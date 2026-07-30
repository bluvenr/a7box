// A7Box Independent HTTP Service — Multi-instance Engine
// Separate from http_server (P2P web share). Each instance serves a directory
// over HTTP for LAN browsing. index.html is rendered directly; otherwise a
// lightweight directory listing is shown.

mod web_ui;

use std::fs::{self, File};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use tiny_http::{Header, Response, Server, StatusCode};

// ── Types ────────────────────────────────────────────────────────────────

/// A running HTTP server instance
struct ServerInstance {
    id: String,
    dir: PathBuf,
    port: u16,
    stop_flag: Arc<AtomicBool>,
    /// Thread handle so stop_instance can wait for the socket to be fully released.
    thread_handle: Option<thread::JoinHandle<()>>,
}

/// Public info returned to the frontend
#[derive(Clone, serde::Serialize)]
pub struct HttpInstanceInfo {
    pub id: String,
    pub port: u16,
    pub urls: Vec<String>,
    pub directory: String,
}

/// Global state holding all running instances
pub struct HttpServiceState {
    instances: Mutex<Vec<ServerInstance>>,
}

impl HttpServiceState {
    pub fn new() -> Self {
        Self {
            instances: Mutex::new(Vec::new()),
        }
    }
}

// ── Public API ───────────────────────────────────────────────────────────

/// Start a new HTTP server instance for the given directory.
/// If `port` is None, auto-allocates starting from 8080.
pub fn start_instance(
    state: &HttpServiceState,
    dir: PathBuf,
    port: Option<u16>,
) -> Result<HttpInstanceInfo, String> {
    if !dir.exists() || !dir.is_dir() {
        return Err(format!("Directory does not exist: {:?}", dir));
    }

    // Try to bind to a port
    let (server, bound_port) = bind_server(port.unwrap_or(0))?;

    // Generate unique instance ID
    let id = uuid::Uuid::new_v4().to_string();
    let stop_flag = Arc::new(AtomicBool::new(false));

    // Spawn request-handling thread
    let dir_clone = dir.clone();
    let flag_clone = stop_flag.clone();
    let thread_handle = thread::Builder::new()
        .name(format!("http-svc-{}", &id[..8]))
        .spawn(move || {
            while !flag_clone.load(Ordering::Relaxed) {
                match server.recv_timeout(std::time::Duration::from_millis(500)) {
                    Ok(Some(request)) => {
                        handle_request(request, &dir_clone);
                    }
                    Ok(None) => continue,
                    Err(e) => {
                        eprintln!("[A7Box HttpService] Server error: {}", e);
                        break;
                    }
                }
            }
            // `server` is dropped here, releasing the listening socket.
        })
        .map_err(|e| format!("Failed to spawn thread: {}", e))?;

    // Store instance
    let instance = ServerInstance {
        id: id.clone(),
        dir: dir.clone(),
        port: bound_port,
        stop_flag,
        thread_handle: Some(thread_handle),
    };
    state.instances.lock().unwrap().push(instance);

    let urls = get_local_ips()
        .iter()
        .map(|ip| format!("http://{}:{}", ip, bound_port))
        .collect();

    Ok(HttpInstanceInfo {
        id,
        port: bound_port,
        urls,
        directory: dir.to_string_lossy().to_string(),
    })
}

/// Stop an instance by ID.
/// Waits for the server thread to exit so the listening socket is fully released
/// before returning, ensuring the port is available for immediate restart.
pub fn stop_instance(state: &HttpServiceState, id: &str) -> Result<(), String> {
    let mut instances = state.instances.lock().unwrap();
    if let Some(pos) = instances.iter().position(|i| i.id == id) {
        let mut inst = instances.remove(pos);
        inst.stop_flag.store(true, Ordering::Relaxed);
        // Drop the lock before joining (thread exit doesn't need it)
        drop(instances);
        // Wait for the thread to finish and the socket to be released.
        // Max wait ≈ 500ms (the recv_timeout interval in the server loop).
        if let Some(handle) = inst.thread_handle.take() {
            let _ = handle.join();
        }
        Ok(())
    } else {
        Err(format!("Instance not found: {}", id))
    }
}

/// List all running instances
pub fn list_instances(state: &HttpServiceState) -> Vec<HttpInstanceInfo> {
    let instances = state.instances.lock().unwrap();
    instances
        .iter()
        .map(|i| {
            let urls = get_local_ips()
                .iter()
                .map(|ip| format!("http://{}:{}", ip, i.port))
                .collect();
            HttpInstanceInfo {
                id: i.id.clone(),
                port: i.port,
                urls,
                directory: i.dir.to_string_lossy().to_string(),
            }
        })
        .collect()
}

