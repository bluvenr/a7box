// A7Box Rust Backend Entry Point
// Registers all modules, plugins, commands, and tray

mod clipboard;
mod commands;
mod deep_link;
mod events;
mod http_server;
mod http_service;
mod p2p;
mod registry;
mod color_picker;
mod screenshot;
mod shortcut_handler;
mod state;
mod tray;

use clipboard::ClipboardState;
use clipboard::ClipboardManagerState;
use http_server::HttpServerState;
use http_service::HttpServiceState;
use p2p::{P2PState, P2PStateArc};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use state::{ShortcutRegistry, PendingHttpServeDir, PendingImageFile, PendingConvertFile, AppLanguage, PickerSession, CaptureSession};

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
    let picker_session = PickerSession::default();
    let capture_session = CaptureSession::default();

    // P2P state: use app data dir for persistence
    let data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("A7Box")
        .join("p2p");
    let p2p_state: P2PStateArc = Arc::new(P2PState::new(data_dir));

    // Clipboard Manager state: SQLite db + settings + watcher flags
    let cm_data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("A7Box");
    let clipboard_manager_state = Arc::new(
        ClipboardManagerState::init(&cm_data_dir)
            .expect("failed to initialize clipboard manager state"),
    );

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
        .plugin(tauri_plugin_device_info::init())
        // Deep link: registers a7box:// protocol handler in Windows registry
        .plugin(tauri_plugin_deep_link::init())
        // Single instance: ensures only one app instance; forwards deep link URLs
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Bring existing window to foreground when triggered from context menu
            if let Some(window) = app.get_webview_window("main") {
                state::bring_window_to_front(&window);
            }
            // Parse args and emit events (warm start)
            deep_link::parse_args(app, &args, true);
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
        .manage(picker_session)
        .manage(capture_session)
        .manage(clipboard_manager_state)
        .manage(tray::TrayUiState(std::sync::Mutex::new(None)))
        // Commands
        .invoke_handler(tauri::generate_handler![
            // Clipboard
            commands::clipboard::start_clipboard_watcher,
            commands::clipboard::stop_clipboard_watcher,
            commands::clipboard::get_clipboard_text,
            commands::clipboard::set_clipboard_text,
            commands::clipboard::get_clipboard_image,
            // Clipboard Manager
            commands::clipboard_manager::start_clipboard_manager,
            commands::clipboard_manager::stop_clipboard_manager,
            commands::clipboard_manager::cm_set_module_enabled,
            commands::clipboard_manager::cm_open_path,
            commands::clipboard_manager::cm_get_history,
            commands::clipboard_manager::cm_get_clip,
            commands::clipboard_manager::cm_delete_clip,
            commands::clipboard_manager::cm_delete_clips,
            commands::clipboard_manager::cm_toggle_pin,
            commands::clipboard_manager::cm_clear_history,
            commands::clipboard_manager::cm_get_stats,
            commands::clipboard_manager::cm_copy_clip,
            commands::clipboard_manager::cm_paste_clip,
            commands::clipboard_manager::cm_paste_stack,
            commands::clipboard_manager::cm_paste_capability,
            commands::clipboard_manager::cm_snapshot_target,
            commands::clipboard_manager::cm_open_popup,
            commands::clipboard_manager::cm_snippet_list,
            commands::clipboard_manager::cm_snippet_save,
            commands::clipboard_manager::cm_snippet_delete,
            commands::clipboard_manager::cm_rule_list,
            commands::clipboard_manager::cm_rule_save,
            commands::clipboard_manager::cm_rule_delete,
            commands::clipboard_manager::cm_rule_toggle,
            commands::clipboard_manager::cm_get_settings,
            commands::clipboard_manager::cm_save_settings,
            commands::clipboard_manager::cm_export,
            commands::clipboard_manager::cm_import,
            commands::clipboard_manager::cm_asset_path,
            commands::clipboard_manager::cm_image_data_url,
            commands::clipboard_manager::cm_copy_text,
            // Screenshot
            commands::screenshot::capture_full_screen,
            commands::screenshot::capture_region,
            commands::screenshot::capture_to_base64,
            commands::screenshot::get_monitors,
            commands::screenshot::file_to_base64,
            commands::screenshot::save_edited_image,
            commands::screenshot::scan_screenshot_history,
            commands::screenshot::set_capture_from_page,
                        commands::screenshot::get_pending_capture_result,
            commands::screenshot::detect_window_at_cursor,
            commands::screenshot::get_session_captures,
            commands::screenshot::clear_session_captures,
            commands::screenshot::read_capture_file,
            commands::screenshot::read_capture_thumbnail,
            commands::screenshot::delete_capture_file,
            commands::screenshot::save_capture_from_temp,
            commands::screenshot::save_capture_dialog,
            commands::color_picker::get_pending_pin_data,
            // HTTP Server
            commands::http::start_http_server,
            commands::http::stop_http_server,
            commands::http::get_http_server_info,
            // Independent HTTP Service
            commands::http::http_start_server,
            commands::http::http_stop_server,
            commands::http::http_list_servers,
            commands::http::http_change_port,
            commands::http::http_check_port,
            // Tray
            commands::update_tray_language,
            commands::sync_app_language,
            // P2P LAN Transfer
            commands::p2p::p2p_get_identity,
            commands::p2p::p2p_set_alias,
            commands::p2p::p2p_get_peers,
            commands::p2p::p2p_start_service,
            commands::p2p::p2p_send_file,
            commands::p2p::p2p_request_dir,
            commands::p2p::p2p_download_file,
            commands::p2p::p2p_set_shared_dir,
            commands::p2p::p2p_get_shared_info,
            commands::p2p::p2p_get_transfers,
            commands::p2p::p2p_get_local_ips,
            commands::p2p::p2p_manual_connect,
            commands::p2p::p2p_retry_transfer,
            commands::p2p::p2p_stop_service,
            commands::p2p::p2p_get_running_port,
            commands::p2p::p2p_validate_dir,
            commands::p2p::p2p_accept_transfer,
            commands::p2p::p2p_reject_transfer,
            commands::p2p::p2p_cancel_transfer,
            commands::p2p::p2p_set_download_dir,
            commands::p2p::p2p_get_download_dir,
            // Cache Management
            commands::cache::get_cache_sizes,
            commands::cache::clear_cache,
            commands::cache::open_cache_dir,
            // Shortcut Management
            commands::shortcut::update_shortcut,
            // Utility Windows
            commands::window::create_utility_window,
            commands::window::close_utility_window,
            commands::window::show_notification_toast,
            commands::window::show_stopwatch_widget,
            commands::window::show_countdown_widget,
            commands::window::show_cd_item_widget,
            commands::window::close_cd_item_windows,
            // Deep Link
            deep_link::get_pending_http_serve_dir,
            deep_link::get_pending_image_file,
            deep_link::read_local_image,
            deep_link::get_pending_convert_file,
            // Color Picker
            commands::color_picker::start_screen_pick,
            commands::color_picker::get_last_picked_color,
            commands::color_picker::get_pick_source,
            // System Stats
            commands::system::get_system_stats,
            // Network Details
            commands::network::get_network_details,
        ])
        // Setup: tray + global shortcuts + events
        .setup(|app| {
            // Setup system tray
            tray::setup_tray(app)?;

            // Parse command-line args (cold start: store in state, don't emit events)
            let args: Vec<String> = std::env::args().collect();
            deep_link::parse_args(app.handle(), &args, false);

            // Register deep link protocol and Windows context menu
            let _ = app.deep_link().register_all();
            registry::setup_context_menu(app.handle());

            // Register global shortcuts
            let default_shortcuts = vec![
                ("toggle-command-palette", "CommandOrControl+Shift+A"),
                ("toggle-window", "CommandOrControl+Shift+H"),
                ("open-screenshot", "CommandOrControl+Shift+S"),
                ("clipboard-to-qr", "CommandOrControl+Shift+Q"),
                ("clipboard-to-md", "CommandOrControl+Shift+M"),
                ("clipboard-to-json", "CommandOrControl+Shift+J"),
                ("clipboard-to-code-minify", "CommandOrControl+Shift+K"),
                ("open-color-picker", "CommandOrControl+Shift+C"),
                ("quick-create-reminder", "CommandOrControl+Shift+R"),
                ("open-clipboard-popup", "Alt+V"),
                ("clipboard-paste-stack", "Alt+Shift+V"),
            ];
            let registry = &app.state::<ShortcutRegistry>().0;
            {
                let mut reg = registry.lock().unwrap();
                for (action, keys) in &default_shortcuts {
                    let action_str = action.to_string();
                    let keys_str = keys.to_string();
                    let action_emit = action_str.clone();
                    let _ = app.global_shortcut().unregister(keys_str.as_str());
                    if let Err(e) = app.global_shortcut().on_shortcut(keys_str.as_str(), move |app_ref, _shortcut, event| {
                        if event.state != ShortcutState::Pressed { return; }
                        shortcut_handler::execute_action(&app_ref.clone(), &action_emit);
                    }) {
                        eprintln!("[WARN] Failed to register shortcut {}: {}", action_str, e);
                    }
                    reg.insert(action_str, keys_str);
                }
            }

            // Register all event listeners
            events::register_all_events(app);

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            match event {
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Reopen { has_visible_windows, .. } => {
                    // macOS: Dock icon click when no visible windows
                    if !has_visible_windows {
                        if let Some(window) = _app.get_webview_window("main") {
                            crate::state::bring_window_to_front(&window);
                        }
                    }
                }
                tauri::RunEvent::Exit => {
                    crate::commands::screenshot::cleanup_temp_screenshots();
                }
                _ => {}
            }
        });
}
