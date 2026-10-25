use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use crate::storage;

/// Watch cards.json / settings.json and emit `store-changed` when they change on disk
/// (CLI, other sessions, or this app's own writes).
pub fn start_store_watcher(app: AppHandle) {
    thread::spawn(move || {
        let dir = match storage::data_dir_path() {
            Ok(p) => PathBuf::from(p),
            Err(e) => {
                eprintln!("store watcher: data dir error: {e}");
                return;
            }
        };

        let (tx, rx) = mpsc::channel();
        let mut watcher = match RecommendedWatcher::new(
            move |res: Result<notify::Event, notify::Error>| {
                let _ = tx.send(res);
            },
            notify::Config::default(),
        ) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("store watcher: init failed: {e}");
                // Fallback: mtime poll only
                poll_mtime_loop(app);
                return;
            }
        };

        if let Err(e) = watcher.watch(&dir, RecursiveMode::NonRecursive) {
            eprintln!("store watcher: watch failed: {e}");
            poll_mtime_loop(app);
            return;
        }

        let mut last_emit = Instant::now() - Duration::from_secs(1);
        loop {
            match rx.recv_timeout(Duration::from_secs(2)) {
                Ok(Ok(event)) => {
                    let relevant = event.paths.iter().any(|p| {
                        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                        name == "cards.json" || name == "settings.json" || name.ends_with(".tmp")
                    });
                    let interesting = matches!(
                        event.kind,
                        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
                    );
                    if relevant && interesting {
                        // Debounce bursty FSEvents
                        if last_emit.elapsed() >= Duration::from_millis(150) {
                            last_emit = Instant::now();
                            // Brief delay so atomic replace finishes
                            thread::sleep(Duration::from_millis(40));
                            let _ = app.emit("store-changed", ());
                        }
                    }
                }
                Ok(Err(e)) => eprintln!("store watcher event error: {e}"),
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    // Keep thread alive; also a light heartbeat for stubborn FS backends
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    });
}

fn poll_mtime_loop(app: AppHandle) {
    let cards = PathBuf::from(storage::data_dir_path().unwrap_or_default()).join("cards.json");
    let mut last = std::fs::metadata(&cards)
        .and_then(|m| m.modified())
        .ok();
    loop {
        thread::sleep(Duration::from_millis(750));
        let now = std::fs::metadata(&cards)
            .and_then(|m| m.modified())
            .ok();
        if now != last {
            last = now;
            let _ = app.emit("store-changed", ());
        }
    }
}
