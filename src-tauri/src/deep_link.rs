// A7Box Deep Link & Command-Line Argument Handling
// Handles a7box:// protocol, --http-serve, --compress-image, --convert-image flags,
// and pending state commands for cold-start / warm-start scenarios.

use tauri::{Emitter, Manager};
use crate::state::{PendingHttpServeDir, PendingImageFile, PendingConvertFile};

/// Parse a deep link URL to extract the directory path.
/// Input:  `a7box://http-server?dir=C:\some\path`
/// Output: `C:\some\path`
pub fn parse_deep_link_url(url: &str) -> String {
    if let Some(query_start) = url.find('?') {
        let query = &url[query_start + 1..];
        for pair in query.split('&') {
            let mut kv = pair.splitn(2, '=');
            if let (Some(key), Some(value)) = (kv.next(), kv.next()) {
                if key == "dir" {
                    let dir = value.trim_matches('"');
                    // Percent-decode common characters (e.g. %20 -> space)
                    let mut result = String::new();
                    let mut chars = dir.bytes();
                    while let Some(b) = chars.next() {
                        if b == b'%' {
                            let h = chars.next().unwrap_or(b'0');
                            let l = chars.next().unwrap_or(b'0');
                            let hex = format!("{}{}", h as char, l as char);
                            if let Ok(n) = u8::from_str_radix(&hex, 16) {
                                result.push(n as char);
                            }
                        } else if b == b'+' {
                            result.push(' ');
                        } else {
                            result.push(b as char);
                        }
                    }
                    return result;
                }
            }
        }
    }
    String::new()
}

/// Parse command-line arguments for deep link URLs and special flags.
/// Called by both single_instance callback (warm start) and setup() (cold start).
///
/// When `emit_events` is true, emits events to frontend (warm start).
/// When false, stores values in state for later retrieval (cold start).
pub fn parse_args(app: &tauri::AppHandle, args: &[String], emit_events: bool) {
    let mut i = 1;
    while i < args.len() {
        if args[i].starts_with("a7box://http-server") {
            let dir = parse_deep_link_url(&args[i]);
            if !dir.is_empty() {
                if emit_events {
                    let _ = app.emit("deep-link-received", &dir);
                } else if let Ok(mut g) = app.state::<PendingHttpServeDir>().0.lock() {
                    *g = Some(dir);
                }
            }
            break;
        }
        if args[i] == "--http-serve" {
            if let Some(dir) = args.get(i + 1) {
                if emit_events {
                    let _ = app.emit("deep-link-received", dir);
                } else if let Ok(mut g) = app.state::<PendingHttpServeDir>().0.lock() {
                    *g = Some(dir.clone());
                }
            }
            break;
        }
        if args[i] == "--compress-image" {
            if let Some(file) = args.get(i + 1) {
                if let Ok(mut g) = app.state::<PendingImageFile>().0.lock() {
                    g.push(file.clone());
                }
                if emit_events {
                    let _ = app.emit("compress-image-received", file);
                }
            }
            break;
        }
        if args[i] == "--convert-image" {
            if let Some(file) = args.get(i + 1) {
                if let Ok(mut g) = app.state::<PendingConvertFile>().0.lock() {
                    g.push(file.clone());
                }
                if emit_events {
                    let _ = app.emit("convert-image-received", file);
                }
            }
            break;
        }
        i += 1;
    }
}

// ── Tauri Commands ───────────────────────────────────────────────────────────

/// Returns and clears the pending HTTP serve directory from cold start.
#[tauri::command]
pub fn get_pending_http_serve_dir(state: tauri::State<'_, PendingHttpServeDir>) -> Option<String> {
    let mut guard = state.0.lock().ok()?;
    guard.take()
}

/// Returns and clears ALL pending image file paths.
/// Supports multi-file right-click. Populated by both cold start and warm start.
#[tauri::command]
pub fn get_pending_image_file(state: tauri::State<'_, PendingImageFile>) -> Vec<String> {
    let mut guard = match state.0.lock() {
        Ok(g) => g,
        Err(_) => return Vec::new(),
    };
    std::mem::take(&mut *guard)
}

/// Reads a local image file, bypassing fs plugin scope restrictions.
/// Used for right-click context menu where the file path is arbitrary.
#[tauri::command]
pub fn read_local_image(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("Failed to read '{}': {}", path, e))
}

/// Returns and clears ALL pending convert image file paths.
/// Supports multi-file right-click.
#[tauri::command]
pub fn get_pending_convert_file(state: tauri::State<'_, PendingConvertFile>) -> Vec<String> {
    let mut guard = match state.0.lock() {
        Ok(g) => g,
        Err(_) => return Vec::new(),
    };
    std::mem::take(&mut *guard)
}
