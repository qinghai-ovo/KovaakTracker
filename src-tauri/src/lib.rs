mod commands;
pub mod db;
pub mod importer;

use std::sync::{Arc, Mutex, MutexGuard};

use tauri::Manager;

/// The open database, shared by commands and the import thread, or why it couldn't be opened.
pub struct AppDb(Result<Arc<Mutex<db::Db>>, String>);

impl AppDb {
    pub fn lock(&self) -> Result<MutexGuard<'_, db::Db>, String> {
        match &self.0 {
            Ok(db) => Ok(importer::lock(db)),
            Err(err) => Err(err.clone()),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            commands::data_load,
            commands::runs_after,
            commands::override_set,
            commands::override_clear,
            commands::manual_run_save,
            commands::manual_run_delete,
            commands::alias_set,
            commands::plan_save,
            commands::day_save,
            commands::setup_save,
            commands::tracked_save,
            commands::benchmarks_save,
            commands::setting_set,
            commands::data_restore,
            importer::stats_dir_set,
            importer::import_rescan,
            importer::import_set_auto,
            importer::import_status
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // Without a database the window still opens and says why (data_load returns the error).
            let db = match open_db(app.handle()) {
                Ok(db) => {
                    let db = Arc::new(Mutex::new(db));
                    app.manage(importer::Importer::start(app.handle().clone(), db.clone()));
                    Ok(db)
                }
                Err(err) => {
                    log::error!("could not open the database: {err}");
                    Err(format!("无法打开数据库：{err}"))
                }
            };
            app.manage(AppDb(db));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the Kovaak Tracker app");
}

/// Folder to keep the database in instead of the app data folder, e.g. to try a build without
/// touching the real data.
const DATA_DIR_ENV: &str = "KOVAAK_TRACKER_DATA_DIR";

fn open_db(app: &tauri::AppHandle) -> Result<db::Db, Box<dyn std::error::Error>> {
    let dir = match std::env::var_os(DATA_DIR_ENV) {
        Some(dir) => std::path::PathBuf::from(dir),
        None => app.path().app_data_dir()?,
    };
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(db::DB_FILE_NAME);
    let db = db::Db::open(&path)?;
    log::info!(
        "database ready at {} (schema {})",
        path.display(),
        db.schema_version()?
    );
    Ok(db)
}
