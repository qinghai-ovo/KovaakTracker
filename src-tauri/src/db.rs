//! The app's SQLite database: opening it, running schema migrations, and the queries the importer
//! and the screens need.
//!
//! Rules (scenario matching, ranks, suspicious runs) stay in TypeScript. This module stores raw
//! runs and the player's choices and never computes results.

use std::{collections::HashMap, fmt, path::Path, time::Duration};

use rusqlite::{
    Connection, OptionalExtension, ToSql, params,
    types::{FromSql, FromSqlError, FromSqlResult, ToSqlOutput, ValueRef},
};
use serde::{Deserialize, Serialize};

/// Schema migrations in order. A database's `user_version` is the number that have run on it.
const MIGRATIONS: &[&str] = &[include_str!("../migrations/0001_init.sql")];

/// File name of the database inside the app data folder.
pub const DB_FILE_NAME: &str = "tracker.db";

#[derive(Debug)]
pub enum DbError {
    Sqlite(rusqlite::Error),
    /// The file was written by a newer version of the app, which this version can't read safely.
    TooNew {
        found: i64,
        supported: i64,
    },
}

impl fmt::Display for DbError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DbError::Sqlite(err) => write!(f, "database error: {err}"),
            DbError::TooNew { found, supported } => write!(
                f,
                "the database was created by a newer version of the app (schema {found}, this version reads up to {supported})"
            ),
        }
    }
}

impl std::error::Error for DbError {}

impl From<rusqlite::Error> for DbError {
    fn from(err: rusqlite::Error) -> Self {
        DbError::Sqlite(err)
    }
}

pub type Result<T> = std::result::Result<T, DbError>;

/// An enum stored as one of a fixed set of TEXT values (the CHECK constraints in the schema).
macro_rules! text_enum {
    ($(#[$meta:meta])* $name:ident { $($variant:ident => $text:literal),+ $(,)? }) => {
        $(#[$meta])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
        pub enum $name {
            $(#[serde(rename = $text)] $variant),+
        }

        impl $name {
            pub fn as_str(self) -> &'static str {
                match self {
                    $(Self::$variant => $text),+
                }
            }
        }

        impl ToSql for $name {
            fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
                Ok(self.as_str().into())
            }
        }

        impl FromSql for $name {
            fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
                match value.as_str()? {
                    $($text => Ok(Self::$variant),)+
                    other => Err(FromSqlError::Other(
                        format!("unknown {} value '{other}'", stringify!($name)).into(),
                    )),
                }
            }
        }
    };
}

text_enum!(
    /// Where a run came from.
    RunSource { File => "file", Manual => "manual", Legacy => "legacy" }
);

text_enum!(
    /// The player's decision about a run, as `RecordExclusion.status` in TypeScript.
    OverrideStatus { Excluded => "excluded", Suspicious => "suspicious", Kept => "kept" }
);

text_enum!(
    /// Why a run has an override, as `RecordExclusion.reason` in TypeScript.
    OverrideReason { ZeroScore => "zero-score", LowVsMedian => "low-vs-median", Manual => "manual" }
);

/// A run to store. `identity` is the dedupe key and must match `recordKey()` in TypeScript.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewRun {
    pub identity: String,
    pub source: RunSource,
    /// Scenario name as written in the stats file; matching happens in TypeScript.
    pub scenario: String,
    pub score: f64,
    /// UTC milliseconds.
    pub played_at: i64,
    /// Local time from the file name, e.g. `2026-11-03T19:31:02`.
    pub played_local: String,
    pub source_file: Option<String>,
    pub sensitivity: Option<f64>,
    pub fov: Option<f64>,
    pub dpi: Option<f64>,
    pub note: Option<String>,
}

text_enum!(
    /// What happened when a stats file was read.
    FileStatus { Imported => "imported", Failed => "failed", Skipped => "skipped" }
);

