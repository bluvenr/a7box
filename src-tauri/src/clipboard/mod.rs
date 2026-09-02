// A7Box Clipboard Manager — Core Engine
// The single clipboard listener for the whole app. Captures text / image /
// file-list content, runs classification + secret detection + automation
// rules, persists to SQLite and broadcasts changes to all windows.
//
// Events emitted:
//   "clipboard-changed"          plain text payload (backward compatible)
//   "clipboard-history-changed"  { action, id, clipType } structured
//   "clipboard-toast"            { messageKey } non-blocking UI notice
//   "clipboard-rule-notify"      { ruleName } automation rule notification

pub mod classifier;
pub mod crypto;
pub mod db;
pub mod paste;
pub mod secret_detector;
#[cfg(target_os = "windows")]
pub mod win_source;

use db::ClipEntry;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::Path;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub const EVENT_CLIP_CHANGED: &str = "clipboard-changed";
pub const EVENT_HISTORY_CHANGED: &str = "clipboard-history-changed";
pub const EVENT_TOAST: &str = "clipboard-toast";
pub const EVENT_RULE_NOTIFY: &str = "clipboard-rule-notify";

/// Self-write suppression window: writes made by A7Box itself are ignored.
const SELF_WRITE_WINDOW_MS: i64 = 500;
const PREVIEW_CHARS: usize = 200;
/// Dedup lookback for "same content copied again" bumping (7 days).
const DEDUP_WINDOW_MS: i64 = 7 * 86_400_000;

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// SHA-256 hex digest used for content deduplication.
pub fn hash_text(text: &str) -> String {
    sha256_hex(text.as_bytes())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect()
}

fn truncate_chars(s: &str, max_chars: usize) -> String {
    s.chars().take(max_chars).collect()
}

fn truncate_bytes(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    let mut end = max_bytes;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

// ── Settings ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ClipboardSettings {
    /// Master capture switch
    pub enabled: bool,
    pub capture_images: bool,
    pub capture_files: bool,
    pub max_history: u64,
    pub retention_days: u64,
    /// Text larger than this is truncated before storage
    pub max_text_bytes: usize,
    /// Images larger than this (encoded PNG) are skipped
    pub max_image_bytes: u64,
    pub image_cache_limit_mb: u64,
    /// Delay between popup close and simulated Ctrl+V
    pub paste_delay_ms: u64,
    /// Interval between consecutive pastes in Paste Stack
    pub paste_stack_interval_ms: u64,
    /// Encrypt secret clips at rest
    pub encrypt_secrets: bool,
    /// Process names whose copies are never captured (password managers)
    pub ignored_apps: Vec<String>,
}

impl Default for ClipboardSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            capture_images: true,
            capture_files: true,
            max_history: 500,
            retention_days: 30,
            max_text_bytes: 1024 * 1024,
            max_image_bytes: 10 * 1024 * 1024,
            image_cache_limit_mb: 500,
            paste_delay_ms: 80,
            paste_stack_interval_ms: 300,
            encrypt_secrets: true,
            ignored_apps: vec![
                "1password".into(),
                "1password.exe".into(),
                "keepass".into(),
                "keepass.exe".into(),
                "keepassxc".into(),
                "keepassxc.exe".into(),
                "bitwarden".into(),
                "bitwarden.exe".into(),
                "keeweb".into(),
                "passwordsafe".into(),
            ],
        }
    }
}

pub fn load_settings(path: &Path) -> ClipboardSettings {
    let mut settings: ClipboardSettings = std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();
    sanitize_settings(&mut settings);
    settings
}

/// Clamp numeric settings into sane ranges. The settings UI validates too,
/// but a hand-edited config file must not break runtime behavior.
pub fn sanitize_settings(s: &mut ClipboardSettings) {
    s.max_history = s.max_history.clamp(50, 10_000);
    s.retention_days = s.retention_days.clamp(1, 365);
    if s.max_text_bytes == 0 {
        s.max_text_bytes = 1024 * 1024;
    }
    if s.max_image_bytes == 0 {
        s.max_image_bytes = 10 * 1024 * 1024;
    }
    s.image_cache_limit_mb = s.image_cache_limit_mb.clamp(50, 5_000);
    s.paste_delay_ms = s.paste_delay_ms.min(2_000);
    s.paste_stack_interval_ms = s.paste_stack_interval_ms.clamp(50, 5_000);
}

