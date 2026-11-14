mod commands;
mod models;
mod storage;
mod watch;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
        ])
        .setup(|app| {
            let _ = storage::load_store();
            let _ = storage::load_settings();
            watch::start_store_watcher(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
