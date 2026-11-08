//! Keeps the database in step with the stats folder: imports what was played while the app was
//! closed, then watches the folder and imports each new run shortly after KovaaK writes it.
//!
//! All imports run on one background thread, one at a time. Commands only queue work.
//! Events for the web UI:
//! - `import:progress` `{ done, total }` after each batch of files
//! - `import:finished` an `ImportSummary`
//! - `runs:added` `{ count }` when an import stored new runs
//! - `import:failed` `{ files: [{ fileName, reason }] }` when files gave no run
//! - `watcher:status` a `WatcherStatus`, whenever the folder or its state changes

pub mod parser;
pub mod pipeline;

use std::{
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex, MutexGuard, PoisonError,
        mpsc::{self, RecvTimeoutError},
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::{AppDb, db::Db, stats::is_csv};
use pipeline::{FailedFile, ScanOptions};

/// Settings key that remembers the stats folder (a JSON string).
pub const STATS_DIR_KEY: &str = "source.statsDir";

/// How long the folder must be quiet before importing: KovaaK has finished writing by then, and
/// a burst of changes becomes one import.
const QUIET: Duration = Duration::from_millis(500);

/// A poisoned lock only means another thread panicked mid-write; SQLite rolled that back.
pub(crate) fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_millis() as i64)
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatcherStatus {
    pub dir: Option<String>,
    pub watching: bool,
    /// Why the folder can't be watched or read, if it can't.
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportStatus {
    #[serde(flatten)]
    pub watcher: WatcherStatus,
    pub runs: i64,
    pub failed: Vec<FailedFile>,
}

enum Job {
    SetDir(PathBuf),
    Rescan(ScanOptions),
    Changed,
}

/// Handle kept in Tauri state; commands use it to queue work for the import thread.
pub struct Importer {
    jobs: mpsc::Sender<Job>,
    status: Arc<Mutex<WatcherStatus>>,
}

impl Importer {
    pub fn start(app: AppHandle, db: Arc<Mutex<Db>>) -> Importer {
        let (jobs, queue) = mpsc::channel();
        let status = Arc::new(Mutex::new(WatcherStatus::default()));
        let worker = Worker {
            app,
            db,
            jobs: jobs.clone(),
            status: status.clone(),
            dir: None,
            watcher: None,
        };
        thread::Builder::new()
            .name("stats-import".into())
            .spawn(move || worker.run(queue))
            .expect("could not start the stats import thread");
        Importer { jobs, status }
    }

    fn queue(&self, job: Job) -> Result<(), String> {
        self.jobs
            .send(job)
            .map_err(|_| "导入线程已停止，请重启应用".to_owned())
    }
}

struct Worker {
    app: AppHandle,
    db: Arc<Mutex<Db>>,
    /// For the folder watcher, which queues `Changed`.
    jobs: mpsc::Sender<Job>,
    status: Arc<Mutex<WatcherStatus>>,
    dir: Option<PathBuf>,
    /// Dropping it stops watching.
    watcher: Option<RecommendedWatcher>,
}

impl Worker {
    fn run(mut self, queue: mpsc::Receiver<Job>) {
        // Catch up on runs played while the app was closed.
        let mut pending = None;
        let saved = lock(&self.db)
            .setting(STATS_DIR_KEY)
            .ok()
            .flatten()
            .and_then(|json| serde_json::from_str::<String>(&json).ok());
        if let Some(dir) = saved {
            self.watch(PathBuf::from(dir));
            pending = Some(ScanOptions::default());
        }

        loop {
            // With work pending, wait for the folder to go quiet; otherwise wait for work.
            let job = if pending.is_some() {
                match queue.recv_timeout(QUIET) {
                    Ok(job) => Some(job),
                    Err(RecvTimeoutError::Timeout) => None,
                    Err(RecvTimeoutError::Disconnected) => return,
                }
            } else {
                match queue.recv() {
                    Ok(job) => Some(job),
                    Err(_) => return,
                }
            };
            let wanted = match job {
                None => {
                    if let Some(options) = pending.take() {
                        self.import(options);
                    }
                    continue;
                }
                Some(Job::Changed) => ScanOptions::default(),
                Some(Job::Rescan(options)) => options,
                Some(Job::SetDir(dir)) => {
                    self.remember(&dir);
                    self.watch(dir);
                    ScanOptions::default()
                }
            };
            pending = Some(pending.map_or(wanted, |current: ScanOptions| current.merge(wanted)));
        }
    }

    fn remember(&self, dir: &Path) {
        let json = serde_json::to_string(&dir.to_string_lossy()).unwrap_or_default();
        if let Err(err) = lock(&self.db).set_setting(STATS_DIR_KEY, &json) {
            log::error!("could not save the stats folder: {err}");
        }
    }

    fn watch(&mut self, dir: PathBuf) {
        self.watcher = None;
        let jobs = self.jobs.clone();
        let watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
            if let Ok(event) = event
                && matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_))
                && event.paths.iter().any(|path| {
                    path.file_name()
                        .and_then(|n| n.to_str())
                        .is_some_and(is_csv)
                })
            {
                let _ = jobs.send(Job::Changed);
            }
        })
        .and_then(|mut watcher| {
            watcher
                .watch(&dir, RecursiveMode::NonRecursive)
                .map(|()| watcher)
        });
        let shown = Some(dir.to_string_lossy().into_owned());
        let status = match watcher {
            Ok(watcher) => {
                self.watcher = Some(watcher);
                log::info!("watching {}", dir.display());
                WatcherStatus {
                    dir: shown,
                    watching: true,
                    error: None,
                }
            }
            Err(err) => {
                log::error!("could not watch {}: {err}", dir.display());
                WatcherStatus {
                    dir: shown,
                    watching: false,
                    error: Some(format!("无法监听 stats 文件夹：{err}")),
                }
            }
        };
        self.dir = Some(dir);
        self.set_status(status);
    }

    fn set_status(&self, status: WatcherStatus) {
        *lock(&self.status) = status.clone();
        let _ = self.app.emit("watcher:status", status);
    }

    fn import(&self, options: ScanOptions) {
        let Some(dir) = &self.dir else { return };
        let started = Instant::now();
        let app = &self.app;
        let result = pipeline::import_folder(&self.db, dir, options, now_ms(), |done, total| {
            let _ = app.emit(
                "import:progress",
                serde_json::json!({ "done": done, "total": total }),
            );
        });
        match result {
            Ok(summary) => {
                log::info!(
                    "import: {} files, read {}, {} new runs, {} failed, {:?}",
                    summary.files,
                    summary.read,
                    summary.added,
                    summary.failed.len(),
                    started.elapsed()
                );
                if summary.added > 0 {
                    let _ = app.emit("runs:added", serde_json::json!({ "count": summary.added }));
                }
                if !summary.failed.is_empty() {
                    let _ = app.emit(
                        "import:failed",
                        serde_json::json!({ "files": summary.failed }),
                    );
                }
                let _ = app.emit("import:finished", &summary);
                // A folder that came back after an error is fine again.
                let current = lock(&self.status).clone();
                if current.error.is_some() && self.watcher.is_some() {
                    self.set_status(WatcherStatus {
                        error: None,
                        ..current
                    });
                }
            }
            Err(err) => {
                log::error!("import failed: {err}");
                let current = lock(&self.status).clone();
                self.set_status(WatcherStatus {
                    error: Some(err),
                    ..current
                });
            }
        }
    }
}