pub fn save_settings_file(path: &Path, settings: &ClipboardSettings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let raw = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(path, raw).map_err(|e| e.to_string())
}

// ── Manager State (Tauri State, no bare statics) ────────────────────────────

pub struct ClipboardManagerState {
    pub db: Mutex<Connection>,
    pub settings: RwLock<ClipboardSettings>,
    pub settings_path: PathBuf,
    pub images_dir: PathBuf,
    /// Used by cache management (settings page) to report the db location
    #[allow(dead_code)]
    pub db_path: PathBuf,
    /// Persisted copy of `module_enabled` so the flag survives restarts
    /// (Rust cannot know the frontend module state before the UI loads)
    module_flag_path: PathBuf,
    running: AtomicBool,
    /// Module-level master switch synced from the frontend module registry.
    /// Independent from `settings.enabled` (the user's capture preference):
    /// disabling the module in Settings must not overwrite that preference.
    module_enabled: AtomicBool,
    /// End timestamp (ms) of the self-write suppression window
    self_write_until: AtomicI64,
    /// Hash of the last known clipboard content (dedup + suppression)
    last_hash: Mutex<String>,
    /// Paste target snapshot taken when the popup opens
    pub paste_target: Mutex<Option<paste::PasteTarget>>,
    /// Bumped on every start/stop. A watcher thread exits as soon as its own
    /// generation is stale — protects against a fast pause→resume race where
    /// the still-dying thread would see `running == true` again and a second
    /// watcher would end up polling alongside it.
    generation: AtomicU64,
}

