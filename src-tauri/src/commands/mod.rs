// A7Box IPC Commands
// Tauri commands exposed to frontend via invoke()
// This module defines shared state and re-exports domain-specific sub-modules.
// Commands are registered in lib.rs using sub-module paths directly
// (e.g. commands::clipboard::get_clipboard_text).

pub mod clipboard;
pub mod screenshot;
pub mod http;
pub mod p2p;
pub mod cache;
pub mod shortcut;
pub mod window;
pub mod color_picker;

use tauri::AppHandle;

// ── Tray Commands (small, kept inline) ───────────────────────────────────────

#[tauri::command]
pub fn update_tray_language(app: AppHandle, lang: String, app_lang: tauri::State<'_, crate::state::AppLanguage>) {
    if let Ok(mut g) = app_lang.0.lock() {
        *g = lang.clone();
    }
    crate::tray::update_tray_language(&app, &lang);
}

/// Sync app language from frontend (called on app startup to restore user preference)
#[tauri::command]
pub fn sync_app_language(lang: String, app_lang: tauri::State<'_, crate::state::AppLanguage>) {
    if let Ok(mut g) = app_lang.0.lock() {
        *g = lang;
    }
}
