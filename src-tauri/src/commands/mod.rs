// A7Box IPC Commands
// Tauri commands exposed to frontend via invoke()

use crate::clipboard::{self, ClipboardState};
use crate::http_server::{self, HttpServerState};
use crate::http_service::{self, HttpServiceState};
use crate::p2p::{self, PeerInfo, P2PStateArc};
use crate::screenshot;
use std::path::PathBuf;
use tauri::Emitter;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::AppHandle;
use tauri::Manager;

// Tracks whether the current pick session was started from within the app (page mode)
// vs from global shortcut (global mode). Affects ESC/cancel behavior.
pub static PICK_FROM_PAGE: AtomicBool = AtomicBool::new(false);
/// Tracks whether the current screenshot capture flow was initiated from the page
pub static CAPTURE_FROM_PAGE: AtomicBool = AtomicBool::new(false);
/// Stores the last color picked from the screen overlay (for late-joining windows)
pub static LAST_PICKED_COLOR: Mutex<String> = Mutex::new(String::new());
/// Stores the pick source for the current session ("global", "float", "page").
/// Re-emitted on "picker-ready" so the overlay receives it after loading.
pub static PICK_SOURCE: Mutex<String> = Mutex::new(String::new());

/// Temp directory for session screenshots
fn temp_screenshot_dir() -> std::path::PathBuf {
    let dir = std::env::temp_dir().join("a7box_screenshots");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// Clean up temp screenshot directory (called on app exit)
pub fn cleanup_temp_screenshots() {
    let dir = temp_screenshot_dir();
    if dir.exists() {
        let _ = std::fs::remove_dir_all(&dir);
    }
}

/// Screenshot capture metadata
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionCapture {
    pub temp_path: String,
    pub width: u32,
    pub height: u32,
}

/// Stores base64 image data for pin preview windows to fetch on mount.
/// Uses a queue (Vec) to support multiple concurrent pin windows.
pub static PENDING_PIN_DATA: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// Counter for unique capture-preview window labels
pub static PIN_WINDOW_COUNTER: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

/// Pop the next pending pin data (FIFO)
#[tauri::command]
pub fn get_pending_pin_data() -> Option<String> {
    let mut queue = PENDING_PIN_DATA.lock().unwrap();
    if queue.is_empty() { None } else { Some(queue.remove(0)) }
}

/// Get the last color picked from the screen overlay.
#[tauri::command]
pub fn get_last_picked_color() -> String {
    LAST_PICKED_COLOR.lock().unwrap().clone()
}

/// Get the current pick source ("global", "float", "page").
/// Called by LivePicker on mount to reliably determine the entry point.
#[tauri::command]
pub fn get_pick_source() -> String {
    PICK_SOURCE.lock()
        .map(|s| if s.is_empty() { "global".to_string() } else { s.clone() })
        .unwrap_or_else(|_| "global".to_string())
}

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

#[tauri::command]
pub fn set_clipboard_text(text: String) -> Result<(), String> {
    arboard::Clipboard::new()
        .map_err(|e| e.to_string())?
        .set_text(text)
        .map_err(|e| e.to_string())
}

/// Returns clipboard image as { base64, width, height } or error if no image
#[tauri::command]
pub fn get_clipboard_image() -> Result<serde_json::Value, String> {
    use arboard::ImageData;
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    let img: ImageData = clipboard.get_image().map_err(|e| e.to_string())?;
    if img.width == 0 || img.height == 0 {
        return Err("No image in clipboard".into());
    }
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &img.bytes);
    Ok(serde_json::json!({
        "base64": b64,
        "width": img.width,
        "height": img.height,
    }))
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

#[tauri::command]
pub fn scan_screenshot_history(limit: Option<usize>) -> Result<Vec<screenshot::CaptureResult>, String> {
    screenshot::scan_screenshot_history(limit.unwrap_or(50))
}

#[tauri::command]
pub fn set_capture_from_page(value: bool) {
    CAPTURE_FROM_PAGE.store(value, Ordering::SeqCst);
}

#[tauri::command]
pub fn detect_window_at_cursor() -> Result<Option<screenshot::WindowBounds>, String> {
    screenshot::detect_window_at_cursor()
}

/// Get all captures by scanning the temp screenshot directory
#[tauri::command]
pub fn get_session_captures() -> Vec<SessionCapture> {
    let dir = temp_screenshot_dir();
    if !dir.exists() {
        return Vec::new();
    }
    let mut entries: Vec<(std::time::SystemTime, std::path::PathBuf)> = match std::fs::read_dir(&dir) {
        Ok(rd) => rd.filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map(|ext| ext == "png").unwrap_or(false))
            .filter_map(|e| e.metadata().ok().and_then(|m| m.modified().ok().map(|t| (t, e.path()))))
            .collect(),
        Err(_) => return Vec::new(),
    };
    // Sort by modification time, newest first
    entries.sort_by(|a, b| b.0.cmp(&a.0));
    entries.into_iter().map(|(_, path)| {
        // Read PNG dimensions from header (only first 24 bytes)
        let (w, h) = {
            use std::io::Read;
            let mut buf = [0u8; 24];
            std::fs::File::open(&path).ok()
                .and_then(|mut f| f.read_exact(&mut buf).ok().map(|_| buf))
                .and_then(|data| {
                    if &data[1..4] == b"PNG" {
                        let w = u32::from_be_bytes([data[16], data[17], data[18], data[19]]);
                        let h = u32::from_be_bytes([data[20], data[21], data[22], data[23]]);
                        Some((w, h))
                    } else { None }
                })
                .unwrap_or((0, 0))
        };
        SessionCapture {
            temp_path: path.to_string_lossy().to_string(),
            width: w,
            height: h,
        }
    }).collect()
}