impl ClipboardManagerState {
    pub fn init(data_dir: &Path) -> Result<Self, String> {
        let dir = data_dir.join("clipboard");
        let images_dir = dir.join("images");
        std::fs::create_dir_all(&images_dir).map_err(|e| format!("create dir: {}", e))?;
        let db_path = dir.join("clipboard_history.db");
        let settings_path = dir.join("settings.json");
        let module_flag_path = dir.join("module_enabled.flag");
        // Absent/corrupt flag file means "enabled" (the default)
        let module_enabled = std::fs::read_to_string(&module_flag_path)
            .map(|s| s.trim() != "false")
            .unwrap_or(true);
        let settings = load_settings(&settings_path);
        let conn = db::open_db(&db_path)?;
        Ok(Self {
            db: Mutex::new(conn),
            settings: RwLock::new(settings),
            settings_path,
            images_dir,
            db_path,
            module_flag_path,
            running: AtomicBool::new(false),
            module_enabled: AtomicBool::new(module_enabled),
            self_write_until: AtomicI64::new(0),
            last_hash: Mutex::new(String::new()),
            paste_target: Mutex::new(None),
            generation: AtomicU64::new(0),
        })
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    /// True when the clipboard-manager module is enabled in app settings.
    pub fn is_module_enabled(&self) -> bool {
        self.module_enabled.load(Ordering::SeqCst)
    }

    pub fn set_module_enabled(&self, enabled: bool) {
        self.module_enabled.store(enabled, Ordering::SeqCst);
        // Persist so the popup guard and tray item stay correct across restarts
        let _ = std::fs::write(&self.module_flag_path, if enabled { "true" } else { "false" });
    }

    /// Mark that A7Box itself is about to write the clipboard; the watcher
    /// skips changes observed within the suppression window.
    pub fn mark_self_write(&self) {
        self.self_write_until
            .store(now_ms() + SELF_WRITE_WINDOW_MS, Ordering::SeqCst);
    }

    fn in_self_write_window(&self) -> bool {
        now_ms() < self.self_write_until.load(Ordering::SeqCst)
    }

    fn last_hash_matches(&self, hash: &str) -> bool {
        *self.last_hash.lock().unwrap() == hash
    }

    fn set_last_hash(&self, hash: &str) {
        *self.last_hash.lock().unwrap() = hash.to_string();
    }

    pub fn read_settings(&self) -> ClipboardSettings {
        self.settings.read().unwrap().clone()
    }

    pub fn write_settings(&self, mut settings: ClipboardSettings) -> Result<(), String> {
        sanitize_settings(&mut settings);
        save_settings_file(&self.settings_path, &settings)?;
        *self.settings.write().unwrap() = settings;
        Ok(())
    }
}

// ── System clipboard writes (always marked as self-write) ───────────────────

pub fn copy_text_to_system(state: &ClipboardManagerState, text: &str) -> Result<(), String> {
    state.mark_self_write();
    let mut cb = arboard::Clipboard::new().map_err(|e| format!("clipboard: {}", e))?;
    cb.set_text(text.to_string()).map_err(|e| format!("set_text: {}", e))
}

pub fn copy_image_to_system(state: &ClipboardManagerState, file_name: &str) -> Result<(), String> {
    let path = state.images_dir.join(file_name);
    let img = image::open(&path).map_err(|e| format!("read image: {}", e))?;
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    state.mark_self_write();
    let mut cb = arboard::Clipboard::new().map_err(|e| format!("clipboard: {}", e))?;
    cb.set_image(arboard::ImageData {
        bytes: std::borrow::Cow::Owned(rgba.into_raw()),
        width: width as usize,
        height: height as usize,
    })
    .map_err(|e| format!("set_image: {}", e))
}

// ── Watcher lifecycle ────────────────────────────────────────────────────────

pub fn start_watcher(app: AppHandle, state: Arc<ClipboardManagerState>) {
    if !state.read_settings().enabled {
        return;
    }
    if state.running.swap(true, Ordering::SeqCst) {
        return; // already running
    }
    let gen = state.generation.fetch_add(1, Ordering::SeqCst) + 1;
    std::thread::spawn(move || watcher_loop(app, state, gen));
}

pub fn stop_watcher(state: &ClipboardManagerState) {
    state.running.store(false, Ordering::SeqCst);
    // Invalidate any live watcher's generation so a quick re-enable cannot
    // be "adopted" by a thread that hasn't exited yet.
    state.generation.fetch_add(1, Ordering::SeqCst);
}

/// Raw RGBA bitmap as read from the system clipboard.
struct RawImage {
    bytes: Vec<u8>,
    width: u32,
    height: u32,
}

enum Captured {
    /// Text with an optional attached image (mixed clipboard, e.g. spreadsheet selection)
    Text { text: String, attached: Option<RawImage> },
    Image(RawImage),
    Files(Vec<String>),
}

impl Captured {
    fn hash(&self) -> String {
        match self {
            // Attached image does not take part in dedup — the text identity
            // decides; repeated copies of the same text bump instead of
            // re-storing (and re-encoding) the accompanying bitmap.
            Captured::Text { text, .. } => hash_text(text),
            Captured::Image(raw) => sha256_hex(&raw.bytes),
            Captured::Files(paths) => hash_text(&paths.join("\n")),
        }
    }
}

fn watcher_loop(app: AppHandle, state: Arc<ClipboardManagerState>, gen: u64) {
    let alive = || state.is_running() && state.generation.load(Ordering::SeqCst) == gen;
    let mut clipboard = match arboard::Clipboard::new() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[ClipboardManager] failed to init clipboard: {}", e);
            state.running.store(false, Ordering::SeqCst);
            return;
        }
    };

    // Windows: event-driven wake via AddClipboardFormatListener (falls back to
    // polling automatically when unavailable). macOS/Linux: fixed 500ms poll.
    #[cfg(target_os = "windows")]
    let listener_rx = win_source::start_clipboard_listener();

    // Seed last_hash with current content so stale clipboard isn't captured
    if let Some(current) = read_clipboard(&mut clipboard, &state) {
        state.set_last_hash(&current.hash());
    }

    while alive() {
        #[cfg(target_os = "windows")]
        {
            // Wait for an OS change event; timeout acts as a low-freq safety poll
            // (only relevant if AddClipboardFormatListener failed to register)
            let _ = listener_rx.recv_timeout(Duration::from_millis(1000));
        }
        #[cfg(not(target_os = "windows"))]
        std::thread::sleep(Duration::from_millis(500));

        if !alive() {
            break;
        }
        let Some(captured) = read_clipboard(&mut clipboard, &state) else {
            continue;
        };
        let hash = captured.hash();
        if state.in_self_write_window() {
            // Our own write — remember it so it isn't re-captured later
            state.set_last_hash(&hash);
            continue;
        }
        if state.last_hash_matches(&hash) {
            continue;
        }
        state.set_last_hash(&hash);
        ingest(&app, &state, captured, hash);
    }
}

