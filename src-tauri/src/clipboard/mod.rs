// A7Box Clipboard Watcher Module
// Monitors clipboard changes and emits events to frontend

use arboard::Clipboard;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Shared clipboard state
pub struct ClipboardState {
    pub running: Arc<Mutex<bool>>,
    last_text: Arc<Mutex<String>>,
}

impl ClipboardState {
    pub fn new() -> Self {
        Self {
            running: Arc::new(Mutex::new(false)),
            last_text: Arc::new(Mutex::new(String::new())),
        }
    }
}

/// Start watching clipboard for text changes
/// Emits "clipboard-changed" event with the new text
pub fn start_clipboard_watcher(app: AppHandle, state: Arc<ClipboardState>) {
    // Set running flag
    {
        let mut running = state.running.lock().unwrap();
        if *running {
            return; // Already running
        }
        *running = true;
    }

    let running = state.running.clone();
    let last_text = state.last_text.clone();

    std::thread::spawn(move || {
        let mut clipboard = match Clipboard::new() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[A7Box] Failed to init clipboard: {}", e);
                return;
            }
        };

        while *running.lock().unwrap() {
            if let Ok(text) = clipboard.get_text() {
                let mut prev = last_text.lock().unwrap();
                if text != *prev && !text.is_empty() {
                    *prev = text.clone();
                    // Emit event to frontend
                    let _ = app.emit("clipboard-changed", &text);
                }
            }
            std::thread::sleep(Duration::from_millis(500));
        }
    });
}

/// Stop the clipboard watcher
pub fn stop_clipboard_watcher(state: &ClipboardState) {
    let mut running = state.running.lock().unwrap();
    *running = false;
}
