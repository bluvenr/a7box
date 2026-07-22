// A7Box Event Listeners
// All event listeners previously registered in lib.rs setup().
// Organized by domain: picker events, screenshot events, utility window events, window close.

use tauri::{Emitter, Listener, Manager};
use crate::state::{PickerSession, CaptureSession};
use std::sync::atomic::Ordering;

/// Register all event listeners for the application.
pub fn register_all_events(app: &tauri::App) {
    register_picker_events(app);
    register_utility_window_events(app);
    register_screenshot_events(app);
    register_window_events(app);
}

// ── Window Close: hide to tray instead of exiting ────────────────────────────

fn register_window_events(app: &tauri::App) {
    let window = app.get_webview_window("main").unwrap();
    let w = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = w.hide();
        }
    });
}

// ── Utility Window Events ────────────────────────────────────────────────────

fn register_utility_window_events(app: &tauri::App) {
    // Listen for util-window-ready: utility windows signal React has mounted, safe to show
    let app_handle = app.handle().clone();
    app.listen("util-window-ready", move |event| {
        let label = event.payload().trim_matches('"').to_string();
        if !label.is_empty() {
            if let Some(win) = app_handle.get_webview_window(&label) {
                let _ = win.show();
                let _ = win.set_focus();
            }
        }
    });
}

// ── Color Picker Events ──────────────────────────────────────────────────────

