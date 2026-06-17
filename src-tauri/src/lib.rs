// A7Box Rust Backend Entry Point
// Registers all modules, plugins, commands, and tray

mod clipboard;
mod commands;
mod tray;

use clipboard::ClipboardState;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let clipboard_state = Arc::new(ClipboardState::new());

    tauri::Builder::default()
        // Plugins
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        // State
        .manage(clipboard_state)
        // Commands
        .invoke_handler(tauri::generate_handler![
            commands::start_clipboard_watcher,
            commands::stop_clipboard_watcher,
            commands::get_clipboard_text,
        ])
        // Setup: tray + window close behavior
        .setup(|app| {
            // Setup system tray
            tray::setup_tray(app)?;

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
