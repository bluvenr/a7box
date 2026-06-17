// A7Box IPC Commands
// Tauri commands exposed to frontend via invoke()

use crate::clipboard::{self, ClipboardState};
use std::sync::Arc;
use tauri::AppHandle;

/// Start clipboard watcher
#[tauri::command]
pub fn start_clipboard_watcher(app: AppHandle, state: tauri::State<'_, Arc<ClipboardState>>) {
    clipboard::start_clipboard_watcher(app, state.inner().clone());
}

/// Stop clipboard watcher
#[tauri::command]
pub fn stop_clipboard_watcher(state: tauri::State<'_, Arc<ClipboardState>>) {
    clipboard::stop_clipboard_watcher(state.inner());
}

/// Get clipboard text content
#[tauri::command]
pub fn get_clipboard_text() -> Result<String, String> {
    arboard::Clipboard::new()
        .map_err(|e| e.to_string())?
        .get_text()
        .map_err(|e| e.to_string())
}
