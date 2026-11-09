//! The tray icon: closing the window hides it there, and the app keeps importing new runs.
//! Menu: open the window, pause or resume watching the stats folder, quit.

use tauri::{
    AppHandle, Manager, Runtime, WindowEvent,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_notification::NotificationExt;

use crate::{AppDb, importer::WatcherStatus};

const TRAY_ID: &str = "main";
const SHOW: &str = "show";
const PAUSE: &str = "pause";
const QUIT: &str = "quit";
/// Set once the player has been told that closing the window leaves the app in the tray.
const HINT_SHOWN_KEY: &str = "tray.hintShown";

/// The menu entry that changes with the watcher's state.
struct PauseItem<R: Runtime>(MenuItem<R>);

pub fn setup<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, SHOW, "打开 Kovaak Tracker", true, None::<&str>)?;
    // Enabled once there is a folder to watch (see `show_status`).
    let pause = MenuItem::with_id(app, PAUSE, "暂停监听", false, None::<&str>)?;
    let quit = MenuItem::with_id(app, QUIT, "退出", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&show, &pause, &PredefinedMenuItem::separator(app)?, &quit],
    )?;
    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Kovaak Tracker")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            SHOW => show_main(app),
            PAUSE => toggle_watching(app),
            QUIT => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    app.manage(PauseItem(pause));
    Ok(())
}

/// Brings the main window back from the tray (or from behind other windows).
pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Closing the main window hides it; the tray menu's "退出" quits.
pub fn on_window_event<R: Runtime>(window: &tauri::Window<R>, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event
        && window.label() == "main"
    {
        api.prevent_close();
        let _ = window.hide();
        hint_once(window.app_handle());
    }
}

/// The first time the window is hidden, says where the app went.
fn hint_once<R: Runtime>(app: &AppHandle<R>) {
    let Some(db) = app.try_state::<AppDb>() else {
        return;
    };
    let Ok(db) = db.lock() else {
        return;
    };
    if db.setting(HINT_SHOWN_KEY).ok().flatten().is_some() {
        return;
    }
    let _ = db.set_setting(HINT_SHOWN_KEY, "true");
    drop(db);
    if let Err(err) = app
        .notification()
        .builder()
        .title("Kovaak Tracker 还在托盘里")
        .body(
            "关闭窗口后仍会导入新成绩。点托盘图标打开窗口；要退出请在托盘图标的菜单里选\"退出\"。",
        )
        .show()
    {
        log::warn!("could not show the tray hint: {err}");
    }
}

fn toggle_watching<R: Runtime>(app: &AppHandle<R>) {
    if let Some(importer) = app.try_state::<crate::importer::Importer>()
        && let Err(err) = importer.toggle_auto()
    {
        log::error!("could not pause or resume watching: {err}");
    }
}

/// Keeps the tray's tooltip and pause entry in step with the watcher.
pub fn show_status<R: Runtime>(app: &AppHandle<R>, status: &WatcherStatus) {
    if let Some(pause) = app.try_state::<PauseItem<R>>() {
        let _ = pause.0.set_text(if status.auto {
            "暂停监听"
        } else {
            "恢复监听"
        });
        let _ = pause.0.set_enabled(status.dir.is_some());
    }
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let state = match (&status.dir, &status.error) {
            (None, _) => "还没选择 stats 文件夹",
            (Some(_), Some(_)) => "无法监听 stats 文件夹",
            (Some(_), None) if status.watching => "正在监听新成绩",
            (Some(_), None) => "已暂停监听",
        };
        let _ = tray.set_tooltip(Some(format!("Kovaak Tracker · {state}")));
    }
}
