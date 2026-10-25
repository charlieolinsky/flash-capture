use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

pub fn setup_tray(app: &AppHandle) -> Result<(), String> {
    let open = MenuItem::with_id(app, "open", "Open Library", true, None::<&str>)
        .map_err(|e| format!("menu item: {e}"))?;
    let capture = MenuItem::with_id(app, "capture", "Quick Capture (clipboard)", true, None::<&str>)
        .map_err(|e| format!("menu item: {e}"))?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)
        .map_err(|e| format!("menu item: {e}"))?;

    let menu = Menu::with_items(app, &[&open, &capture, &quit])
        .map_err(|e| format!("menu: {e}"))?;

    let _tray = TrayIconBuilder::new()
        .icon(
            app.default_window_icon()
                .ok_or_else(|| "Missing default window icon".to_string())?
                .clone(),
        )
        .menu(&menu)
        .tooltip("FlashCapture")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            "capture" => {
                crate::capture::run_capture_flow(app);
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
        })
        .build(app)
        .map_err(|e| format!("tray: {e}"))?;

    Ok(())
}