/// Read the current clipboard content (files > text > image priority).
/// Text captures additionally probe for an accompanying bitmap so mixed
/// copies (spreadsheet selections, browser images with URL text, ...) keep
/// both parts; the image is stored as an attachment of the text entry.
fn read_clipboard(cb: &mut arboard::Clipboard, state: &ClipboardManagerState) -> Option<Captured> {
    let settings = state.read_settings();

    #[cfg(target_os = "windows")]
    {
        // Apps that mark content confidential (e.g. password managers) set the
        // "Clipboard Viewer Ignore" format — respect it unconditionally.
        if win_source::clipboard_viewer_ignore_set() {
            return None;
        }
        if settings.capture_files {
            if let Some(files) = win_source::clipboard_file_paths() {
                if !files.is_empty() {
                    return Some(Captured::Files(files));
                }
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    let _ = &settings;

    if let Ok(text) = cb.get_text() {
        if !text.trim().is_empty() {
            let attached = if settings.capture_images {
                cb.get_image().ok().and_then(|img| sanitize_attached(img))
            } else {
                None
            };
            return Some(Captured::Text { text, attached });
        }
    }
    if settings.capture_images {
        if let Ok(img) = cb.get_image() {
            return Some(Captured::Image(RawImage {
                bytes: img.bytes.to_vec(),
                width: img.width as u32,
                height: img.height as u32,
            }));
        }
    }
    None
}

/// Attached-image guard rails: drop icon-sized bitmaps (file icons that ride
/// along with path text on macOS/Linux) and absurdly large frames (raw RGBA
/// memory = w*h*4, capped at 200MB to keep the watcher thread safe).
fn sanitize_attached(img: arboard::ImageData<'_>) -> Option<RawImage> {
    let (width, height) = (img.width as u32, img.height as u32);
    if width < 64 || height < 64 {
        return None;
    }
    if (width as u64) * (height as u64) * 4 > 200 * 1024 * 1024 {
        return None;
    }
    Some(RawImage { bytes: img.bytes.to_vec(), width, height })
}

fn capture_source() -> (Option<String>, Option<String>) {
    #[cfg(target_os = "windows")]
    {
        let app_name = win_source::foreground_process_name();
        let title = win_source::foreground_window_title();
        (
            if app_name.is_empty() { None } else { Some(app_name) },
            if title.is_empty() { None } else { Some(title) },
        )
    }
    #[cfg(not(target_os = "windows"))]
    (None, None)
}

fn is_ignored_app(app_name: &str, settings: &ClipboardSettings) -> bool {
    let lower = app_name.to_ascii_lowercase();
    settings
        .ignored_apps
        .iter()
        .any(|ignored| lower == ignored.to_ascii_lowercase())
}

// ── Ingestion pipeline ───────────────────────────────────────────────────────

fn ingest(app: &AppHandle, state: &ClipboardManagerState, captured: Captured, hash: String) {
    let settings = state.read_settings();
    let (source_app, source_title) = capture_source();
    if let Some(name) = &source_app {
        if is_ignored_app(name, &settings) {
            return;
        }
    }
    let now = now_ms();
    let conn = &mut *state.db.lock().unwrap();

    match captured {
        Captured::Text { text, attached } => {
            ingest_text(app, state, conn, text, attached, hash, source_app, source_title, &settings, now)
        }
        Captured::Image(raw) => {
            ingest_image(app, state, conn, raw.bytes, raw.width, raw.height, source_app, source_title, &settings, now)
        }
        Captured::Files(paths) => {
            ingest_files(app, conn, paths, source_app, source_title, now)
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn ingest_text(
    app: &AppHandle,
    state: &ClipboardManagerState,
    conn: &Connection,
    text: String,
    attached: Option<RawImage>,
    hash: String,
    source_app: Option<String>,
    source_title: Option<String>,
    settings: &ClipboardSettings,
    now: i64,
) {
    // Same content copied again -> just bump last_used_at
    if let Ok(Some(existing)) = db::find_recent_same_hash(conn, &hash, DEDUP_WINDOW_MS, now) {
        let _ = db::touch_clip(conn, &existing.id, now);
        let _ = app.emit(
            EVENT_HISTORY_CHANGED,
            serde_json::json!({"action": "touched", "id": existing.id, "clipType": existing.clip_type}),
        );
        return;
    }

    // Size cap: truncate oversized text
    let content = if text.len() > settings.max_text_bytes {
        truncate_bytes(&text, settings.max_text_bytes).to_string()
    } else {
        text
    };

    let mut category = classifier::classify_text(&content).to_string();
    let is_secret = secret_detector::contains_secret(&content);

    // Automation rules may rewrite content/category or spawn extra clips
    let mut content = content;
    let mut extras: Vec<(String, String)> = Vec::new();
    apply_rules(app, conn, &mut content, &mut category, &mut extras);
    if is_secret {
        category = "secret".into();
    }

    let preview = if is_secret {
        "••••••••".to_string()
    } else {
        truncate_chars(&content, PREVIEW_CHARS)
    };
    let mut is_encrypted = false;
    let stored = if is_secret && settings.encrypt_secrets {
        match crypto::encrypt(&content) {
            Ok(enc) => {
                is_encrypted = true;
                enc
            }
            Err(e) => {
                eprintln!("[ClipboardManager] encrypt failed: {}", e);
                content.clone()
            }
        }
    } else {
        content.clone()
    };

    let id = uuid::Uuid::new_v4().to_string();

    // Attached image (mixed text+image copy). Skipped for secrets: the
    // accompanying bitmap may contain the same sensitive data and attached
    // images are NOT encrypted at rest. Oversized/failed encodes degrade
    // silently — the text entry is still stored without attachment.
    let mut attached_image_path: Option<String> = None;
    let mut attached_thumb_path: Option<String> = None;
    let mut attached_size: i64 = 0;
    if let Some(raw) = attached {
        if !is_secret {
            if let Some(stored) = save_attached_image(state, &id, raw, settings) {
                attached_image_path = Some(stored.file_name);
                attached_thumb_path = Some(stored.thumb_name);
                attached_size = stored.png_len as i64;
            }
        }
    }

    let clip = ClipEntry {
        id,
        clip_type: "text".into(),
        category,
        content: stored,
        preview,
        thumbnail_path: attached_thumb_path,
        attached_image_path,
        source_app,
        source_title,
        is_pinned: false,
        is_secret,
        is_encrypted,
        copy_count: 0,
        created_at: now,
        last_used_at: None,
        size: content.len() as i64 + attached_size,
    };
    if let Err(e) = db::insert_clip(conn, &clip) {
        eprintln!("[ClipboardManager] insert failed: {}", e);
        return;
    }

    for (extra_content, extra_category) in extras {
        let extra_preview = truncate_chars(&extra_content, PREVIEW_CHARS);
        let extra = ClipEntry {
            id: uuid::Uuid::new_v4().to_string(),
            clip_type: "text".into(),
            category: extra_category,
            content: extra_content.clone(),
            preview: extra_preview,
            thumbnail_path: None,
            attached_image_path: None,
            source_app: clip.source_app.clone(),
            source_title: clip.source_title.clone(),
            is_pinned: false,
            is_secret: false,
            is_encrypted: false,
            copy_count: 0,
            created_at: now,
            last_used_at: None,
            size: extra_content.len() as i64,
        };
        let _ = db::insert_clip(conn, &extra);
    }

    cleanup_after_insert(state, conn, settings);

    // Backward-compatible plain-text event + structured history event
    let _ = app.emit(EVENT_CLIP_CHANGED, &content);
    let _ = app.emit(
        EVENT_HISTORY_CHANGED,
        serde_json::json!({"action": "added", "id": clip.id, "clipType": clip.clip_type}),
    );
}

/// Encode and persist the attached image of a text clip.
/// Returns the stored file names + encoded size, or None to degrade silently
/// (oversized beyond `max_image_bytes`, encode failure, disk error).
struct StoredAttached {
    file_name: String,
    thumb_name: String,
    png_len: usize,
}

fn save_attached_image(
    state: &ClipboardManagerState,
    id: &str,
    raw: RawImage,
    settings: &ClipboardSettings,
) -> Option<StoredAttached> {
    let rgba = image::RgbaImage::from_raw(raw.width, raw.height, raw.bytes)?;
    let full = image::DynamicImage::ImageRgba8(rgba);
    let mut png: Vec<u8> = Vec::new();
    full.write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
        .ok()?;
    if png.len() as u64 > settings.max_image_bytes {
        return None;
    }
    let thumb = full.thumbnail(200, 150);
    let mut thumb_png: Vec<u8> = Vec::new();
    thumb
        .write_to(&mut std::io::Cursor::new(&mut thumb_png), image::ImageFormat::Png)
        .ok()?;

    let file_name = format!("{}.png", id);
    let thumb_name = format!("{}_thumb.png", id);
    std::fs::write(state.images_dir.join(&file_name), &png).ok()?;
    let _ = std::fs::write(state.images_dir.join(&thumb_name), &thumb_png);
    Some(StoredAttached { file_name, thumb_name, png_len: png.len() })
}

#[allow(clippy::too_many_arguments)]
fn ingest_image(
    app: &AppHandle,
    state: &ClipboardManagerState,
    conn: &Connection,
    bytes: Vec<u8>,
    width: u32,
    height: u32,
    source_app: Option<String>,
    source_title: Option<String>,
    settings: &ClipboardSettings,
    now: i64,
) {
    let Some(rgba) = image::RgbaImage::from_raw(width, height, bytes) else {
        return;
    };
    let full = image::DynamicImage::ImageRgba8(rgba);
    let thumb = full.thumbnail(200, 150);

    let mut png: Vec<u8> = Vec::new();
    if full
        .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
        .is_err()
    {
        return;
    }
    if png.len() as u64 > settings.max_image_bytes {
        emit_toast(app, "imageTooLarge");
        return;
    }
    let mut thumb_png: Vec<u8> = Vec::new();
    if thumb
        .write_to(&mut std::io::Cursor::new(&mut thumb_png), image::ImageFormat::Png)
        .is_err()
    {
        return;
    }

    let id = uuid::Uuid::new_v4().to_string();
    let file_name = format!("{}.png", id);
    let thumb_name = format!("{}_thumb.png", id);
    if std::fs::write(state.images_dir.join(&file_name), &png).is_err() {
        return;
    }
    let _ = std::fs::write(state.images_dir.join(&thumb_name), &thumb_png);

    let clip = ClipEntry {
        id,
        clip_type: "image".into(),
        category: "general".into(),
        content: file_name,
        preview: format!("{}×{} image", width, height),
        thumbnail_path: Some(thumb_name),
        attached_image_path: None,
        source_app,
        source_title,
        is_pinned: false,
        is_secret: false,
        is_encrypted: false,
        copy_count: 0,
        created_at: now,
        last_used_at: None,
        size: png.len() as i64,
    };
    if let Err(e) = db::insert_clip(conn, &clip) {
        eprintln!("[ClipboardManager] insert image failed: {}", e);
        return;
    }
    cleanup_after_insert(state, conn, settings);
    let _ = app.emit(
        EVENT_HISTORY_CHANGED,
        serde_json::json!({"action": "added", "id": clip.id, "clipType": "image"}),
    );
}

#[allow(clippy::too_many_arguments)]
fn ingest_files(
    app: &AppHandle,
    conn: &Connection,
    paths: Vec<String>,
    source_app: Option<String>,
    source_title: Option<String>,
    now: i64,
) {
    let content = serde_json::to_string(&paths).unwrap_or_else(|_| "[]".into());
    let clip = ClipEntry {
        id: uuid::Uuid::new_v4().to_string(),
        clip_type: "file".into(),
        category: "file-path".into(),
        content: content.clone(),
        preview: truncate_chars(paths.first().map(|s| s.as_str()).unwrap_or(""), PREVIEW_CHARS),
        thumbnail_path: None,
        attached_image_path: None,
        source_app,
        source_title,
        is_pinned: false,
        is_secret: false,
        is_encrypted: false,
        copy_count: 0,
        created_at: now,
        last_used_at: None,
        size: content.len() as i64,
    };
    if let Err(e) = db::insert_clip(conn, &clip) {
        eprintln!("[ClipboardManager] insert files failed: {}", e);
        return;
    }
    let _ = app.emit(
        EVENT_HISTORY_CHANGED,
        serde_json::json!({"action": "added", "id": clip.id, "clipType": "file"}),
    );
}

/// Lazy cleanup after each insert: history cap, retention days, image cache cap.
fn cleanup_after_insert(state: &ClipboardManagerState, conn: &Connection, settings: &ClipboardSettings) {
    let removed = db::enforce_limits(conn, settings.max_history, settings.retention_days, now_ms())
        .unwrap_or_default();
    for clip in &removed {
        remove_clip_files(&state.images_dir, clip);
    }
    if settings.image_cache_limit_mb > 0 {
        let limit = settings.image_cache_limit_mb * 1024 * 1024;
        let evicted = db::enforce_image_cache_limit(conn, limit, &state.images_dir).unwrap_or_default();
        for clip in &evicted {
            remove_clip_files(&state.images_dir, clip);
        }
    }
}

/// Delete the image/thumbnail files belonging to a clip (used on delete/clear).
/// Handles both full image entries and attached images of text entries.
pub fn remove_clip_files(images_dir: &Path, clip: &ClipEntry) {
    if clip.clip_type == "image" {
        let _ = std::fs::remove_file(images_dir.join(&clip.content));
        if let Some(thumb) = &clip.thumbnail_path {
            let _ = std::fs::remove_file(images_dir.join(thumb));
        }
        return;
    }
    remove_attached_files(images_dir, clip);
}

/// Delete a text clip's attached image + its thumbnail (also used by the
/// image-cache eviction when stripping attachments from old entries).
pub fn remove_attached_files(images_dir: &Path, clip: &ClipEntry) {
    if let Some(attached) = &clip.attached_image_path {
        let _ = std::fs::remove_file(images_dir.join(attached));
    }
    if let Some(thumb) = &clip.thumbnail_path {
        let _ = std::fs::remove_file(images_dir.join(thumb));
    }
}

fn emit_toast(app: &AppHandle, message_key: &str) {
    let _ = app.emit(EVENT_TOAST, serde_json::json!({"messageKey": message_key}));
}

// ── Automation rules ─────────────────────────────────────────────────────────

/// Apply enabled rules to a freshly captured text clip. May mutate content /
/// category and push (content, category) pairs for extra "copy-as" clips.
fn apply_rules(
    app: &AppHandle,
    conn: &Connection,
    content: &mut String,
    category: &mut String,
    extras: &mut Vec<(String, String)>,
) {
    let rules = match db::list_rules(conn) {
        Ok(r) => r,
        Err(_) => return,
    };
    for rule in rules.into_iter().filter(|r| r.enabled) {
        if !rule_matches(&rule, content, category) {
            continue;
        }
        let config: serde_json::Value = rule
            .action_config
            .as_deref()
            .and_then(|raw| serde_json::from_str(raw).ok())
            .unwrap_or(serde_json::Value::Null);

        match rule.action_type.as_str() {
            "classify" => {
                if let Some(cat) = config.get("category").and_then(|v| v.as_str()) {
                    if classifier::CATEGORIES.contains(&cat) {
                        *category = cat.to_string();
                    }
                }
            }
            "transform" => match config.get("mode").and_then(|v| v.as_str()) {
                Some("strip-tracking") => *content = strip_tracking_params(content),
                Some("trim") => *content = content.trim().to_string(),
                Some("lowercase") => *content = content.to_lowercase(),
                Some("uppercase") => *content = content.to_uppercase(),
                _ => {}
            },
            "copy-as" => {
                if config.get("mode").and_then(|v| v.as_str()) == Some("json-format") {
                    if let Ok(value) = serde_json::from_str::<serde_json::Value>(content) {
                        if let Ok(pretty) = serde_json::to_string_pretty(&value) {
                            extras.push((pretty, "json".into()));
                        }
                    }
                }
            }
            "notify" => {
                let _ = app.emit(EVENT_RULE_NOTIFY, serde_json::json!({"ruleName": rule.name}));
            }
            _ => {}
        }
    }
}

fn rule_matches(rule: &db::RuleEntry, content: &str, category: &str) -> bool {
    match rule.trigger_type.as_str() {
        "contains" => content.contains(&rule.trigger_pattern),
        "regex" => regex::Regex::new(&rule.trigger_pattern)
            .map(|re| re.is_match(content))
            .unwrap_or(false),
        "category" => category == rule.trigger_pattern,
        _ => false,
    }
}

const TRACKING_KEYS: &[&str] = &[
    "ref", "fbclid", "gclid", "msclkid", "igshid", "yclid", "twclid", "dclid", "mc_cid",
    "mc_eid", "_hsenc", "_hsmi", "spm", "share_token",
];

/// Remove common tracking parameters from a URL (utm_*, fbclid, ...).
fn strip_tracking_params(url: &str) -> String {
    let Some(q_pos) = url.find('?') else {
        return url.to_string();
    };
    let base = &url[..q_pos];
    let rest = &url[q_pos + 1..];
    let (query, fragment) = match rest.find('#') {
        Some(p) => (&rest[..p], Some(&rest[p..])),
        None => (rest, None),
    };
    let kept: Vec<&str> = query
        .split('&')
        .filter(|kv| {
            if kv.is_empty() {
                return false;
            }
            let key = kv.split('=').next().unwrap_or("").to_ascii_lowercase();
            !key.starts_with("utm_") && !TRACKING_KEYS.contains(&key.as_str())
        })
        .collect();
    let mut out = base.to_string();
    if !kept.is_empty() {
        out.push('?');
        out.push_str(&kept.join("&"));
    }
    if let Some(frag) = fragment {
        out.push_str(frag);
    }
    out
}

// ── Legacy compatibility ─────────────────────────────────────────────────────
// Kept so the existing `start_clipboard_watcher` / `stop_clipboard_watcher`
// IPC commands keep compiling until they are rewired to the manager engine.
// Not started automatically; the manager engine above is the sole listener.

pub struct ClipboardState {
    pub running: Arc<Mutex<bool>>,
    last_text: Arc<Mutex<String>>,
}

impl ClipboardState {
    pub fn new() -> Self {
        Self {
            running: Arc::new(Mutex::new(false)),
            last_text: Arc::new(Mutex::new(String::new())),
        }
    }
}

pub fn start_clipboard_watcher(app: AppHandle, state: Arc<ClipboardState>) {
    {
        let mut running = state.running.lock().unwrap();
        if *running {
            return;
        }
        *running = true;
    }
    let running = state.running.clone();
    let last_text = state.last_text.clone();
    std::thread::spawn(move || {
        let mut clipboard = match arboard::Clipboard::new() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[A7Box] Failed to init clipboard: {}", e);
                return;
            }
        };
        while *running.lock().unwrap() {
            if let Ok(text) = clipboard.get_text() {
                let mut prev = last_text.lock().unwrap();
                if text != *prev && !text.is_empty() {
                    *prev = text.clone();
                    let _ = app.emit("clipboard-changed", &text);
                }
            }
            std::thread::sleep(Duration::from_millis(500));
        }
    });
}

pub fn stop_clipboard_watcher(state: &ClipboardState) {
    let mut running = state.running.lock().unwrap();
    *running = false;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_stable() {
        assert_eq!(hash_text("hello"), hash_text("hello"));
        assert_ne!(hash_text("hello"), hash_text("world"));
    }

    #[test]
    fn test_truncate_bytes_char_boundary() {
        let s = "中文内容abc";
        let t = truncate_bytes(s, 7); // would cut inside a char
        assert!(t.len() <= 7);
        assert!(t.chars().count() >= 2);
    }

    #[test]
    fn test_strip_tracking() {
        let url = "https://example.com/page?utm_source=x&id=42&fbclid=abc#frag";
        assert_eq!(strip_tracking_params(url), "https://example.com/page?id=42#frag");
        assert_eq!(strip_tracking_params("https://a.com/?utm_a=1"), "https://a.com/");
        assert_eq!(strip_tracking_params("https://a.com/p"), "https://a.com/p");
    }

    #[test]
    fn test_settings_defaults_merge() {
        let partial = r#"{"maxHistory": 100}"#;
        let s: ClipboardSettings = serde_json::from_str(partial).unwrap();
        assert_eq!(s.max_history, 100);
        assert_eq!(s.retention_days, 30); // default filled
    }
}
