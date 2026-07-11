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

use std::sync::atomic::AtomicBool;
use std::sync::Mutex;
use tauri::AppHandle;

// ── Shared State (used by multiple sub-modules and event listeners) ──────────

/// Tracks whether the current pick session was started from within the app (page mode)
/// vs from global shortcut (global mode). Affects ESC/cancel behavior.
pub static PICK_FROM_PAGE: AtomicBool = AtomicBool::new(false);

/// Tracks whether the current screenshot capture flow was initiated from the page
pub static CAPTURE_FROM_PAGE: AtomicBool = AtomicBool::new(false);

/// Stores the last color picked from the screen overlay (for late-joining windows)
pub static LAST_PICKED_COLOR: Mutex<String> = Mutex::new(String::new());

/// Stores the pick source for the current session ("global", "float", "page").
/// Re-emitted on "picker-ready" so the overlay receives it after loading.
pub static PICK_SOURCE: Mutex<String> = Mutex::new(String::new());

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