/// Clear all temp screenshot files
#[tauri::command]
pub fn clear_session_captures() -> bool {
    cleanup_temp_screenshots();
    true
}

/// Read a temp screenshot file, resize to thumbnail, and return as base64 data URL.
#[tauri::command]
pub fn read_capture_thumbnail(path: String) -> Result<String, String> {
    use screenshots::image::imageops::FilterType;
    let img = screenshots::image::open(&path)
        .map_err(|e| format!("Failed to open image: {}", e))?;
    let (w, h) = (img.width(), img.height());
    let (tw, th) = if w > 320 {
        (320u32, (h as u64 * 320 / w as u64).max(1) as u32)
    } else {
        (w, h.max(1))
    };
    let thumb = img.resize_exact(tw, th, FilterType::Triangle);
    let mut cursor = std::io::Cursor::new(Vec::new());
    thumb.write_to(&mut cursor, screenshots::image::ImageFormat::Png)
        .map_err(|e| format!("Failed to encode thumbnail: {}", e))?;
    let buf = cursor.into_inner();
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &buf);
    Ok(format!("data:image/png;base64,{}", b64))
}

/// Read a temp screenshot file and return as full-size base64 data URL
#[tauri::command]
pub fn read_capture_file(path: String) -> Result<String, String> {
    let data = std::fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data);
    Ok(format!("data:image/png;base64,{}", b64))
}

/// Save a capture to disk via system save dialog (sync version for Rust-side use)
pub fn save_capture_dialog_sync(app: &AppHandle, base64: String) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;

    let b64_data = if base64.starts_with("data:") {
        base64.split(',').nth(1).unwrap_or(&base64)
    } else {
        &base64
    };

    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, b64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("A7Box_Screenshot_{}.png", timestamp);

    let file_path = app.dialog()
        .file()
        .set_file_name(&filename)
        .add_filter("PNG Image", &["png"])
        .blocking_save_file();

    let Some(path) = file_path else {
        return Ok(false);
    };

    let path_buf = path.into_path().map_err(|e| format!("Invalid path: {}", e))?;
    std::fs::write(&path_buf, &bytes).map_err(|e| format!("Failed to save file: {}", e))?;
    Ok(true)
}

/// Save a capture to disk via system save dialog (async, for frontend invoke)
#[tauri::command]
pub async fn save_capture_dialog(app: AppHandle, base64: String) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;

    // Strip data URL prefix if present
    let b64_data = if base64.starts_with("data:") {
        base64.split(',').nth(1).unwrap_or(&base64)
    } else {
        &base64
    };

    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, b64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("A7Box_Screenshot_{}.png", timestamp);

    // Show save dialog
    let file_path = app.dialog()
        .file()
        .set_file_name(&filename)
        .add_filter("PNG Image", &["png"])
        .blocking_save_file();

    let Some(path) = file_path else {
        return Ok(false); // User cancelled
    };

    let path_buf = path.into_path().map_err(|e| format!("Invalid path: {}", e))?;
    std::fs::write(&path_buf, &bytes).map_err(|e| format!("Failed to save file: {}", e))?;
    Ok(true)
}

