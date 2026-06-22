// A7Box P2P LAN Transfer Module
// Manages peer discovery, file transfer, and shared directory

pub mod identity;
pub mod discovery;
pub mod protocol;
pub mod server;
pub mod client;

use identity::Identity;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};
use mdns_sd::ServiceDaemon;

/// Discovered peer info
#[derive(Clone, serde::Serialize, serde::Deserialize, Debug)]
pub struct PeerInfo {
    pub code: String,
    pub alias: String,
    pub ip: String,
    pub port: u16,
}

/// Transfer state
#[derive(Clone, serde::Serialize, Debug)]
pub struct TransferInfo {
    pub id: String,
    pub filename: String,
    pub size: u64,
    pub progress: f32,
    pub status: String, // "pending", "transferring", "complete", "failed"
    pub direction: String, // "send" or "receive"
    pub peer_code: String,
    pub file_path: String, // local path for retry / open-folder
}

/// Access log entry
#[derive(Clone, serde::Serialize, Debug)]
pub struct AccessLogEntry {
    pub timestamp: String,
    pub peer_code: String,
    pub peer_alias: String,
    pub action: String, // "browse", "download"
    pub path: String,
}

/// P2P module state
pub struct P2PState {
    pub identity: Mutex<Identity>,
    pub peers: Mutex<HashMap<String, PeerInfo>>,
    pub shared_dir: Mutex<Option<PathBuf>>,
    pub shared_enabled: Mutex<bool>,
    pub transfers: Mutex<Vec<TransferInfo>>,
    pub access_log: Mutex<Vec<AccessLogEntry>>,
    pub tcp_port: Mutex<u16>,
    pub data_dir: PathBuf,
    // Service handles for stop
    pub server_stop: Mutex<Option<Arc<AtomicBool>>>,
    pub mdns_daemon: Mutex<Option<ServiceDaemon>>,
    // Approval channel: transfer_id -> sender (true=accept, false=reject)
    pub pending_approvals: Mutex<HashMap<String, Sender<bool>>>,
    // Cancel flags: transfer_id -> cancel flag
    pub cancel_flags: Mutex<HashMap<String, Arc<AtomicBool>>>,
    // Configurable download directory
    pub download_dir: Mutex<PathBuf>,
}

impl P2PState {
    pub fn new(data_dir: PathBuf) -> Self {
        let identity = Identity::load_or_create(&data_dir);
        // Load persisted download dir, or default to data_dir/downloads
        let default_dl = data_dir.join("downloads");
        let dl_dir = std::fs::read_to_string(data_dir.join("p2p_download_dir.txt"))
            .ok()
            .map(|s| PathBuf::from(s.trim()))
            .filter(|p| p.is_dir())
            .unwrap_or(default_dl);
        Self {
            identity: Mutex::new(identity),
            peers: Mutex::new(HashMap::new()),
            shared_dir: Mutex::new(None),
            shared_enabled: Mutex::new(false),
            transfers: Mutex::new(Vec::new()),
            access_log: Mutex::new(Vec::new()),
            tcp_port: Mutex::new(0),
            download_dir: Mutex::new(dl_dir),
            data_dir,
            server_stop: Mutex::new(None),
            mdns_daemon: Mutex::new(None),
            pending_approvals: Mutex::new(HashMap::new()),
            cancel_flags: Mutex::new(HashMap::new()),
        }
    }

    pub fn get_identity(&self) -> Identity {
        self.identity.lock().unwrap().clone()
    }

    pub fn set_alias(&self, alias: String) {
        let mut id = self.identity.lock().unwrap();
        id.set_alias(alias, &self.data_dir);
    }

    pub fn get_peers(&self) -> Vec<PeerInfo> {
        self.peers.lock().unwrap().values().cloned().collect()
    }

    pub fn add_peer(&self, peer: PeerInfo) {
        self.peers.lock().unwrap().insert(peer.code.clone(), peer);
    }

    pub fn remove_peer(&self, code: &str) {
        self.peers.lock().unwrap().remove(code);
    }

    pub fn add_transfer(&self, transfer: TransferInfo) {
        self.transfers.lock().unwrap().push(transfer);
    }

    pub fn update_transfer_progress(&self, id: &str, progress: f32, status: &str) {
        let mut transfers = self.transfers.lock().unwrap();
        if let Some(t) = transfers.iter_mut().find(|t| t.id == id) {
            t.progress = progress;
            t.status = status.to_string();
        }
    }

    pub fn get_transfers(&self) -> Vec<TransferInfo> {
        self.transfers.lock().unwrap().clone()
    }

    pub fn add_access_log(&self, entry: AccessLogEntry) {
        let mut log = self.access_log.lock().unwrap();
        log.push(entry);
        // Keep last 100 entries
        while log.len() > 100 {
            log.remove(0);
        }
    }

    pub fn get_access_log(&self) -> Vec<AccessLogEntry> {
        self.access_log.lock().unwrap().clone()
    }

    pub fn set_shared_dir(&self, dir: PathBuf) {
        *self.shared_dir.lock().unwrap() = Some(dir);
    }

    pub fn set_shared_enabled(&self, enabled: bool) {
        *self.shared_enabled.lock().unwrap() = enabled;
    }

    pub fn is_shared_enabled(&self) -> bool {
        *self.shared_enabled.lock().unwrap()
    }

    pub fn get_shared_dir(&self) -> Option<PathBuf> {
        self.shared_dir.lock().unwrap().clone()
    }

    // ---- Approval channel ----

    pub fn set_pending_approval(&self, transfer_id: &str, sender: Sender<bool>) {
        self.pending_approvals.lock().unwrap().insert(transfer_id.to_string(), sender);
    }

    pub fn take_approval(&self, transfer_id: &str) -> Option<Sender<bool>> {
        self.pending_approvals.lock().unwrap().remove(transfer_id)
    }

    // ---- Cancel flags ----

    pub fn set_cancel_flag(&self, transfer_id: &str, flag: Arc<AtomicBool>) {
        self.cancel_flags.lock().unwrap().insert(transfer_id.to_string(), flag);
    }

    pub fn get_cancel_flag(&self, transfer_id: &str) -> Option<Arc<AtomicBool>> {
        self.cancel_flags.lock().unwrap().get(transfer_id).cloned()
    }

    pub fn cancel_transfer(&self, transfer_id: &str) -> bool {
        if let Some(flag) = self.get_cancel_flag(transfer_id) {
            flag.store(true, Ordering::Relaxed);
            self.update_transfer_progress(transfer_id, 0.0, "cancelled");
            true
        } else {
            false
        }
    }

    pub fn remove_cancel_flag(&self, transfer_id: &str) {
        self.cancel_flags.lock().unwrap().remove(transfer_id);
    }

    // ---- Download directory ----

    pub fn get_download_dir(&self) -> PathBuf {
        self.download_dir.lock().unwrap().clone()
    }

    pub fn set_download_dir(&self, dir: PathBuf) {
        *self.download_dir.lock().unwrap() = dir.clone();
        // Persist to file
        let _ = std::fs::write(self.data_dir.join("p2p_download_dir.txt"), dir.to_string_lossy().as_bytes());
    }
}

pub type P2PStateArc = Arc<P2PState>;
