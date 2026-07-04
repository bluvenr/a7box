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

/// Capture a region as base64 PNG (in-memory only, no file save).
/// Coordinates (x, y) are in virtual desktop logical pixels (from RegionPicker clientX/clientY).
/// Finds the correct screen and converts to screen-relative coordinates for capture_area.
pub fn capture_region_to_base64(x: i32, y: i32, width: u32, height: u32) -> Result<(String, u32, u32), String> {
    let screens = Screen::all().map_err(|e| format!("Failed to get screens: {}", e))?;
    if screens.is_empty() {
        return Err("No screens found".to_string());
    }

    let screen = Screen::from_point(x, y)
        .unwrap_or(screens[0]);

    let rel_x = x - screen.display_info.x;
    let rel_y = y - screen.display_info.y;

    let img = screen
        .capture_area(rel_x, rel_y, width, height)
        .map_err(|e| format!("Region capture failed: {}", e))?;

    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| format!("Failed to encode PNG: {}", e))?;

    let b64 = format!(
        "data:image/png;base64,{}",
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &buf.into_inner())
    );

    Ok((b64, img.width(), img.height()))
}

/// Scan screenshots directory and return recent files
pub fn scan_screenshot_history(limit: usize) -> Result<Vec<CaptureResult>, String> {
    let dir = screenshots_dir()?;
    let mut entries: Vec<(std::time::SystemTime, PathBuf)> = fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read dir: {}", e))?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map(|ext| ext == "png").unwrap_or(false))
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            let modified = meta.modified().ok()?;
            Some((modified, e.path()))
        })
        .collect();

    // Sort by modification time, newest first
    entries.sort_by(|a, b| b.0.cmp(&a.0));
    entries.truncate(limit);

    let mut results = Vec::new();
    for (_, path) in entries {
        let filename = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        // Try to get dimensions from PNG header
        let (w, h) = read_png_dimensions(&path).unwrap_or((0, 0));
        results.push(CaptureResult {
            path: path.to_string_lossy().to_string(),
            width: w,
            height: h,
            filename,
        });
    }
    Ok(results)
}

/// Read PNG dimensions from file header (without loading full image)
fn read_png_dimensions(path: &PathBuf) -> Option<(u32, u32)> {
    let img = screenshots::image::open(path).ok()?;
    Some((img.width(), img.height()))
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

/// Detected window bounds for hover-to-select in RegionPicker.
#[derive(serde::Serialize)]
pub struct WindowBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub title: String,
}

/// Detect the window under the cursor and return its bounds in virtual desktop logical pixels.
/// Uses Z-order walk: starts from the topmost window, walks down until finding a non-self visible window.
/// Uses DWMWA_EXTENDED_FRAME_BOUNDS for accurate visible window bounds (excludes shadow/padding).
#[cfg(target_os = "windows")]
pub fn detect_window_at_cursor() -> Result<Option<WindowBounds>, String> {
    use windows::Win32::UI::WindowsAndMessaging::*;
    use windows::Win32::UI::HiDpi::GetDpiForWindow;
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
    use windows::Win32::Foundation::{POINT, RECT};

    let current_pid = std::process::id();

    unsafe {
        let mut pt = POINT::default();
        if GetCursorPos(&mut pt).is_err() {
            return Err("GetCursorPos failed".to_string());
        }

        // Get the topmost window, then walk down Z-order
        let topmost = WindowFromPoint(pt);
        if topmost.is_invalid() {
            return Ok(None);
        }

        // Walk to the root of the topmost window
        let root = GetAncestor(topmost, GA_ROOT);
        let start_hwnd = if !root.is_invalid() { root } else { topmost };

        let mut hwnd = start_hwnd;
        loop {
            if hwnd.is_invalid() {
                return Ok(None);
            }

            // Check if this window belongs to our own process → skip it
            let mut window_pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut window_pid));

            if window_pid != current_pid
                && IsWindowVisible(hwnd).as_bool()
            {
                // Use DWM extended frame bounds for accurate visible rect (excludes shadow/padding)
                let mut rect = RECT::default();
                let mut dwm_rect = RECT::default();
                let has_dwm = DwmGetWindowAttribute(
                    hwnd,
                    DWMWA_EXTENDED_FRAME_BOUNDS,
                    &mut dwm_rect as *mut RECT as *mut std::ffi::c_void,
                    std::mem::size_of::<RECT>() as u32,
                ).is_ok();

                let bounds = if has_dwm { dwm_rect } else { rect };

                // Check if the cursor point is within this window's rect
                if (has_dwm || GetWindowRect(hwnd, &mut rect).is_ok())
                    && pt.x >= bounds.left && pt.x < bounds.right
                    && pt.y >= bounds.top && pt.y < bounds.bottom
                {
                    // Skip tool windows and owned/child windows
                    let ex_style = WINDOW_EX_STYLE(GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32);
                    let owner = GetWindow(hwnd, GW_OWNER).unwrap_or_default();
                    if !ex_style.contains(WS_EX_TOOLWINDOW) && owner.is_invalid() {
                        // Found a valid window
                        let dpi = GetDpiForWindow(hwnd);
                        let scale = if dpi > 0 { dpi as f64 / 96.0 } else { 1.0 };

                        let x = (bounds.left as f64 / scale).round() as i32;
                        let y = (bounds.top as f64 / scale).round() as i32;
                        let width = ((bounds.right - bounds.left) as f64 / scale).round() as u32;
                        let height = ((bounds.bottom - bounds.top) as f64 / scale).round() as u32;

                        let len = GetWindowTextLengthW(hwnd) as usize;
                        let title = if len > 0 {
                            let mut buf = vec![0u16; len + 1];
                            let copied = GetWindowTextW(hwnd, &mut buf);
                            String::from_utf16_lossy(&buf[..copied as usize])
                        } else {
                            String::new()
                        };

                        return Ok(Some(WindowBounds { x, y, width, height, title }));
                    }
                }
            }

            // Walk to next window in Z-order (below current)
            let next = GetWindow(hwnd, GW_HWNDNEXT).unwrap_or_default();
            if next.is_invalid() || next == hwnd {
                break;
            }
            hwnd = next;
        }

        Ok(None)
    }
}

#[cfg(not(target_os = "windows"))]
pub fn detect_window_at_cursor() -> Result<Option<WindowBounds>, String> {
    Ok(None)
}
