// A7Box Clipboard Commands

use crate::clipboard::{self, ClipboardState};
use std::sync::Arc;
use tauri::AppHandle;

#[tauri::command]
pub fn start_clipboard_watcher(app: AppHandle, state: tauri::State<'_, Arc<ClipboardState>>) {
    clipboard::start_clipboard_watcher(app, state.inner().clone());
}

#[tauri::command]
pub fn stop_clipboard_watcher(state: tauri::State<'_, Arc<ClipboardState>>) {
    clipboard::stop_clipboard_watcher(state.inner());
}

#[tauri::command]
pub fn get_clipboard_text() -> Result<String, String> {
    arboard::Clipboard::new()
        .map_err(|e| e.to_string())?
        .get_text()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_clipboard_text(text: String) -> Result<(), String> {
    arboard::Clipboard::new()
        .map_err(|e| e.to_string())?
        .set_text(text)
        .map_err(|e| e.to_string())
}

/// Returns clipboard image as { base64, width, height } or error if no image
#[tauri::command]
pub fn get_clipboard_image() -> Result<serde_json::Value, String> {
    use arboard::ImageData;
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    let img: ImageData = clipboard.get_image().map_err(|e| e.to_string())?;
    if img.width == 0 || img.height == 0 {
        return Err("No image in clipboard".into());
    }
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &img.bytes);
    Ok(serde_json::json!({
        "base64": b64,
        "width": img.width,
        "height": img.height,
    }))
}
