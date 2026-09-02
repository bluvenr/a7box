// A7Box Clipboard Manager — IPC Commands
// All commands are prefixed `cm_` and operate on ClipboardManagerState.

use crate::clipboard::{self, db, paste, ClipboardManagerState, ClipboardSettings};
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub const POPUP_LABEL: &str = "clipboard-popup";
const POPUP_ROUTE: &str = "/utility/clipboard-popup";

type CmState<'a> = tauri::State<'a, Arc<ClipboardManagerState>>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PasteCapability {
    pub capable: bool,
    pub reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CmSettingsResponse {
    #[serde(flatten)]
    pub settings: ClipboardSettings,
    pub capability: PasteCapability,
    pub images_dir: String,
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn start_clipboard_manager(app: AppHandle, state: CmState<'_>) {
    clipboard::start_watcher(app, state.inner().clone());
}

#[tauri::command]
pub fn stop_clipboard_manager(state: CmState<'_>) {
    clipboard::stop_watcher(state.inner());
}

/// Sync the module-level master switch from the frontend module registry.
/// Disabling stops capture AND closes the popup if it is open. This flag is
/// intentionally separate from `settings.enabled`, which is the user's own
/// capture preference inside the module page.
#[tauri::command]
pub fn cm_set_module_enabled(app: AppHandle, state: CmState<'_>, enabled: bool) {
    state.set_module_enabled(enabled);
    if !enabled {
        clipboard::stop_watcher(state.inner());
        if let Some(popup) = app.get_webview_window(POPUP_LABEL) {
            let _ = popup.close();
        }
    }
    // Reflect in the tray in place (label/visibility) — no icon rebuild,
    // which would leave ghost icons in the Windows notification area
    crate::tray::update_capture_ui(&app);
}

/// Open a file or directory with the OS default application.
/// Bypasses the opener-plugin ACL so it keeps working regardless of
/// capability rebuilds. Sanitizes surrounding quotes (Windows "Copy as
/// path") and distinguishes "not found" from generic open failures.
#[tauri::command]
pub fn cm_open_path(path: String) -> Result<(), String> {
    let cleaned = path.trim().trim_matches('"').trim().to_string();
    if cleaned.is_empty() {
        return Err("not-found".into());
    }
    if !std::path::Path::new(&cleaned).exists() {
        return Err("not-found".into());
    }
    open::that(&cleaned).map_err(|e| e.to_string())
}

// ── History ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn cm_get_history(
    state: CmState<'_>,
    limit: Option<i64>,
    offset: Option<i64>,
    category: Option<String>,
    clip_type: Option<String>,
    search: Option<String>,
    only_pinned: Option<bool>,
) -> Result<Vec<db::ClipEntry>, String> {
    let conn = state.db.lock().unwrap();
    db::list_clips(
        &conn,
        limit.unwrap_or(50).min(500),
        offset.unwrap_or(0),
        category.as_deref(),
        clip_type.as_deref(),
        search.as_deref(),
        only_pinned.unwrap_or(false),
    )
}

/// Fetch one clip with its content decrypted (when encrypted).
#[tauri::command]
pub fn cm_get_clip(state: CmState<'_>, id: String) -> Result<db::ClipEntry, String> {
    let conn = state.db.lock().unwrap();
    let mut clip = db::get_clip(&conn, &id)?
        .ok_or_else(|| "clip not found".to_string())?;
    if clip.is_encrypted || clipboard::crypto::is_encrypted(&clip.content) {
        clip.content = clipboard::crypto::decrypt(&clip.content)?;
        clip.is_encrypted = false;
    }
    Ok(clip)
}

#[tauri::command]
pub fn cm_delete_clip(app: AppHandle, state: CmState<'_>, id: String) -> Result<(), String> {
    let removed = {
        let conn = state.db.lock().unwrap();
        db::delete_clip(&conn, &id)?
    };
    if let Some(clip) = removed {
        clipboard::remove_clip_files(&state.images_dir, &clip);
        let _ = app.emit(
            clipboard::EVENT_HISTORY_CHANGED,
            serde_json::json!({"action": "deleted", "id": id, "clipType": clip.clip_type}),
        );
    }
    Ok(())
}

#[tauri::command]
pub fn cm_delete_clips(app: AppHandle, state: CmState<'_>, ids: Vec<String>) -> Result<u64, String> {
    let removed = {
        let conn = state.db.lock().unwrap();
        db::delete_clips(&conn, &ids)?
    };
    for clip in &removed {
        clipboard::remove_clip_files(&state.images_dir, clip);
    }
    let _ = app.emit(
        clipboard::EVENT_HISTORY_CHANGED,
        serde_json::json!({"action": "deletedMany", "count": removed.len()}),
    );
    Ok(removed.len() as u64)
}

#[tauri::command]
pub fn cm_toggle_pin(app: AppHandle, state: CmState<'_>, id: String) -> Result<bool, String> {
    let pinned = {
        let conn = state.db.lock().unwrap();
        let clip = db::get_clip(&conn, &id)?.ok_or_else(|| "clip not found".to_string())?;
        let new_state = !clip.is_pinned;
        db::set_pinned(&conn, &id, new_state)?;
        new_state
    };
    let _ = app.emit(
        clipboard::EVENT_HISTORY_CHANGED,
        serde_json::json!({"action": "pinned", "id": id, "pinned": pinned}),
    );
    Ok(pinned)
}

#[tauri::command]
pub fn cm_clear_history(app: AppHandle, state: CmState<'_>, keep_pinned: Option<bool>) -> Result<u64, String> {
    let removed = {
        let conn = state.db.lock().unwrap();
        db::clear_history(&conn, keep_pinned.unwrap_or(true))?
    };
    for clip in &removed {
        clipboard::remove_clip_files(&state.images_dir, clip);
    }
    let _ = app.emit(
        clipboard::EVENT_HISTORY_CHANGED,
        serde_json::json!({"action": "cleared", "count": removed.len()}),
    );
    Ok(removed.len() as u64)
}

#[tauri::command]
pub fn cm_get_stats(state: CmState<'_>) -> Result<db::ClipStats, String> {
    let conn = state.db.lock().unwrap();
    db::get_stats(&conn)
}

// ── Copy / Paste ─────────────────────────────────────────────────────────────

/// Resolve a clip's usable content (decrypts when necessary).
fn resolve_content(state: &ClipboardManagerState, id: &str) -> Result<db::ClipEntry, String> {
    let conn = state.db.lock().unwrap();
    let mut clip = db::get_clip(&conn, id)?.ok_or_else(|| "clip not found".to_string())?;
    if clip.is_encrypted || clipboard::crypto::is_encrypted(&clip.content) {
        clip.content = clipboard::crypto::decrypt(&clip.content)?;
    }
    Ok(clip)
}

/// Write a clip to the system clipboard only.
#[tauri::command]
pub fn cm_copy_clip(state: CmState<'_>, id: String) -> Result<(), String> {
    let clip = resolve_content(state.inner(), &id)?;
    write_clip_to_system(state.inner(), &clip)?;
    let conn = state.db.lock().unwrap();
    let _ = db::touch_clip(&conn, &id, clipboard::now_ms());
    Ok(())
}

fn write_clip_to_system(state: &ClipboardManagerState, clip: &db::ClipEntry) -> Result<(), String> {
    match clip.clip_type.as_str() {
        "image" => clipboard::copy_image_to_system(state, &clip.content),
        "file" => {
            let paths: Vec<String> = serde_json::from_str(&clip.content).unwrap_or_default();
            clipboard::copy_text_to_system(state, &paths.join("\n"))
        }
        _ => clipboard::copy_text_to_system(state, &clip.content),
    }
}

/// Copy arbitrary text (e.g. transformed content) with self-write suppression.
#[tauri::command]
pub fn cm_copy_text(state: CmState<'_>, text: String) -> Result<(), String> {
    clipboard::copy_text_to_system(state.inner(), &text)
}

/// Copy a text clip's attached image (mixed text+image capture) to the system
/// clipboard. The default paste path still writes back the text — this is the
/// explicit way to reuse the accompanying bitmap.
#[tauri::command]
pub fn cm_copy_attached_image(state: CmState<'_>, id: String) -> Result<(), String> {
    let clip = {
        let conn = state.db.lock().unwrap();
        db::get_clip(&conn, &id)?.ok_or_else(|| "clip not found".to_string())?
    };
    let file_name = clip
        .attached_image_path
        .ok_or_else(|| "no attached image".to_string())?;
    clipboard::copy_image_to_system(state.inner(), &file_name)?;
    let conn = state.db.lock().unwrap();
    let _ = db::touch_clip(&conn, &id, clipboard::now_ms());
    Ok(())
}

/// Copy a clip and auto-paste it into the recorded target window.
/// Returns "pasted" or "copied:<reason>" when the platform can't inject keys.
#[tauri::command]
pub fn cm_paste_clip(app: AppHandle, state: CmState<'_>, id: String) -> Result<String, String> {
    let clip = resolve_content(state.inner(), &id)?;
    write_clip_to_system(state.inner(), &clip)?;
    {
        let conn = state.db.lock().unwrap();
        let _ = db::touch_clip(&conn, &id, clipboard::now_ms());
    }
    let (capable, reason) = paste::auto_paste_capability();
    if !capable {
        return Ok(format!("copied:{}", reason));
    }
    perform_auto_paste(&app, state.inner())?;
    Ok("pasted".into())
}

/// Paste Stack: paste several clips in order into the target window.
#[tauri::command]
pub fn cm_paste_stack(app: AppHandle, state: CmState<'_>, ids: Vec<String>) -> Result<String, String> {
    if ids.is_empty() {
        return Ok("empty".into());
    }
    let clips: Vec<db::ClipEntry> = ids
        .iter()
        .map(|id| resolve_content(state.inner(), id))
        .collect::<Result<Vec<_>, _>>()?;
    let (capable, reason) = paste::auto_paste_capability();
    if !capable {
        // Degrade: only copy the first item
        write_clip_to_system(state.inner(), &clips[0])?;
        return Ok(format!("copied:{}", reason));
    }

    let settings = state.read_settings();
    let inner = state.inner().clone();
    let first = clips[0].clone();
    write_clip_to_system(&inner, &first)?;
    close_popup(&app);
    let target = inner.paste_target.lock().unwrap().clone().unwrap_or_default();
    let app2 = app.clone();
    std::thread::spawn(move || {
        paste::restore_focus(&target);
        std::thread::sleep(std::time::Duration::from_millis(settings.paste_delay_ms));
        for (i, clip) in clips.iter().enumerate() {
            if i > 0 {
                if let Err(e) = write_clip_to_system(&inner, clip) {
                    eprintln!("[ClipboardManager] stack write failed: {}", e);
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(settings.paste_stack_interval_ms));
            }
            if let Err(e) = paste::send_paste_keys() {
                eprintln!("[ClipboardManager] stack paste failed: {}", e);
                let _ = app2.emit(clipboard::EVENT_TOAST, serde_json::json!({"messageKey": "pasteFailed"}));
                break;
            }
            let conn = inner.db.lock().unwrap();
            let _ = db::touch_clip(&conn, &clip.id, clipboard::now_ms());
        }
    });
    Ok("pasted".into())
}

/// Close the popup, restore target focus, then send the paste keystroke.
fn perform_auto_paste(app: &AppHandle, state: &ClipboardManagerState) -> Result<(), String> {
    close_popup(app);
    let target = state.paste_target.lock().unwrap().clone().unwrap_or_default();
    let delay = state.read_settings().paste_delay_ms;
    paste::restore_focus(&target);
    std::thread::sleep(std::time::Duration::from_millis(delay));
    paste::send_paste_keys()
}

fn close_popup(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(POPUP_LABEL) {
        let _ = win.close();
    }
}

#[tauri::command]
pub fn cm_paste_capability() -> PasteCapability {
    let (capable, reason) = paste::auto_paste_capability();
    PasteCapability { capable, reason: reason.to_string() }
}

/// Snapshot the current foreground window as the paste target (called right
/// after the popup opens, before it takes focus away from the target app).
#[tauri::command]
pub fn cm_snapshot_target(state: CmState<'_>) -> paste::PasteTarget {
    let target = paste::snapshot_paste_target();
    *state.paste_target.lock().unwrap() = Some(target.clone());
    target
}

// ── Popup window ─────────────────────────────────────────────────────────────

/// Toggle the quick popup. `mode` = Some("paste-stack") opens Paste Stack view.
pub fn toggle_clipboard_popup(app: &AppHandle, mode: Option<&str>) {
    if let Some(existing) = app.get_webview_window(POPUP_LABEL) {
        match mode {
            // Toggle off when reopened without a specific mode
            None => {
                let _ = existing.close();
            }
            // Popup already open (e.g. Alt+V) but invoked with a mode
            // (e.g. Alt+Shift+V): bring it to front and switch its mode.
            Some(m) => {
                let _ = existing.emit("clipboard-popup-set-mode", m);
                let _ = existing.set_focus();
            }
        }
        return;
    }
    // Module disabled -> don't open. Note: capture merely paused
    // (settings.enabled == false) intentionally still allows browsing and
    // pasting the existing history — pausing stops recording, not usage.
    if let Some(cm) = app.try_state::<Arc<ClipboardManagerState>>() {
        if !cm.is_module_enabled() {
            return;
        }
        // Record the paste target BEFORE the popup steals focus
        let target = paste::snapshot_paste_target();
        *cm.paste_target.lock().unwrap() = Some(target);
    }
    let mut url = POPUP_ROUTE.to_string();
    if let Some(m) = mode {
        url = format!("{}?mode={}", url, m);
    }
    let _ = WebviewWindowBuilder::new(app, POPUP_LABEL, WebviewUrl::App(url.into()))
        .title("")
        .inner_size(680.0, 520.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .visible(false)
        .skip_taskbar(true)
        .center()
        .background_color(tauri::window::Color(10, 10, 11, 255))
        .initialization_script(crate::state::lang_init_script(app))
        .build();
    // Window is shown by the util-window-ready listener once React mounts
}

#[tauri::command]
pub fn cm_open_popup(app: AppHandle, mode: Option<String>) {
    toggle_clipboard_popup(&app, mode.as_deref());
}

// ── Snippets ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn cm_snippet_list(state: CmState<'_>) -> Result<Vec<db::SnippetEntry>, String> {
    let conn = state.db.lock().unwrap();
    db::list_snippets(&conn)
}

#[tauri::command]
pub fn cm_snippet_save(state: CmState<'_>, mut snippet: db::SnippetEntry) -> Result<db::SnippetEntry, String> {
    if snippet.id.is_empty() {
        snippet.id = uuid::Uuid::new_v4().to_string();
    }
    if snippet.created_at == 0 {
        snippet.created_at = clipboard::now_ms();
    }
    let conn = state.db.lock().unwrap();
    db::save_snippet(&conn, &snippet)?;
    Ok(snippet)
}

#[tauri::command]
pub fn cm_snippet_delete(state: CmState<'_>, id: String) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    db::delete_snippet(&conn, &id)
}

// ── Rules ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn cm_rule_list(state: CmState<'_>) -> Result<Vec<db::RuleEntry>, String> {
    let conn = state.db.lock().unwrap();
    db::list_rules(&conn)
}

