// A7Box Rust Backend Entry Point
// Registers all modules, plugins, commands, and tray

mod clipboard;
mod commands;
mod http_server;
mod http_service;
mod p2p;
mod registry;
mod color_picker;
mod screenshot;
mod tray;

use clipboard::ClipboardState;
use http_server::HttpServerState;
use http_service::HttpServiceState;
use p2p::{P2PState, P2PStateArc};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::Manager;
use tauri::Emitter;
use tauri::Listener;
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// Registry to track action -> keys mapping for dynamic unregistration
pub struct ShortcutRegistry(pub Mutex<HashMap<String, String>>);

/// State to buffer a deep-link directory when the app cold-starts.
/// The frontend consumes this via `get_pending_http_serve_dir` command.
pub struct PendingHttpServeDir(pub Mutex<Option<String>>);

/// State to buffer image file paths from right-click context menu.
/// Supports multiple files (multi-select right-click). Frontend consumes via
/// `get_pending_image_file` which returns and clears all queued paths.
pub struct PendingImageFile(pub Mutex<Vec<String>>);

/// State to buffer image file paths from right-click "Convert Format" context menu.
/// Frontend consumes via `get_pending_convert_file` which returns and clears all queued paths.
pub struct PendingConvertFile(pub Mutex<Vec<String>>);

/// Shared app language state (synced from frontend when user changes language).
/// Used to pass language to utility windows via initialization script.
pub struct AppLanguage(pub Mutex<String>);

/// Get the current language for the given app handle.
fn current_lang(app_ref: &tauri::AppHandle<tauri::Wry>) -> &'static str {
    let lang = app_ref
        .state::<AppLanguage>()
        .0
        .lock()
        .map(|g| g.clone())
        .unwrap_or_else(|_| "en".to_string());
    if lang.starts_with("zh") { "zh-CN" } else { "en-US" }
}