/// A stats file after the importer read it.
#[derive(Debug, Clone, PartialEq)]
pub struct ImportedFile {
    pub path: String,
    pub size: i64,
    /// UTC milliseconds.
    pub mtime: i64,
    pub status: FileStatus,
    /// Why it gave no run (a `ParseFailure` code or a read error).
    pub error: Option<String>,
}

/// What the database remembers about a stats file, to tell whether it changed since.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FileState {
    pub size: Option<i64>,
    pub mtime: Option<i64>,
    pub status: FileStatus,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunOverride {
    /// Identity of the run it applies to. The run doesn't have to be imported yet.
    pub identity: String,
    pub status: OverrideStatus,
    pub reason: OverrideReason,
    pub note: Option<String>,
    /// UTC milliseconds.
    pub updated_at: i64,
}

pub struct Db {
    conn: Connection,
}

impl Db {
    /// Opens (or creates) the database file and brings its schema up to date.
    pub fn open(path: &Path) -> Result<Db> {
        let conn = Connection::open(path)?;
        // WAL lets the screens read while the importer writes.
        conn.pragma_update_and_check(None, "journal_mode", "wal", |row| row.get::<_, String>(0))?;
        conn.pragma_update(None, "synchronous", "normal")?;
        Self::prepare(conn)
    }

    /// A throwaway database, for tests.
    pub fn open_in_memory() -> Result<Db> {
        Self::prepare(Connection::open_in_memory()?)
    }

    fn prepare(mut conn: Connection) -> Result<Db> {
        conn.pragma_update(None, "foreign_keys", true)?;
        conn.busy_timeout(Duration::from_secs(5))?;
        migrate(&mut conn)?;
        Ok(Db { conn })
    }

    pub fn schema_version(&self) -> Result<i64> {
        Ok(self
            .conn
            .pragma_query_value(None, "user_version", |row| row.get(0))?)
    }

    /// Stores runs in one transaction, skipping any whose identity is already stored.
    /// Returns how many were new.
    pub fn insert_runs(&mut self, runs: &[NewRun], now: i64) -> Result<usize> {
        self.record_import(runs, &[], now)
    }

    /// Stores the runs read from a batch of stats files and what happened to each file, in one
    /// transaction. Runs already stored are skipped. Returns how many runs were new.
    pub fn record_import(
        &mut self,
        runs: &[NewRun],
        files: &[ImportedFile],
        now: i64,
    ) -> Result<usize> {
        let tx = self.conn.transaction()?;
        let mut added = 0;
        {
            let mut insert = tx.prepare_cached(
                "INSERT OR IGNORE INTO runs (identity, source, scenario_raw, score, played_at, played_local,
                   source_file, sensitivity, fov, dpi, note, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            )?;
            for run in runs {
                added += insert.execute(params![
                    run.identity,
                    run.source,
                    run.scenario,
                    run.score,
                    run.played_at,
                    run.played_local,
                    run.source_file,
                    run.sensitivity,
                    run.fov,
                    run.dpi,
                    run.note,
                    now,
                ])?;
            }
            let mut file_row = tx.prepare_cached(
                "INSERT INTO import_files (path, size, mtime, status, error, imported_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT (path) DO UPDATE SET
                   size = excluded.size, mtime = excluded.mtime, status = excluded.status,
                   error = excluded.error, imported_at = excluded.imported_at",
            )?;
            for file in files {
                file_row.execute(params![
                    file.path,
                    file.size,
                    file.mtime,
                    file.status,
                    file.error,
                    now
                ])?;
            }
        }
        tx.commit()?;
        Ok(added)
    }