#[tauri::command]
pub fn cm_rule_save(state: CmState<'_>, mut rule: db::RuleEntry) -> Result<db::RuleEntry, String> {
    if rule.id.is_empty() {
        rule.id = uuid::Uuid::new_v4().to_string();
    }
    let conn = state.db.lock().unwrap();
    db::save_rule(&conn, &rule)?;
    Ok(rule)
}

#[tauri::command]
pub fn cm_rule_delete(state: CmState<'_>, id: String) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    db::delete_rule(&conn, &id)
}

#[tauri::command]
pub fn cm_rule_toggle(state: CmState<'_>, id: String, enabled: bool) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    db::set_rule_enabled(&conn, &id, enabled)
}

// ── Settings ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn cm_get_settings(state: CmState<'_>) -> CmSettingsResponse {
    let (capable, reason) = paste::auto_paste_capability();
    CmSettingsResponse {
        settings: state.read_settings(),
        capability: PasteCapability { capable, reason: reason.to_string() },
        images_dir: state.images_dir.to_string_lossy().to_string(),
    }
}

#[tauri::command]
pub fn cm_save_settings(app: AppHandle, state: CmState<'_>, settings: ClipboardSettings) -> Result<(), String> {
    state.write_settings(settings)?;
    // Reflect the capture switch immediately
    if state.read_settings().enabled {
        clipboard::start_watcher(app.clone(), state.inner().clone());
    } else {
        clipboard::stop_watcher(state.inner());
        // NOTE: an open popup intentionally stays open — pausing stops
        // recording, not browsing the existing history.
    }
    // Keep the tray pause/resume label in sync with this change
    crate::tray::update_capture_ui(&app);
    // Notify other windows (settings UI may be open elsewhere)
    let _ = app.emit("cm-settings-changed", ());
    Ok(())
}

