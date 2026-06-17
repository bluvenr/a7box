// A7Box Rust Backend Entry Point
// Registers all modules, plugins, commands, and tray

mod clipboard;
mod commands;
mod http_server;
mod screenshot;
mod tray;

use clipboard::ClipboardState;
use http_server::HttpServerState;
use std::sync::Arc;
use tauri::Manager;
use tauri::Emitter;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let clipboard_state = Arc::new(ClipboardState::new());
    let http_server_state = Arc::new(HttpServerState::new());

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
        // State
        .manage(clipboard_state)
        .manage(http_server_state)
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
            // HTTP Server
            commands::start_http_server,
            commands::stop_http_server,
            commands::get_http_server_info,
        ])
        // Setup: tray + global shortcuts + window close behavior
        .setup(|app| {
            // Setup system tray
            tray::setup_tray(app)?;

            // Register global shortcuts
            let handle = app.handle().clone();
            let shortcut_handle = handle.clone();
            app.global_shortcut().on_shortcut("CommandOrControl+Shift+A", move |_app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    // Emit event to frontend to toggle command palette
                    let _ = shortcut_handle.emit("global-shortcut", "toggle-command-palette");
                }
            })?;

            let screenshot_handle = handle.clone();
            app.global_shortcut().on_shortcut("CommandOrControl+Shift+S", move |_app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    // Emit event to frontend to open screenshot tool
                    let _ = screenshot_handle.emit("global-shortcut", "open-screenshot");
                }
            })?;

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
