// A7Box Utility Window & Notification Commands

use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn create_utility_window(
    app: AppHandle,
    label: String,
    url: String,
    width: f64,
    height: f64,
) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.close();
    }

    let builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title("")
        .inner_size(width, height)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .visible(false)
        .skip_taskbar(true)
        .center()
        .background_color(tauri::window::Color(10, 10, 11, 255));

    let _window = builder.build().map_err(|e| format!("Failed to create window: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn close_utility_window(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|e| format!("Failed to close window: {}", e))?;
    }
    Ok(())
}

/// Create or show the always-on-top notification toast window.
/// Positioned at the bottom-right corner of the primary monitor.
/// Returns true if a new window was created, false if an existing one was shown.
#[tauri::command]
pub async fn show_notification_toast(app: AppHandle) -> bool {
    let label = "notification-toast";

    if let Some(existing) = app.get_webview_window(label) {
        let _ = existing.show();
        let _ = existing.set_focus();
        return false;
    }

    if let Some(monitor) = app.primary_monitor().ok().flatten() {
        let mon_size = monitor.size();
        let mon_pos = monitor.position();
        let scale = monitor.scale_factor() as f64;
        let win_w = 380.0;
        let win_h = 160.0;
        let margin = 20.0;
        let x = (mon_pos.x as f64 + mon_size.width as f64) / scale - win_w - margin;
        let y = (mon_pos.y as f64 + mon_size.height as f64) / scale - win_h - margin;

        use tauri::{WebviewUrl, WebviewWindowBuilder};
        let result = WebviewWindowBuilder::new(&app, label, WebviewUrl::App("/utility/notification-toast".into()))
            .title("")
            .inner_size(win_w, win_h)
            .position(x, y)
            .resizable(false)
            .decorations(false)
            .shadow(false)
            .always_on_top(true)
            .visible(false)
            .skip_taskbar(true)
            .transparent(true)
            .background_color(tauri::window::Color(0, 0, 0, 0))
            .initialization_script(crate::state::utility_init_script(&app))
            .build();
        match result {
            Ok(_) => { return true; }
            Err(e) => {
                eprintln!("[NotificationToast] Failed to create window: {}", e);
                return false;
            }
        }
    }

    false
}

/// Create or show the always-on-top stopwatch widget (circular clock).
/// Positioned at the bottom-right of the primary monitor, left of the countdown widget.
#[tauri::command]
pub async fn show_stopwatch_widget(app: AppHandle) -> bool {
    show_timer_widget_inner(&app, "sw-widget", "/utility/sw-widget", 120.0, 120.0, 300.0)
}

/// Create or show the always-on-top countdown widget (ring list).
/// Positioned at the bottom-right of the primary monitor.
#[tauri::command]
pub async fn show_countdown_widget(app: AppHandle) -> bool {
    show_timer_widget_inner(&app, "cd-widget", "/utility/cd-widget", 280.0, 260.0, 0.0)
}

/// Create or show an individual countdown item card window.
/// `timer_id` is the full countdown ID; `index` controls vertical stacking.
#[tauri::command]
pub async fn show_cd_item_widget(app: AppHandle, timer_id: String, index: i32) -> bool {
    // Use first 8 chars for label (safe for ASCII IDs; fallback to full string if shorter)
    let short_id: String = timer_id.chars().take(8).collect();
    let label = format!("cd-item-{}", short_id);
    let url = format!("/utility/cd-item?id={}", timer_id);

    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.show();
        return true;
    }

    if let Some(monitor) = app.primary_monitor().ok().flatten() {
        let mon_size = monitor.size();
        let mon_pos = monitor.position();
        let scale = monitor.scale_factor() as f64;
        let win_w = 240.0;
        let win_h = 68.0;
        let margin = 20.0;
        let gap = 6.0;
        let x = (mon_pos.x as f64 + mon_size.width as f64) / scale - win_w - margin;
        let y = (mon_pos.y as f64 + mon_size.height as f64) / scale
            - win_h - margin - (index as f64 * (win_h + gap));

        use tauri::{WebviewUrl, WebviewWindowBuilder};
        let result = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
            .title("")
            .inner_size(win_w, win_h)
            .position(x, y)
            .resizable(false)
            .decorations(false)
            .shadow(false)
            .always_on_top(true)
            .visible(false)
            .skip_taskbar(true)
            .transparent(true)
            .background_color(tauri::window::Color(0, 0, 0, 0))
            .initialization_script(crate::state::utility_init_script(&app))
            .build();
        match result {
            Ok(w) => {
                let _ = w.show();
                return true;
            }
            Err(e) => {
                eprintln!("[CdItem] Failed to create '{}': {}", label, e);
                return false;
            }
        }
    }
    false
}

/// Close all countdown item card windows (labels starting with "cd-item-").
#[tauri::command]
pub fn close_cd_item_windows(app: AppHandle) -> Result<(), String> {
    for window in app.webview_windows() {
        if window.0.starts_with("cd-item-") {
            let _ = window.1.close();
        }
    }
    Ok(())
}

/// Shared logic for timer floating widgets.
/// `x_offset` shifts the window left (used to place stopwatch widget beside countdown widget).
fn show_timer_widget_inner(
    app: &AppHandle,
    label: &str,
    url: &str,
    win_w: f64,
    win_h: f64,
    x_offset: f64,
) -> bool {
    if let Some(existing) = app.get_webview_window(label) {
        let _ = existing.show();
        let _ = existing.set_focus();
        return false;
    }

    if let Some(monitor) = app.primary_monitor().ok().flatten() {
        let mon_size = monitor.size();
        let mon_pos = monitor.position();
        let scale = monitor.scale_factor() as f64;
        let margin = 20.0;
        let x = (mon_pos.x as f64 + mon_size.width as f64) / scale - win_w - margin - x_offset;
        let y = (mon_pos.y as f64 + mon_size.height as f64) / scale - win_h - margin;

        use tauri::{WebviewUrl, WebviewWindowBuilder};
        let result = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
            .title("")
            .inner_size(win_w, win_h)
            .position(x, y)
            .resizable(false)
            .decorations(false)
            .shadow(false)
            .always_on_top(true)
            .visible(false)
            .skip_taskbar(true)
            .transparent(true)
            .background_color(tauri::window::Color(0, 0, 0, 0))
            .initialization_script(crate::state::utility_init_script(app))
            .build();
        match result {
            Ok(w) => {
                let _ = w.show();
                return true;
            }
            Err(e) => {
                eprintln!("[TimerWidget] Failed to create window '{}': {}", label, e);
                return false;
            }
        }
    }

    false
}
