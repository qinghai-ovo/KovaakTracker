//! One import pass over the stats folder: find new or changed files, read and parse them in
//! parallel, and store each batch in one transaction.

use std::{fs, path::Path, sync::Mutex, thread, time::UNIX_EPOCH};

use serde::Serialize;

use super::{is_csv, lock, parser::parse_kovaak_csv};
use crate::db::{Db, FileStatus, ImportedFile, NewRun, RunSource};

/// Files per transaction. Progress is reported after each batch, and a long first import keeps
/// what it has read so far if the app is closed halfway.
const BATCH: usize = 1000;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ScanOptions {
    /// Read files that failed before even if they haven't changed (the "rescan" button).
    pub retry_failed: bool,
    /// Read every file again.
    pub full: bool,
}

impl ScanOptions {
    /// Two requests waiting at once become one import that does what both asked.
    pub fn merge(self, other: ScanOptions) -> ScanOptions {
        ScanOptions {
            retry_failed: self.retry_failed || other.retry_failed,
            full: self.full || other.full,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    /// CSV files in the folder.
    pub files: usize,
    /// Files read in this pass.
    pub read: usize,
    /// Runs that weren't stored before.
    pub added: usize,
    /// Files read in this pass that gave no run.
    pub failed: Vec<FailedFile>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FailedFile {
    pub file_name: String,
    /// A `ParseFailure` code, or `read-error: …`.
    pub reason: String,
}

struct StatsFile {
    name: String,
    path: String,
    size: i64,
    mtime: i64,
}

/// Imports what's new in `dir`. `progress(done, total)` is called after each batch.
pub fn import_folder(
    db: &Mutex<Db>,
    dir: &Path,
    options: ScanOptions,
    now: i64,
    mut progress: impl FnMut(usize, usize),
) -> Result<ImportSummary, String> {
    let files = list_stats_files(dir)?;
    let known = lock(db).import_file_states().map_err(|e| e.to_string())?;
    let to_read: Vec<&StatsFile> = files
        .iter()
        .filter(|file| match known.get(&file.path) {
            None => true,
            Some(_) if options.full => true,
            Some(state) => {
                state.size != Some(file.size)
                    || state.mtime != Some(file.mtime)
                    || (options.retry_failed && state.status == FileStatus::Failed)
            }
        })
        .collect();

    let mut summary = ImportSummary {
        files: files.len(),
        read: to_read.len(),
        ..ImportSummary::default()
    };
    for (index, batch) in to_read.chunks(BATCH).enumerate() {
        let results = read_in_parallel(batch);
        let runs: Vec<NewRun> = results.iter().filter_map(|(run, _)| run.clone()).collect();
        let outcomes: Vec<ImportedFile> = results.into_iter().map(|(_, file)| file).collect();
        for (file, outcome) in batch.iter().zip(&outcomes) {
            if let Some(reason) = &outcome.error {
                summary.failed.push(FailedFile {
                    file_name: file.name.clone(),
                    reason: reason.clone(),
                });
            }
        }
        summary.added += lock(db)
            .record_import(&runs, &outcomes, now)
            .map_err(|e| e.to_string())?;
        progress(
            (index * BATCH + batch.len()).min(to_read.len()),
            to_read.len(),
        );
    }
    Ok(summary)
}

/// The `.csv` files directly inside `dir`, with size and modified time.
fn list_stats_files(dir: &Path) -> Result<Vec<StatsFile>, String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("读取 stats 文件夹失败：{e}"))?;
    let mut files: Vec<StatsFile> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_str()?.to_owned();
            let meta = entry.metadata().ok()?;
            if !meta.is_file() || !is_csv(&name) {
                return None;
            }
            let mtime = meta
                .modified()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |since| since.as_millis() as i64);
            Some(StatsFile {
                path: entry.path().to_string_lossy().into_owned(),
                name,
                size: meta.len() as i64,
                mtime,
            })
        })
        .collect();
    // Oldest first, so an interrupted first import has the earliest runs.
    files.sort_by(|a, b| (a.mtime, &a.name).cmp(&(b.mtime, &b.name)));
    Ok(files)
}

/// Reads and parses files on several threads; results keep the order of `files`.
fn read_in_parallel(files: &[&StatsFile]) -> Vec<(Option<NewRun>, ImportedFile)> {
    let workers = thread::available_parallelism()
        .map_or(4, |n| n.get())
        .min(8);
    let chunk = files.len().div_ceil(workers).max(1);
    thread::scope(|scope| {
        let handles: Vec<_> = files
            .chunks(chunk)
            .map(|part| {
                scope.spawn(move || part.iter().map(|file| read_one(file)).collect::<Vec<_>>())
            })
            .collect();
        handles
            .into_iter()
            .flat_map(|handle| handle.join().expect("a stats parser thread panicked"))
            .collect()
    })
}

