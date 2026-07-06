// A7Box System Tray Module
// Creates system tray icon with context menu
// Supports dynamic language switching via update_tray_language()

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Runtime,
};
#[cfg(target_os = "macos")]
use tauri::image::Image;

/// Tray icon fixed ID for removal/rebuild
pub const TRAY_ID: &str = "main-tray";

/// Get i18n labels based on language code
fn get_labels(lang: &str) -> (&'static str, &'static str, &'static str) {
    if lang.starts_with("zh") {
        (
            "\u{663e}\u{793a} A7\u{5323}",                          // 显示 A7匣
            "\u{9000}\u{51fa}",                                      // 退出
            "A7\u{5323} - \u{684c}\u{9762}\u{6218}\u{672f}\u{7ea7}\u{6548}\u{7387}\u{6b66}\u{5668}", // A7匣 - 桌面战术级效率武器
        )
    } else {
        (
            "Show A7Box",
            "Quit",
            "A7Box - Your Tactical Efficiency Weapon",
        )
    }
}

/// Detect system locale using sys-locale (works on Windows + macOS)
fn detect_locale() -> String {
    if let Some(locale) = sys_locale::get_locale() {
        return locale;
    }
    if let Ok(lang) = std::env::var("LANG") {
        return lang;
    }
    "en".to_string()
}

/// macOS-specific tray icon (monochrome template image, 22x22)
#[cfg(target_os = "macos")]
const TRAY_ICON: Image<'_> = tauri::include_image!("../../icons/a7box-tray-22.png");

/// Build (or rebuild) the system tray with the given language
fn build_tray<R: Runtime>(app: &tauri::AppHandle<R>, lang: &str) -> Result<(), Box<dyn std::error::Error>> {
    let (show_label, quit_label, tooltip) = get_labels(lang);

    // Remove existing tray if present
    let _ = app.remove_tray_by_id(TRAY_ID);

    let show = MenuItem::with_id(app, "show", show_label, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", quit_label, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip(tooltip);

    // macOS: use monochrome template icon for proper light/dark menu bar adaptation
    #[cfg(target_os = "macos")]
    {
        builder = builder.icon(TRAY_ICON).icon_as_template(true);
    }
    // Windows/Linux: use default app icon
    #[cfg(not(target_os = "macos"))]
    {
        builder = builder.icon(app.default_window_icon().unwrap().clone());
    }

    builder
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
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
                    let is_vis = window.is_visible().unwrap_or(false);
                    let is_min = window.is_minimized().unwrap_or(false);
                    if is_vis && !is_min {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}

/// Initial tray setup (uses system locale)
pub fn setup_tray<R: Runtime>(app: &tauri::App<R>) -> Result<(), Box<dyn std::error::Error>> {
    let locale = detect_locale();
    build_tray(app.handle(), &locale)
}

/// Update tray language (called from frontend when language changes)
pub fn update_tray_language<R: Runtime>(app: &tauri::AppHandle<R>, lang: &str) {
    if let Err(e) = build_tray(app, lang) {
        eprintln!("[WARN] Failed to update tray language: {}", e);
    }
}
