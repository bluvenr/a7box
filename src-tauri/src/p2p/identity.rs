// A7Box P2P Identity Module
// Generates and persists client codes and aliases

use rand::Rng;

/// Generate a random 4-char alphanumeric code (e.g., "3KF9")
fn random_code() -> String {
    const CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::thread_rng();
    (0..4)
        .map(|_| {
            let idx = rng.gen_range(0..CHARS.len());
            CHARS[idx] as char
        })
        .collect()
}

/// Get system hostname as default alias
fn default_alias() -> String {
    hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "A7Box".to_string())
}

/// P2P identity: code + alias
#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct Identity {
    pub code: String,
    pub alias: String,
}

impl Identity {
    /// Load identity from storage file, or generate new one
    pub fn load_or_create(data_dir: &std::path::Path) -> Self {
        let path = data_dir.join("p2p_identity.json");
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(id) = serde_json::from_str::<Identity>(&data) {
                return id;
            }
        }
        let id = Identity {
            code: format!("A7-{}", random_code()),
            alias: default_alias(),
        };
        // Persist
        if let Ok(json) = serde_json::to_string_pretty(&id) {
            let _ = std::fs::create_dir_all(data_dir);
            let _ = std::fs::write(path, json);
        }
        id
    }

    /// Update alias and persist
    pub fn set_alias(&mut self, alias: String, data_dir: &std::path::Path) {
        self.alias = alias;
        let path = data_dir.join("p2p_identity.json");
        if let Ok(json) = serde_json::to_string_pretty(self) {
            let _ = std::fs::write(path, json);
        }
    }
}