/// Delete a single temp screenshot file
#[tauri::command]
pub fn delete_capture_file(path: String) -> Result<bool, String> {
    if std::path::Path::new(&path).exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Failed to delete: {}", e))?;
    }
    Ok(true)
}

/// Save a temp screenshot to a user-chosen directory via system save dialog
#[tauri::command]
pub async fn save_capture_from_temp(app: AppHandle, path: String) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;

    let bytes = std::fs::read(&path)
        .map_err(|e| format!("Failed to read temp file: {}", e))?;

    let filename = std::path::Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "screenshot.png".to_string());

    let file_path = app.dialog()
        .file()
        .set_file_name(&filename)
        .add_filter("PNG Image", &["png"])
        .blocking_save_file();

    let Some(save_path) = file_path else {
        return Ok(false);
    };

    let path_buf = save_path.into_path().map_err(|e| format!("Invalid path: {}", e))?;
    std::fs::write(&path_buf, &bytes).map_err(|e| format!("Failed to save: {}", e))?;
    Ok(true)
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
pub fn update_tray_language(app: AppHandle, lang: String, app_lang: tauri::State<'_, crate::AppLanguage>) {
    // Update shared language state so utility windows can read it
    if let Ok(mut g) = app_lang.0.lock() {
        *g = lang.clone();
    }
    crate::tray::update_tray_language(&app, &lang);
}

