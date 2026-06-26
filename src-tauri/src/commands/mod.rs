// A7Box IPC Commands
// Tauri commands exposed to frontend via invoke()

use crate::clipboard::{self, ClipboardState};
use crate::http_server::{self, HttpServerState};
use crate::http_service::{self, HttpServiceState};
use crate::p2p::{self, PeerInfo, P2PStateArc};
use crate::screenshot;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::AppHandle;
use tauri::Manager;

// ============ Clipboard Commands ============

#[tauri::command]
pub fn start_clipboard_watcher(app: AppHandle, state: tauri::State<'_, Arc<ClipboardState>>) {
    clipboard::start_clipboard_watcher(app, state.inner().clone());
}

#[tauri::command]
pub fn stop_clipboard_watcher(state: tauri::State<'_, Arc<ClipboardState>>) {
    clipboard::stop_clipboard_watcher(state.inner());
}

#[tauri::command]
pub fn get_clipboard_text() -> Result<String, String> {
    arboard::Clipboard::new()
        .map_err(|e| e.to_string())?
        .get_text()
        .map_err(|e| e.to_string())
}

// ============ Screenshot Commands ============

#[tauri::command]
pub fn capture_full_screen() -> Result<screenshot::CaptureResult, String> {
    screenshot::capture_full_screen()
}

#[tauri::command]
pub fn capture_region(x: i32, y: i32, width: u32, height: u32) -> Result<screenshot::CaptureResult, String> {
    screenshot::capture_region(x, y, width, height)
}

#[tauri::command]
pub fn capture_to_base64() -> Result<String, String> {
    screenshot::capture_to_base64()
}

#[tauri::command]
pub fn get_monitors() -> Result<Vec<screenshot::MonitorInfo>, String> {
    screenshot::get_monitors()
}

#[tauri::command]
pub fn file_to_base64(path: String) -> Result<String, String> {
    screenshot::file_to_base64(path)
}

#[tauri::command]
pub fn save_edited_image(data: String) -> Result<screenshot::CaptureResult, String> {
    screenshot::save_base64_image(data, "edited")
}

// ============ HTTP Server Commands ============

#[tauri::command]
pub fn start_http_server(
    state: tauri::State<'_, Arc<HttpServerState>>,
    directory: String,
    port: u16,
    #[allow(unused_variables)] allow_upload: Option<bool>,
) -> Result<http_server::ServerInfo, String> {
    let upload = allow_upload.unwrap_or(true);
    http_server::start_server(state.inner().clone(), PathBuf::from(directory), port, upload)
}

#[tauri::command]
pub fn stop_http_server(state: tauri::State<'_, Arc<HttpServerState>>) {
    http_server::stop_server(state.inner());
}

#[tauri::command]
pub fn get_http_server_info(state: tauri::State<'_, Arc<HttpServerState>>) -> Option<http_server::ServerInfo> {
    let running = state.running.lock().unwrap();
    if !*running {
        return None;
    }
    let port = *state.port.lock().unwrap();
    let dir = state.server_dir.lock().unwrap().clone();
    Some(http_server::ServerInfo {
        port,
        urls: vec![format!("http://127.0.0.1:{}", port)],
        directory: dir.to_string_lossy().to_string(),
    })
}

// ============ Independent HTTP Service Commands ============

#[tauri::command]
pub fn http_start_server(
    state: tauri::State<'_, Arc<HttpServiceState>>,
    directory: String,
    port: Option<u16>,
) -> Result<http_service::HttpInstanceInfo, String> {
    http_service::start_instance(state.inner(), PathBuf::from(directory), port)
}

#[tauri::command]
pub fn http_stop_server(
    state: tauri::State<'_, Arc<HttpServiceState>>,
    id: String,
) -> Result<(), String> {
    http_service::stop_instance(state.inner(), &id)
}

#[tauri::command]
pub fn http_list_servers(
    state: tauri::State<'_, Arc<HttpServiceState>>,
) -> Vec<http_service::HttpInstanceInfo> {
    http_service::list_instances(state.inner())
}

// ============ Tray Commands ============