// ── Export / Import ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn cm_export(state: CmState<'_>, format: String, path: String) -> Result<u64, String> {
    let clips = {
        let conn = state.db.lock().unwrap();
        db::list_clips(&conn, 1_000_000, 0, None, None, None, false)?
    };
    // Decrypt secrets for export
    let clips: Vec<db::ClipEntry> = clips
        .into_iter()
        .map(|mut c| {
            if c.is_encrypted {
                if let Ok(plain) = clipboard::crypto::decrypt(&c.content) {
                    c.content = plain;
                    c.is_encrypted = false;
                }
            }
            c
        })
        .collect();
    let count = clips.len() as u64;

    match format.as_str() {
        "csv" => {
            let mut csv = String::from("id,clip_type,category,preview,source_app,created_at,content\n");
            for c in &clips {
                csv.push_str(&format!(
                    "{},{},{},{},{},{},{}\n",
                    c.id,
                    c.clip_type,
                    c.category,
                    csv_escape(&c.preview),
                    csv_escape(c.source_app.as_deref().unwrap_or("")),
                    c.created_at,
                    csv_escape(&c.content),
                ));
            }
            std::fs::write(&path, csv).map_err(|e| e.to_string())?;
        }
        _ => {
            let raw = serde_json::to_string_pretty(&clips).map_err(|e| e.to_string())?;
            std::fs::write(&path, raw).map_err(|e| e.to_string())?;
        }
    }
    Ok(count)
}

