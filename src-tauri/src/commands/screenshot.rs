// A7Box Screenshot Commands

use crate::screenshot;
use std::sync::atomic::Ordering;
use tauri::AppHandle;

/// Temp directory for session screenshots
fn temp_screenshot_dir() -> std::path::PathBuf {
    let dir = std::env::temp_dir().join("a7box_screenshots");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// Clean up temp screenshot directory (called on app exit)
pub fn cleanup_temp_screenshots() {
    let dir = temp_screenshot_dir();
    if dir.exists() {
        let _ = std::fs::remove_dir_all(&dir);
    }
}

/// Screenshot capture metadata
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionCapture {
    pub temp_path: String,
    pub width: u32,
    pub height: u32,
}

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

#[tauri::command]
pub fn scan_screenshot_history(limit: Option<usize>) -> Result<Vec<screenshot::CaptureResult>, String> {
    screenshot::scan_screenshot_history(limit.unwrap_or(50))
}

#[tauri::command]
pub fn set_capture_from_page(value: bool) {
    super::CAPTURE_FROM_PAGE.store(value, Ordering::SeqCst);
}

#[tauri::command]
pub fn detect_window_at_cursor() -> Result<Option<screenshot::WindowBounds>, String> {
    screenshot::detect_window_at_cursor()
}

/// Get all captures by scanning the temp screenshot directory
#[tauri::command]
pub fn get_session_captures() -> Vec<SessionCapture> {
    let dir = temp_screenshot_dir();
    if !dir.exists() {
        return Vec::new();
    }
    let mut entries: Vec<(std::time::SystemTime, std::path::PathBuf)> = match std::fs::read_dir(&dir) {
        Ok(rd) => rd.filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map(|ext| ext == "png").unwrap_or(false))
            .filter_map(|e| e.metadata().ok().and_then(|m| m.modified().ok().map(|t| (t, e.path()))))
            .collect(),
        Err(_) => return Vec::new(),
    };
    entries.sort_by(|a, b| b.0.cmp(&a.0));
    entries.into_iter().map(|(_, path)| {
        let (w, h) = {
            use std::io::Read;
            let mut buf = [0u8; 24];
            std::fs::File::open(&path).ok()
                .and_then(|mut f| f.read_exact(&mut buf).ok().map(|_| buf))
                .and_then(|data| {
                    if &data[1..4] == b"PNG" {
                        let w = u32::from_be_bytes([data[16], data[17], data[18], data[19]]);
                        let h = u32::from_be_bytes([data[20], data[21], data[22], data[23]]);
                        Some((w, h))
                    } else { None }
                })
                .unwrap_or((0, 0))
        };
        SessionCapture {
            temp_path: path.to_string_lossy().to_string(),
            width: w,
            height: h,
        }
    }).collect()
}

/// Clear all temp screenshot files
#[tauri::command]
pub fn clear_session_captures() -> bool {
    cleanup_temp_screenshots();
    true
}

/// Read a temp screenshot file, resize to thumbnail, and return as base64 data URL.
#[tauri::command]
pub fn read_capture_thumbnail(path: String) -> Result<String, String> {
    use screenshots::image::imageops::FilterType;
    let img = screenshots::image::open(&path)
        .map_err(|e| format!("Failed to open image: {}", e))?;
    let (w, h) = (img.width(), img.height());
    let (tw, th) = if w > 320 {
        (320u32, (h as u64 * 320 / w as u64).max(1) as u32)
    } else {
        (w, h.max(1))
    };
    let thumb = img.resize_exact(tw, th, FilterType::Triangle);
    let mut cursor = std::io::Cursor::new(Vec::new());
    thumb.write_to(&mut cursor, screenshots::image::ImageFormat::Png)
        .map_err(|e| format!("Failed to encode thumbnail: {}", e))?;
    let buf = cursor.into_inner();
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &buf);
    Ok(format!("data:image/png;base64,{}", b64))
}

/// Read a temp screenshot file and return as full-size base64 data URL
#[tauri::command]
pub fn read_capture_file(path: String) -> Result<String, String> {
    let data = std::fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data);
    Ok(format!("data:image/png;base64,{}", b64))
}

/// Save a capture to disk via system save dialog (sync version for Rust-side use)
pub fn save_capture_dialog_sync(app: &AppHandle, base64: String) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;

    let b64_data = if base64.starts_with("data:") {
        base64.split(',').nth(1).unwrap_or(&base64)
    } else {
        &base64
    };

    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, b64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("A7Box_Screenshot_{}.png", timestamp);

    let file_path = app.dialog()
        .file()
        .set_file_name(&filename)
        .add_filter("PNG Image", &["png"])
        .blocking_save_file();

    let Some(path) = file_path else {
        return Ok(false);
    };

    let path_buf = path.into_path().map_err(|e| format!("Invalid path: {}", e))?;
    std::fs::write(&path_buf, &bytes).map_err(|e| format!("Failed to save file: {}", e))?;
    Ok(true)
}

/// Save a capture to disk via system save dialog (async, for frontend invoke)
#[tauri::command]
pub async fn save_capture_dialog(app: AppHandle, base64: String) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;

    let b64_data = if base64.starts_with("data:") {
        base64.split(',').nth(1).unwrap_or(&base64)
    } else {
        &base64
    };

    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, b64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("A7Box_Screenshot_{}.png", timestamp);

    let file_path = app.dialog()
        .file()
        .set_file_name(&filename)
        .add_filter("PNG Image", &["png"])
        .blocking_save_file();

    let Some(path) = file_path else {
        return Ok(false);
    };

    let path_buf = path.into_path().map_err(|e| format!("Invalid path: {}", e))?;
    std::fs::write(&path_buf, &bytes).map_err(|e| format!("Failed to save file: {}", e))?;
    Ok(true)
}

/// Delete a single temp screenshot file
#[tauri::command]
pub fn delete_capture_file(path: String) -> Result<bool, String> {
    if std::path::Path::new(&path).exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Failed to delete: {}", e))?;
    }
    Ok(true)
}

/// Save a temp screenshot to a user-chosen directory via system save dialog
#[tauri::command]
pub async fn save_capture_from_temp(app: AppHandle, path: String) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;

    let bytes = std::fs::read(&path)
        .map_err(|e| format!("Failed to read temp file: {}", e))?;

    let filename = std::path::Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "screenshot.png".to_string());

    let file_path = app.dialog()
        .file()
        .set_file_name(&filename)
        .add_filter("PNG Image", &["png"])
        .blocking_save_file();

    let Some(save_path) = file_path else {
        return Ok(false);
    };

    let path_buf = save_path.into_path().map_err(|e| format!("Invalid path: {}", e))?;
    std::fs::write(&path_buf, &bytes).map_err(|e| format!("Failed to save: {}", e))?;
    Ok(true)
}
