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

/// Capture a region of the screen.
/// On macOS, uses full-screen capture + crop to avoid CGWindowListCreateImage
/// region-capture issues where other app windows may render as desktop background.
#[cfg(target_os = "macos")]
pub fn capture_region(x: i32, y: i32, width: u32, height: u32) -> Result<CaptureResult, String> {
    let screens = Screen::all().map_err(|e| format!("Failed to get screens: {}", e))?;
    if screens.is_empty() {
        return Err("No screens found".to_string());
    }

    let screen = &screens[0];
    let full_img = screen
        .capture()
        .map_err(|e| format!("Screenshot failed: {}", e))?;

    // Convert logical coords to physical pixel coords.
    // Use actual image-to-display ratio instead of scale_factor cast to avoid
    // truncation errors with fractional scaling (e.g. 1.5x → 1 as u32).
    let (img_w, img_h) = (full_img.width() as f64, full_img.height() as f64);
    let (disp_w, disp_h) = (screen.display_info.width as f64, screen.display_info.height as f64);
    let scale_x = if disp_w > 0.0 { img_w / disp_w } else { 1.0 };
    let scale_y = if disp_h > 0.0 { img_h / disp_h } else { 1.0 };
    let crop_x = (((x - screen.display_info.x).max(0) as f64) * scale_x).round() as u32;
    let crop_y = (((y - screen.display_info.y).max(0) as f64) * scale_y).round() as u32;
    let crop_w = (width as f64 * scale_x).round() as u32;
    let crop_h = (height as f64 * scale_y).round() as u32;

    let img = crop_image(&full_img, crop_x, crop_y, crop_w, crop_h)?;
    save_image(&img, "region")
}

/// Capture a region of the screen (non-macOS fallback).
#[cfg(not(target_os = "macos"))]
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

/// Crop an RgbaImage to the specified region (pixel coordinates).
#[cfg(target_os = "macos")]
fn crop_image(img: &RgbaImage, x: u32, y: u32, width: u32, height: u32) -> Result<RgbaImage, String> {
    let (iw, ih) = (img.width(), img.height());
    // Clamp to image bounds
    let x = x.min(iw.saturating_sub(1));
    let y = y.min(ih.saturating_sub(1));
    let w = width.min(iw.saturating_sub(x));
    let h = height.min(ih.saturating_sub(y));
    if w == 0 || h == 0 {
        return Err("Crop region is empty".to_string());
    }
    let dynamic = screenshots::image::DynamicImage::ImageRgba8(img.clone());
    Ok(dynamic.crop_imm(x, y, w, h).into_rgba8())
}

/// Capture a region as base64 PNG (in-memory only, no file save).
/// On macOS, uses full-screen capture + crop to avoid CGWindowListCreateImage
/// region-capture issues where other app windows may render as desktop background.
#[cfg(target_os = "macos")]
pub fn capture_region_to_base64(x: i32, y: i32, width: u32, height: u32) -> Result<(String, u32, u32), String> {
    let screens = Screen::all().map_err(|e| format!("Failed to get screens: {}", e))?;
    if screens.is_empty() {
        return Err("No screens found".to_string());
    }

    let screen = Screen::from_point(x, y)
        .unwrap_or(screens[0]);

    let full_img = screen
        .capture()
        .map_err(|e| format!("Screenshot failed: {}", e))?;

    // Convert logical coords to physical pixel coords.
    // Use actual image-to-display ratio instead of scale_factor cast to avoid
    // truncation errors with fractional scaling (e.g. 1.5x → 1 as u32).
    let (img_w, img_h) = (full_img.width() as f64, full_img.height() as f64);
    let (disp_w, disp_h) = (screen.display_info.width as f64, screen.display_info.height as f64);
    let scale_x = if disp_w > 0.0 { img_w / disp_w } else { 1.0 };
    let scale_y = if disp_h > 0.0 { img_h / disp_h } else { 1.0 };
    let crop_x = (((x - screen.display_info.x).max(0) as f64) * scale_x).round() as u32;
    let crop_y = (((y - screen.display_info.y).max(0) as f64) * scale_y).round() as u32;
    let crop_w = (width as f64 * scale_x).round() as u32;
    let crop_h = (height as f64 * scale_y).round() as u32;

    let img = crop_image(&full_img, crop_x, crop_y, crop_w, crop_h)?;

    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| format!("Failed to encode PNG: {}", e))?;

    let b64 = format!(
        "data:image/png;base64,{}",
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &buf.into_inner())
    );

    Ok((b64, img.width(), img.height()))
}