// ── Internal helpers ─────────────────────────────────────────────────────

/// Bind to a port. If preferred_port is 0, auto-allocate from 8080.
/// On failure, try next port (up to 20 attempts).
fn bind_server(preferred_port: u16) -> Result<(tiny_http::Server, u16), String> {
    let start = if preferred_port == 0 { 8080 } else { preferred_port };
    for offset in 0..20u16 {
        let port = start + offset;
        let addr: SocketAddr = format!("0.0.0.0:{}", port)
            .parse()
            .map_err(|e| format!("Invalid address: {}", e))?;
        match Server::http(addr) {
            Ok(server) => return Ok((server, port)),
            Err(_) if offset < 19 => continue,
            Err(e) => {
                return Err(format!(
                    "Failed to bind port {} (tried {}-{}): {}",
                    port, start, start + 19, e
                ))
            }
        }
    }
    Err("Failed to bind any port".to_string())
}

fn get_local_ips() -> Vec<String> {
    let mut ips = Vec::new();
    if let Ok(addrs) = local_ip_address::list_afinet_netifas() {
        for (_name, ip) in addrs {
            if let std::net::IpAddr::V4(addr) = ip {
                if !addr.is_loopback() {
                    ips.push(addr.to_string());
                }
            }
        }
    }
    if ips.is_empty() {
        ips.push("127.0.0.1".to_string());
    }
    ips
}

// ── Request handling ─────────────────────────────────────────────────────

fn handle_request(request: tiny_http::Request, base_dir: &PathBuf) {
    let url = request.url().to_string();

    // API: file list for directory listing UI
    if url.starts_with("/api/files") {
        let sub_path = extract_query_param(&url, "path").unwrap_or_default();
        let sub_path = sanitize_path(&sub_path);
        let target_dir = if sub_path.is_empty() {
            base_dir.clone()
        } else {
            base_dir.join(&sub_path)
        };
        if !target_dir.starts_with(base_dir) || !target_dir.exists() {
            json_response(request, "[]", 200);
            return;
        }
        match fs::read_dir(&target_dir) {
            Ok(entries) => {
                let items: Vec<serde_json::Value> = entries
                    .flatten()
                    .map(|e| {
                        let meta = e.metadata().ok();
                        serde_json::json!({
                            "name": e.file_name().to_string_lossy(),
                            "isDir": meta.as_ref().map(|m| m.is_dir()).unwrap_or(false),
                            "size": meta.as_ref().map(|m| m.len()).unwrap_or(0),
                        })
                    })
                    .collect();
                json_response(
                    request,
                    &serde_json::to_string(&items).unwrap_or_else(|_| "[]".into()),
                    200,
                );
            }
            Err(_) => json_response(request, "[]", 200),
        }
        return;
    }

    // File access: /files/{path}
    if url.starts_with("/files/") {
        let file_path_str = percent_decode(&url[7..]);
        let file_path_str = sanitize_path(&file_path_str);
        let file_path = base_dir.join(&file_path_str);
        if !file_path.starts_with(base_dir) || !file_path.is_file() {
            text_response(request, "404 Not Found", 404);
            return;
        }
        // Browsable types → inline render; others → download
        if is_browsable(&file_path) {
            serve_file_inline(request, &file_path);
        } else {
            serve_file_download(request, &file_path);
        }
        return;
    }

    // Directory or index.html serving
    // Resolve the requested path to a directory
    let request_path = percent_decode(&url);
    let request_path = request_path.trim_start_matches('/');
    let request_path = sanitize_path(request_path);

    let target_dir = if request_path.is_empty() {
        base_dir.clone()
    } else {
        base_dir.join(&request_path)
    };

    // Security: ensure within base_dir
    if !target_dir.starts_with(base_dir) {
        text_response(request, "403 Forbidden", 403);
        return;
    }

    // If target is a file (not a directory), serve it inline for browsable types
    if target_dir.is_file() {
        if is_browsable(&target_dir) {
            serve_file_inline(request, &target_dir);
        } else {
            serve_file_download(request, &target_dir);
        }
        return;
    }

    if !target_dir.is_dir() {
        text_response(request, "404 Not Found", 404);
        return;
    }

    // Check for index.html in the target directory
    let index_path = target_dir.join("index.html");
    if index_path.is_file() {
        serve_file_inline(request, &index_path);
        return;
    }

    // No index.html — serve directory listing UI
    let response = Response::from_data(web_ui::DIRECTORY_LISTING_HTML.as_bytes().to_vec())
        .with_header(
            Header::from_bytes("Content-Type", "text/html; charset=utf-8").unwrap(),
        )
        .with_status_code(StatusCode(200));
    let _ = request.respond(response);
}

