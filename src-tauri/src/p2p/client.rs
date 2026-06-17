// A7Box P2P TCP Client
// Connects to peers to send files and request shared directories

use crate::p2p::protocol::*;
use crate::p2p::{PeerInfo, TransferInfo, P2PStateArc};
use std::io::{BufReader, BufWriter, Read, Write};
use std::net::TcpStream;
use std::path::Path;
use tauri::Emitter;

/// Connect to a peer and send a file
pub fn send_file(
    peer: &PeerInfo,
    file_path: &Path,
    state: &P2PStateArc,
    app_handle: &tauri::AppHandle,
) -> Result<String, String> {
    let addr = format!("{}:{}", peer.ip, peer.port);
    let stream = TcpStream::connect_timeout(
        &addr.parse().map_err(|e| format!("Parse addr: {}", e))?,
        std::time::Duration::from_secs(10),
    ).map_err(|e| format!("Connect error: {}", e))?;

    stream.set_read_timeout(Some(std::time::Duration::from_secs(300))).ok();
    stream.set_write_timeout(Some(std::time::Duration::from_secs(300))).ok();

    let mut reader = BufReader::new(stream.try_clone().map_err(|e| e.to_string())?);
    let mut writer = BufWriter::new(stream);

    // Exchange Hello
    let identity = state.get_identity();
    let hello = HelloMsg {
        code: identity.code.clone(),
        alias: identity.alias.clone(),
        version: PROTOCOL_VERSION,
    };
    write_json(&mut writer, MsgType::Hello as u8, &hello)
        .map_err(|e| format!("Hello send: {}", e))?;

    let (_, _peer_hello): (u8, HelloMsg) = read_json(&mut reader)
        .map_err(|e| format!("Hello recv: {}", e))?;

    // Compute file info
    let file_size = std::fs::metadata(file_path).map_err(|e| e.to_string())?.len();
    let file_hash = sha256_file(file_path).map_err(|e| e.to_string())?;
    let filename = file_path.file_name().unwrap_or_default().to_string_lossy().to_string();
    let total_chunks = ((file_size as usize) + CHUNK_SIZE - 1) / CHUNK_SIZE;
    let transfer_id = uuid::Uuid::new_v4().to_string();

    // Record transfer
    state.add_transfer(TransferInfo {
        id: transfer_id.clone(),
        filename: filename.clone(),
        size: file_size,
        progress: 0.0,
        status: "pending".to_string(),
        direction: "send".to_string(),
        peer_code: peer.code.clone(),
        file_path: file_path.to_string_lossy().to_string(),
    });

    // Send FileOffer
    let offer = FileOfferMsg {
        transfer_id: transfer_id.clone(),
        filename: filename.clone(),
        size: file_size,
        sha256: file_hash.clone(),
        total_chunks: total_chunks as u32,
    };
    write_json(&mut writer, MsgType::FileOffer as u8, &offer)
        .map_err(|e| format!("FileOffer send: {}", e))?;

    // Wait for Accept or Reject
    let (msg_type, payload) = read_message(&mut reader)
        .map_err(|e| format!("Response recv: {}", e))?;

    match MsgType::from_u8(msg_type) {
        Some(MsgType::Reject) => {
            let reject: RejectMsg = serde_json::from_slice(&payload)
                .map_err(|e| format!("Parse Reject: {}", e))?;
            state.update_transfer_progress(&transfer_id, 0.0, "rejected");
            return Err(format!("Rejected: {}", reject.reason));
        }
        Some(MsgType::Accept) => {
            // Continue with transfer
        }
        Some(MsgType::Error) => {
            let err: ErrorMsg = serde_json::from_slice(&payload)
                .map_err(|e| format!("Parse Error: {}", e))?;
            state.update_transfer_progress(&transfer_id, 0.0, "error");
            return Err(format!("Peer error: {}", err.message));
        }
        _ => {
            return Err(format!("Unexpected response: 0x{:02x}", msg_type));
        }
    }

    state.update_transfer_progress(&transfer_id, 0.0, "transferring");

    // Send file chunks
    let mut file = std::fs::File::open(file_path).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; CHUNK_SIZE];
    let mut sent = 0u32;

    loop {
        let n = file.read(&mut buf).map_err(|e| format!("Read error: {}", e))?;
        if n == 0 { break; }

        // Build ChunkData payload
        let tid_bytes = transfer_id.as_bytes();
        let mut chunk = Vec::with_capacity(20 + n);
        // transfer_id (16 bytes, zero-padded)
        let mut tid_padded = [0u8; 16];
        let copy_len = 16.min(tid_bytes.len());
        tid_padded[..copy_len].copy_from_slice(&tid_bytes[..copy_len]);
        chunk.extend_from_slice(&tid_padded);
        chunk.extend_from_slice(&sent.to_be_bytes());
        chunk.extend_from_slice(&buf[..n]);

        write_message(&mut writer, MsgType::ChunkData as u8, &chunk)
            .map_err(|e| format!("Chunk send: {}", e))?;

        sent += 1;
        let progress = (sent as f32 / total_chunks as f32) * 100.0;
        state.update_transfer_progress(&transfer_id, progress, "transferring");
        let _ = app_handle.emit("p2p-transfer-progress", serde_json::json!({
            "transfer_id": transfer_id,
            "progress": progress,
            "status": "transferring",
        }));
    }

    // Send Complete
    let complete = CompleteMsg {
        transfer_id: transfer_id.clone(),
        sha256: file_hash,
    };
    write_json(&mut writer, MsgType::Complete as u8, &complete).ok();

    state.update_transfer_progress(&transfer_id, 100.0, "complete");
    let _ = app_handle.emit("p2p-transfer-progress", serde_json::json!({
        "transfer_id": transfer_id,
        "progress": 100.0,
        "status": "complete",
    }));

    Ok(transfer_id)
}