fn register_picker_events(app: &tauri::App) {
    // picker-ready: frontend signals CSS is applied, now safe to show overlay.
    {
        let app_handle = app.handle().clone();
        app.listen("picker-ready", move |_event| {
            let source = app_handle.state::<PickerSession>().source.lock()
                .map(|s| if s.is_empty() { "global".to_string() } else { s.clone() })
                .unwrap_or_else(|_| "global".to_string());
            let _ = app_handle.emit("pick-source", &source);
            if let Some(overlay) = app_handle.get_webview_window("pick-overlay") {
                let _ = overlay.show();
                let _ = overlay.set_focus();
            }
        });
    }

    // color-quick-ready: ColorQuick signals it's mounted, safe to show + send color.
    {
        let app_handle = app.handle().clone();
        app.listen("color-quick-ready", move |_event| {
            if let Some(cq) = app_handle.get_webview_window("color-quick") {
                let _ = cq.show();
                let _ = cq.set_focus();
            }
            let color = app_handle.state::<PickerSession>().last_color.lock()
                .map(|s| s.clone())
                .unwrap_or_default();
            if !color.is_empty() {
                let _ = app_handle.emit("screen-color-picked", &color);
            }
        });
    }

    // pick-confirm from the overlay (left-click / Enter / Space)
    {
        let app_handle = app.handle().clone();
        app.listen("pick-confirm", move |event| {
            if let Some(overlay) = app_handle.get_webview_window("pick-overlay") {
                let _ = overlay.hide();
                let _ = overlay.close();
            }
            let payload_str = event.payload();
            let mode = serde_json::from_str::<serde_json::Value>(payload_str)
                .ok()
                .and_then(|v| {
                    if let Some(m) = v.get("mode").and_then(|m| m.as_str()) {
                        return Some(m.to_string());
                    }
                    if let Some(s) = v.as_str() {
                        return serde_json::from_str::<serde_json::Value>(s)
                            .ok()
                            .and_then(|inner| inner.get("mode").and_then(|m| m.as_str()).map(String::from));
                    }
                    None
                })
                .unwrap_or_default();

            let from_page = app_handle.state::<PickerSession>().from_page.load(Ordering::SeqCst);
            if mode == "quick" && from_page {
                if let Some(main) = app_handle.get_webview_window("main") {
                    let _ = main.unminimize();
                    let _ = main.show();
                    let _ = main.set_focus();
                }
            }
        });
    }

    // repick-from-float: user clicked "取色" in ColorQuick
    {
        let app_handle = app.handle().clone();
        app.listen("repick-from-float", move |_event| {
            if let Some(existing) = app_handle.get_webview_window("pick-overlay") {
                let _ = existing.hide();
                let _ = existing.close();
            }
            let app_clone = app_handle.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(250));
                {
                    let ps = app_clone.state::<PickerSession>();
                    let mut src = ps.source.lock().unwrap();
                    *src = "float".into();
                }
                if let Err(e) = crate::commands::color_picker::start_screen_pick(app_clone, Some(false)) {
                    eprintln!("[WARN] Failed to start screen pick from float: {}", e);
                }
            });
        });
    }

    // pick-from-page: user clicked pipette button in ColorTool page
    {
        let app_handle = app.handle().clone();
        app.listen("pick-from-page", move |_event| {
            if let Some(existing) = app_handle.get_webview_window("pick-overlay") {
                let _ = existing.hide();
                let _ = existing.close();
            }
            let app_clone = app_handle.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(250));
                {
                    let ps = app_clone.state::<PickerSession>();
                    let mut src = ps.source.lock().unwrap();
                    *src = "page".into();
                }
                if let Err(e) = crate::commands::color_picker::start_screen_pick(app_clone, Some(true)) {
                    eprintln!("[WARN] Failed to start screen pick from page: {}", e);
                }
            });
        });
    }

    // right-click-pick: close overlay, show ColorQuick float (global) or restore main (page)
    {
        let app_handle = app.handle().clone();
        app.listen("right-click-pick", move |event| {
            if let Some(overlay) = app_handle.get_webview_window("pick-overlay") {
                let _ = overlay.hide();
                let _ = overlay.close();
            }

            let picked_hex = event.payload().trim_matches('"').to_string();
            if !picked_hex.is_empty() {
                if let Ok(mut stored) = app_handle.state::<PickerSession>().last_color.lock() {
                    *stored = picked_hex.clone();
                }
            }

            let from_page = app_handle.state::<PickerSession>().from_page.load(Ordering::SeqCst);
            if from_page {
                if let Some(main) = app_handle.get_webview_window("main") {
                    let _ = main.unminimize();
                    let _ = main.show();
                    let _ = main.set_focus();
                }
            } else {
                if let Some(cq) = app_handle.get_webview_window("color-quick") {
                    let _ = cq.show();
                    let _ = cq.unminimize();
                    let _ = cq.set_focus();
                } else {
                    use tauri::{WebviewUrl, WebviewWindowBuilder};
                    let _ = WebviewWindowBuilder::new(
                        &app_handle, "color-quick",
                        WebviewUrl::App("/utility/color-quick".into()),
                    )
                        .title("")
                        .inner_size(360.0, 500.0)
                        .resizable(false)
                        .decorations(false)
                        .always_on_top(true)
                        .visible(false)
                        .skip_taskbar(true)
                        .center()
                        .background_color(tauri::window::Color(10, 10, 11, 255))
                        .initialization_script(crate::state::lang_init_script(&app_handle))
                        .build();
                }
            }
        });
    }

    // pick-cancel from the overlay: close overlay, conditionally restore main
    {
        let app_handle = app.handle().clone();
        app.listen("pick-cancel", move |_event| {
            if let Some(overlay) = app_handle.get_webview_window("pick-overlay") {
                let _ = overlay.hide();
                let _ = overlay.close();
            }
            if app_handle.state::<PickerSession>().from_page.load(Ordering::SeqCst) {
                if let Some(main) = app_handle.get_webview_window("main") {
                    let _ = main.unminimize();
                    let _ = main.show();
                    let _ = main.set_focus();
                }
            }
        });
    }
}

// ── Screenshot Capture Flow Events ───────────────────────────────────────────

