// A7Box Cache Management Commands

use crate::p2p::P2PStateArc;
use std::path::PathBuf;

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

// ── Helpers ──────────────────────────────────────────────────────────────────

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