/// Connect to a peer and request their shared directory listing
pub fn request_dir(
    peer: &PeerInfo,
    state: &P2PStateArc,
) -> Result<Vec<DirListingFile>, String> {
    let addr = format!("{}:{}", peer.ip, peer.port);
    let stream = TcpStream::connect_timeout(
        &addr.parse().map_err(|e| format!("Parse addr: {}", e))?,
        std::time::Duration::from_secs(10),
    ).map_err(|e| format!("Connect error: {}", e))?;

    stream.set_read_timeout(Some(std::time::Duration::from_secs(30))).ok();

    let mut reader = BufReader::new(stream.try_clone().map_err(|e| e.to_string())?);
    let mut writer = BufWriter::new(stream);

    // Exchange Hello
    let identity = state.get_identity();
    let hello = HelloMsg {
        code: identity.code.clone(),
        alias: identity.alias.clone(),
        version: PROTOCOL_VERSION,
    };
    write_json(&mut writer, MsgType::Hello as u8, &hello)
        .map_err(|e| format!("Hello send: {}", e))?;

    let (_, _peer_hello): (u8, HelloMsg) = read_json(&mut reader)
        .map_err(|e| format!("Hello recv: {}", e))?;

    // Send DirRequest (empty payload)
    write_json(&mut writer, MsgType::DirRequest as u8, &serde_json::json!({}))
        .map_err(|e| format!("DirRequest send: {}", e))?;

    // Wait for DirListing or Error
    let (msg_type, payload) = read_message(&mut reader)
        .map_err(|e| format!("Response recv: {}", e))?;

    match MsgType::from_u8(msg_type) {
        Some(MsgType::DirListing) => {
            let listing: DirListingMsg = serde_json::from_slice(&payload)
                .map_err(|e| format!("Parse DirListing: {}", e))?;
            Ok(listing.files)
        }
        Some(MsgType::Error) => {
            let err: ErrorMsg = serde_json::from_slice(&payload)
                .map_err(|e| format!("Parse Error: {}", e))?;
            Err(format!("Peer error: {}", err.message))
        }
        _ => Err(format!("Unexpected response: 0x{:02x}", msg_type)),
    }
}