/// Capture a region as base64 PNG (non-macOS fallback).
#[cfg(not(target_os = "macos"))]
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

#[cfg(target_os = "macos")]
pub fn detect_window_at_cursor() -> Result<Option<WindowBounds>, String> {
    // CoreFoundation / CoreGraphics FFI for enumerating on-screen windows.
    // Returns windows in Z-order (topmost first), each as a CFDictionary.
    type CFArrayRef = *const std::ffi::c_void;
    type CFDictionaryRef = *const std::ffi::c_void;
    type CFStringRef = *const std::ffi::c_void;
    type CFNumberRef = *const std::ffi::c_void;
    type CFIndex = i64;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        // CoreGraphics: window enumeration
        fn CGWindowListCopyWindowInfo(
            option: u32, relative_to_window: u32,
        ) -> CFArrayRef;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        // CoreFoundation: collection/string utilities
        fn CFArrayGetCount(the_array: CFArrayRef) -> CFIndex;
        fn CFArrayGetValueAtIndex(the_array: CFArrayRef, idx: CFIndex)
            -> *const std::ffi::c_void;
        fn CFDictionaryGetValue(
            the_dict: CFDictionaryRef, key: *const std::ffi::c_void,
        ) -> *const std::ffi::c_void;
        fn CFNumberGetValue(
            number: CFNumberRef, the_type: u32, value_ptr: *mut std::ffi::c_void,
        ) -> u8;
        fn CFStringCreateWithCString(
            alloc: *const std::ffi::c_void,
            c_str: *const std::ffi::c_char,
            encoding: u32,
        ) -> CFStringRef;
        fn CFStringGetLength(the_string: CFStringRef) -> CFIndex;
        fn CFStringGetCharacters(
            the_string: CFStringRef, range_start: CFIndex, range_length: CFIndex,
            buffer: *mut u16,
        );
        fn CFRelease(cf: *const std::ffi::c_void);

        // CoreGraphics constants (resolved via CoreFoundation)
        static kCGWindowBounds: CFStringRef;
        static kCGWindowOwnerPID: CFStringRef;
        static kCGWindowLayer: CFStringRef;
        static kCGWindowAlpha: CFStringRef;
        static kCGWindowName: CFStringRef;
        static kCGWindowOwnerName: CFStringRef;
    }

    const K_CG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY: u32 = 1 << 0;
    const K_CF_NUMBER_SINT32_TYPE: u32 = 3;
    const K_CF_NUMBER_DOUBLE_TYPE: u32 = 12;
    const K_CF_STRING_ENCODING_UTF8: u32 = 0x08000100;

    let current_pid = std::process::id();
    let (cx, cy) = crate::color_picker::get_cursor_pos()?;

    unsafe {
        let windows = CGWindowListCopyWindowInfo(
            K_CG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY, 0,
        );
        if windows.is_null() {
            return Ok(None);
        }

        let count = CFArrayGetCount(windows);
        let mut result = None;

        for i in 0..count {
            let win_dict = CFArrayGetValueAtIndex(windows, i) as CFDictionaryRef;
            if win_dict.is_null() { continue; }

            // ── Filter: skip own process ──
            let mut pid: i32 = 0;
            let pid_ref = CFDictionaryGetValue(win_dict, kCGWindowOwnerPID);
            if pid_ref.is_null() { continue; }
            CFNumberGetValue(
                pid_ref as CFNumberRef, K_CF_NUMBER_SINT32_TYPE,
                &mut pid as *mut i32 as *mut std::ffi::c_void,
            );
            if pid as u32 == current_pid { continue; }

            // ── Filter: normal window layer only (layer 0) ──
            let mut layer: i32 = -1;
            let layer_ref = CFDictionaryGetValue(win_dict, kCGWindowLayer);
            if !layer_ref.is_null() {
                CFNumberGetValue(
                    layer_ref as CFNumberRef, K_CF_NUMBER_SINT32_TYPE,
                    &mut layer as *mut i32 as *mut std::ffi::c_void,
                );
            }
            if layer != 0 { continue; }

            // ── Filter: visible (alpha > 0) and on-screen ──
            let mut alpha: f64 = 0.0;
            let alpha_ref = CFDictionaryGetValue(win_dict, kCGWindowAlpha);
            if !alpha_ref.is_null() {
                CFNumberGetValue(
                    alpha_ref as CFNumberRef, K_CF_NUMBER_DOUBLE_TYPE,
                    &mut alpha as *mut f64 as *mut std::ffi::c_void,
                );
            }
            if alpha <= 0.0 { continue; }

            // ── Read window bounds (in points / logical pixels) ──
            let bounds_ref = CFDictionaryGetValue(win_dict, kCGWindowBounds);
            if bounds_ref.is_null() { continue; }

            // kCGWindowBounds is a CFDictionary with X, Y, Width, Height keys
            let read_bounds_key = |key: &str| -> f64 {
                let c_key = std::ffi::CString::new(key).unwrap();
                let cf_key = CFStringCreateWithCString(
                    std::ptr::null(), c_key.as_ptr(), K_CF_STRING_ENCODING_UTF8,
                );
                if cf_key.is_null() { return 0.0; }
                let val = CFDictionaryGetValue(bounds_ref as CFDictionaryRef, cf_key);
                CFRelease(cf_key);
                if val.is_null() { return 0.0; }
                let mut v: f64 = 0.0;
                CFNumberGetValue(
                    val as CFNumberRef, K_CF_NUMBER_DOUBLE_TYPE,
                    &mut v as *mut f64 as *mut std::ffi::c_void,
                );
                v
            };

            let wx = read_bounds_key("X");
            let wy = read_bounds_key("Y");
            let ww = read_bounds_key("Width");
            let wh = read_bounds_key("Height");

            if (cx as f64) >= wx && (cx as f64) < wx + ww
                && (cy as f64) >= wy && (cy as f64) < wy + wh
            {
                // ── Read window title (fallback to owner/app name) ──
                let mut title = String::new();
                let title_ref = CFDictionaryGetValue(win_dict, kCGWindowName);
                let name_ref = if title_ref.is_null() {
                    CFDictionaryGetValue(win_dict, kCGWindowOwnerName)
                } else {
                    // Check if title is empty string
                    if CFStringGetLength(title_ref as CFStringRef) == 0 {
                        CFDictionaryGetValue(win_dict, kCGWindowOwnerName)
                    } else {
                        title_ref
                    }
                };

                if !name_ref.is_null() {
                    let len = CFStringGetLength(name_ref as CFStringRef);
                    if len > 0 && len < 512 {
                        let mut buf = vec![0u16; len as usize];
                        CFStringGetCharacters(
                            name_ref as CFStringRef, 0, len, buf.as_mut_ptr(),
                        );
                        title = String::from_utf16_lossy(&buf);
                    }
                }

                // macOS: coordinates already in logical pixels (points)
                result = Some(WindowBounds {
                    x: wx as i32,
                    y: wy as i32,
                    width: ww as u32,
                    height: wh as u32,
                    title,
                });
                break; // Found topmost matching window
            }
        }

        CFRelease(windows);
        Ok(result)
    }
}

#[cfg(target_os = "linux")]
pub fn detect_window_at_cursor() -> Result<Option<WindowBounds>, String> {
    // Not implemented on Linux — users can manually select regions.
    // X11 implementation would require XQueryTree + XGetWindowAttributes + WM frame detection,
    // which varies significantly across window managers (Mutter, KWin, i3, etc.).
    Ok(None)
}
