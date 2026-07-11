// A7Box Shared State Definitions & Helper Functions
// State structs, language helpers, and utility init scripts.

use std::collections::HashMap;
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

/// Init script for utility windows that need transparent background (region-picker, capture-toolbar).
/// Sets transparent backgrounds immediately on page load to prevent black flash.
pub fn utility_init_script(app_ref: &tauri::AppHandle<tauri::Wry>) -> String {
    format!(
        r#"window.__A7BOX_LANG__='{}';
document.addEventListener('DOMContentLoaded',function(){{
  var s='background:transparent!important';
  document.documentElement.style.cssText+=s;
  document.body.style.cssText+=s;
  var r=document.getElementById('root');if(r)r.style.cssText+=s;
}});"#,
        current_lang(app_ref)
    )
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
