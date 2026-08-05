// A7Box Shortcut Action Handler
// Shared logic for handling global shortcut actions, used by both
// lib.rs setup() (initial registration) and commands/mod.rs update_shortcut() (dynamic updates).

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use std::sync::atomic::Ordering;
use crate::state::{PickerSession, CaptureSession};

/// Execute the action associated with a global shortcut.
/// Called from both lib.rs setup() and commands/mod.rs update_shortcut().
pub fn execute_action(app: &AppHandle, action: &str) {
    match action {
        "toggle-command-palette" => handle_toggle_palette(app),
        "toggle-window" => handle_toggle_window(app),
        "open-screenshot" => handle_open_screenshot(app),
        "clipboard-to-qr" => open_utility_window(app, "qr-quick", "/utility/qr-quick", 360.0, 440.0, false, false),
        "clipboard-to-md" => open_utility_window(app, "md-convert", "/utility/md-convert", 520.0, 600.0, true, false),
        "clipboard-to-json" => open_utility_window(app, "json-quick", "/utility/json-quick", 480.0, 560.0, true, false),
        "clipboard-to-code-minify" => open_utility_window(app, "code-quick", "/utility/code-quick", 560.0, 640.0, true, false),
        "open-color-picker" => handle_open_color_picker(app),
        "quick-create-reminder" => open_utility_window(app, "reminder-quick", "/utility/reminder-quick", 480.0, 380.0, false, false),
        "open-clipboard-popup" => crate::commands::clipboard_manager::toggle_clipboard_popup(app, None),
        "clipboard-paste-stack" => crate::commands::clipboard_manager::toggle_clipboard_popup(app, Some("paste-stack")),
        _ => {}
    }
    // Also emit event to frontend for any additional handling
    let _ = app.emit("global-shortcut", action);
}

// ── Action handlers ──────────────────────────────────────────────────────────

fn handle_toggle_palette(app: &AppHandle) {
    let label = "utility-palette";
    // Close existing if any (toggle behavior)
    if let Some(existing) = app.get_webview_window(label) {
        let _ = existing.close();
        // Don't create a new one — this is toggle off
    } else {
        let builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App("/utility/palette".into()))
            .title("A7Box")
            .inner_size(520.0, 420.0)
            .resizable(false)
            .decorations(false)
            .always_on_top(true)
            .visible(false)
            .skip_taskbar(true)
            .center()
            .background_color(tauri::window::Color(20, 20, 22, 255))
            .initialization_script(crate::state::lang_init_script(app));
        let _ = builder.build();
        // Window shown by util-window-ready listener
    }
}

fn handle_toggle_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let is_vis = w.is_visible().unwrap_or(false);
        let is_min = w.is_minimized().unwrap_or(false);
        if is_vis && !is_min {
            let _ = w.hide();
        } else {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
    }
}

fn handle_open_screenshot(app: &AppHandle) {
    // Hide main window so screenshot can capture the screen
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
    app.state::<CaptureSession>().from_page.store(false, Ordering::SeqCst);
    let _ = app.emit("start-capture-flow", "");
}

fn handle_open_color_picker(app: &AppHandle) {
    // Hide main window so the picker can see the screen
    if let Some(main_win) = app.get_webview_window("main") {
        let _ = main_win.hide();
    }
    // Also hide ColorQuick if it's open
    if let Some(cq) = app.get_webview_window("color-quick") {
        let _ = cq.hide();
    }
    let app_clone = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(250));
        {
            let ps = app_clone.state::<PickerSession>();
            let mut src = ps.source.lock().unwrap();
            *src = "global".into();
        }
        if let Err(e) = crate::commands::color_picker::start_screen_pick(app_clone, None) {
            eprintln!("[WARN] Failed to start screen pick: {}", e);
        }
    });
}

/// Open a utility window with standard configuration.
/// Used by clipboard-to-qr, clipboard-to-md, clipboard-to-json, clipboard-to-code-minify,
/// quick-create-reminder.
fn open_utility_window(
    app: &AppHandle,
    label: &str,
    url_path: &str,
    width: f64,
    height: f64,
    resizable: bool,
    transparent: bool,
) {
    // Close existing if any
    if let Some(existing) = app.get_webview_window(label) {
        let _ = existing.close();
    }
    let bg = if transparent {
        tauri::window::Color(0, 0, 0, 0)
    } else {
        tauri::window::Color(10, 10, 11, 255)
    };
    let _ = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url_path.into()))
        .title("")
        .inner_size(width, height)
        .resizable(resizable)
        .decorations(false)
        .always_on_top(true)
        .visible(false)
        .skip_taskbar(true)
        .center()
        .background_color(bg)
        .initialization_script(crate::state::lang_init_script(app))
        .build();
}
