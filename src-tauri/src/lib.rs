pub mod db;
mod stats;

use std::sync::Mutex;

use tauri::Manager;

/// The open database, shared by commands. Missing if it couldn't be opened.
pub struct AppDb(pub Mutex<db::Db>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            stats::list_stats_files,
            stats::read_stats_file
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // Nothing reads the database yet (the screens still use webview storage), so a
            // failure here is logged instead of stopping the app.
            match open_db(app.handle()) {
                Ok(db) => {
                    app.manage(AppDb(Mutex::new(db)));
                }
                Err(err) => log::error!("could not open the database: {err}"),
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the Kovaak Tracker app");
}

fn open_db(app: &tauri::AppHandle) -> Result<db::Db, Box<dyn std::error::Error>> {
    let dir = app.path().app_data_dir()?;
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