fn register_screenshot_events(app: &tauri::App) {
    // start-capture-flow: create transparent overlay for region selection
    {
        let app_handle = app.handle().clone();
        app.listen("start-capture-flow", move |_event| {
            if let Some(existing) = app_handle.get_webview_window("utility-region-picker") {
                let _ = existing.close();
            }
            if let Some(existing) = app_handle.get_webview_window("utility-capture-toolbar") {
                let _ = existing.close();
            }
            if let Some(main) = app_handle.get_webview_window("main") {
                let _ = main.hide();
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

            use tauri::{WebviewUrl, WebviewWindowBuilder};
            let builder = WebviewWindowBuilder::new(
                &app_handle, "utility-region-picker",
                WebviewUrl::App("/utility/region-picker".into()),
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
                .background_color(tauri::window::Color(0, 0, 0, 0))
                .transparent(true)
                .initialization_script(crate::state::utility_init_script(&app_handle));
            let _ = builder.build();
        });
    }

    // region-picker-ready: show the region picker overlay
    {
        let app_handle = app.handle().clone();
        app.listen("region-picker-ready", move |_event| {
            if let Some(rp) = app_handle.get_webview_window("utility-region-picker") {
                let _ = rp.show();
                let _ = rp.set_focus();
            }
        });
    }

    // region-selected: capture region to base64, send back to RegionPicker for inline editing
    {
        let app_handle = app.handle().clone();
        app.listen("region-selected", move |event| {
            let payload_str = event.payload();
            let region: Option<serde_json::Value> = serde_json::from_str(payload_str).ok()
                .and_then(|v: serde_json::Value| {
                    if let Some(s) = v.as_str() {
                        serde_json::from_str(s).ok()
                    } else {
                        Some(v)
                    }
                });

            let Some(r) = region else {
                if let Some(rp) = app_handle.get_webview_window("utility-region-picker") {
                    let _ = rp.close();
                }
                return;
            };

            let x = r.get("x").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            let y = r.get("y").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            let w = r.get("width").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let h = r.get("height").and_then(|v| v.as_u64()).unwrap_or(0) as u32;

            if w < 10 || h < 10 {
                if let Some(rp) = app_handle.get_webview_window("utility-region-picker") {
                    let _ = rp.close();
                }
                let from_page = app_handle.state::<CaptureSession>().from_page.load(Ordering::SeqCst);
                if from_page {
                    if let Some(main) = app_handle.get_webview_window("main") {
                        let _ = main.show();
                        let _ = main.unminimize();
                        let _ = main.set_focus();
                    }
                }
                return;
            }

            if let Some(rp) = app_handle.get_webview_window("utility-region-picker") {
                let _ = rp.hide();
            }

            let capture_ah = app_handle.clone();
            let from_page_cap = app_handle.state::<CaptureSession>().from_page.load(Ordering::SeqCst);
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(250));

                match crate::screenshot::capture_region_to_base64(x, y, w, h) {
                    Ok((base64, img_w, img_h)) => {
                        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S_%3f").to_string();
                        let temp_dir = std::env::temp_dir().join("a7box_screenshots");
                        let _ = std::fs::create_dir_all(&temp_dir);
                        let temp_path = temp_dir.join(format!("screenshot_{}.png", timestamp));

                        let b64_raw = if base64.starts_with("data:") {
                            base64.split(',').nth(1).unwrap_or(&base64)
                        } else { &base64 };
                        if let Ok(bytes) = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, b64_raw) {
                            let _ = std::fs::write(&temp_path, &bytes);
                        }
                        let temp_path_str = temp_path.to_string_lossy().to_string();

                        let _ = capture_ah.emit("capture-result", serde_json::json!({
                            "base64": base64,
                            "tempPath": temp_path_str,
                            "x": x,
                            "y": y,
                            "width": w,
                            "height": h,
                            "imgWidth": img_w,
                            "imgHeight": img_h,
                        }));

                        if let Some(rp) = capture_ah.get_webview_window("utility-region-picker") {
                            let _ = rp.show();
                            let _ = rp.set_focus();
                        }
                    }
                    Err(e) => {
                        eprintln!("[WARN] Region capture failed: {}", e);
                        if let Some(rp) = capture_ah.get_webview_window("utility-region-picker") {
                            let _ = rp.close();
                        }
                        if from_page_cap {
                            if let Some(main) = capture_ah.get_webview_window("main") {
                                let _ = main.show();
                                let _ = main.unminimize();
                                let _ = main.set_focus();
                            }
                        }
                    }
                }
            });
        });
    }

    // capture-done: user finished editing, close RegionPicker
    {
        let app_handle = app.handle().clone();
        app.listen("capture-done", move |_event| {
            let from_page = app_handle.state::<CaptureSession>().from_page.load(Ordering::SeqCst);

            if let Some(rp) = app_handle.get_webview_window("utility-region-picker") {
                let _ = rp.hide();
                let _ = rp.close();
            }

            if from_page {
                if let Some(main) = app_handle.get_webview_window("main") {
                    let _ = main.show();
                    let _ = main.unminimize();
                    let _ = main.set_focus();
                }
            }

            let _ = app_handle.emit("screenshot-captured", "");
        });
    }

    // save-capture-request: hide overlay, show save dialog, emit done
    {
        let app_handle = app.handle().clone();
        app.listen("save-capture-request", move |event| {
            if let Some(rp) = app_handle.get_webview_window("utility-region-picker") {
                let _ = rp.hide();
            }
            std::thread::sleep(std::time::Duration::from_millis(100));

            let payload = event.payload().trim_matches('"').to_string();
            let app_clone = app_handle.clone();
            std::thread::spawn(move || {
                let result = crate::commands::screenshot::save_capture_dialog_sync(&app_clone, payload);
                let _ = app_clone.emit("save-capture-done", "");
                if let Err(e) = result {
                    eprintln!("[WARN] Save dialog error: {}", e);
                }
            });
        });
    }

    // pin-capture-request: close picker, create always-on-top preview window
    {
        let app_handle = app.handle().clone();
        app.listen("pin-capture-request", move |event| {
            let payload_str = event.payload().trim_matches('"').to_string();

            if let Some(rp) = app_handle.get_webview_window("utility-region-picker") {
                let _ = rp.hide();
                let _ = rp.close();
            }

            let from_page = app_handle.state::<CaptureSession>().from_page.load(Ordering::SeqCst);
            if from_page {
                if let Some(main) = app_handle.get_webview_window("main") {
                    let _ = main.show();
                    let _ = main.unminimize();
                    let _ = main.set_focus();
                }
            }

            let (img_w, img_h) = crate::state::read_png_dims_from_base64(&payload_str)
                .unwrap_or((800, 600));

            let max_dim = 1200.0_f64;
            let long_edge = img_w.max(img_h) as f64;
            let fit_scale = if long_edge > max_dim { max_dim / long_edge } else { 1.0 };
            let chrome_h = 60.0;
            let win_w = ((img_w as f64 * fit_scale) as f64).max(300.0);
            let win_h = ((img_h as f64 * fit_scale) as f64 + chrome_h).max(200.0);

            let counter = app_handle.state::<PickerSession>().pin_window_counter.fetch_add(1, Ordering::SeqCst);
            let label = format!("capture-preview-{}", counter);

            use tauri::{WebviewUrl, WebviewWindowBuilder};
            let _ = WebviewWindowBuilder::new(
                &app_handle, &label,
                WebviewUrl::App("/utility/capture-preview".into()),
            )
                .title("")
                .inner_size(win_w, win_h)
                .resizable(true)
                .decorations(false)
                .always_on_top(true)
                .visible(false)
                .skip_taskbar(true)
                .center()
                .background_color(tauri::window::Color(20, 20, 22, 255))
                .initialization_script(crate::state::lang_init_script(&app_handle))
                .build();

            if let Ok(mut q) = app_handle.state::<PickerSession>().pending_pin_data.lock() {
                q.push(payload_str);
            }
        });
    }
}
