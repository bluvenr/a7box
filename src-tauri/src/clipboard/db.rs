// A7Box Clipboard Manager — SQLite Storage Engine
// Tables: clips (+ FTS5 trigram index), snippets, rules.
// Chinese full-text search requires the `trigram` tokenizer (default unicode61
// cannot segment CJK text). Queries shorter than 3 chars fall back to LIKE.

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

/// A single clipboard history entry
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipEntry {
    pub id: String,
    pub clip_type: String, // text | image | file
    pub category: String,  // general | url | code | json | email | file-path | color | secret
    pub content: String,   // text content / image file path / JSON array of file paths
    pub preview: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_path: Option<String>,
    /// Attached image that came with copied text (mixed text+image clipboard,
    /// e.g. a spreadsheet selection). File name inside images_dir.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attached_image_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_app: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_title: Option<String>,
    pub is_pinned: bool,
    pub is_secret: bool,
    pub is_encrypted: bool,
    pub copy_count: u32,
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_used_at: Option<i64>,
    pub size: i64,
}

/// Reusable text snippet with optional {{variable}} placeholders
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnippetEntry {
    pub id: String,
    pub name: String,
    pub content: String,
    pub variables: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shortcut: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    pub created_at: i64,
}

/// Automation rule applied when a new clip is captured
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleEntry {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub trigger_pattern: String,
    pub trigger_type: String, // regex | contains | category
    pub action_type: String,  // classify | transform | copy-as | notify
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action_config: Option<String>, // JSON
    pub priority: i32,
}

/// History statistics for the management page header
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipStats {
    pub total: u64,
    pub pinned: u64,
    pub secrets: u64,
    pub by_type: Vec<(String, u64)>,
    pub by_category: Vec<(String, u64)>,
}

pub fn open_db(path: &std::path::Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let conn = Connection::open(path).map_err(|e| format!("open db: {}", e))?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "synchronous", "NORMAL")
        .map_err(|e| e.to_string())?;
    init_schema(&conn)?;
    Ok(conn)
}

fn init_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS clips (
            id TEXT PRIMARY KEY,
            clip_type TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'general',
            content TEXT NOT NULL,
            preview TEXT NOT NULL DEFAULT '',
            thumbnail_path TEXT,
            source_app TEXT,
            source_title TEXT,
            is_pinned INTEGER NOT NULL DEFAULT 0,
            is_secret INTEGER NOT NULL DEFAULT 0,
            is_encrypted INTEGER NOT NULL DEFAULT 0,
            copy_count INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            last_used_at INTEGER,
            size INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_clips_created ON clips(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_clips_pinned ON clips(is_pinned);

        CREATE TABLE IF NOT EXISTS snippets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            content TEXT NOT NULL,
            variables TEXT NOT NULL DEFAULT '[]',
            shortcut TEXT,
            category TEXT,
            created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS rules (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            trigger_pattern TEXT NOT NULL,
            trigger_type TEXT NOT NULL,
            action_type TEXT NOT NULL,
            action_config TEXT,
            priority INTEGER NOT NULL DEFAULT 0
        );",
    )
    .map_err(|e| format!("init schema: {}", e))?;

    // FTS5 virtual table — trigram tokenizer is mandatory for CJK substring search.
    // Creation is attempted separately so a missing FTS5 build degrades gracefully.
    let has_fts: bool = conn
        .prepare("SELECT clip_id FROM clips_fts LIMIT 1")
        .is_ok();
    if !has_fts {
        if let Err(e) = conn.execute_batch(
            "CREATE VIRTUAL TABLE clips_fts USING fts5(
                clip_id UNINDEXED,
                content, preview, source_app, source_title,
                tokenize = 'trigram'
            );",
        ) {
            eprintln!("[A7Box][CM] FTS5 unavailable, search falls back to LIKE: {}", e);
        }
    }

    // Migration: attached_image_path (text clips with an accompanying image).
    // Column probe + ALTER keeps pre-existing databases upgradeable in place.
    let has_attached: bool = conn
        .prepare("SELECT attached_image_path FROM clips LIMIT 1")
        .is_ok();
    if !has_attached {
        conn.execute_batch("ALTER TABLE clips ADD COLUMN attached_image_path TEXT;")
            .map_err(|e| format!("migrate clips: {}", e))?;
    }
    Ok(())
}

fn has_fts(conn: &Connection) -> bool {
    conn.prepare("SELECT clip_id FROM clips_fts LIMIT 1").is_ok()
}