fn csv_escape(s: &str) -> String {
    let escaped = s.replace('"', "\"\"").replace('\n', "\\n").replace('\r', "");
    format!("\"{}\"", escaped)
}

#[tauri::command]
pub fn cm_import(app: AppHandle, state: CmState<'_>, path: String) -> Result<u64, String> {
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let clips: Vec<db::ClipEntry> = serde_json::from_str(&raw).map_err(|e| format!("parse: {}", e))?;
    let total = clips.len() as u64;
    let mut imported = 0u64;
    {
        let conn = state.db.lock().unwrap();
        for mut clip in clips {
            if clip.id.is_empty() {
                clip.id = uuid::Uuid::new_v4().to_string();
            }
            if clip.created_at == 0 {
                clip.created_at = clipboard::now_ms();
            }
            if db::insert_clip(&conn, &clip).is_ok() {
                imported += 1;
            }
        }
    }
    let _ = app.emit(
        clipboard::EVENT_HISTORY_CHANGED,
        serde_json::json!({"action": "imported", "count": imported, "total": total}),
    );
    Ok(imported)
}

// ── Assets ───────────────────────────────────────────────────────────────────

/// Absolute path of a stored image/thumbnail (frontend uses convertFileSrc).
#[tauri::command]
pub fn cm_asset_path(state: CmState<'_>, file_name: String) -> Result<String, String> {
    // Reject path traversal
    if file_name.contains("..") || file_name.contains('/') || file_name.contains('\\') {
        return Err("invalid file name".into());
    }
    let path = state.images_dir.join(&file_name);
    if !path.exists() {
        return Err("file not found".into());
    }
    Ok(path.to_string_lossy().to_string())
}

/// Read a stored image/thumbnail and return a data URL (avoids asset protocol config).
#[tauri::command]
pub fn cm_image_data_url(state: CmState<'_>, file_name: String) -> Result<String, String> {
    if file_name.contains("..") || file_name.contains('/') || file_name.contains('\\') {
        return Err("invalid file name".into());
    }
    let path = state.images_dir.join(&file_name);
    if !path.exists() {
        return Err("file not found".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    // Guard against huge files (thumbnails are ~KB; originals capped at ingest)
    if bytes.len() > 20 * 1024 * 1024 {
        return Err("file too large".into());
    }
    use base64::Engine as _;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:image/png;base64,{}", b64))
}