/// Use `path` as the stats folder: remember it, watch it, and import what's new.
#[tauri::command]
pub fn stats_dir_set(importer: State<'_, Importer>, path: String) -> Result<(), String> {
    let dir = PathBuf::from(&path);
    if !dir.is_dir() {
        return Err(format!("找不到这个文件夹：{path}"));
    }
    importer.queue(Job::SetDir(dir))
}

/// Read the stats folder again: files that failed before are retried; `full` re-reads every file.
#[tauri::command]
pub fn import_rescan(importer: State<'_, Importer>, full: Option<bool>) -> Result<(), String> {
    importer.queue(Job::Rescan(ScanOptions {
        retry_failed: true,
        full: full.unwrap_or(false),
    }))
}

#[tauri::command]
pub fn import_status(
    importer: State<'_, Importer>,
    db: State<'_, AppDb>,
) -> Result<ImportStatus, String> {
    let watcher = lock(&importer.status).clone();
    let db = lock(&db.0);
    let runs = db.run_count().map_err(|e| e.to_string())?;
    let failed = db
        .failed_files()
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|(path, reason)| FailedFile {
            file_name: Path::new(&path)
                .file_name()
                .map_or(path.clone(), |name| name.to_string_lossy().into_owned()),
            reason,
        })
        .collect();
    Ok(ImportStatus {
        watcher,
        runs,
        failed,
    })
}