/// Sync app language from frontend (called on app startup to restore user preference)
#[tauri::command]
pub fn sync_app_language(lang: String, app_lang: tauri::State<'_, crate::AppLanguage>) {
    if let Ok(mut g) = app_lang.0.lock() {
        *g = lang;
    }
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
    use std::io::{BufReader, BufWriter};
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
                    "toggle-command-palette" => {
                        // Create standalone Spotlight-style palette window
                        use tauri::{WebviewUrl, WebviewWindowBuilder};
                        let label = "utility-palette";
                        if let Some(existing) = app_ref.get_webview_window(label) {
                            let _ = existing.close();
                        } else {
                            // transparent() is not available on macOS without macos-private-api feature
                            #[cfg(not(target_os = "macos"))]
                            let builder = WebviewWindowBuilder::new(app_ref, label, WebviewUrl::App("/utility/palette".into()))
                                .title("A7Box")
                                .inner_size(520.0, 420.0)
                                .resizable(false)
                                .decorations(false)
                                .always_on_top(true)
                                .visible(false) // hidden until React emits util-window-ready
                                .skip_taskbar(true)
                                .center()
                                .background_color(tauri::window::Color(0, 0, 0, 0))
                                .transparent(true)
                                .initialization_script(crate::lang_init_script(app_ref));
                            #[cfg(target_os = "macos")]
                            let builder = WebviewWindowBuilder::new(app_ref, label, WebviewUrl::App("/utility/palette".into()))
                                .title("A7Box")
                                .inner_size(520.0, 420.0)
                                .resizable(false)
                                .decorations(false)
                                .always_on_top(true)
                                .visible(false) // hidden until React emits util-window-ready
                                .skip_taskbar(true)
                                .center()
                                .background_color(tauri::window::Color(0, 0, 0, 0))
                                .initialization_script(crate::lang_init_script(app_ref));
                            if let Ok(_win) = builder.build()
                            {
                                // Window shown by util-window-ready listener
                            }
                        }
                    }
                    "open-screenshot" => {
                        // Global shortcut: trigger capture flow directly (no page navigation)
                        if let Some(w) = app_ref.get_webview_window("main") {
                            let _ = w.hide();
                        }
                        crate::commands::CAPTURE_FROM_PAGE.store(false, Ordering::SeqCst);
                        let _ = app_ref.emit("start-capture-flow", "");
                    }
                    "toggle-window" => {
                        if let Some(w) = app_ref.get_webview_window("main") {
                            let is_vis = w.is_visible().unwrap_or(false);
                            let is_min = w.is_minimized().unwrap_or(false);
                            if is_vis && !is_min {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                                let _ = w.unminimize();
                                let _ = w.set_focus();
                            }
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
                        // Hide main window so the picker can see the screen
                        if let Some(main_win) = app_ref.get_webview_window("main") {
                            let _ = main_win.hide();
                        }
                        // Also hide ColorQuick if it's open
                        if let Some(cq) = app_ref.get_webview_window("color-quick") {
                            let _ = cq.hide();
                        }
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
        .visible(false) // hidden until React emits util-window-ready
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

// ============ Color Picker Commands ============

/// Start live screen color picking: create a full-screen transparent overlay
/// that covers all monitors. The overlay captures all mouse/keyboard input
/// and shows a crosshair cursor. A floating card displays real-time pixel color.
/// Start the full-screen transparent color picker overlay.
/// `page_mode`: if Some, forces PICK_FROM_PAGE to the given value (for event-driven entries).
///              if None, auto-detects from main window visibility (for direct calls like global shortcut).
#[tauri::command]
pub fn start_screen_pick(app: AppHandle, page_mode: Option<bool>) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    // Close existing overlay if any
    if let Some(existing) = app.get_webview_window("pick-overlay") {
        let _ = existing.close();
    }

    // Calculate virtual screen bounds covering ALL monitors
    let screens = screenshots::Screen::all().unwrap_or_default();
    let (vx, vy, vw, vh) = if screens.is_empty() {
        (0, 0, 1920u32, 1080u32)
    } else {
        let mut min_x = i32::MAX;
        let mut min_y = i32::MAX;
        let mut max_x = i32::MIN;
        let mut max_y = i32::MIN;
        for s in &screens {
            let di = &s.display_info;
            min_x = min_x.min(di.x);
            min_y = min_y.min(di.y);
            max_x = max_x.max(di.x + di.width as i32);
            max_y = max_y.max(di.y + di.height as i32);
        }
        (min_x, min_y, (max_x - min_x) as u32, (max_y - min_y) as u32)
    };

    // Check if main window was visible when pick started (page mode vs global mode)
    let main_was_visible = app.get_webview_window("main")
        .map(|w| w.is_visible().unwrap_or(false))
        .unwrap_or(false);

    // Build full-screen transparent overlay covering all monitors
    // transparent() requires macos-private-api feature on macOS; rely on background_color alpha on macOS
    #[cfg(not(target_os = "macos"))]
    let builder = WebviewWindowBuilder::new(
        &app,
        "pick-overlay",
        WebviewUrl::App("/utility/live-picker".into()),
    )
    .title("")
    .inner_size(vw as f64, vh as f64)
    .position(vx as f64, vy as f64)
    .resizable(false)
    .decorations(false)
    .shadow(false) // Disable window shadow to prevent visible edge flicker
    .always_on_top(true)
    .visible(false) // Start hidden to avoid black flash
    .skip_taskbar(true)
    .initialization_script(crate::lang_init_script(&app))
    .background_color(tauri::window::Color(0, 0, 0, 0))
    .transparent(true);
    #[cfg(target_os = "macos")]
    let builder = WebviewWindowBuilder::new(
        &app,
        "pick-overlay",
        WebviewUrl::App("/utility/live-picker".into()),
    )
    .title("")
    .inner_size(vw as f64, vh as f64)
    .position(vx as f64, vy as f64)
    .resizable(false)
    .decorations(false)
    .shadow(false) // Disable window shadow to prevent visible edge flicker
    .always_on_top(true)
    .visible(false) // Start hidden to avoid black flash
    .skip_taskbar(true)
    .initialization_script(crate::lang_init_script(&app))
    .background_color(tauri::window::Color(0, 0, 0, 0));
    let _overlay = builder.build()
    .map_err(|e| format!("Failed to create overlay: {}", e))?;

    // Disable Windows show/hide animation via Win32 API (prevents zoom-in/out edge effect)
    #[cfg(target_os = "windows")]
    {
        if let Some(hwnd) = _overlay.hwnd().ok().map(|h| h.0) {
            #[link(name = "user32")]
            extern "system" {
                fn GetWindowLongPtrW(hwnd: *mut std::ffi::c_void, index: i32) -> isize;
                fn SetWindowLongPtrW(hwnd: *mut std::ffi::c_void, index: i32, new: isize) -> isize;
            }
            const GWL_STYLE: i32 = -16;
            const WS_BORDER: isize = 0x00800000;
            const WS_DLGFRAME: isize = 0x00400000;
            unsafe {
                let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
                SetWindowLongPtrW(hwnd, GWL_STYLE, style & !(WS_BORDER | WS_DLGFRAME));
            }
        }
    }

    // Overlay stays hidden until frontend emits "picker-ready" (CSS applied)
    // This prevents the black flash entirely

    // Store pick mode: use explicit value if provided, otherwise auto-detect
    PICK_FROM_PAGE.store(page_mode.unwrap_or(main_was_visible), Ordering::SeqCst);

    // Spawn polling thread: polls pixel color + cursor position + magnifier region
    let app_clone = app.clone();
    std::thread::spawn(move || {
        let mut last_color = String::new();
        let mut last_x = -1i32;
        let mut last_y = -1i32;
        const MAG_SIZE: i32 = 15; // magnifier capture region: 15x15 pixels (larger pixels = easier targeting)

        loop {
            if app_clone.get_webview_window("pick-overlay").is_none() {
                break;
            }

            if let Ok((x, y)) = crate::color_picker::get_cursor_pos() {
                // Emit color update
                let color = crate::color_picker::capture_pixel_color(x, y)
                    .unwrap_or_else(|_| last_color.clone());
                if color != last_color {
                    let _ = app_clone.emit("cursor-color", &color);
                    // Store for late-joining windows (e.g. ColorQuick created after pick)
                    if let Ok(mut stored) = LAST_PICKED_COLOR.lock() {
                        *stored = color.clone();
                    }
                    last_color = color;
                }

                // Emit cursor position for card + magnifier tracking
                if x != last_x || y != last_y {
                    let scale = screenshots::Screen::all()
                        .ok()
                        .and_then(|screens| {
                            screens.iter().find(|s| {
                                let di = &s.display_info;
                                x >= di.x && x < di.x + di.width as i32
                                    && y >= di.y && y < di.y + di.height as i32
                            }).map(|s| s.display_info.scale_factor as f64)
                        })
                        .unwrap_or(1.0);

                    let rel_x = ((x - vx) as f64 / scale) as i32;
                    let rel_y = ((y - vy) as f64 / scale) as i32;
                    let _ = app_clone.emit("cursor-position", serde_json::json!({
                        "x": rel_x, "y": rel_y, "color": last_color
                    }));
                    last_x = x;
                    last_y = y;

                    // Capture magnifier region every frame cursor moves (sync with color/position)
                    if let Ok(screens) = screenshots::Screen::all() {
                        let half = MAG_SIZE / 2;
                        // Find the screen containing the cursor
                        if let Some(screen) = screens.iter().find(|s| {
                            let di = &s.display_info;
                            x >= di.x && x < di.x + di.width as i32
                                && y >= di.y && y < di.y + di.height as i32
                        }).or(screens.first()) {
                            let sx = screen.display_info.x;
                            let sy = screen.display_info.y;
                            let sw = screen.display_info.width as i32;
                            let sh = screen.display_info.height as i32;
                            let cx = (x - sx - half).max(0).min(sw - 1);
                            let cy = (y - sy - half).max(0).min(sh - 1);
                            let cw = MAG_SIZE.min(sw - cx);
                            let ch = MAG_SIZE.min(sh - cy);
                            if cw > 0 && ch > 0 {
                                if let Ok(img) = screen.capture_area(cx, cy, cw as u32, ch as u32) {
                                    let pixels: Vec<u8> = img.into_raw();
                                    let _ = app_clone.emit("cursor-region", serde_json::json!({
                                        "data": pixels,
                                        "w": cw, "h": ch,
                                        "offX": (x - sx) - cx,
                                        "offY": (y - sy) - cy,
                                    }));
                                }
                            }
                        }
                    }
                }
            }

            std::thread::sleep(std::time::Duration::from_millis(33));
        }
    });

    Ok(())
}