#[tauri::command]
pub fn update_tray_language(app: AppHandle, lang: String) {
    crate::tray::update_tray_language(&app, &lang);
}

// ============ P2P LAN Transfer Commands ============

#[tauri::command]
pub fn p2p_get_identity(state: tauri::State<'_, P2PStateArc>) -> p2p::identity::Identity {
    state.get_identity()
}

#[tauri::command]
pub fn p2p_set_alias(state: tauri::State<'_, P2PStateArc>, alias: String) {
    state.set_alias(alias);
}

#[tauri::command]
pub fn p2p_get_peers(state: tauri::State<'_, P2PStateArc>) -> Vec<PeerInfo> {
    state.get_peers()
}

#[tauri::command]
pub fn p2p_start_service(app: AppHandle, state: tauri::State<'_, P2PStateArc>) -> Result<u16, String> {
    let state_inner = state.inner().clone();
    // Stop any existing service first
    stop_service_inner(&state_inner);
    // Start TCP server
    let (port, stop_flag) = p2p::server::start_server(state_inner.clone(), app.clone())?;
    *state_inner.tcp_port.lock().unwrap() = port;
    *state_inner.server_stop.lock().unwrap() = Some(stop_flag);
    // Start mDNS discovery
    let daemon = p2p::discovery::start_discovery(app, state_inner.clone())?;
    *state_inner.mdns_daemon.lock().unwrap() = Some(daemon);
    Ok(port)
}

fn stop_service_inner(state: &p2p::P2PState) {
    // Stop TCP server
    if let Some(flag) = state.server_stop.lock().unwrap().take() {
        flag.store(true, std::sync::atomic::Ordering::Relaxed);
    }
    // Stop mDNS
    if let Some(daemon) = state.mdns_daemon.lock().unwrap().take() {
        p2p::discovery::stop_discovery(&daemon);
    }
    // Clear peers
    {
        let mut peers = state.peers.lock().unwrap();
        peers.clear();
    }
    *state.tcp_port.lock().unwrap() = 0;
}

#[tauri::command]
pub fn p2p_stop_service(state: tauri::State<'_, P2PStateArc>) {
    stop_service_inner(state.inner());
}

/// Returns the current TCP port if P2P service is running, 0 otherwise
#[tauri::command]
pub fn p2p_get_running_port(state: tauri::State<'_, P2PStateArc>) -> u16 {
    *state.inner().tcp_port.lock().unwrap()
}

#[tauri::command]
pub fn p2p_send_file(
    app: AppHandle,
    state: tauri::State<'_, P2PStateArc>,
    peer_code: String,
    file_path: String,
) -> Result<String, String> {
    let state = state.inner().clone();
    let peer = state.get_peers().into_iter()
        .find(|p| p.code == peer_code)
        .ok_or("Peer not found")?;
    p2p::client::send_file(&peer, std::path::Path::new(&file_path), &state, &app)
}

#[tauri::command]
pub fn p2p_request_dir(
    state: tauri::State<'_, P2PStateArc>,
    peer_code: String,
) -> Result<Vec<p2p::protocol::DirListingFile>, String> {
    let state = state.inner().clone();
    let peer = state.get_peers().into_iter()
        .find(|p| p.code == peer_code)
        .ok_or("Peer not found")?;
    p2p::client::request_dir(&peer, &state)
}

#[tauri::command]
pub fn p2p_download_file(
    app: AppHandle,
    state: tauri::State<'_, P2PStateArc>,
    peer_code: String,
    remote_path: String,
    local_dir: String,
) -> Result<String, String> {
    let state = state.inner().clone();
    let peer = state.get_peers().into_iter()
        .find(|p| p.code == peer_code)
        .ok_or("Peer not found")?;
    p2p::client::download_dir_file(&peer, &remote_path, std::path::Path::new(&local_dir), &state, &app)
}

#[tauri::command]
pub fn p2p_set_shared_dir(state: tauri::State<'_, P2PStateArc>, dir: String, enabled: bool) {
    let state = state.inner();
    if !dir.is_empty() {
        state.set_shared_dir(PathBuf::from(dir));
    }
    state.set_shared_enabled(enabled);
}