fn row_to_clip(row: &Row<'_>) -> rusqlite::Result<ClipEntry> {
    Ok(ClipEntry {
        id: row.get(0)?,
        clip_type: row.get(1)?,
        category: row.get(2)?,
        content: row.get(3)?,
        preview: row.get(4)?,
        thumbnail_path: row.get(5)?,
        source_app: row.get(6)?,
        source_title: row.get(7)?,
        is_pinned: row.get::<_, i32>(8)? != 0,
        is_secret: row.get::<_, i32>(9)? != 0,
        is_encrypted: row.get::<_, i32>(10)? != 0,
        copy_count: row.get::<_, u32>(11)?,
        created_at: row.get(12)?,
        last_used_at: row.get(13)?,
        size: row.get(14)?,
        attached_image_path: row.get(15)?,
    })
}

const CLIP_COLS: &str = "id, clip_type, category, content, preview, thumbnail_path, source_app, source_title, is_pinned, is_secret, is_encrypted, copy_count, created_at, last_used_at, size, attached_image_path";

pub fn insert_clip(conn: &Connection, clip: &ClipEntry) -> Result<(), String> {
    conn.execute(
        "INSERT INTO clips (id, clip_type, category, content, preview, thumbnail_path, source_app, source_title, is_pinned, is_secret, is_encrypted, copy_count, created_at, last_used_at, size, attached_image_path)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![
            clip.id,
            clip.clip_type,
            clip.category,
            clip.content,
            clip.preview,
            clip.thumbnail_path,
            clip.source_app,
            clip.source_title,
            clip.is_pinned as i32,
            clip.is_secret as i32,
            clip.is_encrypted as i32,
            clip.copy_count,
            clip.created_at,
            clip.last_used_at,
            clip.size,
            clip.attached_image_path,
        ],
    )
    .map_err(|e| format!("insert clip: {}", e))?;

    if has_fts(conn) {
        let _ = conn.execute(
            "INSERT INTO clips_fts (clip_id, content, preview, source_app, source_title) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![clip.id, clip.content, clip.preview, clip.source_app, clip.source_title],
        );
    }
    Ok(())
}

