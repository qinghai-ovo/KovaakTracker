//! What the screens read and change: runs, the player's decisions, benchmarks, the plan, the
//! training log and settings. TypeScript turns these rows into the screens' data.

use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{Db, NewRun, Result, RunOverride, RunSource};

/// The plan isn't per day yet (roadmap M4); the one standing plan is kept under this day key.
const STANDING_PLAN: &str = "";

/// Folder next to the database for copies made before a restore.
const COPY_DIR: &str = "backups";
const COPY_PREFIX: &str = "tracker-before-restore-";
/// How many of those copies are kept.
const KEPT_COPIES: usize = 5;

/// A stored run as the screens get it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredRun {
    /// Grows with every insert, so the UI can ask for runs newer than the last one it has.
    pub id: i64,
    pub identity: String,
    pub source: RunSource,
    pub scenario: String,
    pub score: f64,
    pub played_at: i64,
    pub played_local: String,
    pub source_file: Option<String>,
    pub sensitivity: Option<f64>,
    pub fov: Option<f64>,
    pub dpi: Option<f64>,
    pub note: Option<String>,
}

/// One benchmark difficulty with its scenarios, rank thresholds and rank colors.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkDifficulty {
    pub benchmark: String,
    pub difficulty: String,
    pub kovaaks_id: Option<String>,
    pub sharecode: Option<String>,
    /// UTC milliseconds of the last threshold sync.
    pub synced_at: Option<i64>,
    /// Lowest rank first.
    pub ranks: Vec<Rank>,
    pub scenarios: Vec<BenchmarkScenario>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rank {
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkScenario {
    pub name: String,
    pub category: Option<String>,
    pub subcategory: Option<String>,
    pub leaderboard_id: Option<String>,
    /// Score needed for each rank, lowest rank first.
    pub thresholds: Vec<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackedBenchmark {
    pub benchmark: String,
    pub difficulty: String,
    pub active: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Alias {
    pub raw_name: String,
    pub scenario_name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayEntry {
    pub day_key: String,
    /// `{ sleep, energy, warmup }`, any subset.
    pub mood: Value,
    pub note: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanItem {
    pub scenario_name: String,
    pub target_runs: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Setup {
    pub mouse: String,
    pub mousepad: String,
    pub sensitivity: String,
    pub dpi: String,
    pub fov: String,
    pub notes: String,
}

/// Everything the screens start from, read in one go when the window opens.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppData {
    /// Oldest first; deleted manual runs left out.
    pub runs: Vec<StoredRun>,
    pub overrides: Vec<RunOverride>,
    pub aliases: Vec<Alias>,
    pub benchmarks: Vec<BenchmarkDifficulty>,
    /// Sidebar order.
    pub tracked: Vec<TrackedBenchmark>,
    pub days: Vec<DayEntry>,
    pub plan: Vec<PlanItem>,
    pub setup: Option<Setup>,
    /// Settings values, parsed from their JSON text.
    pub settings: BTreeMap<String, Value>,
    /// UTC milliseconds of the newest file import.
    pub last_import_at: Option<i64>,
}

/// A backup to restore. The player's decisions, plan, log, setup, followed benchmarks and the
/// given settings replace what's stored; manual runs replace the stored manual runs; other runs
/// are added unless already stored, so runs imported from the stats folder stay.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Restore {
    pub runs: Vec<NewRun>,
    pub overrides: Vec<RunOverride>,
    pub aliases: Vec<Alias>,
    /// None keeps the stored benchmarks (a backup without any).
    pub benchmarks: Option<Vec<BenchmarkDifficulty>>,
    pub tracked: Vec<TrackedBenchmark>,
    pub days: Vec<DayEntry>,
    pub plan: Vec<PlanItem>,
    pub setup: Option<Setup>,
    pub settings: BTreeMap<String, Value>,
}

const RUN_COLUMNS: &str = "id, identity, source, scenario_raw, score, played_at, played_local,
    source_file, sensitivity, fov, dpi, note";

fn stored_run(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredRun> {
    Ok(StoredRun {
        id: row.get(0)?,
        identity: row.get(1)?,
        source: row.get(2)?,
        scenario: row.get(3)?,
        score: row.get(4)?,
        played_at: row.get(5)?,
        played_local: row.get(6)?,
        source_file: row.get(7)?,
        sensitivity: row.get(8)?,
        fov: row.get(9)?,
        dpi: row.get(10)?,
        note: row.get(11)?,
    })
}

impl Db {
    pub fn load_app_data(&self) -> Result<AppData> {
        let conn = &self.conn;
        Ok(AppData {
            runs: self.runs_after(0)?,
            overrides: self.overrides()?,
            aliases: collect(
                conn,
                "SELECT raw_name, scenario_name FROM scenario_aliases ORDER BY raw_name",
                [],
                |row| {
                    Ok(Alias {
                        raw_name: row.get(0)?,
                        scenario_name: row.get(1)?,
                    })
                },
            )?,
            benchmarks: read_benchmarks(conn)?,
            tracked: collect(
                conn,
                "SELECT benchmark, difficulty, active FROM tracked_benchmarks ORDER BY sort_order",
                [],
                |row| {
                    Ok(TrackedBenchmark {
                        benchmark: row.get(0)?,
                        difficulty: row.get(1)?,
                        active: row.get(2)?,
                    })
                },
            )?,
            days: collect(
                conn,
                "SELECT day_key, mood, note FROM days ORDER BY day_key",
                [],
                |row| {
                    let mood: String = row.get(1)?;
                    Ok(DayEntry {
                        day_key: row.get(0)?,
                        mood: serde_json::from_str(&mood).unwrap_or(Value::Null),
                        note: row.get(2)?,
                    })
                },
            )?,
            plan: collect(
                conn,
                "SELECT scenario_name, target_runs FROM plans WHERE day_key = ?1 ORDER BY sort_order",
                [STANDING_PLAN],
                |row| {
                    Ok(PlanItem {
                        scenario_name: row.get(0)?,
                        target_runs: row.get(1)?,
                    })
                },
            )?,
            setup: collect(
                conn,
                "SELECT mouse, mousepad, sensitivity, dpi, fov, notes FROM setups WHERE is_default = 1",
                [],
                |row| {
                    Ok(Setup {
                        mouse: row.get(0)?,
                        mousepad: row.get(1)?,
                        sensitivity: row.get(2)?,
                        dpi: row.get(3)?,
                        fov: row.get(4)?,
                        notes: row.get(5)?,
                    })
                },
            )?
            .into_iter()
            .next(),
            settings: collect(conn, "SELECT key, value FROM settings", [], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?
            .into_iter()
            // A value that isn't JSON was not written by this app; leave it out.
            .filter_map(|(key, text)| serde_json::from_str(&text).ok().map(|value| (key, value)))
            .collect(),
            last_import_at: conn.query_row(
                "SELECT MAX(imported_at) FROM import_files",
                [],
                |row| row.get(0),
            )?,
        })
    }

    /// Runs stored after the run with id `after`, oldest first; deleted manual runs left out.
    pub fn runs_after(&self, after: i64) -> Result<Vec<StoredRun>> {
        let mut query = self.conn.prepare_cached(&format!(
            "SELECT {RUN_COLUMNS} FROM runs WHERE id > ?1 AND deleted_at IS NULL ORDER BY id"
        ))?;
        let rows = query.query_map([after], stored_run)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Adds a manual run, or changes the manual run with the same identity.
    /// Returns false (and changes nothing) when the identity belongs to an imported run.
    pub fn save_manual_run(&self, run: &NewRun, now: i64) -> Result<bool> {
        let changed = self.conn.execute(
            "INSERT INTO runs (identity, source, scenario_raw, score, played_at, played_local, note, created_at)
             VALUES (?1, 'manual', ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT (identity) DO UPDATE SET
               scenario_raw = excluded.scenario_raw, score = excluded.score,
               played_at = excluded.played_at, played_local = excluded.played_local,
               note = excluded.note, deleted_at = NULL
             WHERE runs.source = 'manual'",
            params![
                run.identity,
                run.scenario,
                run.score,
                run.played_at,
                run.played_local,
                run.note,
                now
            ],
        )?;
        Ok(changed > 0)
    }

    /// Soft-deletes a manual run; imported runs can't be deleted, only ignored.
    pub fn delete_manual_run(&self, identity: &str, now: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE runs SET deleted_at = ?2 WHERE identity = ?1 AND source = 'manual'",
            params![identity, now],
        )?;
        Ok(())
    }

    pub fn set_alias(&self, alias: &Alias, now: i64) -> Result<()> {
        write_alias(&self.conn, alias, now)
    }

    pub fn save_plan(&mut self, items: &[PlanItem]) -> Result<()> {
        let tx = self.conn.transaction()?;
        write_plan(&tx, items)?;
        tx.commit()?;
        Ok(())
    }

    /// Saves a training day; a day with no mood and no note is removed.
    pub fn save_day(&self, day: &DayEntry, now: i64) -> Result<()> {
        write_day(&self.conn, day, now)
    }

    pub fn save_setup(&self, setup: &Setup) -> Result<()> {
        write_setup(&self.conn, setup)
    }

    /// Replaces the followed benchmarks; `items` is the sidebar order.
    pub fn save_tracked(&mut self, items: &[TrackedBenchmark]) -> Result<()> {
        let tx = self.conn.transaction()?;
        write_tracked(&tx, items)?;
        tx.commit()?;
        Ok(())
    }

    /// Replaces every stored benchmark difficulty with `items`.
    pub fn save_benchmarks(&mut self, items: &[BenchmarkDifficulty]) -> Result<()> {
        let tx = self.conn.transaction()?;
        write_benchmarks(&tx, items)?;
        tx.commit()?;
        Ok(())
    }

    /// True once the player has anything a restore would replace or add to.
    pub fn holds_player_data(&self) -> Result<bool> {
        Ok(self.conn.query_row(
            "SELECT EXISTS (SELECT 1 FROM runs WHERE deleted_at IS NULL)
                 OR EXISTS (SELECT 1 FROM run_overrides)
                 OR EXISTS (SELECT 1 FROM scenario_aliases)
                 OR EXISTS (SELECT 1 FROM days)
                 OR EXISTS (SELECT 1 FROM plans)
                 OR EXISTS (SELECT 1 FROM tracked_benchmarks)",
            [],
            |row| row.get(0),
        )?)
    }

    /// Copies the database into `backups/` next to it before a restore replaces anything, and
    /// keeps the newest few copies. `stamp` (local time, e.g. `20261109-213005`) names the copy.
    /// Returns where it went; None for an in-memory database or one with nothing to lose.
    pub fn copy_before_restore(&self, stamp: &str) -> Result<Option<PathBuf>> {
        let Some(dir) = self.path.as_deref().and_then(Path::parent) else {
            return Ok(None);
        };
        if !self.holds_player_data()? {
            return Ok(None);
        }
        let dir = dir.join(COPY_DIR);
        fs::create_dir_all(&dir)?;
        let mut copy = dir.join(format!("{COPY_PREFIX}{stamp}.db"));
        let mut n = 1;
        while copy.exists() {
            n += 1;
            copy = dir.join(format!("{COPY_PREFIX}{stamp}-{n}.db"));
        }
        // A consistent snapshot, even while the importer writes.
        self.conn
            .execute("VACUUM INTO ?1", params![copy.to_string_lossy()])?;
        let mut copies: Vec<PathBuf> = fs::read_dir(&dir)?
            .filter_map(|entry| entry.ok().map(|entry| entry.path()))
            .filter(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with(COPY_PREFIX) && name.ends_with(".db"))
            })
            .collect();
        copies.sort_by_key(|path| fs::metadata(path).and_then(|meta| meta.modified()).ok());
        let extra = copies.len().saturating_sub(KEPT_COPIES);
        for old in &copies[..extra] {
            if let Err(err) = fs::remove_file(old) {
                log::warn!("could not remove old copy {}: {err}", old.display());
            }
        }
        Ok(Some(copy))
    }

    /// Restores a backup in one transaction (see `Restore`). Returns how many runs were new.
    pub fn restore(&mut self, backup: &Restore, now: i64) -> Result<usize> {
        let tx = self.conn.transaction()?;
        tx.execute_batch(
            "DELETE FROM runs WHERE source = 'manual';
             DELETE FROM run_overrides;
             DELETE FROM scenario_aliases;
             DELETE FROM days;
             DELETE FROM setups;",
        )?;
        let mut added = 0;
        {
            let mut insert = tx.prepare_cached(
                "INSERT OR IGNORE INTO runs (identity, source, scenario_raw, score, played_at, played_local,
                   source_file, sensitivity, fov, dpi, note, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            )?;
            for run in &backup.runs {
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
            let mut set_override = tx.prepare_cached(
                "INSERT OR REPLACE INTO run_overrides (identity, status, reason, note, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )?;
            for item in &backup.overrides {
                set_override.execute(params![
                    item.identity,
                    item.status,
                    item.reason,
                    item.note,
                    item.updated_at
                ])?;
            }
        }
        for alias in &backup.aliases {
            write_alias(&tx, alias, now)?;
        }
        if let Some(benchmarks) = &backup.benchmarks {
            write_benchmarks(&tx, benchmarks)?;
        }
        write_tracked(&tx, &backup.tracked)?;
        for day in &backup.days {
            write_day(&tx, day, now)?;
        }
        write_plan(&tx, &backup.plan)?;
        if let Some(setup) = &backup.setup {
            write_setup(&tx, setup)?;
        }
        for (key, value) in &backup.settings {
            tx.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                params![key, value.to_string()],
            )?;
        }
        tx.commit()?;
        Ok(added)
    }
}

fn collect<T>(
    conn: &Connection,
    sql: &str,
    params: impl rusqlite::Params,
    map: impl FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<T>,
) -> Result<Vec<T>> {
    let mut query = conn.prepare_cached(sql)?;
    let rows = query.query_map(params, map)?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

fn read_benchmarks(conn: &Connection) -> Result<Vec<BenchmarkDifficulty>> {
    let difficulties = collect(
        conn,
        "SELECT id, benchmark, difficulty, kovaaks_id, sharecode, synced_at
         FROM benchmark_difficulties ORDER BY id",
        [],
        |row| {
            Ok((
                row.get::<_, i64>(0)?,
                BenchmarkDifficulty {
                    benchmark: row.get(1)?,
                    difficulty: row.get(2)?,
                    kovaaks_id: row.get(3)?,
                    sharecode: row.get(4)?,
                    synced_at: row.get(5)?,
                    ranks: Vec::new(),
                    scenarios: Vec::new(),
                },
            ))
        },
    )?;
    let mut ranks = conn.prepare_cached(
        "SELECT name, color FROM ranks WHERE difficulty_id = ?1 ORDER BY rank_index",
    )?;
    let mut scenarios = conn.prepare_cached(
        "SELECT id, name, category, subcategory, leaderboard_id FROM scenarios
         WHERE difficulty_id = ?1 ORDER BY sort_order",
    )?;
    let mut thresholds = conn.prepare_cached(
        "SELECT score FROM thresholds WHERE scenario_id = ?1 ORDER BY rank_index",
    )?;
    let mut out = Vec::with_capacity(difficulties.len());
    for (id, mut difficulty) in difficulties {
        difficulty.ranks = ranks
            .query_map([id], |row| {
                Ok(Rank {
                    name: row.get(0)?,
                    color: row.get(1)?,
                })
            })?
            .collect::<rusqlite::Result<_>>()?;
        let rows: Vec<(i64, BenchmarkScenario)> = scenarios
            .query_map([id], |row| {
                Ok((
                    row.get(0)?,
                    BenchmarkScenario {
                        name: row.get(1)?,
                        category: row.get(2)?,
                        subcategory: row.get(3)?,
                        leaderboard_id: row.get(4)?,
                        thresholds: Vec::new(),
                    },
                ))
            })?
            .collect::<rusqlite::Result<_>>()?;
        for (scenario_id, mut scenario) in rows {
            scenario.thresholds = thresholds
                .query_map([scenario_id], |row| row.get(0))?
                .collect::<rusqlite::Result<_>>()?;
            difficulty.scenarios.push(scenario);
        }
        out.push(difficulty);
    }
    Ok(out)
}

fn write_alias(conn: &Connection, alias: &Alias, now: i64) -> Result<()> {
    conn.execute(
        "INSERT INTO scenario_aliases (raw_name, scenario_name, created_at) VALUES (?1, ?2, ?3)
         ON CONFLICT (raw_name) DO UPDATE SET scenario_name = excluded.scenario_name",
        params![alias.raw_name, alias.scenario_name, now],
    )?;
    Ok(())
}

fn write_plan(conn: &Connection, items: &[PlanItem]) -> Result<()> {
    conn.execute("DELETE FROM plans WHERE day_key = ?1", [STANDING_PLAN])?;
    let mut insert = conn.prepare_cached(
        "INSERT OR IGNORE INTO plans (day_key, scenario_name, target_runs, sort_order)
         VALUES (?1, ?2, ?3, ?4)",
    )?;
    for (order, item) in items.iter().enumerate() {
        insert.execute(params![
            STANDING_PLAN,
            item.scenario_name,
            item.target_runs.max(1),
            order as i64
        ])?;
    }
    Ok(())
}

fn write_day(conn: &Connection, day: &DayEntry, now: i64) -> Result<()> {
    let no_mood = day.mood.as_object().is_none_or(|mood| mood.is_empty());
    if no_mood && day.note.is_empty() {
        conn.execute("DELETE FROM days WHERE day_key = ?1", [&day.day_key])?;
        return Ok(());
    }
    let mood = if no_mood {
        "{}".to_owned()
    } else {
        day.mood.to_string()
    };
    conn.execute(
        "INSERT INTO days (day_key, mood, note, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (day_key) DO UPDATE SET
           mood = excluded.mood, note = excluded.note, updated_at = excluded.updated_at",
        params![day.day_key, mood, day.note, now],
    )?;
    Ok(())
}

fn write_setup(conn: &Connection, setup: &Setup) -> Result<()> {
    let values = params![
        setup.mouse,
        setup.mousepad,
        setup.sensitivity,
        setup.dpi,
        setup.fov,
        setup.notes
    ];
    let updated = conn.execute(
        "UPDATE setups SET mouse = ?1, mousepad = ?2, sensitivity = ?3, dpi = ?4, fov = ?5, notes = ?6
         WHERE is_default = 1",
        values,
    )?;
    if updated == 0 {
        conn.execute(
            "INSERT INTO setups (name, mouse, mousepad, sensitivity, dpi, fov, notes, is_default)
             VALUES ('默认', ?1, ?2, ?3, ?4, ?5, ?6, 1)",
            values,
        )?;
    }
    Ok(())
}

fn write_tracked(conn: &Connection, items: &[TrackedBenchmark]) -> Result<()> {
    conn.execute("DELETE FROM tracked_benchmarks", [])?;
    let mut insert = conn.prepare_cached(
        "INSERT OR IGNORE INTO tracked_benchmarks (benchmark, difficulty, sort_order, active)
         VALUES (?1, ?2, ?3, ?4)",
    )?;
    let mut active_seen = false;
    for (order, item) in items.iter().enumerate() {
        // Only the first one marked active counts; the schema allows one.
        let active = item.active && !active_seen;
        active_seen |= active;
        insert.execute(params![
            item.benchmark,
            item.difficulty,
            order as i64,
            active
        ])?;
    }
    Ok(())
}

fn write_benchmarks(conn: &Connection, items: &[BenchmarkDifficulty]) -> Result<()> {
    // Scenarios, thresholds and ranks go with their difficulty (ON DELETE CASCADE).
    conn.execute("DELETE FROM benchmark_difficulties", [])?;
    let mut difficulty = conn.prepare_cached(
        "INSERT OR IGNORE INTO benchmark_difficulties (benchmark, difficulty, kovaaks_id, sharecode, synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
    )?;
    let mut rank = conn.prepare_cached(
        "INSERT INTO ranks (difficulty_id, rank_index, name, color) VALUES (?1, ?2, ?3, ?4)",
    )?;
    let mut scenario = conn.prepare_cached(
        "INSERT OR IGNORE INTO scenarios (difficulty_id, name, category, subcategory, leaderboard_id, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    )?;
    let mut threshold = conn.prepare_cached(
        "INSERT INTO thresholds (scenario_id, rank_index, score) VALUES (?1, ?2, ?3)",
    )?;
    for item in items {
        if difficulty.execute(params![
            item.benchmark,
            item.difficulty,
            item.kovaaks_id,
            item.sharecode,
            item.synced_at
        ])? == 0
        {
            continue; // The same difficulty twice: keep the first.
        }
        let difficulty_id = conn.last_insert_rowid();
        for (index, entry) in item.ranks.iter().enumerate() {
            rank.execute(params![
                difficulty_id,
                index as i64,
                entry.name,
                entry.color
            ])?;
        }
        for (order, entry) in item.scenarios.iter().enumerate() {
            if scenario.execute(params![
                difficulty_id,
                entry.name,
                entry.category,
                entry.subcategory,
                entry.leaderboard_id,
                order as i64
            ])? == 0
            {
                continue;
            }
            let scenario_id = conn.last_insert_rowid();
            for (index, score) in entry.thresholds.iter().enumerate() {
                threshold.execute(params![scenario_id, index as i64, score])?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{OverrideReason, OverrideStatus};
    use serde_json::json;

    fn manual(identity: &str, score: f64) -> NewRun {
        NewRun {
            identity: identity.into(),
            source: RunSource::Manual,
            scenario: "VT Pasu Intermediate S5".into(),
            score,
            played_at: 1_793_701_862_000,
            played_local: "2026-11-03T19:31:02".into(),
            source_file: None,
            sensitivity: None,
            fov: None,
            dpi: None,
            note: Some("warm-up".into()),
        }
    }

    fn file_run(identity: &str) -> NewRun {
        NewRun {
            source: RunSource::File,
            source_file: Some("a.csv".into()),
            note: None,
            ..manual(identity, 700.0)
        }
    }

    fn viscose() -> BenchmarkDifficulty {
        BenchmarkDifficulty {
            benchmark: "Viscose Benchmarks S2".into(),
            difficulty: "Easier".into(),
            kovaaks_id: Some("617".into()),
            sharecode: None,
            synced_at: Some(5),
            ranks: vec![
                Rank {
                    name: "Iron".into(),
                    color: Some("#888".into()),
                },
                Rank {
                    name: "Bronze".into(),
                    color: None,
                },
            ],
            scenarios: vec![
                BenchmarkScenario {
                    name: "VT Pasu Easy".into(),
                    category: Some("Clicking".into()),
                    subcategory: Some("Dynamic".into()),
                    leaderboard_id: Some("101".into()),
                    thresholds: vec![400.0, 500.0],
                },
                BenchmarkScenario {
                    name: "VT Smoothbot Easy".into(),
                    category: Some("Tracking".into()),
                    subcategory: None,
                    leaderboard_id: None,
                    thresholds: vec![2000.0, 2400.0],
                },
            ],
        }
    }

    #[test]
    fn manual_runs_can_be_changed_and_deleted_but_imported_runs_cannot() {
        let mut db = Db::open_in_memory().unwrap();
        db.insert_runs(&[file_run("csv:a")], 1).unwrap();
        assert!(db.save_manual_run(&manual("manual-1", 500.0), 2).unwrap());
        assert!(db.save_manual_run(&manual("manual-1", 550.0), 3).unwrap());
        assert!(
            !db.save_manual_run(&manual("csv:a", 1.0), 4).unwrap(),
            "an imported run is not overwritten"
        );
        let runs = db.runs_after(0).unwrap();
        assert_eq!(runs.len(), 2);
        assert_eq!(runs[0].score, 700.0);
        assert_eq!(runs[1].score, 550.0);
        assert_eq!(runs[1].note.as_deref(), Some("warm-up"));

        db.delete_manual_run("manual-1", 5).unwrap();
        db.delete_manual_run("csv:a", 5).unwrap();
        let left = db.runs_after(0).unwrap();
        assert_eq!(left.len(), 1);
        assert_eq!(left[0].identity, "csv:a");
        assert!(db.runs_after(left[0].id).unwrap().is_empty());

        assert!(
            db.save_manual_run(&manual("manual-1", 560.0), 6).unwrap(),
            "saving again brings it back"
        );
        assert_eq!(db.run_count().unwrap(), 2);
    }

    #[test]
    fn everything_saved_comes_back_in_load_app_data() {
        let mut db = Db::open_in_memory().unwrap();
        db.save_benchmarks(&[viscose()]).unwrap();
        db.save_tracked(&[
            TrackedBenchmark {
                benchmark: "Viscose Benchmarks S2".into(),
                difficulty: "Medium".into(),
                active: false,
            },
            TrackedBenchmark {
                benchmark: "Viscose Benchmarks S2".into(),
                difficulty: "Easier".into(),
                active: true,
            },
        ])
        .unwrap();
        let alias = Alias {
            raw_name: "Pasu Easy".into(),
            scenario_name: "VT Pasu Easy".into(),
        };
        db.set_alias(&alias, 1).unwrap();
        let plan = vec![
            PlanItem {
                scenario_name: "VT Pasu Easy".into(),
                target_runs: 3,
            },
            PlanItem {
                scenario_name: "VT Smoothbot Easy".into(),
                target_runs: 0,
            },
        ];
        db.save_plan(&plan).unwrap();
        let day = DayEntry {
            day_key: "2026-11-03".into(),
            mood: json!({ "sleep": "一般" }),
            note: "good day".into(),
        };
        db.save_day(&day, 2).unwrap();
        db.save_day(
            &DayEntry {
                day_key: "2026-11-04".into(),
                mood: json!({}),
                note: String::new(),
            },
            3,
        )
        .unwrap();
        let setup = Setup {
            mouse: "Viper".into(),
            dpi: "1600".into(),
            ..Setup::default()
        };
        db.save_setup(&setup).unwrap();
        db.save_setup(&setup).unwrap();
        db.set_setting("rules.dayStartHour", "4").unwrap();

        let data = db.load_app_data().unwrap();
        assert_eq!(data.benchmarks, vec![viscose()]);
        assert_eq!(data.tracked.len(), 2);
        assert_eq!(data.tracked[0].difficulty, "Medium");
        assert!(data.tracked[1].active);
        assert_eq!(data.aliases, vec![alias]);
        assert_eq!(data.plan[0], plan[0]);
        assert_eq!(
            data.plan[1].target_runs, 1,
            "a plan item has at least one run"
        );
        assert_eq!(data.days, vec![day], "an empty day isn't stored");
        assert_eq!(data.setup, Some(setup));
        assert_eq!(data.settings.get("rules.dayStartHour"), Some(&json!(4)));
        assert_eq!(data.last_import_at, None);

        db.save_benchmarks(&[]).unwrap();
        assert!(db.load_app_data().unwrap().benchmarks.is_empty());
        let orphans: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM thresholds", [], |row| row.get(0))
            .unwrap();
        assert_eq!(orphans, 0, "thresholds go with their benchmark");
    }

    #[test]
    fn restoring_a_backup_replaces_choices_and_keeps_imported_runs() {
        let mut db = Db::open_in_memory().unwrap();
        db.insert_runs(&[file_run("csv:a")], 1).unwrap();
        db.save_manual_run(&manual("manual-old", 1.0), 1).unwrap();
        db.set_override(&RunOverride {
            identity: "csv:a".into(),
            status: OverrideStatus::Excluded,
            reason: OverrideReason::Manual,
            note: None,
            updated_at: 1,
        })
        .unwrap();

        let ignored = RunOverride {
            identity: "csv:b".into(),
            status: OverrideStatus::Excluded,
            reason: OverrideReason::Manual,
            note: Some("mouse died".into()),
            updated_at: 2,
        };
        let backup = Restore {
            runs: vec![
                manual("manual-new", 600.0),
                NewRun {
                    source: RunSource::Legacy,
                    ..file_run("csv:a")
                },
                NewRun {
                    source: RunSource::Legacy,
                    ..file_run("csv:b")
                },
            ],
            overrides: vec![ignored.clone()],
            aliases: vec![],
            benchmarks: Some(vec![viscose()]),
            tracked: vec![TrackedBenchmark {
                benchmark: "Viscose Benchmarks S2".into(),
                difficulty: "Easier".into(),
                active: true,
            }],
            days: vec![],
            plan: vec![],
            setup: None,
            settings: BTreeMap::from([("rules.dayStartHour".to_owned(), json!(5))]),
        };
        assert_eq!(db.restore(&backup, 10).unwrap(), 2);

        let data = db.load_app_data().unwrap();
        let identities: Vec<_> = data.runs.iter().map(|run| run.identity.as_str()).collect();
        assert_eq!(identities, ["csv:a", "manual-new", "csv:b"]);
        assert_eq!(
            data.runs[0].source,
            RunSource::File,
            "the imported run stays as it was"
        );
        assert_eq!(data.overrides, vec![ignored]);
        assert_eq!(data.benchmarks.len(), 1);
        assert_eq!(data.settings.get("rules.dayStartHour"), Some(&json!(5)));

        let again = Restore {
            benchmarks: None,
            ..backup
        };
        db.restore(&again, 11).unwrap();
        assert_eq!(
            db.load_app_data().unwrap().benchmarks.len(),
            1,
            "a backup without benchmarks keeps the stored ones"
        );
    }

    #[test]
    fn restores_are_preceded_by_a_copy_and_old_copies_are_pruned() {
        let dir = std::env::temp_dir().join(format!("kovaak-copy-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let db = Db::open(&dir.join("tracker.db")).unwrap();

        assert_eq!(
            db.copy_before_restore("20261109-000000").unwrap(),
            None,
            "an empty database has nothing to keep"
        );
        assert!(
            Db::open_in_memory()
                .unwrap()
                .copy_before_restore("x")
                .unwrap()
                .is_none()
        );

        db.save_manual_run(&manual("manual-1", 1.0), 1).unwrap();
        let first = db.copy_before_restore("20261109-000001").unwrap().unwrap();
        let again = db.copy_before_restore("20261109-000001").unwrap().unwrap();
        assert_ne!(
            first, again,
            "a second copy in the same second gets its own name"
        );
        let copy = Db::open(&first).unwrap();
        let runs = copy.load_app_data().unwrap().runs;
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].identity, "manual-1");
        drop(copy);

        for n in 2..=7 {
            std::thread::sleep(std::time::Duration::from_millis(20));
            db.copy_before_restore(&format!("20261109-00000{n}"))
                .unwrap();
        }
        let mut kept: Vec<String> = fs::read_dir(dir.join(COPY_DIR))
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        kept.sort();
        assert_eq!(kept.len(), KEPT_COPIES);
        assert_eq!(kept[0], "tracker-before-restore-20261109-000003.db");
        assert_eq!(kept[4], "tracker-before-restore-20261109-000007.db");

        drop(db);
        let _ = fs::remove_dir_all(&dir);
    }
}