/// Serve a file inline (rendered in browser, e.g. HTML, images, text)
fn serve_file_inline(request: tiny_http::Request, path: &PathBuf) {
    match fs::read(path) {
        Ok(data) => {
            let content_type = guess_content_type(path);
            let response = Response::from_data(data)
                .with_header(Header::from_bytes("Content-Type", content_type).unwrap())
                .with_status_code(StatusCode(200));
            let _ = request.respond(response);
        }
        Err(e) => text_response(request, &format!("Error: {}", e), 500),
    }
}

/// Serve a file as download (Content-Disposition: attachment)
fn serve_file_download(request: tiny_http::Request, path: &PathBuf) {
    let display_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "download".to_string());
    match File::open(path) {
        Ok(file) => {
            let len = file.metadata().map(|m| m.len()).unwrap_or(0);
            let content_type = guess_content_type(path);
            let response = Response::from_file(file)
                .with_header(Header::from_bytes("Content-Type", content_type).unwrap())
                .with_header(
                    Header::from_bytes("Content-Length", len.to_string()).unwrap(),
                )
                .with_header(
                    Header::from_bytes(
                        "Content-Disposition",
                        format!("attachment; filename=\"{}\"", display_name),
                    )
                    .unwrap(),
                )
                .with_status_code(StatusCode(200));
            let _ = request.respond(response);
        }
        Err(e) => text_response(request, &format!("Error: {}", e), 500),
    }
}

fn json_response(request: tiny_http::Request, body: &str, code: u16) {
    let response = Response::from_string(body)
        .with_header(
            Header::from_bytes("Content-Type", "application/json").unwrap(),
        )
        .with_status_code(StatusCode(code));
    let _ = request.respond(response);
}

fn text_response(request: tiny_http::Request, body: &str, code: u16) {
    let response = Response::from_string(body).with_status_code(StatusCode(code));
    let _ = request.respond(response);
}

// ── Utilities ────────────────────────────────────────────────────────────

fn sanitize_path(path: &str) -> String {
    let path = path.replace('\\', "/");
    let parts: Vec<&str> = path
        .split('/')
        .filter(|p| !p.is_empty() && *p != "." && *p != "..")
        .collect();
    parts.join("/")
}

fn extract_query_param(url: &str, key: &str) -> Option<String> {
    let query_start = url.find('?')?;
    let query = &url[query_start + 1..];
    for pair in query.split('&') {
        let mut kv = pair.splitn(2, '=');
        if let (Some(k), Some(v)) = (kv.next(), kv.next()) {
            if k == key {
                return Some(percent_decode(v));
            }
        }
    }
    None
}

fn percent_decode(s: &str) -> String {
    let mut bytes = Vec::new();
    let mut chars = s.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let h = chars.next().unwrap_or(b'0');
            let l = chars.next().unwrap_or(b'0');
            let hex = format!("{}{}", h as char, l as char);
            if let Ok(n) = u8::from_str_radix(&hex, 16) {
                bytes.push(n);
            }
        } else {
            bytes.push(b);
        }
    }
    // from_utf8_lossy handles both valid UTF-8 and gracefully degrades for invalid sequences
    String::from_utf8_lossy(&bytes).into_owned()
}

fn guess_content_type(path: &PathBuf) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("html") | Some("htm") => "text/html; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("js") => "application/javascript; charset=utf-8",
        Some("json") => "application/json; charset=utf-8",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("svg") => "image/svg+xml",
        Some("webp") => "image/webp",
        Some("ico") => "image/x-icon",
        Some("bmp") => "image/bmp",
        Some("pdf") => "application/pdf",
        Some("txt") | Some("md") | Some("log") => "text/plain; charset=utf-8",
        Some("xml") => "application/xml",
        Some("csv") => "text/csv; charset=utf-8",
        Some("zip") => "application/zip",
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("ttf") => "font/ttf",
        _ => "application/octet-stream",
    }
}

/// Check if a file type can be rendered inline in the browser
fn is_browsable(path: &PathBuf) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase().as_str().to_owned()).as_deref(),
        Some("html" | "htm" | "css" | "js" | "json" | "xml" | "svg"
            | "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "ico"
            | "pdf" | "txt" | "md" | "log" | "csv"
            | "mp4" | "webm" | "mp3" | "wav")
    )
}
