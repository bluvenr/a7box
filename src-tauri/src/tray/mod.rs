// A7Box System Tray Module
// Creates system tray icon with context menu
// Supports dynamic language switching via update_tray_language()

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, Wry,
};
#[cfg(target_os = "macos")]
use tauri::image::Image;

/// Tray icon fixed ID for removal/rebuild
pub const TRAY_ID: &str = "main-tray";

/// i18n labels for tray menu items
struct TrayLabels {
    show: &'static str,
    palette: &'static str,
    clipboard_history: &'static str,
    settings: &'static str,
    website: &'static str,
    about_author: &'static str,
    quit: &'static str,
    tooltip: &'static str,
}

/// Get i18n labels based on language code
fn get_labels(lang: &str) -> TrayLabels {
    if lang.starts_with("zh") {
        TrayLabels {
            show: "\u{663e}\u{793a} A7\u{5323}",                    // 显示 A7匳
            palette: "\u{547d}\u{4ee4}\u{9762}\u{677f}",            // 命令面板
            clipboard_history: "\u{526a}\u{8d34}\u{677f}\u{5386}\u{53f2}", // 剪贴板历史
            settings: "\u{6253}\u{5f00}\u{8bbe}\u{7f6e}",            // 打开设置
            website: "\u{4ea7}\u{54c1}\u{5b98}\u{7f51}",              // 产品官网
            about_author: "\u{5173}\u{4e8e}\u{4f5c}\u{8005}",        // 关于作者
            quit: "\u{9000}\u{51fa}",                                  // 退出
            tooltip: "A7\u{5323} - \u{684c}\u{9762}\u{6218}\u{672f}\u{7ea7}\u{6548}\u{7387}\u{6b66}\u{5668}", // A7匣 - 桌面战术级效率武器
        }
    } else {
        TrayLabels {
            show: "Show A7Box",
            palette: "Command Palette",
            clipboard_history: "Clipboard History",
            settings: "Open Settings",
            website: "Website",
            about_author: "About Author",
            quit: "Quit",
            tooltip: "A7Box - Your Tactical Efficiency Weapon",
        }
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
const TRAY_ICON: Image<'_> = tauri::include_image!("icons/a7box-tray-22.png");

/// Build (or rebuild) the system tray with the given language
fn build_tray(app: &tauri::AppHandle<Wry>, lang: &str) -> Result<(), Box<dyn std::error::Error>> {
    let labels = get_labels(lang);

    // Remove existing tray if present
    let _ = app.remove_tray_by_id(TRAY_ID);

    // Build menu items
    let show = MenuItem::with_id(app, "show", labels.show, true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let palette = MenuItem::with_id(app, "palette", labels.palette, true, None::<&str>)?;
    // Show the currently bound popup shortcut in the label (read from registry)
    let popup_keys = app
        .try_state::<crate::state::ShortcutRegistry>()
        .and_then(|r| r.0.lock().ok().and_then(|m| m.get("open-clipboard-popup").cloned()))
        .unwrap_or_else(|| "Alt+V".to_string());
    let clipboard_history = MenuItem::with_id(
        app,
        "clipboard-history",
        format!("{} ({})", labels.clipboard_history, popup_keys),
        true,
        None::<&str>,
    )?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let settings = MenuItem::with_id(app, "settings", labels.settings, true, None::<&str>)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let website = MenuItem::with_id(app, "website", labels.website, true, None::<&str>)?;
    let about_author = MenuItem::with_id(app, "about-author", labels.about_author, true, None::<&str>)?;
    let sep4 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", labels.quit, true, None::<&str>)?;

    // Hide the clipboard-history entry when the clipboard-manager module is
    // disabled (persisted flag, so it is correct right after startup too)
    let cm_enabled = app
        .try_state::<std::sync::Arc<crate::clipboard::ClipboardManagerState>>()
        .map(|s| s.is_module_enabled())
        .unwrap_or(true);

    let menu = if cm_enabled {
        Menu::with_items(app, &[
            &show, &sep1,
            &palette,
            &clipboard_history,
            &sep2, &settings,
            &sep3, &website, &about_author,
            &sep4, &quit,
        ])?
    } else {
        Menu::with_items(app, &[
            &show, &sep1,
            &palette,
            &sep2, &settings,
            &sep3, &website, &about_author,
            &sep4, &quit,
        ])?
    };

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip(labels.tooltip);

    // Left-click toggles window visibility; right-click shows context menu (all platforms)
    builder = builder.show_menu_on_left_click(false);

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
                    crate::state::bring_window_to_front(&window);
                }
            }
            "palette" => {
                // Command palette is a standalone floating window, no need to show main window
                crate::shortcut_handler::execute_action(app, "toggle-command-palette");
            }
            "clipboard-history" => {
                crate::commands::clipboard_manager::toggle_clipboard_popup(app, None);
            }
            "settings" => {
                if let Some(window) = app.get_webview_window("main") {
                    crate::state::bring_window_to_front(&window);
                }
                let _ = app.emit("tray-open-settings", "");
            }
            "website" => {
                let _ = open::that("https://a7box.virapi.com/");
            }
            "about-author" => {
                let _ = open::that("https://bluvenr.virapi.com/");
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
                        crate::state::bring_window_to_front(&window);
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}

/// Initial tray setup (uses system locale)
pub fn setup_tray(app: &tauri::App<Wry>) -> Result<(), Box<dyn std::error::Error>> {
    let locale = detect_locale();
    build_tray(app.handle(), &locale)
}

/// Update tray language (called from frontend when language changes)
pub fn update_tray_language(app: &tauri::AppHandle<Wry>, lang: &str) {
    if let Err(e) = build_tray(app, lang) {
        eprintln!("[WARN] Failed to update tray language: {}", e);
    }
}
