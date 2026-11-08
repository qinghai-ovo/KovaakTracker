//! Keeps the database in step with the stats folder: imports what was played while the app was
//! closed, then watches the folder and imports each new run shortly after KovaaK writes it.
//!
//! All imports run on one background thread, one at a time. Commands queue work; the ones the
//! player starts wait for the import and return its summary.
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

use crate::{AppDb, db::Db};
use pipeline::{FailedFile, ImportSummary, ScanOptions};

/// Settings key that remembers the stats folder (a JSON string).
pub const STATS_DIR_KEY: &str = "source.statsDir";
/// Settings key for "import new runs automatically" (JSON bool, on when missing). When off, the
/// folder is neither watched nor caught up on at startup; only the player's rescans import.
pub const AUTO_IMPORT_KEY: &str = "source.autoImport";

const STOPPED: &str = "导入线程已停止，请重启应用";

/// How long the folder must be quiet before importing: KovaaK has finished writing by then, and
/// a burst of changes becomes one import.
const QUIET: Duration = Duration::from_millis(500);

/// A poisoned lock only means another thread panicked mid-write; SQLite rolled that back.
pub(crate) fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

pub(crate) fn is_csv(name: &str) -> bool {
    name.to_ascii_lowercase().ends_with(".csv")
}

pub(crate) fn now_ms() -> i64 {
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
    /// Automatic import ("自动导入新成绩"): watch the folder and catch up at startup.
    pub auto: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportStatus {
    #[serde(flatten)]
    pub watcher: WatcherStatus,
    pub runs: i64,
    pub failed: Vec<FailedFile>,
}

/// Where the summary of the import a command asked for goes.
type Reply = mpsc::Sender<Result<ImportSummary, String>>;

enum Job {
    SetDir(PathBuf, Option<Reply>),
    Rescan(ScanOptions, Option<Reply>),
    SetAuto(bool),
    /// The watcher saw a stats file change.
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
            auto: true,
            waiting: Vec::new(),
        };
        thread::Builder::new()
            .name("stats-import".into())
            .spawn(move || worker.run(queue))
            .expect("could not start the stats import thread");
        Importer { jobs, status }
    }

    fn queue(&self, job: Job) -> Result<(), String> {
        self.jobs.send(job).map_err(|_| STOPPED.to_owned())
    }

    /// Pauses watching if it's on, resumes it if it's off (the tray menu).
    pub fn toggle_auto(&self) -> Result<(), String> {
        let auto = lock(&self.status).auto;
        self.queue(Job::SetAuto(!auto))
    }

    /// Queues a job and waits (off the main thread) for the import it leads to.
    async fn request(
        &self,
        job: impl FnOnce(Option<Reply>) -> Job,
    ) -> Result<ImportSummary, String> {
        let (reply, summary) = mpsc::channel();
        self.queue(job(Some(reply)))?;
        tauri::async_runtime::spawn_blocking(move || summary.recv())
            .await
            .map_err(|err| err.to_string())?
            .map_err(|_| STOPPED.to_owned())?
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
    /// Import new runs without being asked (the `AUTO_IMPORT_KEY` setting).
    auto: bool,
    /// Commands waiting for the next import's summary.
    waiting: Vec<Reply>,
}

impl Worker {
    fn saved<T: serde::de::DeserializeOwned>(&self, key: &str) -> Option<T> {
        let json = lock(&self.db).setting(key).ok().flatten()?;
        serde_json::from_str(&json).ok()
    }

    fn save(&self, key: &str, value: impl Serialize) {
        let json = serde_json::to_string(&value).unwrap_or_default();
        if let Err(err) = lock(&self.db).set_setting(key, &json) {
            log::error!("could not save {key}: {err}");
        }
    }