#[tauri::command]
pub fn p2p_get_shared_info(state: tauri::State<'_, P2PStateArc>) -> serde_json::Value {
    let dir = state.get_shared_dir();
    let enabled = state.is_shared_enabled();
    let files = if enabled {
        if let Some(ref d) = dir {
            std::fs::read_dir(d)
                .map(|entries| {
                    entries.flatten().map(|e| {
                        let meta = e.metadata().ok();
                        serde_json::json!({
                            "name": e.file_name().to_string_lossy(),
                            "size": meta.as_ref().map(|m| m.len()).unwrap_or(0),
                            "isDir": meta.as_ref().map(|m| m.is_dir()).unwrap_or(false),
                        })
                    }).collect::<Vec<_>>()
                })
                .unwrap_or_default()
        } else { vec![] }
    } else { vec![] };

    serde_json::json!({
        "directory": dir.map(|d| d.to_string_lossy().to_string()).unwrap_or_default(),
        "enabled": enabled,
        "files": files,
        "accessLog": state.get_access_log(),
    })
}

#[tauri::command]
pub fn p2p_get_transfers(state: tauri::State<'_, P2PStateArc>) -> Vec<p2p::TransferInfo> {
    state.get_transfers()
}

#[tauri::command]
pub fn p2p_validate_dir(dir: String) -> bool {
    if dir.is_empty() { return false; }
    let path = std::path::Path::new(&dir);
    path.exists() && path.is_dir()
}

#[tauri::command]
pub fn p2p_get_local_ips() -> Vec<String> {
    let mut ips = Vec::new();
    if let Ok(addrs) = local_ip_address::list_afinet_netifas() {
        for (_name, ip) in addrs {
            if let std::net::IpAddr::V4(addr) = ip {
                if !addr.is_loopback() {
                    ips.push(addr.to_string());
                }
            }
        }
    }
    if ips.is_empty() {
        ips.push("127.0.0.1".to_string());
    }
    ips
}

#[tauri::command]
pub fn p2p_manual_connect(
    state: tauri::State<'_, P2PStateArc>,
    addr: String,
) -> Result<p2p::PeerInfo, String> {
    // Parse "IP:port" format
    let parts: Vec<&str> = addr.rsplitn(2, ':').collect();
    if parts.len() != 2 {
        return Err("Invalid format. Use IP:Port".to_string());
    }
    let ip = parts[1].trim().to_string();
    let port: u16 = parts[0].trim().parse().map_err(|_| "Invalid port number".to_string())?;

    // Try to connect and get identity via Hello
    use std::io::{BufReader, BufWriter, Read, Write};
    use std::net::TcpStream;
    let stream = TcpStream::connect_timeout(
        &format!("{}:{}", ip, port).parse().map_err(|e| format!("Parse addr: {}", e))?,
        std::time::Duration::from_secs(10),
    ).map_err(|e| format!("Connect error: {}", e))?;
    stream.set_read_timeout(Some(std::time::Duration::from_secs(10))).ok();

    let mut reader = BufReader::new(stream.try_clone().map_err(|e| e.to_string())?);
    let mut writer = BufWriter::new(stream);

    // Send Hello
    let identity = state.get_identity();
    let hello = p2p::protocol::HelloMsg {
        code: identity.code.clone(),
        alias: identity.alias.clone(),
        version: p2p::protocol::PROTOCOL_VERSION,
    };
    p2p::protocol::write_json(&mut writer, p2p::protocol::MsgType::Hello as u8, &hello)
        .map_err(|e| format!("Hello send: {}", e))?;

    // Receive peer Hello
    let (_, peer_hello): (u8, p2p::protocol::HelloMsg) = p2p::protocol::read_json(&mut reader)
        .map_err(|e| format!("Hello recv: {}", e))?;

    // Block self-connection
    if peer_hello.code == identity.code {
        return Err("Cannot connect to your own device".to_string());
    }

    let peer = p2p::PeerInfo {
        code: peer_hello.code.clone(),
        alias: peer_hello.alias.clone(),
        ip: ip.clone(),
        port,
    };
    state.add_peer(peer.clone());
    Ok(peer)
}

