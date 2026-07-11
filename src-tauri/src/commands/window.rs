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
        #[cfg(not(target_os = "macos"))]
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
        #[cfg(target_os = "macos")]
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