    fn run(mut self, queue: mpsc::Receiver<Job>) {
        self.auto = self.saved(AUTO_IMPORT_KEY).unwrap_or(true);
        let mut pending = None;
        if let Some(dir) = self.saved::<String>(STATS_DIR_KEY) {
            self.use_dir(PathBuf::from(dir));
            // Catch up on runs played while the app was closed.
            if self.auto {
                pending = Some(ScanOptions::default());
            }
        } else {
            self.set_status(WatcherStatus {
                auto: self.auto,
                ..WatcherStatus::default()
            });
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
                        let result = self.import(options);
                        for reply in self.waiting.drain(..) {
                            let _ = reply.send(result.clone());
                        }
                    }
                    continue;
                }
                Some(Job::Changed) if self.auto => ScanOptions::default(),
                Some(Job::Changed) => continue,
                Some(Job::Rescan(options, reply)) => {
                    self.waiting.extend(reply);
                    options
                }
                Some(Job::SetDir(dir, reply)) => {
                    self.save(STATS_DIR_KEY, dir.to_string_lossy());
                    self.use_dir(dir);
                    self.waiting.extend(reply);
                    ScanOptions::default()
                }
                Some(Job::SetAuto(auto)) => {
                    self.save(AUTO_IMPORT_KEY, auto);
                    self.auto = auto;
                    let Some(dir) = self.dir.clone() else {
                        self.set_status(WatcherStatus {
                            auto,
                            ..WatcherStatus::default()
                        });
                        continue;
                    };
                    self.use_dir(dir);
                    if !auto {
                        continue;
                    }
                    // Turned back on: pick up what was played meanwhile.
                    ScanOptions::default()
                }
            };
            pending = Some(pending.map_or(wanted, |current: ScanOptions| current.merge(wanted)));
        }
    }

    /// Makes `dir` the stats folder, watching it when automatic import is on.
    fn use_dir(&mut self, dir: PathBuf) {
        self.watcher = None;
        let shown = Some(dir.to_string_lossy().into_owned());
        self.dir = Some(dir.clone());
        if self.auto {
            self.watch(dir);
        } else {
            self.set_status(WatcherStatus {
                dir: shown,
                watching: false,
                error: None,
                auto: false,
            });
        }
    }

    fn watch(&mut self, dir: PathBuf) {
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
                    auto: true,
                }
            }
            Err(err) => {
                log::error!("could not watch {}: {err}", dir.display());
                WatcherStatus {
                    dir: shown,
                    watching: false,
                    error: Some(format!("无法监听 stats 文件夹：{err}")),
                    auto: true,
                }
            }
        };
        self.set_status(status);
    }

    fn set_status(&self, status: WatcherStatus) {
        *lock(&self.status) = status.clone();
        crate::tray::show_status(&self.app, &status);
        let _ = self.app.emit("watcher:status", status);
    }

    fn import(&self, options: ScanOptions) -> Result<ImportSummary, String> {
        let Some(dir) = &self.dir else {
            return Err("还没有选择 stats 文件夹".into());
        };
        let started = Instant::now();
        let app = &self.app;
        let result = pipeline::import_folder(&self.db, dir, options, now_ms(), |done, total| {
            let _ = app.emit(
                "import:progress",
                serde_json::json!({ "done": done, "total": total }),
            );
        });
        match &result {
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
                let _ = app.emit("import:finished", summary);
                // A folder that came back after an error is fine again.
                let current = lock(&self.status).clone();
                if current.error.is_some() && (self.watcher.is_some() || !self.auto) {
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
                    error: Some(err.clone()),
                    ..current
                });
            }
        }
        result
    }
}

/// Use `path` as the stats folder: remember it, watch it, and import what's new.
/// Returns once that import is done.
#[tauri::command]
pub async fn stats_dir_set(
    importer: State<'_, Importer>,
    path: String,
) -> Result<ImportSummary, String> {
    let dir = PathBuf::from(&path);
    if !dir.is_dir() {
        return Err(format!("找不到这个文件夹：{path}"));
    }
    importer.request(|reply| Job::SetDir(dir, reply)).await
}

/// Read the stats folder again: files that failed before are retried; `full` re-reads every file.
/// Returns once the import is done.
#[tauri::command]
pub async fn import_rescan(
    importer: State<'_, Importer>,
    full: Option<bool>,
) -> Result<ImportSummary, String> {
    let options = ScanOptions {
        retry_failed: true,
        full: full.unwrap_or(false),
    };
    importer.request(|reply| Job::Rescan(options, reply)).await
}

/// Turn automatic import (watching the folder, catching up at startup) on or off.
#[tauri::command]
pub fn import_set_auto(importer: State<'_, Importer>, enabled: bool) -> Result<(), String> {
    importer.queue(Job::SetAuto(enabled))
}

#[tauri::command]
pub fn import_status(
    importer: State<'_, Importer>,
    db: State<'_, AppDb>,
) -> Result<ImportStatus, String> {
    let watcher = lock(&importer.status).clone();
    let db = db.lock()?;
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