/// Download a specific file from a peer's shared directory
pub fn download_dir_file(
    peer: &PeerInfo,
    remote_path: &str,
    local_dir: &Path,
    state: &P2PStateArc,
    app_handle: &tauri::AppHandle,
) -> Result<String, String> {
    let addr = format!("{}:{}", peer.ip, peer.port);
    let stream = TcpStream::connect_timeout(
        &addr.parse().map_err(|e| format!("Parse addr: {}", e))?,
        std::time::Duration::from_secs(10),
    ).map_err(|e| format!("Connect error: {}", e))?;

    stream.set_read_timeout(Some(std::time::Duration::from_secs(300))).ok();

    let mut reader = BufReader::new(stream.try_clone().map_err(|e| e.to_string())?);
    let mut writer = BufWriter::new(stream);

    // Exchange Hello
    let identity = state.get_identity();
    let hello = HelloMsg {
        code: identity.code.clone(),
        alias: identity.alias.clone(),
        version: PROTOCOL_VERSION,
    };
    write_json(&mut writer, MsgType::Hello as u8, &hello)
        .map_err(|e| format!("Hello send: {}", e))?;

    let (_, _): (u8, HelloMsg) = read_json(&mut reader)
        .map_err(|e| format!("Hello recv: {}", e))?;

    // Send DirDownload request
    let req = DirDownloadMsg {
        path: remote_path.to_string(),
        offset: 0,
    };
    write_json(&mut writer, MsgType::DirDownload as u8, &req)
        .map_err(|e| format!("DirDownload send: {}", e))?;

    // Expect FileOffer from peer
    let (_, offer): (u8, FileOfferMsg) = read_json(&mut reader)
        .map_err(|e| format!("FileOffer recv: {}", e))?;

    let transfer_id = offer.transfer_id.clone();
    let total_chunks = offer.total_chunks;

    // Send Accept
    let accept = AcceptMsg {
        transfer_id: transfer_id.clone(),
        resume_chunk: None,
    };
    write_json(&mut writer, MsgType::Accept as u8, &accept)
        .map_err(|e| format!("Accept send: {}", e))?;

    // Create local file
    std::fs::create_dir_all(local_dir).map_err(|e| e.to_string())?;
    let local_path = local_dir.join(&offer.filename);
    let mut file = std::fs::File::create(&local_path).map_err(|e| e.to_string())?;

    // Receive chunks
    let mut received = 0u32;
    for _ in 0..total_chunks {
        let (msg_type, payload) = read_message(&mut reader)
            .map_err(|e| format!("Chunk recv: {}", e))?;

        if msg_type != MsgType::ChunkData as u8 {
            return Err(format!("Expected ChunkData, got 0x{:02x}", msg_type));
        }
        if payload.len() >= 20 {
            file.write_all(&payload[20..]).map_err(|e| format!("Write error: {}", e))?;
        }

        received += 1;
        let progress = (received as f32 / total_chunks as f32) * 100.0;
        let _ = app_handle.emit("p2p-transfer-progress", serde_json::json!({
            "transfer_id": transfer_id,
            "progress": progress,
            "status": "downloading",
        }));
    }

    drop(file);

    // Verify
    let actual = sha256_file(&local_path).map_err(|e| e.to_string())?;
    if actual != offer.sha256 {
        let _ = std::fs::remove_file(&local_path);
        return Err("SHA-256 mismatch".to_string());
    }

    let _ = app_handle.emit("p2p-transfer-progress", serde_json::json!({
        "transfer_id": transfer_id,
        "progress": 100.0,
        "status": "complete",
        "path": local_path.to_string_lossy(),
    }));

    Ok(local_path.to_string_lossy().to_string())
}
