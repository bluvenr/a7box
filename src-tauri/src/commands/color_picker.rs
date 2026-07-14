// A7Box Color Picker Commands

use std::sync::atomic::Ordering;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

/// Stores base64 image data for pin preview windows to fetch on mount.
/// Uses a queue (Vec) to support multiple concurrent pin windows.
pub static PENDING_PIN_DATA: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// Counter for unique capture-preview window labels
pub static PIN_WINDOW_COUNTER: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

/// Pop the next pending pin data (FIFO)
#[tauri::command]
pub fn get_pending_pin_data() -> Option<String> {
    let mut queue = PENDING_PIN_DATA.lock().unwrap();
    if queue.is_empty() { None } else { Some(queue.remove(0)) }
}

/// Get the last color picked from the screen overlay.
#[tauri::command]
pub fn get_last_picked_color() -> String {
    super::LAST_PICKED_COLOR.lock().unwrap().clone()
}

/// Get the current pick source ("global", "float", "page").
/// Called by LivePicker on mount to reliably determine the entry point.
#[tauri::command]
pub fn get_pick_source() -> String {
    super::PICK_SOURCE.lock()
        .map(|s| if s.is_empty() { "global".to_string() } else { s.clone() })
        .unwrap_or_else(|_| "global".to_string())
}

/// Start live screen color picking: create a full-screen transparent overlay
/// that covers all monitors. The overlay captures all mouse/keyboard input
/// and shows a crosshair cursor. A floating card displays real-time pixel color.
/// `page_mode`: if Some, forces PICK_FROM_PAGE to the given value (for event-driven entries).
///              if None, auto-detects from main window visibility (for direct calls like global shortcut).
#[tauri::command]
pub fn start_screen_pick(app: AppHandle, page_mode: Option<bool>) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    if let Some(existing) = app.get_webview_window("pick-overlay") {
        let _ = existing.close();
    }

    let screens = screenshots::Screen::all().unwrap_or_default();
    let (vx, vy, vw, vh) = if screens.is_empty() {
        (0, 0, 1920u32, 1080u32)
    } else {
        let mut min_x = i32::MAX;
        let mut min_y = i32::MAX;
        let mut max_x = i32::MIN;
        let mut max_y = i32::MIN;
        for s in &screens {
            let di = &s.display_info;
            min_x = min_x.min(di.x);
            min_y = min_y.min(di.y);
            max_x = max_x.max(di.x + di.width as i32);
            max_y = max_y.max(di.y + di.height as i32);
        }
        (min_x, min_y, (max_x - min_x) as u32, (max_y - min_y) as u32)
    };

    let main_was_visible = app.get_webview_window("main")
        .map(|w| w.is_visible().unwrap_or(false))
        .unwrap_or(false);

    let builder = WebviewWindowBuilder::new(
        &app, "pick-overlay", WebviewUrl::App("/utility/live-picker".into()),
    )
    .title("")
    .inner_size(vw as f64, vh as f64)
    .position(vx as f64, vy as f64)
    .resizable(false)
    .decorations(false)
    .shadow(false)
    .always_on_top(true)
    .visible(false)
    .skip_taskbar(true)
    .initialization_script(crate::state::lang_init_script(&app))
    .background_color(tauri::window::Color(0, 0, 0, 0))
    .transparent(true);
    let _overlay = builder.build()
        .map_err(|e| format!("Failed to create overlay: {}", e))?;

    // Disable Windows show/hide animation via Win32 API
    #[cfg(target_os = "windows")]
    {
        if let Some(hwnd) = _overlay.hwnd().ok().map(|h| h.0) {
            #[link(name = "user32")]
            extern "system" {
                fn GetWindowLongPtrW(hwnd: *mut std::ffi::c_void, index: i32) -> isize;
                fn SetWindowLongPtrW(hwnd: *mut std::ffi::c_void, index: i32, new: isize) -> isize;
            }
            const GWL_STYLE: i32 = -16;
            const WS_BORDER: isize = 0x00800000;
            const WS_DLGFRAME: isize = 0x00400000;
            unsafe {
                let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
                SetWindowLongPtrW(hwnd, GWL_STYLE, style & !(WS_BORDER | WS_DLGFRAME));
            }
        }
    }

    super::PICK_FROM_PAGE.store(page_mode.unwrap_or(main_was_visible), Ordering::SeqCst);

    let app_clone = app.clone();
    std::thread::spawn(move || {
        let mut last_color = String::new();
        let mut last_x = -1i32;
        let mut last_y = -1i32;
        const MAG_SIZE: i32 = 15;

        loop {
            if app_clone.get_webview_window("pick-overlay").is_none() {
                break;
            }

            if let Ok((x, y)) = crate::color_picker::get_cursor_pos() {
                let color = crate::color_picker::capture_pixel_color(x, y)
                    .unwrap_or_else(|_| last_color.clone());
                if color != last_color {
                    let _ = app_clone.emit("cursor-color", &color);
                    if let Ok(mut stored) = super::LAST_PICKED_COLOR.lock() {
                        *stored = color.clone();
                    }
                    last_color = color;
                }

                if x != last_x || y != last_y {
                    let scale = screenshots::Screen::all()
                        .ok()
                        .and_then(|screens| {
                            screens.iter().find(|s| {
                                let di = &s.display_info;
                                x >= di.x && x < di.x + di.width as i32
                                    && y >= di.y && y < di.y + di.height as i32
                            }).map(|s| s.display_info.scale_factor as f64)
                        })
                        .unwrap_or(1.0);

                    let rel_x = ((x - vx) as f64 / scale) as i32;
                    let rel_y = ((y - vy) as f64 / scale) as i32;
                    let _ = app_clone.emit("cursor-position", serde_json::json!({
                        "x": rel_x, "y": rel_y, "color": last_color
                    }));
                    last_x = x;
                    last_y = y;

                    if let Ok(screens) = screenshots::Screen::all() {
                        let half = MAG_SIZE / 2;
                        if let Some(screen) = screens.iter().find(|s| {
                            let di = &s.display_info;
                            x >= di.x && x < di.x + di.width as i32
                                && y >= di.y && y < di.y + di.height as i32
                        }).or(screens.first()) {
                            let sx = screen.display_info.x;
                            let sy = screen.display_info.y;
                            let sw = screen.display_info.width as i32;
                            let sh = screen.display_info.height as i32;
                            let cx = (x - sx - half).max(0).min(sw - 1);
                            let cy = (y - sy - half).max(0).min(sh - 1);
                            let cw = MAG_SIZE.min(sw - cx);
                            let ch = MAG_SIZE.min(sh - cy);
                            if cw > 0 && ch > 0 {
                                if let Ok(img) = screen.capture_area(cx, cy, cw as u32, ch as u32) {
                                    let pixels: Vec<u8> = img.into_raw();
                                    let _ = app_clone.emit("cursor-region", serde_json::json!({
                                        "data": pixels,
                                        "w": cw, "h": ch,
                                        "offX": (x - sx) - cx,
                                        "offY": (y - sy) - cy,
                                    }));
                                }
                            }
                        }
                    }
                }
            }

            std::thread::sleep(std::time::Duration::from_millis(33));
        }
    });

    Ok(())
}
