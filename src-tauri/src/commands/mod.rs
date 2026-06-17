// A7Box IPC Commands
// Tauri commands exposed to frontend via invoke()

use crate::clipboard::{self, ClipboardState};
use crate::http_server::{self, HttpServerState};
use crate::screenshot;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::AppHandle;

// ============ Clipboard Commands ============

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

// ============ Screenshot Commands ============

#[tauri::command]
pub fn capture_full_screen() -> Result<screenshot::CaptureResult, String> {
    screenshot::capture_full_screen()
}

#[tauri::command]
pub fn capture_region(x: i32, y: i32, width: u32, height: u32) -> Result<screenshot::CaptureResult, String> {
    screenshot::capture_region(x, y, width, height)
}

#[tauri::command]
pub fn capture_to_base64() -> Result<String, String> {
    screenshot::capture_to_base64()
}

#[tauri::command]
pub fn get_monitors() -> Result<Vec<screenshot::MonitorInfo>, String> {
    screenshot::get_monitors()
}

#[tauri::command]
pub fn file_to_base64(path: String) -> Result<String, String> {
    screenshot::file_to_base64(path)
}

#[tauri::command]
pub fn save_edited_image(data: String) -> Result<screenshot::CaptureResult, String> {
    screenshot::save_base64_image(data, "edited")
}

// ============ HTTP Server Commands ============

#[tauri::command]
pub fn start_http_server(
    state: tauri::State<'_, Arc<HttpServerState>>,
    directory: String,
    port: u16,
) -> Result<http_server::ServerInfo, String> {
    http_server::start_server(state.inner().clone(), PathBuf::from(directory), port)
}

#[tauri::command]
pub fn stop_http_server(state: tauri::State<'_, Arc<HttpServerState>>) {
    http_server::stop_server(state.inner());
}

#[tauri::command]
pub fn get_http_server_info(state: tauri::State<'_, Arc<HttpServerState>>) -> Option<http_server::ServerInfo> {
    let running = state.running.lock().unwrap();
    if !*running {
        return None;
    }
    let port = *state.port.lock().unwrap();
    let dir = state.server_dir.lock().unwrap().clone();
    Some(http_server::ServerInfo {
        port,
        urls: vec![format!("http://127.0.0.1:{}", port)],
        directory: dir.to_string_lossy().to_string(),
    })
}
