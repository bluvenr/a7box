// A7Box Shared State Definitions & Helper Functions
// State structs, language helpers, and utility init scripts.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU32};
use std::sync::Mutex;
use tauri::Manager;

/// Registry to track action -> keys mapping for dynamic unregistration
pub struct ShortcutRegistry(pub Mutex<HashMap<String, String>>);

/// State to buffer a deep-link directory when the app cold-starts.
/// The frontend consumes this via `get_pending_http_serve_dir` command.
pub struct PendingHttpServeDir(pub Mutex<Option<String>>);

/// State to buffer image file paths from right-click context menu.
/// Supports multiple files (multi-select right-click). Frontend consumes via
/// `get_pending_image_file` which returns and clears all queued paths.
pub struct PendingImageFile(pub Mutex<Vec<String>>);

/// State to buffer image file paths from right-click "Convert Format" context menu.
/// Frontend consumes via `get_pending_convert_file` which returns and clears all queued paths.
pub struct PendingConvertFile(pub Mutex<Vec<String>>);

/// Shared app language state (synced from frontend when user changes language).
/// Used to pass language to utility windows via initialization script.
pub struct AppLanguage(pub Mutex<String>);

/// Color picker session state — replaces global statics for thread-safe managed access.
#[derive(Default)]
pub struct PickerSession {
    /// Whether the current pick session was started from within the app (page mode)
    pub from_page: AtomicBool,
    /// Last color picked from the screen overlay
    pub last_color: Mutex<String>,
    /// Pick source for the current session ("global", "float", "page")
    pub source: Mutex<String>,
    /// Base64 image data queue for pin preview windows
    pub pending_pin_data: Mutex<Vec<String>>,
    /// Counter for unique capture-preview window labels
    pub pin_window_counter: AtomicU32,
}

/// Screenshot capture session state — replaces global static for thread-safe managed access.
#[derive(Default)]
pub struct CaptureSession {
    /// Whether the current capture flow was initiated from the page
    pub from_page: AtomicBool,
}

/// Get the current language for the given app handle.
pub fn current_lang(app_ref: &tauri::AppHandle<tauri::Wry>) -> &'static str {
    let lang = app_ref
        .state::<AppLanguage>()
        .0
        .lock()
        .map(|g| g.clone())
        .unwrap_or_else(|_| "en".to_string());
    if lang.starts_with("zh") { "zh-CN" } else { "en-US" }
}

/// JavaScript snippet injected via `initialization_script` into utility webviews.
/// Runs BEFORE any page scripts, so `getInitialLanguage()` can read `window.__A7BOX_LANG__`.
pub fn lang_init_script(app_ref: &tauri::AppHandle<tauri::Wry>) -> String {
    format!("window.__A7BOX_LANG__='{}';", current_lang(app_ref))
}

/// Init script for utility windows that need transparent background (region-picker, capture-toolbar, palette).
/// Sets transparent backgrounds immediately to prevent any flash of opaque background.
/// `document.documentElement` (html) is available at script injection time,
/// while `body` and `#root` require DOMContentLoaded.
pub fn utility_init_script(app_ref: &tauri::AppHandle<tauri::Wry>) -> String {
    format!(
        r#"window.__A7BOX_LANG__='{}';
document.documentElement.style.background='transparent';
document.addEventListener('DOMContentLoaded',function(){{
  var s='background:transparent!important';
  document.body.style.cssText+=';'+s;
  var r=document.getElementById('root');if(r)r.style.cssText+=';'+s;
}});"#,
        current_lang(app_ref)
    )
}

/// Bring a window to the foreground, overcoming Windows' SetForegroundWindow restrictions.
/// Uses the always-on-top toggle trick: briefly enable then disable always_on_top
/// to force the window above other applications (e.g. when triggered from Explorer context menu).
pub fn bring_window_to_front<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    // Windows foreground trick: toggle always-on-top
    let _ = window.set_always_on_top(true);
    let _ = window.set_always_on_top(false);
}

/// Read PNG width/height from the IHDR chunk in a base64 data URL.
/// Returns (width, height) or None if parsing fails.
pub fn read_png_dims_from_base64(data: &str) -> Option<(u32, u32)> {
    let b64 = data.strip_prefix("data:image/png;base64,")?;
    // PNG header: 8 signature + 4 length + 4 "IHDR" + 4 width + 4 height = first 24 bytes
    // Base64: 24 bytes → 32 chars
    let header_b64: String = b64.chars().take(32).collect();
    let header = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &header_b64).ok()?;
    if header.len() < 24 {
        return None;
    }
    let w = u32::from_be_bytes([header[16], header[17], header[18], header[19]]);
    let h = u32::from_be_bytes([header[20], header[21], header[22], header[23]]);
    Some((w, h))
}