#[tauri::command]
pub fn p2p_retry_transfer(
    app: AppHandle,
    state: tauri::State<'_, P2PStateArc>,
    transfer_id: String,
) -> Result<String, String> {
    let state_inner = state.inner().clone();
    // Find the failed transfer
    let transfer = {
        let transfers = state_inner.transfers.lock().unwrap();
        transfers.iter().find(|t| t.id == transfer_id && t.direction == "send").cloned()
    }.ok_or("Transfer not found")?;

    // Update status back to pending
    state_inner.update_transfer_progress(&transfer_id, 0.0, "pending");

    // Find the peer
    let peer = state_inner.get_peers().into_iter()
        .find(|p| p.code == transfer.peer_code)
        .ok_or("Peer not found")?;

    // Re-send the file
    let file_path = transfer.file_path;
    if file_path.is_empty() {
        return Err("No file path stored for this transfer".to_string());
    }
    p2p::client::send_file(&peer, std::path::Path::new(&file_path), &state_inner, &app)
}

// ---- Approval / Cancel / Download Dir ----

#[tauri::command]
pub fn p2p_accept_transfer(
    state: tauri::State<'_, P2PStateArc>,
    transfer_id: String,
) -> bool {
    state.inner().take_approval(&transfer_id)
        .map(|tx| tx.send(true).is_ok())
        .unwrap_or(false)
}

#[tauri::command]
pub fn p2p_reject_transfer(
    state: tauri::State<'_, P2PStateArc>,
    transfer_id: String,
) -> bool {
    state.inner().take_approval(&transfer_id)
        .map(|tx| tx.send(false).is_ok())
        .unwrap_or(false)
}

#[tauri::command]
pub fn p2p_cancel_transfer(
    state: tauri::State<'_, P2PStateArc>,
    transfer_id: String,
) -> bool {
    state.inner().cancel_transfer(&transfer_id)
}

#[tauri::command]
pub fn p2p_set_download_dir(
    state: tauri::State<'_, P2PStateArc>,
    dir: String,
) {
    state.inner().set_download_dir(std::path::PathBuf::from(dir));
}

#[tauri::command]
pub fn p2p_get_download_dir(
    state: tauri::State<'_, P2PStateArc>,
) -> String {
    state.inner().get_download_dir().to_string_lossy().to_string()
}

// ============ Cache Management Commands ============

/// Returns cache sizes in bytes for each cache category
#[tauri::command]
pub fn get_cache_sizes(state: tauri::State<'_, P2PStateArc>) -> serde_json::Value {
    // P2P downloads
    let dl_dir = state.inner().get_download_dir();
    let (p2p_downloads, p2p_file_count) = dir_size_and_count(&dl_dir);

    // Screenshots: ~/Pictures/A7Box/Screenshots
    let ss_dir = dirs::picture_dir()
        .map(|p| p.join("A7Box").join("Screenshots"));
    let (screenshots, ss_file_count) = ss_dir.as_ref()
        .map(|p| dir_size_and_count(p))
        .unwrap_or((0, 0));

    // P2P transfers history count
    let transfer_count = state.inner().transfers.lock().unwrap().len();

    serde_json::json!({
        "p2pDownloads": p2p_downloads,
        "p2pDownloadsPath": dl_dir.to_string_lossy(),
        "p2pFileCount": p2p_file_count,
        "screenshots": screenshots,
        "screenshotsPath": ss_dir
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
        "screenshotFileCount": ss_file_count,
        "transferCount": transfer_count,
    })
}