    /// Size, modified time and outcome of every stats file read so far, by path.
    pub fn import_file_states(&self) -> Result<HashMap<String, FileState>> {
        let mut query = self
            .conn
            .prepare_cached("SELECT path, size, mtime, status FROM import_files")?;
        let rows = query.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                FileState {
                    size: row.get(1)?,
                    mtime: row.get(2)?,
                    status: row.get(3)?,
                },
            ))
        })?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Stats files that gave no run, with the reason, by path.
    pub fn failed_files(&self) -> Result<Vec<(String, String)>> {
        let mut query = self.conn.prepare_cached(
            "SELECT path, COALESCE(error, '') FROM import_files WHERE status = 'failed' ORDER BY path",
        )?;
        let rows = query.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Number of stored runs, not counting deleted manual runs.
    pub fn run_count(&self) -> Result<i64> {
        Ok(self.conn.query_row(
            "SELECT COUNT(*) FROM runs WHERE deleted_at IS NULL",
            [],
            |row| row.get(0),
        )?)
    }

    /// Adds or replaces the player's decision about a run.
    pub fn set_override(&self, item: &RunOverride) -> Result<()> {
        self.conn.execute(
            "INSERT INTO run_overrides (identity, status, reason, note, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT (identity) DO UPDATE SET
               status = excluded.status, reason = excluded.reason,
               note = excluded.note, updated_at = excluded.updated_at",
            params![
                item.identity,
                item.status,
                item.reason,
                item.note,
                item.updated_at
            ],
        )?;
        Ok(())
    }

    pub fn clear_override(&self, identity: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM run_overrides WHERE identity = ?1", [identity])?;
        Ok(())
    }

    pub fn overrides(&self) -> Result<Vec<RunOverride>> {
        let mut query = self.conn.prepare_cached(
            "SELECT identity, status, reason, note, updated_at FROM run_overrides ORDER BY identity",
        )?;
        let rows = query.query_map([], |row| {
            Ok(RunOverride {
                identity: row.get(0)?,
                status: row.get(1)?,
                reason: row.get(2)?,
                note: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// A settings value as stored (JSON text), if set.
    pub fn setting(&self, key: &str) -> Result<Option<String>> {
        Ok(self
            .conn
            .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
                row.get(0)
            })
            .optional()?)
    }

    pub fn set_setting(&self, key: &str, json: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            [key, json],
        )?;
        Ok(())
    }
}

/// Runs every migration the database hasn't had yet, each in its own transaction.
fn migrate(conn: &mut Connection) -> Result<()> {
    let supported = MIGRATIONS.len() as i64;
    let found: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if found > supported {
        return Err(DbError::TooNew { found, supported });
    }
    for (index, sql) in MIGRATIONS.iter().enumerate().skip(found as usize) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", index as i64 + 1)?;
        tx.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    const TABLES: &[&str] = &[
        "benchmark_difficulties",
        "days",
        "import_files",
        "plans",
        "ranks",
        "run_overrides",
        "runs",
        "scenario_aliases",
        "scenarios",
        "settings",
        "setups",
        "thresholds",
        "tracked_benchmarks",
    ];

    fn temp_db(label: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("kovaak-db-test-{label}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(DB_FILE_NAME)
    }

    fn file_run(file: &str, score: f64) -> NewRun {
        NewRun {
            identity: format!("csv:{file}:2026-11-03T10:31:02.000Z:{score}"),
            source: RunSource::File,
            scenario: "VT Pasu Intermediate S5".into(),
            score,
            played_at: 1_793_701_862_000,
            played_local: "2026-11-03T19:31:02".into(),
            source_file: Some(file.into()),
            sensitivity: Some(0.35),
            fov: Some(103.0),
            dpi: None,
            note: None,
        }
    }

    fn table_names(db: &Db) -> Vec<String> {
        let mut query = db
            .conn
            .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
            .unwrap();
        query
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap()
    }

    #[test]
    fn a_new_database_gets_every_table() {
        let db = Db::open_in_memory().unwrap();
        assert_eq!(db.schema_version().unwrap(), MIGRATIONS.len() as i64);
        assert_eq!(table_names(&db), TABLES);
    }

    #[test]
    fn reopening_a_file_keeps_its_data_and_runs_no_migration_twice() {
        let path = temp_db("reopen");
        {
            let mut db = Db::open(&path).unwrap();
            let mode: String = db
                .conn
                .pragma_query_value(None, "journal_mode", |row| row.get(0))
                .unwrap();
            assert_eq!(mode, "wal");
            db.insert_runs(&[file_run("a.csv", 712.0)], 1).unwrap();
        }
        let db = Db::open(&path).unwrap();
        assert_eq!(db.schema_version().unwrap(), MIGRATIONS.len() as i64);
        assert_eq!(db.run_count().unwrap(), 1);
    }

    #[test]
    fn the_same_run_is_stored_once() {
        let mut db = Db::open_in_memory().unwrap();
        let run = file_run("a.csv", 712.0);
        assert_eq!(db.insert_runs(std::slice::from_ref(&run), 1).unwrap(), 1);
        assert_eq!(
            db.insert_runs(std::slice::from_ref(&run), 2).unwrap(),
            0,
            "a second import adds nothing"
        );
        assert_eq!(
            db.insert_runs(
                &[run, file_run("b.csv", 650.0), file_run("b.csv", 650.0)],
                3
            )
            .unwrap(),
            1,
            "duplicates inside one batch count once"
        );
        assert_eq!(db.run_count().unwrap(), 2);
    }

    #[test]
    fn overrides_are_kept_by_identity_even_before_the_run_is_imported() {
        let mut db = Db::open_in_memory().unwrap();
        let run = file_run("a.csv", 12.0);
        let mut item = RunOverride {
            identity: run.identity.clone(),
            status: OverrideStatus::Excluded,
            reason: OverrideReason::Manual,
            note: Some("mouse died".into()),
            updated_at: 10,
        };
        db.set_override(&item).unwrap();
        db.insert_runs(&[run], 11).unwrap();
        assert_eq!(db.overrides().unwrap(), vec![item.clone()]);

        item.status = OverrideStatus::Kept;
        item.note = None;
        item.updated_at = 12;
        db.set_override(&item).unwrap();
        assert_eq!(
            db.overrides().unwrap(),
            vec![item.clone()],
            "setting again replaces"
        );

        db.clear_override(&item.identity).unwrap();
        assert!(db.overrides().unwrap().is_empty());
    }

    #[test]
    fn settings_round_trip_as_json_text() {
        let db = Db::open_in_memory().unwrap();
        assert_eq!(db.setting("rules.dayStartHour").unwrap(), None);
        db.set_setting("rules.dayStartHour", "4").unwrap();
        db.set_setting("rules.dayStartHour", "5").unwrap();
        assert_eq!(
            db.setting("rules.dayStartHour").unwrap().as_deref(),
            Some("5")
        );
    }

    #[test]
    fn values_outside_the_schema_are_refused() {
        let db = Db::open_in_memory().unwrap();
        let bad_source = db.conn.execute(
            "INSERT INTO runs (identity, source, scenario_raw, score, played_at, played_local, created_at)
             VALUES ('x', 'web', 's', 1, 1, '2026-11-03T19:31:02', 1)",
            [],
        );
        assert!(bad_source.is_err());
        db.conn
            .execute(
                "INSERT INTO tracked_benchmarks (benchmark, difficulty, sort_order, active) VALUES ('Viscose', 'Easier', 0, 1)",
                [],
            )
            .unwrap();
        let second_active = db.conn.execute(
            "INSERT INTO tracked_benchmarks (benchmark, difficulty, sort_order, active) VALUES ('Viscose', 'Medium', 1, 1)",
            [],
        );
        assert!(second_active.is_err(), "only one benchmark is active");
    }

    #[test]
    fn a_database_from_a_newer_app_is_refused() {
        let path = temp_db("too-new");
        {
            let conn = Connection::open(&path).unwrap();
            conn.pragma_update(None, "user_version", 99).unwrap();
        }
        match Db::open(&path) {
            Err(DbError::TooNew { found: 99, .. }) => {}
            Err(other) => panic!("expected TooNew, got {other}"),
            Ok(_) => panic!("expected TooNew, got an open database"),
        }
    }
}