fn read_one(file: &StatsFile) -> (Option<NewRun>, ImportedFile) {
    let parsed = fs::read(&file.path)
        .map_err(|e| format!("read-error: {e}"))
        .and_then(|bytes| {
            parse_kovaak_csv(
                &String::from_utf8_lossy(&bytes),
                &file.name,
                Some(file.mtime),
            )
            .map_err(|failure| failure.code().to_owned())
        });
    let outcome = |status, error| ImportedFile {
        path: file.path.clone(),
        size: file.size,
        mtime: file.mtime,
        status,
        error,
    };
    match parsed {
        Ok(run) => (
            Some(NewRun {
                identity: run.identity,
                source: RunSource::File,
                scenario: run.scenario,
                score: run.score,
                played_at: run.played_at,
                played_local: run.played_local,
                source_file: Some(file.name.clone()),
                sensitivity: run.sensitivity,
                fov: run.fov,
                dpi: run.dpi,
                note: None,
            }),
            outcome(FileStatus::Imported, None),
        ),
        Err(reason) => (None, outcome(FileStatus::Failed, Some(reason))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_dir(label: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("kovaak-import-test-{label}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_run(dir: &Path, scenario: &str, time: &str, score: &str) {
        let name = format!("{scenario} - Challenge - 2026.11.03-{time} Stats.csv");
        let text =
            format!("Kill #,Timestamp\n1,19:30:02.861\n\nScore:,{score}\nScenario:,{scenario}\n");
        fs::write(dir.join(name), text).unwrap();
    }

    fn import(db: &Mutex<Db>, dir: &Path, options: ScanOptions) -> ImportSummary {
        import_folder(db, dir, options, 1, |_, _| {}).unwrap()
    }

    #[test]
    fn imports_new_files_once_and_rereads_only_changed_ones() {
        let dir = temp_dir("incremental");
        write_run(&dir, "Pasu", "19.31.02", "712.0");
        write_run(&dir, "Pasu", "19.32.10", "698.5");
        fs::write(dir.join("notes.txt"), "not a run").unwrap();
        let db = Mutex::new(Db::open_in_memory().unwrap());

        let first = import(&db, &dir, ScanOptions::default());
        assert_eq!((first.files, first.read, first.added), (2, 2, 2));

        let again = import(&db, &dir, ScanOptions::default());
        assert_eq!(
            (again.read, again.added),
            (0, 0),
            "nothing new, nothing read"
        );

        write_run(&dir, "Pasu", "19.33.40", "720.0");
        let new_run = import(&db, &dir, ScanOptions::default());
        assert_eq!((new_run.read, new_run.added), (1, 1));

        let full = import(
            &db,
            &dir,
            ScanOptions {
                full: true,
                ..ScanOptions::default()
            },
        );
        assert_eq!(
            (full.read, full.added),
            (3, 0),
            "reading everything again adds no duplicates"
        );
        assert_eq!(lock(&db).run_count().unwrap(), 3);
    }

    #[test]
    fn failed_files_are_recorded_and_retried_on_request() {
        let dir = temp_dir("failed");
        write_run(&dir, "Pasu", "19.31.02", "not a number");
        let db = Mutex::new(Db::open_in_memory().unwrap());

        let first = import(&db, &dir, ScanOptions::default());
        assert_eq!(first.added, 0);
        assert_eq!(first.failed.len(), 1);
        assert_eq!(first.failed[0].reason, "missing-score");
        assert_eq!(lock(&db).failed_files().unwrap().len(), 1);

        assert_eq!(
            import(&db, &dir, ScanOptions::default()).read,
            0,
            "an unchanged failed file waits"
        );
        let retry = import(
            &db,
            &dir,
            ScanOptions {
                retry_failed: true,
                ..ScanOptions::default()
            },
        );
        assert_eq!(retry.read, 1);

        // Once fixed (the file changes), it imports and leaves the failed list.
        write_run(&dir, "Pasu", "19.31.02", "712.0");
        assert_eq!(import(&db, &dir, ScanOptions::default()).added, 1);
        assert!(lock(&db).failed_files().unwrap().is_empty());
    }

    #[test]
    fn reports_progress_per_batch_and_a_missing_folder_as_an_error() {
        let dir = temp_dir("progress");
        write_run(&dir, "Pasu", "19.31.02", "712.0");
        let db = Mutex::new(Db::open_in_memory().unwrap());
        let mut calls = Vec::new();
        import_folder(&db, &dir, ScanOptions::default(), 1, |done, total| {
            calls.push((done, total))
        })
        .unwrap();
        assert_eq!(calls, vec![(1, 1)]);

        assert!(
            import_folder(
                &db,
                &dir.join("missing"),
                ScanOptions::default(),
                1,
                |_, _| {}
            )
            .is_err()
        );
    }
}
