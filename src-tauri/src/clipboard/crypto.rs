// A7Box Clipboard Manager — At-rest Encryption
// AES-256-GCM for clips flagged as secrets. Key derived via HKDF-SHA256 from a
// machine fingerprint (hostname + machine GUID), so secrets stay on this machine.

use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine;
use hkdf::Hkdf;
use rand::RngCore;
use sha2::Sha256;

const PREFIX: &str = "a7enc:v1:";

/// Collect a reasonably stable machine fingerprint.
fn machine_fingerprint() -> String {
    let host = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown-host".into());

    let machine_id = read_machine_id().unwrap_or_else(|| "no-machine-id".into());
    format!("a7box-clipboard|{}|{}", host, machine_id)
}

#[cfg(target_os = "windows")]
fn read_machine_id() -> Option<String> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let key = hklm.open_subkey("SOFTWARE\\Microsoft\\Cryptography").ok()?;
    key.get_value::<String, _>("MachineGuid").ok()
}

#[cfg(target_os = "macos")]
fn read_machine_id() -> Option<String> {
    // IOPlatformUUID requires ioreg; fall back to a persisted random id
    persisted_random_id()
}

#[cfg(target_os = "linux")]
fn read_machine_id() -> Option<String> {
    std::fs::read_to_string("/etc/machine-id")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(persisted_random_id)
}

/// Fallback: a random id persisted in the app data dir
#[allow(dead_code)]
fn persisted_random_id() -> Option<String> {
    let dir = dirs::data_local_dir()?.join("A7Box").join("clipboard");
    let path = dir.join(".machine-id");
    if let Ok(existing) = std::fs::read_to_string(&path) {
        let trimmed = existing.trim().to_string();
        if !trimmed.is_empty() {
            return Some(trimmed);
        }
    }
    let id = uuid::Uuid::new_v4().to_string();
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::write(&path, &id);
    Some(id)
}

fn derive_key() -> [u8; 32] {
    let ikm = machine_fingerprint();
    let hk = Hkdf::<Sha256>::new(Some(b"a7box-clipboard-salt"), ikm.as_bytes());
    let mut okm = [0u8; 32];
    hk.expand(b"aes-256-gcm-key", &mut okm)
        .expect("32 is a valid HKDF output length");
    okm
}

/// Encrypt plaintext; returns `a7enc:v1:<base64(nonce || ciphertext)>`.
pub fn encrypt(plaintext: &str) -> Result<String, String> {
    let key = derive_key();
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("encrypt: {}", e))?;
    let mut blob = Vec::with_capacity(12 + ciphertext.len());
    blob.extend_from_slice(&nonce_bytes);
    blob.extend_from_slice(&ciphertext);
    Ok(format!(
        "{}{}",
        PREFIX,
        base64::engine::general_purpose::STANDARD.encode(&blob)
    ))
}

/// Decrypt a value produced by `encrypt`. Non-prefixed input is returned as-is
/// (allows transparent migration of unencrypted rows).
pub fn decrypt(stored: &str) -> Result<String, String> {
    let Some(b64) = stored.strip_prefix(PREFIX) else {
        return Ok(stored.to_string());
    };
    let blob = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| format!("decode: {}", e))?;
    if blob.len() < 13 {
        return Err("ciphertext too short".into());
    }
    let key = derive_key();
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&blob[..12]);
    let plain = cipher
        .decrypt(nonce, &blob[12..])
        .map_err(|_| "decrypt failed (wrong machine?)".to_string())?;
    String::from_utf8(plain).map_err(|e| e.to_string())
}

pub fn is_encrypted(stored: &str) -> bool {
    stored.starts_with(PREFIX)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_roundtrip() {
        let secret = "ghp_abcdef1234567890abcdef1234567890abcd";
        let enc = encrypt(secret).unwrap();
        assert!(is_encrypted(&enc));
        assert_ne!(enc, secret);
        assert_eq!(decrypt(&enc).unwrap(), secret);
    }

    #[test]
    fn test_chinese_roundtrip() {
        let secret = "密码：测试中文内容123";
        let enc = encrypt(secret).unwrap();
        assert_eq!(decrypt(&enc).unwrap(), secret);
    }

    #[test]
    fn test_plain_passthrough() {
        assert_eq!(decrypt("plain text").unwrap(), "plain text");
        assert!(!is_encrypted("plain text"));
    }
}
