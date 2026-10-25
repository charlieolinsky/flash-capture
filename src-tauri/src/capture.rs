use crate::models::CapturePayload;
use enigo::{
    Direction::{Click, Press, Release},
    Enigo, Key, Keyboard, Settings as EnigoSettings,
};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_clipboard_manager::ClipboardExt;

/// Latest capture payload so the Quick Capture window can pull it on mount
/// (avoids losing the event if the webview listener was not ready yet).
pub static PENDING_CAPTURE: Mutex<Option<CapturePayload>> = Mutex::new(None);

fn stash_payload(payload: &CapturePayload) {
    if let Ok(mut guard) = PENDING_CAPTURE.lock() {
        *guard = Some(payload.clone());
    }
}

pub fn take_pending_payload() -> Option<CapturePayload> {
    PENDING_CAPTURE.lock().ok().and_then(|mut g| g.take())
}

pub fn peek_pending_payload() -> Option<CapturePayload> {
    PENDING_CAPTURE.lock().ok().and_then(|g| g.clone())
}

/// Release leftover modifiers from the global hotkey (e.g. ⌘⇧F) before sending ⌘C.
fn release_modifiers(enigo: &mut Enigo) {
    let keys = [
        Key::Meta,
        Key::Shift,
        Key::Control,
        Key::Alt,
        #[cfg(target_os = "macos")]
        Key::RCommand,
    ];
    for key in keys {
        let _ = enigo.key(key, Release);
    }
}

fn simulate_copy() -> Result<(), String> {
    let mut settings = EnigoSettings::default();
    // Keep simulated ⌘C independent of physically held Shift/Meta from the hotkey.
    settings.independent_of_keyboard_state = true;
    settings.open_prompt_to_get_permissions = true;

    let mut enigo =
        Enigo::new(&settings).map_err(|e| format!("Input simulation failed: {e}"))?;

    // Hotkey keys are often still down when this runs.
    release_modifiers(&mut enigo);
    thread::sleep(Duration::from_millis(80));
    release_modifiers(&mut enigo);
    thread::sleep(Duration::from_millis(40));

    #[cfg(target_os = "macos")]
    {
        enigo
            .key(Key::Meta, Press)
            .map_err(|e| format!("Key press failed: {e}"))?;
        thread::sleep(Duration::from_millis(20));
        enigo
            .key(Key::Unicode('c'), Click)
            .map_err(|e| format!("Key click failed: {e}"))?;
        thread::sleep(Duration::from_millis(20));
        enigo
            .key(Key::Meta, Release)
            .map_err(|e| format!("Key release failed: {e}"))?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        enigo
            .key(Key::Control, Press)
            .map_err(|e| format!("Key press failed: {e}"))?;
        thread::sleep(Duration::from_millis(20));
        enigo
            .key(Key::Unicode('c'), Click)
            .map_err(|e| format!("Key click failed: {e}"))?;
        thread::sleep(Duration::from_millis(20));
        enigo
            .key(Key::Control, Release)
            .map_err(|e| format!("Key release failed: {e}"))?;
    }

    // Ensure enigo flushes events before drop (macOS quirk).
    drop(enigo);
    Ok(())
}

fn clipboard_changed(previous: &str, after: &str) -> bool {
    let a = after.trim();
    !a.is_empty() && a != previous.trim()
}

pub fn capture_selection_text(app: &AppHandle) -> CapturePayload {
    let clipboard = app.clipboard();
    let previous = clipboard.read_text().unwrap_or_default();

    let sim_result = simulate_copy();

    // Poll: browsers often need >100ms before the clipboard updates.
    let mut after = previous.clone();
    for _ in 0..12 {
        thread::sleep(Duration::from_millis(50));
        after = clipboard.read_text().unwrap_or_default();
        if clipboard_changed(&previous, &after) {
            break;
        }
    }

    let captured = after.clone();

    // Restore prior clipboard after we have our copy (best effort).
    let _ = clipboard.write_text(previous.clone());

    if let Err(e) = sim_result {
        let from_selection = clipboard_changed(&previous, &captured);
        let answer = if from_selection {
            captured
        } else if !previous.trim().is_empty() {
            previous
        } else {
            String::new()
        };
        return CapturePayload {
            answer: answer.trim().to_string(),
            from_selection,
            notice: Some(format!(
                "Copy simulation failed ({e}). On macOS, enable Accessibility for FlashCapture (or your terminal if using `tauri dev`) in System Settings → Privacy & Security → Accessibility."
            )),
        };
    }

    if captured.trim().is_empty() {
        return CapturePayload {
            answer: String::new(),
            from_selection: false,
            notice: Some(
                "No text captured. Highlight text, grant Accessibility, then try again — or copy with ⌘C first and use Quick Capture."
                    .to_string(),
            ),
        };
    }

    let from_selection = clipboard_changed(&previous, &captured);
    let notice = if from_selection {
        None
    } else {
        Some(
            "Clipboard did not change after Copy. Using existing clipboard text. If you highlighted a selection, grant Accessibility to FlashCapture (System Settings → Privacy & Security → Accessibility)."
                .to_string(),
        )
    };

    CapturePayload {
        answer: captured.trim().to_string(),
        from_selection,
        notice,
    }
}

fn emit_payload(app: &AppHandle, payload: &CapturePayload) {
    stash_payload(payload);
    if let Some(win) = app.get_webview_window("capture") {
        let _ = win.emit("capture-payload", payload);
        // Also emit on the app handle so any window can hear it.
        let _ = app.emit("capture-payload", payload);
    } else {
        let _ = app.emit("capture-payload", payload);
    }
}

pub fn show_capture_window(app: &AppHandle, payload: CapturePayload) -> Result<(), String> {
    stash_payload(&payload);

    if let Some(win) = app.get_webview_window("capture") {
        emit_payload(app, &payload);
        win.show()
            .map_err(|e| format!("Failed to show capture window: {e}"))?;
        win.set_focus()
            .map_err(|e| format!("Failed to focus capture window: {e}"))?;
        // Re-emit after a short delay in case the listener attached late.
        let app_handle = app.clone();
        let payload2 = payload.clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(150));
            emit_payload(&app_handle, &payload2);
            thread::sleep(Duration::from_millis(250));
            emit_payload(&app_handle, &payload2);
        });
        return Ok(());
    }

    let _win = WebviewWindowBuilder::new(
        app,
        "capture",
        WebviewUrl::App("index.html?window=capture".into()),
    )
    .title("Quick Capture")
    .inner_size(480.0, 420.0)
    .resizable(true)
    .always_on_top(true)
    .center()
    .visible(true)
    .build()
    .map_err(|e| format!("Failed to create capture window: {e}"))?;

    let app_handle = app.clone();
    thread::spawn(move || {
        // First paint + React effect need time; pull-based pending payload is the backup.
        for delay in [100, 250, 500, 900] {
            thread::sleep(Duration::from_millis(delay));
            emit_payload(&app_handle, &payload);
            if let Some(win) = app_handle.get_webview_window("capture") {
                let _ = win.set_focus();
            }
        }
    });

    Ok(())
}

pub fn run_capture_flow(app: &AppHandle) {
    // Run copy while the source app (browser) still has focus — do not show our
    // window until after clipboard capture completes.
    let payload = capture_selection_text(app);
    eprintln!(
        "FlashCapture: captured {} chars, from_selection={}",
        payload.answer.len(),
        payload.from_selection
    );
    if let Err(e) = show_capture_window(app, payload) {
        eprintln!("Capture flow error: {e}");
    }
}