/// JavaScript snippet injected via `initialization_script` into utility webviews.
/// Runs BEFORE any page scripts, so `getInitialLanguage()` can read `window.__A7BOX_LANG__`.
fn lang_init_script(app_ref: &tauri::AppHandle<tauri::Wry>) -> String {
    format!("window.__A7BOX_LANG__='{}';", current_lang(app_ref))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let clipboard_state = Arc::new(ClipboardState::new());
    let http_server_state = Arc::new(HttpServerState::new());
    let http_service_state = Arc::new(HttpServiceState::new());
    let pending_http_serve_dir = PendingHttpServeDir(Mutex::new(None));
    let pending_image_file = PendingImageFile(Mutex::new(Vec::new()));
    let pending_convert_file = PendingConvertFile(Mutex::new(Vec::new()));
    let shortcut_registry = ShortcutRegistry(Mutex::new(HashMap::new()));
    let app_language = AppLanguage(Mutex::new(
        sys_locale::get_locale().unwrap_or_else(|| "en".to_string()),
    ));

    // P2P state: use app data dir for persistence
    let data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("A7Box")
        .join("p2p");
    let p2p_state: P2PStateArc = Arc::new(P2PState::new(data_dir));

    tauri::Builder::default()
        // Plugins
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // Deep link: registers a7box:// protocol handler in Windows registry
        .plugin(tauri_plugin_deep_link::init())
        // Single instance: ensures only one app instance; forwards deep link URLs
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Bring existing window to foreground when triggered from context menu
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }

            let mut i = 1;
            while i < args.len() {
                if args[i].starts_with("a7box://http-server") {
                    let dir = parse_deep_link_url(&args[i]);
                    if !dir.is_empty() {
                        let _ = app.emit("deep-link-received", &dir);
                    }
                    break;
                }
                if args[i] == "--http-serve" {
                    if let Some(dir) = args.get(i + 1) {
                        let _ = app.emit("deep-link-received", dir);
                    }
                    break;
                }
                if args[i] == "--compress-image" {
                    if let Some(file) = args.get(i + 1) {
                        // Store in state so frontend can poll even if event is missed
                        if let Ok(mut g) = app.state::<PendingImageFile>().0.lock() {
                            g.push(file.clone());
                        }
                        let _ = app.emit("compress-image-received", file);
                    }
                    break;
                }
                if args[i] == "--convert-image" {
                    if let Some(file) = args.get(i + 1) {
                        if let Ok(mut g) = app.state::<PendingConvertFile>().0.lock() {
                            g.push(file.clone());
                        }
                        let _ = app.emit("convert-image-received", file);
                    }
                    break;
                }
                i += 1;
            }
        }))
        // State
        .manage(clipboard_state)
        .manage(http_server_state)
        .manage(http_service_state)
        .manage(p2p_state)
        .manage(pending_http_serve_dir)
        .manage(pending_image_file)
        .manage(pending_convert_file)
        .manage(shortcut_registry)
        .manage(app_language)
        // Commands
        .invoke_handler(tauri::generate_handler![
            // Clipboard
            commands::start_clipboard_watcher,
            commands::stop_clipboard_watcher,
            commands::get_clipboard_text,
            commands::set_clipboard_text,
            commands::get_clipboard_image,
            // Screenshot
            commands::capture_full_screen,
            commands::capture_region,
            commands::capture_to_base64,
            commands::get_monitors,
            commands::file_to_base64,
            commands::save_edited_image,
            // HTTP Server
            commands::start_http_server,
            commands::stop_http_server,
            commands::get_http_server_info,
            // Independent HTTP Service
            commands::http_start_server,
            commands::http_stop_server,
            commands::http_list_servers,
            // Tray
            commands::update_tray_language,
            commands::sync_app_language,
            // P2P LAN Transfer
            commands::p2p_get_identity,
            commands::p2p_set_alias,
            commands::p2p_get_peers,
            commands::p2p_start_service,
            commands::p2p_send_file,
            commands::p2p_request_dir,
            commands::p2p_download_file,
            commands::p2p_set_shared_dir,
            commands::p2p_get_shared_info,
            commands::p2p_get_transfers,
            commands::p2p_get_local_ips,
            commands::p2p_manual_connect,
            commands::p2p_retry_transfer,
            commands::p2p_stop_service,
            commands::p2p_get_running_port,
            commands::p2p_validate_dir,
            commands::p2p_accept_transfer,
            commands::p2p_reject_transfer,
            commands::p2p_cancel_transfer,
            commands::p2p_set_download_dir,
            commands::p2p_get_download_dir,
            // Cache Management
            commands::get_cache_sizes,
            commands::clear_cache,
            // Shortcut Management
            commands::update_shortcut,
            // Utility Windows
            commands::create_utility_window,
            commands::close_utility_window,
            // Deep Link: pending HTTP serve directory
            get_pending_http_serve_dir,
            // Deep Link: pending image file for compression
            get_pending_image_file,
            read_local_image,
            get_pending_convert_file,
            // Color Picker
            commands::start_screen_pick,
            commands::get_last_picked_color,
            commands::get_pick_source,
        ])
        // Setup: tray + global shortcuts + window close behavior
        .setup(|app| {
            // Setup system tray
            tray::setup_tray(app)?;

            // Check command-line args for deep link URL or --http-serve flag
            // Store in PendingHttpServeDir state so frontend can fetch on mount
            // (emitting before frontend listener is ready would lose the event)
            let args: Vec<String> = std::env::args().collect();
            let mut i = 1;
            while i < args.len() {
                if args[i].starts_with("a7box://http-server") {
                    let dir = parse_deep_link_url(&args[i]);
                    if let Ok(mut g) = app.state::<PendingHttpServeDir>().0.lock() {
                        *g = Some(dir);
                    }
                    break;
                }
                if args[i] == "--http-serve" {
                    if let Some(dir) = args.get(i + 1) {
                        if let Ok(mut g) = app.state::<PendingHttpServeDir>().0.lock() {
                            *g = Some(dir.clone());
                        }
                    }
                    break;
                }
                if args[i] == "--compress-image" {
                    if let Some(file) = args.get(i + 1) {
                        if let Ok(mut g) = app.state::<PendingImageFile>().0.lock() {
                            g.push(file.clone());
                        }
                    }
                    break;
                }
                if args[i] == "--convert-image" {
                    if let Some(file) = args.get(i + 1) {
                        if let Ok(mut g) = app.state::<PendingConvertFile>().0.lock() {
                            g.push(file.clone());
                        }
                    }
                    break;
                }
                i += 1;
            }

            // Register deep link protocol and Windows context menu
            let _ = app.deep_link().register_all();
            registry::setup_context_menu(app.handle());

            // Register global shortcuts dynamically
            let handle = app.handle().clone();
            let default_shortcuts = vec![
                ("toggle-command-palette", "CommandOrControl+Shift+A"),
                ("toggle-window", "CommandOrControl+Shift+H"),
                ("open-screenshot", "CommandOrControl+Shift+S"),
                ("clipboard-to-qr", "CommandOrControl+Shift+Q"),
                ("clipboard-to-md", "CommandOrControl+Shift+M"),
                ("clipboard-to-json", "CommandOrControl+Shift+J"),
                ("open-color-picker", "CommandOrControl+Shift+C"),
            ];
            let registry = &app.state::<ShortcutRegistry>().0;
            {
                let mut reg = registry.lock().unwrap();
                for (action, keys) in &default_shortcuts {
                    let action_str = action.to_string();
                    let keys_str = keys.to_string();
                    let handle_clone = handle.clone();
                    let action_emit = action_str.clone();
                    // Unregister first in case the hotkey is already registered
                    let _ = app.global_shortcut().unregister(keys_str.as_str());
                    if let Err(e) = app.global_shortcut().on_shortcut(keys_str.as_str(), move |app_ref, _shortcut, event| {
                        if event.state != ShortcutState::Pressed { return; }
                        // Handle actions directly in Rust (no frontend roundtrip needed)
                        match action_emit.as_str() {
                            "toggle-command-palette" => {
                                // Create standalone Spotlight-style palette window
                                use tauri::{WebviewUrl, WebviewWindowBuilder};
                                let label = "utility-palette";
                                // Close existing if any (toggle behavior)
                                if let Some(existing) = app_ref.get_webview_window(label) {
                                    let _ = existing.close();
                                    // Don't create a new one — this is toggle off
                                } else {
                                    if let Ok(win) = WebviewWindowBuilder::new(app_ref, label, WebviewUrl::App("/utility/palette".into()))
                                        .title("A7Box")
                                        .inner_size(520.0, 420.0)
                                        .resizable(false)
                                        .decorations(false)
                                        .transparent(true)
                                        .always_on_top(true)
                                        .visible(true)
                                        .skip_taskbar(true)
                                        .center()
                                        .background_color(tauri::window::Color(0, 0, 0, 0))
                                        .initialization_script(crate::lang_init_script(app_ref))
                                        .build()
                                    {
                                        let _ = win.set_focus();
                                    }
                                }
                            }
                            "toggle-window" => {
                                if let Some(w) = app_ref.get_webview_window("main") {
                                    if w.is_visible().unwrap_or(false) {
                                        let _ = w.hide();
                                    } else {
                                        let _ = w.show();
                                        let _ = w.unminimize();
                                        let _ = w.set_focus();
                                    }
                                }
                            }
                            "open-screenshot" => {
                                if let Some(w) = app_ref.get_webview_window("main") {
                                    let _ = w.show();
                                    let _ = w.unminimize();
                                    let _ = w.set_focus();
                                }
                            }
                            "clipboard-to-qr" => {
                                // Create utility window directly from Rust
                                use tauri::{WebviewUrl, WebviewWindowBuilder};
                                let label = "qr-quick";
                                // Close existing if any
                                if let Some(existing) = app_ref.get_webview_window(label) {
                                    let _ = existing.close();
                                }
                                if let Ok(_win) = WebviewWindowBuilder::new(app_ref, label, WebviewUrl::App("/utility/qr-quick".into()))
                                    .title("")
                                    .inner_size(360.0, 440.0)
                                    .resizable(false)
                                    .decorations(false)
                                    .always_on_top(true)
                                    .visible(false) // hidden until React emits util-window-ready
                                    .skip_taskbar(true)
                                    .center()
                                    .background_color(tauri::window::Color(10, 10, 11, 255))
                                    .initialization_script(crate::lang_init_script(app_ref))
                                    .build()
                                {
                                    // Window stays open; user closes via X button, ESC, or double-click title bar
                                }
                            }
                            "clipboard-to-md" => {
                                use tauri::{WebviewUrl, WebviewWindowBuilder};
                                let label = "md-convert";
                                if let Some(existing) = app_ref.get_webview_window(label) {
                                    let _ = existing.close();
                                }
                                if let Ok(_win) = WebviewWindowBuilder::new(app_ref, label, WebviewUrl::App("/utility/md-convert".into()))
                                    .title("")
                                    .inner_size(520.0, 600.0)
                                    .resizable(true)
                                    .decorations(false)
                                    .always_on_top(true)
                                    .visible(false) // hidden until React emits util-window-ready
                                    .skip_taskbar(true)
                                    .center()
                                    .background_color(tauri::window::Color(10, 10, 11, 255))
                                    .initialization_script(crate::lang_init_script(app_ref))
                                    .build()
                                {}
                            }
                            "clipboard-to-json" => {
                                use tauri::{WebviewUrl, WebviewWindowBuilder};
                                let label = "json-quick";
                                if let Some(existing) = app_ref.get_webview_window(label) {
                                    let _ = existing.close();
                                }
                                if let Ok(_win) = WebviewWindowBuilder::new(app_ref, label, WebviewUrl::App("/utility/json-quick".into()))
                                    .title("")
                                    .inner_size(480.0, 560.0)
                                    .resizable(true)
                                    .decorations(false)
                                    .always_on_top(true)
                                    .visible(false) // hidden until React emits util-window-ready
                                    .skip_taskbar(true)
                                    .center()
                                    .background_color(tauri::window::Color(10, 10, 11, 255))
                                    .initialization_script(crate::lang_init_script(app_ref))
                                    .build()
                                {}
                            }
                            "clipboard-to-code-minify" => {
                                use tauri::{WebviewUrl, WebviewWindowBuilder};
                                let label = "code-quick";
                                if let Some(existing) = app_ref.get_webview_window(label) {
                                    let _ = existing.close();
                                }
                                if let Ok(_win) = WebviewWindowBuilder::new(app_ref, label, WebviewUrl::App("/utility/code-quick".into()))
                                    .title("")
                                    .inner_size(560.0, 640.0)
                                    .resizable(true)
                                    .decorations(false)
                                    .always_on_top(true)
                                    .visible(false) // hidden until React emits util-window-ready
                                    .skip_taskbar(true)
                                    .center()
                                    .background_color(tauri::window::Color(10, 10, 11, 255))
                                    .initialization_script(crate::lang_init_script(app_ref))
                                    .build()
                                {}
                            }
                            "open-color-picker" => {
                                // Hide main window so the picker overlay can see the screen
                                // (hide instead of minimize so is_visible() returns false = global mode)
                                if let Some(main_win) = app_ref.get_webview_window("main") {
                                    let _ = main_win.hide();
                                }
                                // Also hide ColorQuick if it's open (user triggered from global shortcut)
                                if let Some(cq) = app_ref.get_webview_window("color-quick") {
                                    let _ = cq.hide();
                                }
                                // Spawn thread: wait for minimize, then start live picker
                                let app_clone = app_ref.clone();
                                std::thread::spawn(move || {
                                    std::thread::sleep(std::time::Duration::from_millis(250));
                                    if let Ok(mut src) = crate::commands::PICK_SOURCE.lock() {
                                        *src = "global".into();
                                    }
                                    if let Err(e) = crate::commands::start_screen_pick(app_clone, None) {
                                        eprintln!("[WARN] Failed to start screen pick: {}", e);
                                    }
                                });
                            }
                            _ => {}
                        }
                        // Also emit event to frontend for any additional handling
                        // For actions that bring the window from hidden/minimized state,
                        // delay the emit so the webview has time to become active.
                        let needs_delay = matches!(action_emit.as_str(), "open-screenshot");
                        if needs_delay {
                            let h = handle_clone.clone();
                            let a = action_emit.clone();
                            std::thread::spawn(move || {
                                std::thread::sleep(std::time::Duration::from_millis(150));
                                let _ = h.emit("global-shortcut", &a);
                            });
                        } else {
                            let _ = handle_clone.emit("global-shortcut", &action_emit);
                        }
                    }) {
                        eprintln!("[WARN] Failed to register shortcut {}: {}", action_str, e);
                    }
                    reg.insert(action_str, keys_str);
                }
            }

            // Handle window close: hide to tray instead of exiting
            let window = app.get_webview_window("main").unwrap();
            let w = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = w.hide();
                }
            });

            // Listen for picker-ready: frontend signals CSS is applied, now safe to show overlay.
            // Also re-emit pick-source so the overlay's listener (registered after load) receives it.
            {
                let app_handle = app.handle().clone();
                app.listen("picker-ready", move |_event| {
                    // Re-emit the stored pick-source (the original emit may have been lost
                    // because it fired before the overlay's React component mounted)
                    let source = crate::commands::PICK_SOURCE.lock()
                        .map(|s| if s.is_empty() { "global".to_string() } else { s.clone() })
                        .unwrap_or_else(|_| "global".to_string());
                    let _ = app_handle.emit("pick-source", &source);
                    if let Some(overlay) = app_handle.get_webview_window("pick-overlay") {
                        let _ = overlay.show();
                        let _ = overlay.set_focus();
                    }
                });
            }

            // Listen for color-quick-ready: ColorQuick signals it's mounted, safe to show + send color.
            {
                let app_handle = app.handle().clone();
                app.listen("color-quick-ready", move |_event| {
                    // Show the window now that React is ready (avoids black flash)
                    if let Some(cq) = app_handle.get_webview_window("color-quick") {
                        let _ = cq.show();
                        let _ = cq.set_focus();
                    }
                    // Re-emit screen-color-picked so ColorQuick's listener receives the correct color
                    let color = crate::commands::LAST_PICKED_COLOR.lock()
                        .map(|s| s.clone())
                        .unwrap_or_default();
                    if !color.is_empty() {
                        let _ = app_handle.emit("screen-color-picked", &color);
                    }
                });
            }

            // Listen for util-window-ready: utility windows signal React has mounted, safe to show (avoids flicker)
            {
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

            // Listen for pick-confirm from the overlay (left-click / Enter / Space)
            // Payload: { color: string, mode: string }
            // mode="quick": copy color, close overlay; restore main if page mode
            {
                let app_handle = app.handle().clone();
                app.listen("pick-confirm", move |event| {
                    if let Some(overlay) = app_handle.get_webview_window("pick-overlay") {
                        let _ = overlay.hide();
                        let _ = overlay.close();
                    }
                    // Parse mode: try as object first, then as JSON-encoded string
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

                    let from_page = crate::commands::PICK_FROM_PAGE.load(std::sync::atomic::Ordering::SeqCst);
                    // Restore main if: quick mode from page (user was in app)
                    if mode == "quick" && from_page {
                        if let Some(main) = app_handle.get_webview_window("main") {
                            let _ = main.unminimize();
                            let _ = main.show();
                            let _ = main.set_focus();
                        }
                    }
                });
            }

            // Listen for repick-from-float: user clicked "取色" in ColorQuick
            // Same approach as global shortcut: wait for hide, then start pick
            {
                let app_handle = app.handle().clone();
                app.listen("repick-from-float", move |_event| {
                    // Close existing overlay if any
                    if let Some(existing) = app_handle.get_webview_window("pick-overlay") {
                        let _ = existing.hide();
                        let _ = existing.close();
                    }
                    let app_clone = app_handle.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(250));
                        if let Ok(mut src) = crate::commands::PICK_SOURCE.lock() {
                            *src = "float".into();
                        }
                        if let Err(e) = crate::commands::start_screen_pick(app_clone, Some(false)) {
                            eprintln!("[WARN] Failed to start screen pick from float: {}", e);
                        }
                    });
                });
            }

            // Listen for pick-from-page: user clicked pipette button in ColorTool page
            {
                let app_handle = app.handle().clone();
                app.listen("pick-from-page", move |_event| {
                    // Close existing overlay if any
                    if let Some(existing) = app_handle.get_webview_window("pick-overlay") {
                        let _ = existing.hide();
                        let _ = existing.close();
                    }
                    let app_clone = app_handle.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(250));
                        if let Ok(mut src) = crate::commands::PICK_SOURCE.lock() {
                            *src = "page".into();
                        }
                        if let Err(e) = crate::commands::start_screen_pick(app_clone, Some(true)) {
                            eprintln!("[WARN] Failed to start screen pick from page: {}", e);
                        }
                    });
                });
            }

            // Listen for right-click-pick: close overlay, show ColorQuick float (global) or restore main (page)
            {
                let app_handle = app.handle().clone();
                app.listen("right-click-pick", move |event| {
                    if let Some(overlay) = app_handle.get_webview_window("pick-overlay") {
                        let _ = overlay.hide();
                        let _ = overlay.close();
                    }

                    // Extract hex from event payload and store in LAST_PICKED_COLOR
                    // (ensures exact picked color is preserved for late-joining windows)
                    let picked_hex = event.payload().trim_matches('"').to_string();
                    if !picked_hex.is_empty() {
                        if let Ok(mut stored) = crate::commands::LAST_PICKED_COLOR.lock() {
                            *stored = picked_hex.clone();
                        }
                    }

                    let from_page = crate::commands::PICK_FROM_PAGE.load(std::sync::atomic::Ordering::SeqCst);
                    if from_page {
                        // Page mode: restore main window (user was working in ColorTool)
                        if let Some(main) = app_handle.get_webview_window("main") {
                            let _ = main.unminimize();
                            let _ = main.show();
                            let _ = main.set_focus();
                        }
                    } else {
                        // Global mode: show or create ColorQuick float window
                        if let Some(cq) = app_handle.get_webview_window("color-quick") {
                            let _ = cq.show();
                            let _ = cq.unminimize();
                            let _ = cq.set_focus();
                        } else {
                            // Window doesn't exist yet — create it hidden
                            // (avoids black flash; React emits "color-quick-ready" when mounted)
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
                                .initialization_script(crate::lang_init_script(&app_handle))
                                .build();
                        }
                    }
                });
            }

            // Listen for pick-cancel from the overlay: close overlay, conditionally restore main
            {
                let app_handle = app.handle().clone();
                app.listen("pick-cancel", move |_event| {
                    if let Some(overlay) = app_handle.get_webview_window("pick-overlay") {
                        let _ = overlay.hide();
                        let _ = overlay.close();
                    }
                    // Only restore main if pick was started from page (not global shortcut)
                    if crate::commands::PICK_FROM_PAGE.load(std::sync::atomic::Ordering::SeqCst) {
                        if let Some(main) = app_handle.get_webview_window("main") {
                            let _ = main.unminimize();
                            let _ = main.show();
                            let _ = main.set_focus();
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Parse a deep link URL to extract the directory path.
/// Input:  `a7box://http-server?dir=C:\some\path`
/// Output: `C:\some\path`
fn parse_deep_link_url(url: &str) -> String {
    if let Some(query_start) = url.find('?') {
        let query = &url[query_start + 1..];
        for pair in query.split('&') {
            let mut kv = pair.splitn(2, '=');
            if let (Some(key), Some(value)) = (kv.next(), kv.next()) {
                if key == "dir" {
                    let dir = value.trim_matches('"');
                    // Percent-decode common characters (e.g. %20 -> space)
                    let mut result = String::new();
                    let mut chars = dir.bytes();
                    while let Some(b) = chars.next() {
                        if b == b'%' {
                            let h = chars.next().unwrap_or(b'0');
                            let l = chars.next().unwrap_or(b'0');
                            let hex = format!("{}{}", h as char, l as char);
                            if let Ok(n) = u8::from_str_radix(&hex, 16) {
                                result.push(n as char);
                            }
                        } else if b == b'+' {
                            result.push(' ');
                        } else {
                            result.push(b as char);
                        }
                    }
                    return result;
                }
            }
        }
    }
    String::new()
}

/// Tauri command: returns and clears the pending HTTP serve directory from cold start.
#[tauri::command]
fn get_pending_http_serve_dir(state: tauri::State<'_, PendingHttpServeDir>) -> Option<String> {
    let mut guard = state.0.lock().ok()?;
    guard.take()
}

/// Tauri command: returns and clears ALL pending image file paths.
/// Returns Vec<String> (empty if none). Supports multi-file right-click.
/// Populated by both cold start (setup arg parsing) and warm start (single_instance callback).
#[tauri::command]
fn get_pending_image_file(state: tauri::State<'_, PendingImageFile>) -> Vec<String> {
    let mut guard = match state.0.lock() {
        Ok(g) => g,
        Err(_) => return Vec::new(),
    };
    std::mem::take(&mut *guard)
}

/// Tauri command: reads a local image file, bypassing fs plugin scope restrictions.
/// Used for right-click context menu where the file path is arbitrary.
/// Returns raw bytes as Vec<u8> (serialized as JSON number array).
#[tauri::command]
fn read_local_image(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("Failed to read '{}': {}", path, e))
}

/// Tauri command: returns and clears ALL pending convert image file paths.
/// Returns Vec<String> (empty if none). Supports multi-file right-click.
#[tauri::command]
fn get_pending_convert_file(state: tauri::State<'_, PendingConvertFile>) -> Vec<String> {
    let mut guard = match state.0.lock() {
        Ok(g) => g,
        Err(_) => return Vec::new(),
    };
    std::mem::take(&mut *guard)
}
