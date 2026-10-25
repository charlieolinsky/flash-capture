mod capture;
mod commands;
mod models;
mod storage;
mod tray;
mod watch;

use tauri::{Manager, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

fn register_hotkey(app: &tauri::AppHandle) -> Result<(), String> {
    let settings = storage::load_settings().unwrap_or_default();
    let hotkey = if settings.hotkey.trim().is_empty() {
        "CommandOrControl+Shift+F".to_string()
    } else {
        settings.hotkey
    };

    let _ = app.global_shortcut().unregister_all();

    app.global_shortcut()
        .on_shortcut(hotkey.as_str(), |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                capture::run_capture_flow(app);
            }
        })
        .map_err(|e| format!("Failed to register hotkey '{hotkey}': {e}"))?;

    Ok(())
}

#[tauri::command]
fn reregister_hotkey(app: tauri::AppHandle) -> Result<(), String> {
    register_hotkey(&app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::get_store,
            commands::get_settings,
            commands::save_settings,
            commands::upsert_card,
            commands::delete_card,
            commands::upsert_deck,
            commands::delete_deck,
            commands::review_card,
            commands::export_store,
            commands::export_store_to_path,
            commands::import_store,
            commands::import_store_from_path,
            commands::get_data_dir,
            commands::trigger_capture,
            commands::get_pending_capture,
            commands::clear_pending_capture,
            commands::hide_capture_window,
            reregister_hotkey,
        ])
        .setup(|app| {
            let _ = storage::load_store();
            let _ = storage::load_settings();

            if let Err(e) = tray::setup_tray(app.handle()) {
                eprintln!("Tray setup failed: {e}");
            }
            if let Err(e) = register_hotkey(app.handle()) {
                eprintln!("Hotkey registration failed: {e}");
            }
            watch::start_store_watcher(app.handle().clone());

            if let Some(main) = app.get_webview_window("main") {
                let handle = app.handle().clone();
                main.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        if let Some(win) = handle.get_webview_window("main") {
                            let _ = win.hide();
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
