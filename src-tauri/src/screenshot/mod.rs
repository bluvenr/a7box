// A7Box Screenshot Module
// Captures full-screen and region screenshots using the screenshots crate

use chrono::Local;
use screenshots::image::ImageFormat;
use screenshots::Screen;
use std::fs;
use std::io::Cursor;
use std::path::PathBuf;

// Re-export image types from screenshots' bundled image crate
type RgbaImage = screenshots::image::RgbaImage;

/// Capture info returned to frontend
#[derive(serde::Serialize)]
pub struct CaptureResult {
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub filename: String,
}

/// Monitor info
#[derive(serde::Serialize)]
pub struct MonitorInfo {
    pub id: u32,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub scale: f32,
}

/// Get screenshots directory
fn screenshots_dir() -> Result<PathBuf, String> {
    let dir = dirs::picture_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("A7Box")
        .join("Screenshots");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {}", e))?;
    Ok(dir)
}

/// Save an RgbaImage to file
fn save_image(img: &RgbaImage, prefix: &str) -> Result<CaptureResult, String> {
    let dir = screenshots_dir()?;
    let timestamp = Local::now().format("%Y%m%d_%H%M%S");
    let filename = format!("{}_{}.png", prefix, timestamp);
    let filepath = dir.join(&filename);

    img.save(&filepath)
        .map_err(|e| format!("Failed to save: {}", e))?;

    Ok(CaptureResult {
        path: filepath.to_string_lossy().to_string(),
        width: img.width(),
        height: img.height(),
        filename,
    })
}

/// Capture full screen (primary monitor)
pub fn capture_full_screen() -> Result<CaptureResult, String> {
    let screens = Screen::all().map_err(|e| format!("Failed to get screens: {}", e))?;
    if screens.is_empty() {
        return Err("No screens found".to_string());
    }

    let screen = &screens[0];
    let img = screen
        .capture()
        .map_err(|e| format!("Screenshot failed: {}", e))?;

    save_image(&img, "fullscreen")
}

/// Capture a region of the screen
pub fn capture_region(x: i32, y: i32, width: u32, height: u32) -> Result<CaptureResult, String> {
    let screens = Screen::all().map_err(|e| format!("Failed to get screens: {}", e))?;
    if screens.is_empty() {
        return Err("No screens found".to_string());
    }

    let screen = &screens[0];
    let img = screen
        .capture_area(x, y, width, height)
        .map_err(|e| format!("Region capture failed: {}", e))?;

    save_image(&img, "region")
}

/// Capture screen to base64 PNG (for clipboard/preview)
pub fn capture_to_base64() -> Result<String, String> {
    let screens = Screen::all().map_err(|e| format!("Failed to get screens: {}", e))?;
    if screens.is_empty() {
        return Err("No screens found".to_string());
    }

    let screen = &screens[0];
    let img = screen
        .capture()
        .map_err(|e| format!("Screenshot failed: {}", e))?;

    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| format!("Failed to encode PNG: {}", e))?;

    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, buf.into_inner());
    Ok(format!("data:image/png;base64,{}", b64))
}

/// Get available monitors info
pub fn get_monitors() -> Result<Vec<MonitorInfo>, String> {
    let screens = Screen::all().map_err(|e| format!("Failed to get screens: {}", e))?;
    Ok(screens
        .iter()
        .map(|s| MonitorInfo {
            id: s.display_info.id,
            width: s.display_info.width,
            height: s.display_info.height,
            x: s.display_info.x,
            y: s.display_info.y,
            scale: s.display_info.scale_factor,
        })
        .collect())
}

/// Read a file as base64 data URL
pub fn file_to_base64(path: String) -> Result<String, String> {
    let data = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data);
    Ok(format!("data:image/png;base64,{}", b64))
}

/// Save base64 image data to file
pub fn save_base64_image(data: String, filename_prefix: &str) -> Result<CaptureResult, String> {
    let dir = screenshots_dir()?;
    let timestamp = Local::now().format("%Y%m%d_%H%M%S");
    let filename = format!("{}_{}_edited.png", filename_prefix, timestamp);
    let filepath = dir.join(&filename);

    // Strip data URL prefix if present
    let b64_data = if data.starts_with("data:") {
        data.split(',').nth(1).unwrap_or(&data)
    } else {
        &data
    };

    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, b64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    // Read image dimensions from PNG header
    let img = screenshots::image::load_from_memory_with_format(&bytes, screenshots::image::ImageFormat::Png)
        .map_err(|e| format!("Failed to read image: {}", e))?;

    fs::write(&filepath, &bytes).map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(CaptureResult {
        path: filepath.to_string_lossy().to_string(),
        width: img.width(),
        height: img.height(),
        filename,
    })
}