/// Clear a specific cache category. `category` is one of:
/// - "p2pDownloads": delete files in the download directory
/// - "screenshots": delete files in the screenshots directory
/// - "transferHistory": clear in-memory transfer records
#[tauri::command]
pub fn clear_cache(
    state: tauri::State<'_, P2PStateArc>,
    category: String,
) -> Result<bool, String> {
    match category.as_str() {
        "p2pDownloads" => {
            let dl_dir = state.inner().get_download_dir();
            clear_dir_contents(&dl_dir)?;
            Ok(true)
        }
        "screenshots" => {
            let ss_dir = dirs::picture_dir()
                .map(|p| p.join("A7Box").join("Screenshots"))
                .unwrap_or_else(|| PathBuf::from("."));
            clear_dir_contents(&ss_dir)?;
            Ok(true)
        }
        "transferHistory" => {
            state.inner().transfers.lock().unwrap().clear();
            Ok(true)
        }
        _ => Err(format!("Unknown cache category: {}", category)),
    }
}

// ---- Helpers ----

fn dir_size_and_count(path: &std::path::Path) -> (u64, u32) {
    if !path.exists() { return (0, 0); }
    walkdir_count(path).unwrap_or((0, 0))
}

fn walkdir_count(path: &std::path::Path) -> std::io::Result<(u64, u32)> {
    let mut total = 0u64;
    let mut count = 0u32;
    if path.is_file() {
        return Ok((path.metadata()?.len(), 1));
    }
    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        let meta = entry.metadata()?;
        if meta.is_dir() {
            let (s, c) = walkdir_count(&entry.path())?;
            total += s;
            count += c;
        } else {
            total += meta.len();
            count += 1;
        }
    }
    Ok((total, count))
}

fn dir_size(path: &std::path::Path) -> u64 {
    dir_size_and_count(path).0
}

fn clear_dir_contents(path: &std::path::Path) -> Result<(), String> {
    if !path.exists() { return Ok(()); }
    let entries = std::fs::read_dir(path).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let p = entry.path();
        if p.is_dir() {
            std::fs::remove_dir_all(&p).map_err(|e| format!("{}: {}", p.display(), e))?;
        } else {
            std::fs::remove_file(&p).map_err(|e| format!("{}: {}", p.display(), e))?;
        }
    }
    Ok(())
}

// ============ Shortcut Management Commands ============

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortcutConfig {
    pub action: String,
    pub keys: String,
    pub enabled: bool,
}

#[tauri::command]
pub fn update_shortcut(app: AppHandle, action: String, keys: String, enabled: bool) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
    use tauri::Emitter;

    let state = app.state::<crate::ShortcutRegistry>();
    let mut registry = state.0.lock().map_err(|e| e.to_string())?;

    // Unregister old shortcut if exists
    if let Some(old_keys) = registry.get(&action) {
        let _ = app.global_shortcut().unregister(old_keys.as_str());
    }

    // Register new shortcut if enabled
    if enabled && !keys.is_empty() {
        let action_clone = action.clone();
        let app_handle = app.clone();
        app.global_shortcut()
            .on_shortcut(keys.as_str(), move |app_ref, _shortcut, event| {
                if event.state != ShortcutState::Pressed { return; }
                // Handle actions directly in Rust
                match action_clone.as_str() {
                    "toggle-command-palette" | "open-screenshot" => {
                        if let Some(w) = app_ref.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.unminimize();
                            let _ = w.set_focus();
                        }
                    }
                    "clipboard-to-qr" => {
                        use tauri::{WebviewUrl, WebviewWindowBuilder};
                        let label = "qr-quick";
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
                    _ => {}
                }
                // Also emit to frontend
                let _ = app_handle.emit("global-shortcut", &action_clone);
            })
            .map_err(|e| format!("Failed to register shortcut: {}", e))?;
        registry.insert(action.clone(), keys);
    } else {
        registry.remove(&action);
    }

    Ok(())
}

// ============ Utility Window Commands ============

#[tauri::command]
pub fn create_utility_window(
    app: AppHandle,
    label: String,
    url: String,
    width: f64,
    height: f64,
) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    // Close existing window with same label if any
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.close();
    }

    let builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title("")
        .inner_size(width, height)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .visible(true)
        .skip_taskbar(true)
        .center()
        .background_color(tauri::window::Color(10, 10, 11, 255));

    let _window = builder.build().map_err(|e| format!("Failed to create window: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn close_utility_window(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|e| format!("Failed to close window: {}", e))?;
    }
    Ok(())
}
