// A7Box Cache Management Commands

use crate::p2p::P2PStateArc;
use std::path::PathBuf;
use std::sync::Arc;

type CmStateArc = Arc<crate::clipboard::ClipboardManagerState>;

/// Temp directory for session screenshots (same as screenshot module)
fn temp_screenshot_dir() -> PathBuf {
    std::env::temp_dir().join("a7box_screenshots")
}

/// Returns cache sizes in bytes for each cache category
#[tauri::command]
pub fn get_cache_sizes(
    state: tauri::State<'_, P2PStateArc>,
    cm: tauri::State<'_, CmStateArc>,
) -> serde_json::Value {
    // P2P downloads
    let dl_dir = state.inner().get_download_dir();
    let (p2p_downloads, p2p_file_count) = dir_size_and_count(&dl_dir);

    // Screenshots: temp directory (same as screenshot module)
    let ss_dir = temp_screenshot_dir();
    let (screenshots, ss_file_count) = dir_size_and_count(&ss_dir);

    // P2P transfers history count
    let transfer_count = state.inner().transfers.lock().unwrap().len();

    // Clipboard manager: db file + captured images
    let cm_db_path = cm.db_path.clone();
    let clipboard_db = cm_db_path.metadata().map(|m| m.len()).unwrap_or(0);
    let (clipboard_images, cm_image_count) = dir_size_and_count(&cm.images_dir);

    serde_json::json!({
        "p2pDownloads": p2p_downloads,
        "p2pDownloadsPath": dl_dir.to_string_lossy(),
        "p2pFileCount": p2p_file_count,
        "screenshots": screenshots,
        "screenshotsPath": ss_dir.to_string_lossy(),
        "screenshotFileCount": ss_file_count,
        "transferCount": transfer_count,
        "clipboardDb": clipboard_db,
        "clipboardDbPath": cm_db_path.to_string_lossy(),
        "clipboardImages": clipboard_images,
        "clipboardImageCount": cm_image_count,
    })
}

/// Clear a specific cache category. `category` is one of:
/// - "p2pDownloads": delete files in the download directory
/// - "screenshots": delete files in the temp screenshots directory
/// - "transferHistory": clear in-memory transfer records
/// - "clipboardImages": delete captured clipboard image files
/// - "clipboardHistory": clear clipboard history records (keeps snippets/rules)
#[tauri::command]
pub fn clear_cache(
    state: tauri::State<'_, P2PStateArc>,
    cm: tauri::State<'_, CmStateArc>,
    category: String,
) -> Result<bool, String> {
    match category.as_str() {
        "p2pDownloads" => {
            let dl_dir = state.inner().get_download_dir();
            clear_dir_contents(&dl_dir)?;
            Ok(true)
        }
        "screenshots" => {
            let ss_dir = temp_screenshot_dir();
            clear_dir_contents(&ss_dir)?;
            Ok(true)
        }
        "transferHistory" => {
            state.inner().transfers.lock().unwrap().clear();
            Ok(true)
        }
        "clipboardImages" => {
            clear_dir_contents(&cm.images_dir)?;
            Ok(true)
        }
        "clipboardHistory" => {
            let removed = {
                let conn = cm.db.lock().unwrap();
                crate::clipboard::db::clear_history(&conn, false)?
            };
            for clip in &removed {
                crate::clipboard::remove_clip_files(&cm.images_dir, clip);
            }
            Ok(true)
        }
        _ => Err(format!("Unknown cache category: {}", category)),
    }
}

/// Open a cache directory in system file explorer
#[tauri::command]
pub fn open_cache_dir(
    category: String,
    state: tauri::State<'_, P2PStateArc>,
    cm: tauri::State<'_, CmStateArc>,
) -> Result<bool, String> {
    let dir = match category.as_str() {
        "p2pDownloads" => state.inner().get_download_dir(),
        "screenshots" => temp_screenshot_dir(),
        "clipboardImages" => cm.images_dir.clone(),
        _ => return Err(format!("Unknown cache category: {}", category)),
    };
    if dir.exists() {
        open::that(&dir).map_err(|e| format!("Failed to open folder: {}", e))?;
        Ok(true)
    } else {
        Ok(false)
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
