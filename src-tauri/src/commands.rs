//! Commands the screens use to read and change what the database keeps (`src/data/tauriData.ts`).
//! Importing from the stats folder lives in `importer`.

use serde::Serialize;
use tauri::State;

use crate::{
    AppDb,
    db::{
        Alias, AppData, BenchmarkDifficulty, DayEntry, Db, NewRun, PlanItem, Restore, RunOverride,
        RunSource, Setup, StoredRun, TrackedBenchmark,
    },
    importer::{AUTO_IMPORT_KEY, STATS_DIR_KEY, now_ms},
};

fn with_db<T>(
    db: &State<'_, AppDb>,
    action: impl FnOnce(&mut Db) -> crate::db::Result<T>,
) -> Result<T, String> {
    action(&mut *db.lock()?).map_err(|err| {
        log::error!("database: {err}");
        format!("数据库出错：{err}")
    })
}

#[tauri::command]
pub fn data_load(db: State<'_, AppDb>) -> Result<AppData, String> {
    with_db(&db, |db| db.load_app_data())
}

/// Runs stored after the run with id `after` (new imports), oldest first.
#[tauri::command]
pub fn runs_after(db: State<'_, AppDb>, after: i64) -> Result<Vec<StoredRun>, String> {
    with_db(&db, |db| db.runs_after(after))
}

#[tauri::command]
pub fn override_set(db: State<'_, AppDb>, item: RunOverride) -> Result<(), String> {
    with_db(&db, |db| db.set_override(&item))
}

#[tauri::command]
pub fn override_clear(db: State<'_, AppDb>, identity: String) -> Result<(), String> {
    with_db(&db, |db| db.clear_override(&identity))
}

/// Adds a manual run or changes one.
#[tauri::command]
pub fn manual_run_save(db: State<'_, AppDb>, run: NewRun) -> Result<(), String> {
    if run.source != RunSource::Manual {
        return Err("只能修改手动录入的成绩".into());
    }
    match with_db(&db, |db| db.save_manual_run(&run, now_ms()))? {
        true => Ok(()),
        false => Err("只能修改手动录入的成绩".into()),
    }
}

#[tauri::command]
pub fn manual_run_delete(db: State<'_, AppDb>, identity: String) -> Result<(), String> {
    with_db(&db, |db| db.delete_manual_run(&identity, now_ms()))
}

#[tauri::command]
pub fn alias_set(db: State<'_, AppDb>, alias: Alias) -> Result<(), String> {
    with_db(&db, |db| db.set_alias(&alias, now_ms()))
}

#[tauri::command]
pub fn plan_save(db: State<'_, AppDb>, items: Vec<PlanItem>) -> Result<(), String> {
    with_db(&db, |db| db.save_plan(&items))
}

#[tauri::command]
pub fn day_save(db: State<'_, AppDb>, day: DayEntry) -> Result<(), String> {
    with_db(&db, |db| db.save_day(&day, now_ms()))
}

#[tauri::command]
pub fn setup_save(db: State<'_, AppDb>, setup: Setup) -> Result<(), String> {
    with_db(&db, |db| db.save_setup(&setup))
}

#[tauri::command]
pub fn tracked_save(db: State<'_, AppDb>, items: Vec<TrackedBenchmark>) -> Result<(), String> {
    with_db(&db, |db| db.save_tracked(&items))
}

#[tauri::command]
pub fn benchmarks_save(
    db: State<'_, AppDb>,
    items: Vec<BenchmarkDifficulty>,
) -> Result<(), String> {
    with_db(&db, |db| db.save_benchmarks(&items))
}

/// Settings keys the importer owns; they change through its own commands.
fn importer_key(key: &str) -> bool {
    key == STATS_DIR_KEY || key == AUTO_IMPORT_KEY
}

#[tauri::command]
pub fn setting_set(
    db: State<'_, AppDb>,
    key: String,
    value: serde_json::Value,
) -> Result<(), String> {
    if importer_key(&key) {
        return Err(format!("{key} 不能直接修改"));
    }
    with_db(&db, |db| db.set_setting(&key, &value.to_string()))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Restored {
    /// Runs the database didn't have yet.
    added: usize,
    /// Where the database was copied before the restore; None when it held nothing to lose.
    copy: Option<String>,
}

/// Copies the database aside, then restores a backup. Nothing is replaced if the copy fails.
#[tauri::command]
pub fn data_restore(db: State<'_, AppDb>, mut backup: Restore) -> Result<Restored, String> {
    backup.settings.retain(|key, _| !importer_key(key));
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let mut db = db.lock()?;
    let copy = db.copy_before_restore(&stamp).map_err(|err| {
        log::error!("copy before restore: {err}");
        format!("没能先把当前数据另存一份，所以没有导入：{err}")
    })?;
    let added = db.restore(&backup, now_ms()).map_err(|err| {
        log::error!("restore: {err}");
        format!("数据库出错：{err}")
    })?;
    Ok(Restored {
        added,
        copy: copy.map(|path| path.display().to_string()),
    })
}
