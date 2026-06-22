// A7Box P2P TCP Server
// Listens for incoming connections: file receive, dir access

use crate::p2p::protocol::*;
use crate::p2p::{AccessLogEntry, P2PStateArc};
use std::io::{BufReader, BufWriter, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use tauri::Emitter;

/// Start TCP server for incoming P2P connections
pub fn start_server(
    state: P2PStateArc,
    app_handle: tauri::AppHandle,
) -> Result<(u16, Arc<AtomicBool>), String> {
    let listener = TcpListener::bind("0.0.0.0:0")
        .map_err(|e| format!("TCP bind error: {}", e))?;

    let port = listener.local_addr()
        .map_err(|e| format!("Local addr error: {}", e))?.port();

    // Store port
    *state.tcp_port.lock().unwrap() = port;

    let stop_flag = Arc::new(AtomicBool::new(false));
    let stop_clone = stop_flag.clone();

    listener.set_nonblocking(true).ok();

    thread::spawn(move || {
        while !stop_clone.load(Ordering::Relaxed) {
            match listener.accept() {
                Ok((stream, addr)) => {
                    let state = state.clone();
                    let handle = app_handle.clone();
                    thread::spawn(move || {
                        if let Err(e) = handle_connection(stream, &state, &handle) {
                            eprintln!("[P2P] Connection error from {}: {}", addr, e);
                        }
                    });
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(std::time::Duration::from_millis(100));
                    continue;
                }
                Err(e) => {
                    eprintln!("[P2P] Accept error: {}", e);
                    break;
                }
            }
        }
    });

    Ok((port, stop_flag))
}

/// Handle a single incoming connection
fn handle_connection(
    stream: TcpStream,
    state: &P2PStateArc,
    app_handle: &tauri::AppHandle,
) -> Result<(), String> {
    stream.set_read_timeout(Some(std::time::Duration::from_secs(30))).ok();
    stream.set_write_timeout(Some(std::time::Duration::from_secs(30))).ok();

    let mut reader = BufReader::new(stream.try_clone().map_err(|e| e.to_string())?);
    let mut writer = BufWriter::new(stream);

    // Send Hello
    let identity = state.get_identity();
    let hello = HelloMsg {
        code: identity.code.clone(),
        alias: identity.alias.clone(),
        version: PROTOCOL_VERSION,
    };
    write_json(&mut writer, MsgType::Hello as u8, &hello)
        .map_err(|e| format!("Hello send error: {}", e))?;

    // Read peer Hello
    let (msg_type, peer_hello): (u8, HelloMsg) = read_json(&mut reader)
        .map_err(|e| format!("Hello recv error: {}", e))?;

    if msg_type != MsgType::Hello as u8 {
        return Err("Expected Hello message".to_string());
    }
    let peer_code = peer_hello.code.clone();
    let peer_alias = peer_hello.alias.clone();

    // Read next message to determine what peer wants
    let (msg_type, payload) = read_message(&mut reader)
        .map_err(|e| format!("Read error: {}", e))?;

    match MsgType::from_u8(msg_type) {
        Some(MsgType::FileOffer) => {
            let offer: FileOfferMsg = serde_json::from_slice(&payload)
                .map_err(|e| format!("Parse FileOffer: {}", e))?;
            handle_file_receive(&mut reader, &mut writer, offer, &peer_code, &peer_alias, state, app_handle)?;
        }
        Some(MsgType::DirRequest) => {
            handle_dir_request(&mut reader, &mut writer, &peer_code, &peer_alias, state, app_handle)?;
        }
        Some(MsgType::DirDownload) => {
            let req: DirDownloadMsg = serde_json::from_slice(&payload)
                .map_err(|e| format!("Parse DirDownload: {}", e))?;
            handle_dir_download(&mut reader, &mut writer, &req, &peer_code, &peer_alias, state, app_handle)?;
        }
        _ => {
            return Err(format!("Unexpected message type: 0x{:02x}", msg_type));
        }
    }

    Ok(())
}

/// Handle incoming file: emit event to frontend for approval, then receive
fn handle_file_receive(
    reader: &mut BufReader<TcpStream>,
    writer: &mut BufWriter<TcpStream>,
    offer: FileOfferMsg,
    peer_code: &str,
    peer_alias: &str,
    state: &P2PStateArc,
    app_handle: &tauri::AppHandle,
) -> Result<(), String> {
    // Create approval channel
    let (tx, rx) = std::sync::mpsc::channel();
    state.set_pending_approval(&offer.transfer_id, tx);

    // Set up cancel flag for this transfer
    let cancel_flag = Arc::new(AtomicBool::new(false));
    state.set_cancel_flag(&offer.transfer_id, cancel_flag.clone());

    // Emit event to frontend for approval
    let event_payload = serde_json::json!({
        "transfer_id": offer.transfer_id,
        "filename": offer.filename,
        "size": offer.size,
        "peer_code": peer_code,
        "peer_alias": peer_alias,
    });
    let _ = app_handle.emit("p2p-incoming-file", &event_payload);

    // Wait for approval (60s timeout)
    match rx.recv_timeout(std::time::Duration::from_secs(60)) {
        Ok(true) => {
            // User accepted — send Accept message
            let accept = AcceptMsg {
                transfer_id: offer.transfer_id.clone(),
                resume_chunk: None,
            };
            write_json(writer, MsgType::Accept as u8, &accept)
                .map_err(|e| format!("Accept send error: {}", e))?;
        }
        Ok(false) => {
            // User rejected
            let reject = RejectMsg {
                transfer_id: offer.transfer_id.clone(),
                reason: "User rejected".to_string(),
            };
            write_json(writer, MsgType::Reject as u8, &reject).ok();
            let _ = app_handle.emit("p2p-transfer-progress", serde_json::json!({
                "transfer_id": offer.transfer_id,
                "progress": 0.0,
                "status": "rejected",
            }));
            state.remove_cancel_flag(&offer.transfer_id);
            return Ok(());
        }
        Err(_) => {
            // Timeout — auto reject
            let reject = RejectMsg {
                transfer_id: offer.transfer_id.clone(),
                reason: "Approval timeout".to_string(),
            };
            write_json(writer, MsgType::Reject as u8, &reject).ok();
            let _ = app_handle.emit("p2p-transfer-progress", serde_json::json!({
                "transfer_id": offer.transfer_id,
                "progress": 0.0,
                "status": "rejected",
            }));
            state.remove_cancel_flag(&offer.transfer_id);
            return Ok(());
        }
    }

    // Create receive directory
    let download_dir = state.get_download_dir();
    std::fs::create_dir_all(&download_dir).map_err(|e| format!("Mkdir error: {}", e))?;
    let file_path = download_dir.join(&offer.filename);

    // Record incoming transfer
    state.add_transfer(crate::p2p::TransferInfo {
        id: offer.transfer_id.clone(),
        filename: offer.filename.clone(),
        size: offer.size,
        progress: 0.0,
        status: "receiving".to_string(),
        direction: "receive".to_string(),
        peer_code: peer_code.to_string(),
        file_path: file_path.to_string_lossy().to_string(),
    });

    // Receive chunks
    let total_chunks = offer.total_chunks;
    let mut received = 0u32;
    let mut file = std::fs::File::create(&file_path)
        .map_err(|e| format!("Create file error: {}", e))?;

    for _i in 0..total_chunks {
        // Check cancel flag
        if cancel_flag.load(Ordering::Relaxed) {
            drop(file);
            let _ = std::fs::remove_file(&file_path);
            let err = ErrorMsg {
                transfer_id: offer.transfer_id.clone(),
                message: "Cancelled by user".to_string(),
            };
            write_json(writer, MsgType::Error as u8, &err).ok();
            state.update_transfer_progress(&offer.transfer_id, 0.0, "cancelled");
            state.remove_cancel_flag(&offer.transfer_id);
            return Ok(());
        }

        let (msg_type, payload) = read_message(reader)
            .map_err(|e| format!("Chunk recv error: {}", e))?;

        if msg_type != MsgType::ChunkData as u8 {
            return Err(format!("Expected ChunkData, got 0x{:02x}", msg_type));
        }

        // ChunkData format: [transfer_id: 16 bytes][chunk_index: u32][data]
        if payload.len() < 20 {
            return Err("ChunkData too short".to_string());
        }
        let data = &payload[20..];
        file.write_all(data).map_err(|e| format!("Write error: {}", e))?;

        received += 1;
        let progress = (received as f32 / total_chunks as f32) * 100.0;
        state.update_transfer_progress(&offer.transfer_id, progress, "receiving");
        let _ = app_handle.emit("p2p-transfer-progress", serde_json::json!({
            "transfer_id": offer.transfer_id,
            "progress": progress,
            "status": "receiving",
        }));
    }

    drop(file);

    // Verify SHA-256
    let actual_hash = sha256_file(&file_path).map_err(|e| format!("SHA256 error: {}", e))?;
    if actual_hash != offer.sha256 {
        let _ = std::fs::remove_file(&file_path);
        let err = ErrorMsg {
            transfer_id: offer.transfer_id.clone(),
            message: "SHA-256 mismatch".to_string(),
        };
        write_json(writer, MsgType::Error as u8, &err).ok();
        state.update_transfer_progress(&offer.transfer_id, 0.0, "failed");
        state.remove_cancel_flag(&offer.transfer_id);
        return Err("SHA-256 mismatch".to_string());
    }

    // Send Complete
    let complete = CompleteMsg {
        transfer_id: offer.transfer_id.clone(),
        sha256: actual_hash,
    };
    write_json(writer, MsgType::Complete as u8, &complete).ok();

    state.update_transfer_progress(&offer.transfer_id, 100.0, "complete");
    let _ = app_handle.emit("p2p-transfer-progress", serde_json::json!({
        "transfer_id": offer.transfer_id,
        "progress": 100.0,
        "status": "complete",
        "path": file_path.to_string_lossy(),
    }));

    state.remove_cancel_flag(&offer.transfer_id);

    Ok(())
}

/// Handle directory listing request: emit approval event, then serve
fn handle_dir_request(
    _reader: &mut BufReader<TcpStream>,
    writer: &mut BufWriter<TcpStream>,
    peer_code: &str,
    peer_alias: &str,
    state: &P2PStateArc,
    app_handle: &tauri::AppHandle,
) -> Result<(), String> {
    if !state.is_shared_enabled() {
        let err = ErrorMsg {
            transfer_id: String::new(),
            message: "Shared directory not enabled".to_string(),
        };
        write_json(writer, MsgType::Error as u8, &err).ok();
        return Err("Shared directory not enabled".to_string());
    }

    let shared_dir = state.get_shared_dir().ok_or("No shared directory")?;

    // Emit access request to frontend
    let _ = app_handle.emit("p2p-access-request", serde_json::json!({
        "peer_code": peer_code,
        "peer_alias": peer_alias,
        "action": "browse",
    }));

    // Log access
    state.add_access_log(AccessLogEntry {
        timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        peer_code: peer_code.to_string(),
        peer_alias: peer_alias.to_string(),
        action: "browse".to_string(),
        path: shared_dir.to_string_lossy().to_string(),
    });

    // Read directory listing
    let entries = std::fs::read_dir(&shared_dir)
        .map_err(|e| format!("ReadDir error: {}", e))?;

    let mut files = Vec::new();
    for entry in entries.flatten() {
        let meta = entry.metadata().ok();
        let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        files.push(DirListingFile {
            name: entry.file_name().to_string_lossy().to_string(),
            size,
            is_dir,
        });
    }

    let listing = DirListingMsg { files };
    write_json(writer, MsgType::DirListing as u8, &listing)
        .map_err(|e| format!("DirListing send error: {}", e))?;

    let _ = app_handle.emit("p2p-access-log", serde_json::json!({
        "timestamp": chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        "peer_code": peer_code,
        "peer_alias": peer_alias,
        "action": "browse",
        "path": shared_dir.to_string_lossy(),
    }));

    Ok(())
}

/// Handle file download from shared directory
fn handle_dir_download(
    _reader: &mut BufReader<TcpStream>,
    writer: &mut BufWriter<TcpStream>,
    req: &DirDownloadMsg,
    peer_code: &str,
    peer_alias: &str,
    state: &P2PStateArc,
    app_handle: &tauri::AppHandle,
) -> Result<(), String> {
    let shared_dir = state.get_shared_dir().ok_or("No shared directory")?;
    let file_path = shared_dir.join(&req.path);

    // Security: prevent path traversal
    if !file_path.starts_with(&shared_dir) {
        let err = ErrorMsg {
            transfer_id: String::new(),
            message: "Path traversal denied".to_string(),
        };
        write_json(writer, MsgType::Error as u8, &err).ok();
        return Err("Path traversal denied".to_string());
    }

    if !file_path.is_file() {
        let err = ErrorMsg {
            transfer_id: String::new(),
            message: "File not found".to_string(),
        };
        write_json(writer, MsgType::Error as u8, &err).ok();
        return Err("File not found".to_string());
    }

    // Log download
    state.add_access_log(AccessLogEntry {
        timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        peer_code: peer_code.to_string(),
        peer_alias: peer_alias.to_string(),
        action: "download".to_string(),
        path: req.path.clone(),
    });

    let _ = app_handle.emit("p2p-access-log", serde_json::json!({
        "timestamp": chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        "peer_code": peer_code,
        "peer_alias": peer_alias,
        "action": "download",
        "path": req.path,
    }));

    // Send file as FileOffer first
    let file_size = std::fs::metadata(&file_path).map_err(|e| e.to_string())?.len();
    let file_hash = sha256_file(&file_path).map_err(|e| e.to_string())?;
    let filename = file_path.file_name().unwrap_or_default().to_string_lossy().to_string();
    let total_chunks = ((file_size as usize) + CHUNK_SIZE - 1) / CHUNK_SIZE;
    let transfer_id = uuid::Uuid::new_v4().to_string();

    let offer = FileOfferMsg {
        transfer_id: transfer_id.clone(),
        filename,
        size: file_size,
        sha256: file_hash.clone(),
        total_chunks: total_chunks as u32,
    };
    write_json(writer, MsgType::FileOffer as u8, &offer)
        .map_err(|e| format!("FileOffer send error: {}", e))?;

    // Wait for Accept
    let (_, _accept): (u8, AcceptMsg) = read_json(&mut BufReader::new(writer.get_ref().try_clone().map_err(|e| e.to_string())?))
        .map_err(|e| format!("Accept recv error: {}", e))?;

    // Send chunks
    let mut file = std::fs::File::open(&file_path).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; CHUNK_SIZE];

    // Skip to offset for resume
    if req.offset > 0 {
        use std::io::Seek;
        file.seek(std::io::SeekFrom::Start(req.offset)).map_err(|e| e.to_string())?;
    }

    loop {
        let n = file.read(&mut buf).map_err(|e| format!("Read error: {}", e))?;
        if n == 0 { break; }

        // Build ChunkData: [transfer_id: 16 bytes][chunk_index: u32][data]
        let tid_bytes = transfer_id.as_bytes();
        let mut chunk = Vec::with_capacity(20 + n);
        chunk.extend_from_slice(&tid_bytes[..16.min(tid_bytes.len())]);
        // Pad transfer_id to 16 bytes
        for _ in tid_bytes.len()..16 {
            chunk.push(0);
        }
        chunk.extend_from_slice(&0u32.to_be_bytes()); // chunk_index placeholder
        chunk.extend_from_slice(&buf[..n]);

        write_message(writer, MsgType::ChunkData as u8, &chunk)
            .map_err(|e| format!("Chunk send error: {}", e))?;
    }

    // Send Complete
    let complete = CompleteMsg {
        transfer_id,
        sha256: file_hash,
    };
    write_json(writer, MsgType::Complete as u8, &complete).ok();

    Ok(())
}
