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

/// Handles to the clipboard-related menu items, kept so capture state and
/// module visibility can be updated IN PLACE. Recreating the tray icon on
/// every toggle leaves duplicate/ghost icons in the Windows notification
/// area (and rebuilding from a menu handler even deadlocked once) — the
/// icon itself never needs to change for these updates.
pub struct TrayUi {
    pub toggle: MenuItem<Wry>,
    pub history: MenuItem<Wry>,
    pub menu: Menu<Wry>,
}

/// Managed state holding the live tray item handles (None until first build).
pub struct TrayUiState(pub std::sync::Mutex<Option<TrayUi>>);

/// i18n labels for tray menu items
struct TrayLabels {
    show: &'static str,
    palette: &'static str,
    clipboard_history: &'static str,
    clipboard_pause: &'static str,
    clipboard_resume: &'static str,
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
            clipboard_pause: "\u{6682}\u{505c}\u{526a}\u{8d34}\u{677f}\u{76d1}\u{542c}", // 暂停剪贴板监听
            clipboard_resume: "\u{6062}\u{590d}\u{526a}\u{8d34}\u{677f}\u{76d1}\u{542c}", // 恢复剪贴板监听
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
            clipboard_pause: "Pause Clipboard Monitoring",
            clipboard_resume: "Resume Clipboard Monitoring",
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
    // Current capture state — drives the pause/resume toggle label.
    let capture_enabled = app
        .try_state::<std::sync::Arc<crate::clipboard::ClipboardManagerState>>()
        .map(|s| s.read_settings().enabled)
        .unwrap_or(true);
    let clipboard_history = MenuItem::with_id(
        app,
        "clipboard-history",
        format!("{} ({})", labels.clipboard_history, popup_keys),
        // Stays usable while capture is paused: browsing the existing
        // history records nothing new (pausing stops recording, not usage).
        true,
        None::<&str>,
    )?;
    // Quick toggle for clipboard capture — label reflects the current state.
    // Lets users pause monitoring without digging into settings (privacy need).
    let clipboard_toggle = MenuItem::with_id(
        app,
        "clipboard-toggle",
        if capture_enabled { labels.clipboard_pause } else { labels.clipboard_resume },
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
            &clipboard_toggle,
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

    // Keep handles for in-place updates (toggle label / module visibility)
    if let Some(ui_state) = app.try_state::<TrayUiState>() {
        if let Ok(mut g) = ui_state.0.lock() {
            *g = Some(TrayUi {
                toggle: clipboard_toggle.clone(),
                history: clipboard_history.clone(),
                menu: menu.clone(),
            });
        }
    }

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
            "clipboard-toggle" => {
                // Quick pause/resume of clipboard capture (mirrors cm_save_settings)
                if let Some(state) = app.try_state::<std::sync::Arc<crate::clipboard::ClipboardManagerState>>() {
                    let mut settings = state.read_settings();
                    settings.enabled = !settings.enabled;
                    let now_enabled = settings.enabled;
                    if state.write_settings(settings).is_ok() {
                        if now_enabled {
                            crate::clipboard::start_watcher(app.clone(), state.inner().clone());
                        } else {
                            crate::clipboard::stop_watcher(state.inner());
                        }
                        // Keep the in-app settings UI in sync (same event the
                        // page listens to)
                        let _ = app.emit("cm-settings-changed", ());
                    }
                    // Update the toggle label in place. No tray-icon rebuild:
                    // recreating the icon leaves ghost icons in the Windows
                    // notification area (and rebuilding from this handler
                    // deadlocked the app before).
                    update_capture_ui(app);
                }
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

/// Refresh the clipboard entries of the existing tray in place (pause/resume
/// label + module visibility). Never recreates the tray icon, so it is safe
/// to call from anywhere — including tray-menu handlers — without ghost
/// icons or message-loop deadlocks.
pub fn update_capture_ui(app: &tauri::AppHandle<Wry>) {
    let (Some(ui_state), Some(cm)) = (
        app.try_state::<TrayUiState>(),
        app.try_state::<std::sync::Arc<crate::clipboard::ClipboardManagerState>>(),
    ) else {
        return;
    };
    let Ok(guard) = ui_state.0.lock() else { return };
    let Some(ui) = guard.as_ref() else { return };

    let labels = get_labels(&crate::state::current_lang(app));
    let capture_enabled = cm.read_settings().enabled;
    let cm_enabled = cm.is_module_enabled();

    let _ = ui.toggle.set_text(if capture_enabled {
        labels.clipboard_pause
    } else {
        labels.clipboard_resume
    });
    // Show/hide both entries with the module switch. Detach-then-reinsert is
    // idempotent and the visual equivalent of the old rebuild-without-items
    // path — minus the icon churn that caused ghost tray icons.
    let _ = ui.menu.remove(&ui.history);
    let _ = ui.menu.remove(&ui.toggle);
    if cm_enabled {
        // [show, sep, palette, history, toggle, sep, settings, ...]
        let _ = ui.menu.insert(&ui.history, 3);
        let _ = ui.menu.insert(&ui.toggle, 4);
    }
}