/// List clips with optional category filter and FTS/LIKE search.
/// Pinned clips always come first, ordered by created_at desc.
pub fn list_clips(
    conn: &Connection,
    limit: i64,
    offset: i64,
    category: Option<&str>,
    clip_type: Option<&str>,
    search: Option<&str>,
    only_pinned: bool,
) -> Result<Vec<ClipEntry>, String> {
    // Resolve the id set matched by the search query (if any)
    let matched_ids: Option<Vec<String>> = match search.map(str::trim).filter(|s| !s.is_empty()) {
        Some(q) => Some(search_ids(conn, q)?),
        None => None,
    };

    let mut sql = format!("SELECT {} FROM clips WHERE 1=1", CLIP_COLS);
    let mut args: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if only_pinned {
        sql.push_str(" AND is_pinned = 1");
    }
    if let Some(cat) = category.filter(|c| !c.is_empty() && *c != "all") {
        sql.push_str(" AND category = ?");
        args.push(Box::new(cat.to_string()));
    }
    if let Some(t) = clip_type.filter(|t| !t.is_empty() && *t != "all") {
        sql.push_str(" AND clip_type = ?");
        args.push(Box::new(t.to_string()));
    }
    if let Some(ids) = &matched_ids {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let placeholders = vec!["?"; ids.len()].join(",");
        sql.push_str(&format!(" AND id IN ({})", placeholders));
        for id in ids {
            args.push(Box::new(id.clone()));
        }
    }
    sql.push_str(" ORDER BY is_pinned DESC, created_at DESC LIMIT ? OFFSET ?");
    args.push(Box::new(limit));
    args.push(Box::new(offset));

    let refs: Vec<&dyn rusqlite::types::ToSql> = args.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(refs.as_slice(), row_to_clip)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Full-text search over clip contents. Uses FTS5 trigram when the query is at
/// least 3 characters; otherwise falls back to LIKE (trigram requires >= 3).
fn search_ids(conn: &Connection, query: &str) -> Result<Vec<String>, String> {
    let chars: Vec<char> = query.chars().collect();
    if has_fts(conn) && chars.len() >= 3 {
        // Escape double quotes for an FTS5 phrase query (substring semantics with trigram)
        let escaped = query.replace('"', "\"\"");
        let match_expr = format!("\"{}\"", escaped);
        let mut stmt = conn
            .prepare("SELECT clip_id FROM clips_fts WHERE clips_fts MATCH ?1 ORDER BY rank LIMIT 500")
            .map_err(|e| e.to_string())?;
        let ids: Vec<String> = stmt
            .query_map(params![match_expr], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        return Ok(ids);
    }
    let like = format!("%{}%", query.replace('%', "\\%").replace('_', "\\_"));
    let mut stmt = conn
        .prepare(
            "SELECT id FROM clips WHERE content LIKE ?1 ESCAPE '\\' OR preview LIKE ?1 ESCAPE '\\'
             OR source_app LIKE ?1 ESCAPE '\\' OR source_title LIKE ?1 ESCAPE '\\' LIMIT 500",
        )
        .map_err(|e| e.to_string())?;
    let ids: Result<Vec<String>, _> = stmt
        .query_map(params![like], |r| r.get(0))
        .and_then(|rows| rows.collect());
    ids.map_err(|e| e.to_string())
}

pub fn get_clip(conn: &Connection, id: &str) -> Result<Option<ClipEntry>, String> {
    let sql = format!("SELECT {} FROM clips WHERE id = ?1", CLIP_COLS);
    conn.query_row(&sql, params![id], row_to_clip)
        .optional()
        .map_err(|e| e.to_string())
}

#[allow(dead_code)]
pub fn update_content(conn: &Connection, id: &str, content: &str, preview: &str, category: &str, is_secret: bool, is_encrypted: bool) -> Result<(), String> {
    conn.execute(
        "UPDATE clips SET content = ?2, preview = ?3, category = ?4, is_secret = ?5, is_encrypted = ?6 WHERE id = ?1",
        params![id, content, preview, category, is_secret as i32, is_encrypted as i32],
    )
    .map_err(|e| e.to_string())?;
    if has_fts(conn) {
        let _ = conn.execute("DELETE FROM clips_fts WHERE clip_id = ?1", params![id]);
        let _ = conn.execute(
            "INSERT INTO clips_fts (clip_id, content, preview, source_app, source_title)
             SELECT id, content, preview, source_app, source_title FROM clips WHERE id = ?1",
            params![id],
        );
    }
    Ok(())
}

/// Mark a clip as used just now (bumps copy_count + last_used_at)
pub fn touch_clip(conn: &Connection, id: &str, now_ms: i64) -> Result<(), String> {
    conn.execute(
        "UPDATE clips SET copy_count = copy_count + 1, last_used_at = ?2 WHERE id = ?1",
        params![id, now_ms],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

pub fn set_pinned(conn: &Connection, id: &str, pinned: bool) -> Result<(), String> {
    conn.execute(
        "UPDATE clips SET is_pinned = ?2 WHERE id = ?1",
        params![id, pinned as i32],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

/// Delete one clip, returning it (so callers can clean up image files)
pub fn delete_clip(conn: &Connection, id: &str) -> Result<Option<ClipEntry>, String> {
    let clip = get_clip(conn, id)?;
    if clip.is_some() {
        remove_clip_rows(conn, id)?;
    }
    Ok(clip)
}

/// Delete many clips, returning them for file cleanup
pub fn delete_clips(conn: &Connection, ids: &[String]) -> Result<Vec<ClipEntry>, String> {
    let mut removed = Vec::new();
    for id in ids {
        if let Some(clip) = get_clip(conn, id)? {
            remove_clip_rows(conn, id)?;
            removed.push(clip);
        }
    }
    Ok(removed)
}

fn remove_clip_rows(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM clips WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    if has_fts(conn) {
        let _ = conn.execute("DELETE FROM clips_fts WHERE clip_id = ?1", params![id]);
    }
    Ok(())
}

/// Clear history; when keep_pinned is true pinned clips survive.
/// Returns the removed clips for image-file cleanup.
pub fn clear_history(conn: &Connection, keep_pinned: bool) -> Result<Vec<ClipEntry>, String> {
    let where_clause = if keep_pinned { " WHERE is_pinned = 0" } else { "" };
    let sql = format!("SELECT {} FROM clips{}", CLIP_COLS, where_clause);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let removed: Vec<ClipEntry> = stmt
        .query_map([], row_to_clip)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let del_sql = format!("DELETE FROM clips{}", where_clause);
    conn.execute(&del_sql, []).map_err(|e| e.to_string())?;
    if has_fts(conn) && !removed.is_empty() {
        let placeholders = vec!["?"; removed.len()].join(",");
        let ids: Vec<&str> = removed.iter().map(|c| c.id.as_str()).collect();
        let _ = conn.execute(
            &format!("DELETE FROM clips_fts WHERE clip_id IN ({})", placeholders),
            rusqlite::params_from_iter(ids),
        );
    }
    Ok(removed)
}

/// Enforce max history count + retention days. Returns removed (non-pinned) clips.
pub fn enforce_limits(conn: &Connection, max_history: u64, retention_days: u64, now_ms: i64) -> Result<Vec<ClipEntry>, String> {
    let mut removed = Vec::new();

    if retention_days > 0 {
        let cutoff = now_ms - (retention_days as i64) * 86_400_000;
        let sql = format!("SELECT {} FROM clips WHERE is_pinned = 0 AND created_at < ?1", CLIP_COLS);
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let expired: Vec<ClipEntry> = stmt
            .query_map(params![cutoff], row_to_clip)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        for clip in &expired {
            remove_clip_rows(conn, &clip.id)?;
        }
        removed.extend(expired);
    }

    if max_history > 0 {
        let total: u64 = conn
            .query_row("SELECT COUNT(*) FROM clips", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if total > max_history {
            let overflow = total - max_history;
            let sql = format!(
                "SELECT {} FROM clips WHERE is_pinned = 0 ORDER BY created_at ASC LIMIT ?1",
                CLIP_COLS
            );
            let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
            let oldest: Vec<ClipEntry> = stmt
                .query_map(params![overflow as i64], row_to_clip)
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            for clip in &oldest {
                remove_clip_rows(conn, &clip.id)?;
            }
            removed.extend(oldest);
        }
    }
    Ok(removed)
}

/// Evict until total image bytes <= limit. Two phases per round:
///   1. strip attached images from the oldest non-pinned TEXT clips (the text
///      record survives — the image is only supplementary)
///   2. evict the oldest non-pinned IMAGE clips entirely
/// Returns removed clips (phase 2 only; stripped files are deleted in place).
pub fn enforce_image_cache_limit(conn: &Connection, limit_bytes: u64, images_dir: &std::path::Path) -> Result<Vec<ClipEntry>, String> {
    let mut removed = Vec::new();
    loop {
        let mut total: u64 = 0;
        if let Ok(entries) = std::fs::read_dir(images_dir) {
            for e in entries.flatten() {
                if let Ok(meta) = e.metadata() {
                    total += meta.len();
                }
            }
        }
        if total <= limit_bytes {
            break;
        }
        // Phase 1: strip the oldest non-pinned attached image (keeps the text entry)
        if strip_oldest_attached_image(conn, images_dir)? {
            continue;
        }
        // Phase 2: remove the oldest non-pinned image clip
        let sql = format!("SELECT {} FROM clips WHERE clip_type = 'image' AND is_pinned = 0 ORDER BY created_at ASC LIMIT 1", CLIP_COLS);
        let oldest: Option<ClipEntry> = conn
            .query_row(&sql, [], row_to_clip)
            .optional()
            .map_err(|e| e.to_string())?;
        match oldest {
            Some(clip) => {
                remove_clip_rows(conn, &clip.id)?;
                // Delete the files immediately so the next size check observes
                // the freed space; otherwise this loop would evict every
                // non-pinned image row before any file is actually removed.
                crate::clipboard::remove_clip_files(images_dir, &clip);
                removed.push(clip);
            }
            None => break, // nothing evictable; clear stray files instead
        }
    }
    Ok(removed)
}

/// Detach the attached image of the oldest non-pinned text clip.
/// Files are deleted immediately so the caller's size loop observes progress.
fn strip_oldest_attached_image(conn: &Connection, images_dir: &std::path::Path) -> Result<bool, String> {
    let sql = format!(
        "SELECT {} FROM clips WHERE attached_image_path IS NOT NULL AND is_pinned = 0 ORDER BY created_at ASC LIMIT 1",
        CLIP_COLS
    );
    let clip: Option<ClipEntry> = conn
        .query_row(&sql, [], row_to_clip)
        .optional()
        .map_err(|e| e.to_string())?;
    let Some(clip) = clip else { return Ok(false) };
    conn.execute(
        "UPDATE clips SET attached_image_path = NULL, thumbnail_path = NULL WHERE id = ?1",
        params![clip.id],
    )
    .map_err(|e| e.to_string())?;
    crate::clipboard::remove_attached_files(images_dir, &clip);
    Ok(true)
}

pub fn get_stats(conn: &Connection) -> Result<ClipStats, String> {
    let total: u64 = conn.query_row("SELECT COUNT(*) FROM clips", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    let pinned: u64 = conn.query_row("SELECT COUNT(*) FROM clips WHERE is_pinned = 1", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    let secrets: u64 = conn.query_row("SELECT COUNT(*) FROM clips WHERE is_secret = 1", [], |r| r.get(0)).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT clip_type, COUNT(*) FROM clips GROUP BY clip_type").map_err(|e| e.to_string())?;
    let by_type = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, u64>(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT category, COUNT(*) FROM clips GROUP BY category ORDER BY COUNT(*) DESC").map_err(|e| e.to_string())?;
    let by_category = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, u64>(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(ClipStats { total, pinned, secrets, by_type, by_category })
}

// ── Snippets ─────────────────────────────────────────────────────────────────

pub fn list_snippets(conn: &Connection) -> Result<Vec<SnippetEntry>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, content, variables, shortcut, category, created_at FROM snippets ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            let vars_json: String = r.get(3)?;
            Ok(SnippetEntry {
                id: r.get(0)?,
                name: r.get(1)?,
                content: r.get(2)?,
                variables: serde_json::from_str(&vars_json).unwrap_or_default(),
                shortcut: r.get(4)?,
                category: r.get(5)?,
                created_at: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn save_snippet(conn: &Connection, s: &SnippetEntry) -> Result<(), String> {
    let vars_json = serde_json::to_string(&s.variables).unwrap_or_else(|_| "[]".into());
    conn.execute(
        "INSERT INTO snippets (id, name, content, variables, shortcut, category, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET name = ?2, content = ?3, variables = ?4, shortcut = ?5, category = ?6",
        params![s.id, s.name, s.content, vars_json, s.shortcut, s.category, s.created_at],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

pub fn delete_snippet(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM snippets WHERE id = ?1", params![id])
        .map(|_| ())
        .map_err(|e| e.to_string())
}

// ── Rules ────────────────────────────────────────────────────────────────────

pub fn list_rules(conn: &Connection) -> Result<Vec<RuleEntry>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, enabled, trigger_pattern, trigger_type, action_type, action_config, priority FROM rules ORDER BY priority DESC, id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(RuleEntry {
                id: r.get(0)?,
                name: r.get(1)?,
                enabled: r.get::<_, i32>(2)? != 0,
                trigger_pattern: r.get(3)?,
                trigger_type: r.get(4)?,
                action_type: r.get(5)?,
                action_config: r.get(6)?,
                priority: r.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn save_rule(conn: &Connection, r: &RuleEntry) -> Result<(), String> {
    conn.execute(
        "INSERT INTO rules (id, name, enabled, trigger_pattern, trigger_type, action_type, action_config, priority)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET name = ?2, enabled = ?3, trigger_pattern = ?4, trigger_type = ?5, action_type = ?6, action_config = ?7, priority = ?8",
        params![r.id, r.name, r.enabled as i32, r.trigger_pattern, r.trigger_type, r.action_type, r.action_config, r.priority],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

pub fn delete_rule(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM rules WHERE id = ?1", params![id])
        .map(|_| ())
        .map_err(|e| e.to_string())
}

pub fn set_rule_enabled(conn: &Connection, id: &str, enabled: bool) -> Result<(), String> {
    conn.execute(
        "UPDATE rules SET enabled = ?2 WHERE id = ?1",
        params![id, enabled as i32],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

/// Find the most recent clip with the same content hash (used for dedup bumping).
pub fn find_recent_same_hash(conn: &Connection, hash: &str, window_ms: i64, now_ms: i64) -> Result<Option<ClipEntry>, String> {
    // Hash is stored in preview of a marker? Simpler: compare content directly for recent text clips.
    // The watcher keeps the last hash in memory; this function is a secondary guard.
    let sql = format!(
        "SELECT {} FROM clips WHERE created_at > ?1 ORDER BY created_at DESC LIMIT 1",
        CLIP_COLS
    );
    let latest: Option<ClipEntry> = conn
        .query_row(&sql, params![now_ms - window_ms], row_to_clip)
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(clip) = latest {
        let clip_hash = crate::clipboard::hash_text(&clip.content);
        if clip_hash == hash {
            return Ok(Some(clip));
        }
    }
    Ok(None)
}
