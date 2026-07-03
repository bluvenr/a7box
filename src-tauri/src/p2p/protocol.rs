// A7Box P2P Protocol Module
// Custom binary protocol over TCP for file transfer

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};

/// Protocol version
pub const PROTOCOL_VERSION: u8 = 1;

/// Chunk size: 64KB
pub const CHUNK_SIZE: usize = 64 * 1024;

/// Message type bytes
#[repr(u8)]
pub enum MsgType {
    Hello = 0x01,
    FileOffer = 0x02,
    Accept = 0x03,
    Reject = 0x04,
    ChunkReq = 0x05,
    Complete = 0x06,
    Error = 0x07,
    DirRequest = 0x10,
    DirListing = 0x11,
    DirDownload = 0x12,
    ChunkData = 0x20,
}

impl MsgType {
    pub fn from_u8(v: u8) -> Option<Self> {
        match v {
            0x01 => Some(Self::Hello),
            0x02 => Some(Self::FileOffer),
            0x03 => Some(Self::Accept),
            0x04 => Some(Self::Reject),
            0x05 => Some(Self::ChunkReq),
            0x06 => Some(Self::Complete),
            0x07 => Some(Self::Error),
            0x10 => Some(Self::DirRequest),
            0x11 => Some(Self::DirListing),
            0x12 => Some(Self::DirDownload),
            0x20 => Some(Self::ChunkData),
            _ => None,
        }
    }
}

// ---- Control message payloads (JSON) ----

#[derive(Serialize, Deserialize)]
pub struct HelloMsg {
    pub code: String,
    pub alias: String,
    pub version: u8,
}

#[derive(Serialize, Deserialize)]
pub struct FileOfferMsg {
    pub transfer_id: String,
    pub filename: String,
    pub size: u64,
    pub sha256: String,
    pub total_chunks: u32,
}

#[derive(Serialize, Deserialize)]
pub struct AcceptMsg {
    pub transfer_id: String,
    pub resume_chunk: Option<u32>, // for resume support
}

#[derive(Serialize, Deserialize)]
pub struct RejectMsg {
    pub transfer_id: String,
    pub reason: String,
}

#[derive(Serialize, Deserialize)]
pub struct CompleteMsg {
    pub transfer_id: String,
    pub sha256: String,
}

#[derive(Serialize, Deserialize)]
pub struct ErrorMsg {
    pub transfer_id: String,
    pub message: String,
}

#[derive(Serialize, Deserialize)]
pub struct DirListingFile {
    pub name: String,
    pub size: u64,
    pub is_dir: bool,
}

#[derive(Serialize, Deserialize)]
pub struct DirListingMsg {
    pub files: Vec<DirListingFile>,
}

#[derive(Serialize, Deserialize)]
pub struct DirDownloadMsg {
    pub path: String,
    pub offset: u64,
}

// ---- Wire format helpers ----

/// Write a control message: [type: u8][length: u32 BE][json payload]
pub fn write_message<W: Write>(writer: &mut W, msg_type: u8, payload: &[u8]) -> std::io::Result<()> {
    writer.write_all(&[msg_type])?;
    writer.write_all(&(payload.len() as u32).to_be_bytes())?;
    writer.write_all(payload)?;
    writer.flush()?;
    Ok(())
}

/// Write a JSON control message
pub fn write_json<W: Write, T: Serialize>(writer: &mut W, msg_type: u8, msg: &T) -> std::io::Result<()> {
    let json = serde_json::to_vec(msg).map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    write_message(writer, msg_type, &json)
}

/// Read a message: returns (type, payload)
pub fn read_message<R: Read>(reader: &mut R) -> std::io::Result<(u8, Vec<u8>)> {
    let mut type_buf = [0u8; 1];
    reader.read_exact(&mut type_buf)?;

    let mut len_buf = [0u8; 4];
    reader.read_exact(&mut len_buf)?;
    let len = u32::from_be_bytes(len_buf) as usize;

    // Sanity check: max 10MB control message
    if len > 10 * 1024 * 1024 {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "Message too large"));
    }

    let mut payload = vec![0u8; len];
    reader.read_exact(&mut payload)?;

    Ok((type_buf[0], payload))
}

/// Read a JSON control message
pub fn read_json<R: Read, T: for<'de> Deserialize<'de>>(reader: &mut R) -> std::io::Result<(u8, T)> {
    let (msg_type, payload) = read_message(reader)?;
    let msg = serde_json::from_slice(&payload)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    Ok((msg_type, msg))
}

// ---- SHA-256 helpers ----

/// Compute SHA-256 of a file
pub fn sha256_file(path: &std::path::Path) -> std::io::Result<String> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 { break; }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}
