// A7Box System Tray Module
// Creates system tray icon with context menu

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Runtime,
};

/// Detect system locale using sys-locale (works on Windows + macOS)
fn is_chinese_locale() -> bool {
    if let Some(locale) = sys_locale::get_locale() {
        return locale.starts_with("zh") || locale.starts_with("ZH");
    }
    // Fallback: check env vars (Linux/container)
    if let Ok(lang) = std::env::var("LANG") {
        return lang.starts_with("zh");
    }
    false
}

/// Setup system tray with context menu
pub fn setup_tray<R: Runtime>(app: &tauri::App<R>) -> Result<(), Box<dyn std::error::Error>> {
    let is_zh = is_chinese_locale();
    let show_label = if is_zh { "\u{663e}\u{793a} A7\u{5319}" } else { "Show A7Box" };
    let quit_label = if is_zh { "\u{9000}\u{51fa}" } else { "Quit" };
    let tooltip = if is_zh {
        "A7\u{5319} - \u{684c}\u{9762}\u{6218}\u{672f}\u{7ea7}\u{6548}\u{7387}\u{6b66}\u{5668}"
    } else {
        "A7Box - Your Tactical Efficiency Weapon"
    };

    let show = MenuItem::with_id(app, "show", show_label, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", quit_label, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip(tooltip)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // Only toggle window on LEFT click (right click shows context menu)
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}
