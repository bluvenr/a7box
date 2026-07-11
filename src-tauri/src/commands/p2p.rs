// A7Box P2P LAN Transfer Commands

use crate::p2p::{self, PeerInfo, P2PStateArc};
use std::path::PathBuf;
use tauri::AppHandle;

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
    stop_service_inner(&state_inner);
    let (port, stop_flag) = p2p::server::start_server(state_inner.clone(), app.clone())?;
    *state_inner.tcp_port.lock().unwrap() = port;
    *state_inner.server_stop.lock().unwrap() = Some(stop_flag);
    let daemon = p2p::discovery::start_discovery(app, state_inner.clone())?;
    *state_inner.mdns_daemon.lock().unwrap() = Some(daemon);
    Ok(port)
}

fn stop_service_inner(state: &p2p::P2PState) {
    if let Some(flag) = state.server_stop.lock().unwrap().take() {
        flag.store(true, std::sync::atomic::Ordering::Relaxed);
    }
    if let Some(daemon) = state.mdns_daemon.lock().unwrap().take() {
        p2p::discovery::stop_discovery(&daemon);
    }
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
    let parts: Vec<&str> = addr.rsplitn(2, ':').collect();
    if parts.len() != 2 {
        return Err("Invalid format. Use IP:Port".to_string());
    }
    let ip = parts[1].trim().to_string();
    let port: u16 = parts[0].trim().parse().map_err(|_| "Invalid port number".to_string())?;

    use std::io::{BufReader, BufWriter};
    use std::net::TcpStream;
    let stream = TcpStream::connect_timeout(
        &format!("{}:{}", ip, port).parse().map_err(|e| format!("Parse addr: {}", e))?,
        std::time::Duration::from_secs(10),
    ).map_err(|e| format!("Connect error: {}", e))?;
    stream.set_read_timeout(Some(std::time::Duration::from_secs(10))).ok();

    let mut reader = BufReader::new(stream.try_clone().map_err(|e| e.to_string())?);
    let mut writer = BufWriter::new(stream);

    let identity = state.get_identity();
    let hello = p2p::protocol::HelloMsg {
        code: identity.code.clone(),
        alias: identity.alias.clone(),
        version: p2p::protocol::PROTOCOL_VERSION,
    };
    p2p::protocol::write_json(&mut writer, p2p::protocol::MsgType::Hello as u8, &hello)
        .map_err(|e| format!("Hello send: {}", e))?;

    let (_, peer_hello): (u8, p2p::protocol::HelloMsg) = p2p::protocol::read_json(&mut reader)
        .map_err(|e| format!("Hello recv: {}", e))?;

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
    let transfer = {
        let transfers = state_inner.transfers.lock().unwrap();
        transfers.iter().find(|t| t.id == transfer_id && t.direction == "send").cloned()
    }.ok_or("Transfer not found")?;

    state_inner.update_transfer_progress(&transfer_id, 0.0, "pending");

    let peer = state_inner.get_peers().into_iter()
        .find(|p| p.code == transfer.peer_code)
        .ok_or("Peer not found")?;

    let file_path = transfer.file_path;
    if file_path.is_empty() {
        return Err("No file path stored for this transfer".to_string());
    }
    p2p::client::send_file(&peer, std::path::Path::new(&file_path), &state_inner, &app)
}

// ── Approval / Cancel / Download Dir ─────────────────────────────────────────

#[tauri::command]
pub fn p2p_accept_transfer(state: tauri::State<'_, P2PStateArc>, transfer_id: String) -> bool {
    state.inner().take_approval(&transfer_id)
        .map(|tx| tx.send(true).is_ok())
        .unwrap_or(false)
}

#[tauri::command]
pub fn p2p_reject_transfer(state: tauri::State<'_, P2PStateArc>, transfer_id: String) -> bool {
    state.inner().take_approval(&transfer_id)
        .map(|tx| tx.send(false).is_ok())
        .unwrap_or(false)
}

#[tauri::command]
pub fn p2p_cancel_transfer(state: tauri::State<'_, P2PStateArc>, transfer_id: String) -> bool {
    state.inner().cancel_transfer(&transfer_id)
}

#[tauri::command]
pub fn p2p_set_download_dir(state: tauri::State<'_, P2PStateArc>, dir: String) {
    state.inner().set_download_dir(PathBuf::from(dir));
}

#[tauri::command]
pub fn p2p_get_download_dir(state: tauri::State<'_, P2PStateArc>) -> String {
    state.inner().get_download_dir().to_string_lossy().to_string()
}
