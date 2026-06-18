// A7Box IPC Commands
// Tauri commands exposed to frontend via invoke()

use crate::clipboard::{self, ClipboardState};
use crate::http_server::{self, HttpServerState};
use crate::p2p::{self, PeerInfo, P2PStateArc};
use crate::screenshot;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::AppHandle;

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
