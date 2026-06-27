// A7Box Rust Backend Entry Point
// Registers all modules, plugins, commands, and tray

mod clipboard;
mod commands;
mod http_server;
mod http_service;
mod p2p;
mod registry;
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
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// Registry to track action -> keys mapping for dynamic unregistration
pub struct ShortcutRegistry(pub Mutex<HashMap<String, String>>);

/// State to buffer a deep-link directory when the app cold-starts.
/// The frontend consumes this via `get_pending_http_serve_dir` command.
pub struct PendingHttpServeDir(pub Mutex<Option<String>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let clipboard_state = Arc::new(ClipboardState::new());
    let http_server_state = Arc::new(HttpServerState::new());
    let http_service_state = Arc::new(HttpServiceState::new());
    let pending_http_serve_dir = PendingHttpServeDir(Mutex::new(None));
    let shortcut_registry = ShortcutRegistry(Mutex::new(HashMap::new()));

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
                i += 1;
            }
        }))
        // State
        .manage(clipboard_state)
        .manage(http_server_state)
        .manage(http_service_state)
        .manage(p2p_state)
        .manage(pending_http_serve_dir)
        .manage(shortcut_registry)
        // Commands
        .invoke_handler(tauri::generate_handler![
            // Clipboard
            commands::start_clipboard_watcher,
            commands::stop_clipboard_watcher,
            commands::get_clipboard_text,
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
                i += 1;
            }

            // Register deep link protocol and Windows context menu
            let _ = app.deep_link().register_all();
            registry::setup_context_menu(app.handle());

            // Register global shortcuts dynamically
            let handle = app.handle().clone();
            let default_shortcuts = vec![
                ("toggle-command-palette", "CommandOrControl+Shift+A"),
                ("open-screenshot", "CommandOrControl+Shift+S"),
                ("clipboard-to-qr", "CommandOrControl+Shift+Q"),
                ("clipboard-to-md", "CommandOrControl+Shift+M"),
                ("clipboard-to-json", "CommandOrControl+Shift+J"),
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
                                // Bring main window to front
                                if let Some(w) = app_ref.get_webview_window("main") {
                                    let _ = w.show();
                                    let _ = w.unminimize();
                                    let _ = w.set_focus();
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
                                    .visible(true)
                                    .skip_taskbar(true)
                                    .center()
                                    .background_color(tauri::window::Color(10, 10, 11, 255))
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
                                    .visible(true)
                                    .skip_taskbar(true)
                                    .center()
                                    .background_color(tauri::window::Color(10, 10, 11, 255))
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
                                    .visible(true)
                                    .skip_taskbar(true)
                                    .center()
                                    .background_color(tauri::window::Color(10, 10, 11, 255))
                                    .build()
                                {}
                            }
                            _ => {}
                        }
                        // Also emit event to frontend for any additional handling
                        let _ = handle_clone.emit("global-shortcut", &action_emit);
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
