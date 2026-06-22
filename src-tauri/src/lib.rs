// A7Box Rust Backend Entry Point
// Registers all modules, plugins, commands, and tray

mod clipboard;
mod commands;
mod http_server;
mod p2p;
mod screenshot;
mod tray;

use clipboard::ClipboardState;
use http_server::HttpServerState;
use p2p::{P2PState, P2PStateArc};
use std::sync::Arc;
use tauri::Manager;
use tauri::Emitter;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let clipboard_state = Arc::new(ClipboardState::new());
    let http_server_state = Arc::new(HttpServerState::new());

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
        // State
        .manage(clipboard_state)
        .manage(http_server_state)
        .manage(p2p_state)
        // Commands
        .invoke_handler(tauri::generate_handler![
            // Clipboard
            commands::start_clipboard_watcher,
            commands::stop_clipboard_watcher,
            commands::get_clipboard_text,
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
        ])
        // Setup: tray + global shortcuts + window close behavior
        .setup(|app| {
            // Setup system tray
            tray::setup_tray(app)?;

            // Register global shortcuts (graceful: warn on failure, don't crash)
            let handle = app.handle().clone();
            let shortcut_handle = handle.clone();
            if let Err(e) = app.global_shortcut().on_shortcut("CommandOrControl+Shift+A", move |_app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    let _ = shortcut_handle.emit("global-shortcut", "toggle-command-palette");
                }
            }) {
                eprintln!("[WARN] Failed to register Ctrl+Shift+A shortcut: {}", e);
            }

            let screenshot_handle = handle.clone();
            if let Err(e) = app.global_shortcut().on_shortcut("CommandOrControl+Shift+S", move |_app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    let _ = screenshot_handle.emit("global-shortcut", "open-screenshot");
                }
            }) {
                eprintln!("[WARN] Failed to register Ctrl+Shift+S shortcut: {}", e);
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
