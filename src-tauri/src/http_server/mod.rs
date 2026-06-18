// A7Box HTTP File Server Module
// Serves files from a directory over HTTP for LAN transfer
// Also provides Web UI for browser-based file sharing

mod web_ui;

use std::fs::{self, File};
use std::io::{Write, BufReader, BufRead};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use tiny_http::{Header, Method, Response, Server, StatusCode};

pub struct HttpServerState {
    pub running: Arc<Mutex<bool>>,
    pub port: Arc<Mutex<u16>>,
    pub server_dir: Arc<Mutex<PathBuf>>,
    pub allow_upload: Arc<Mutex<bool>>,
}

impl HttpServerState {
    pub fn new() -> Self {
        Self {
            running: Arc::new(Mutex::new(false)),
            port: Arc::new(Mutex::new(0)),
            server_dir: Arc::new(Mutex::new(PathBuf::new())),
            allow_upload: Arc::new(Mutex::new(true)),
        }
    }
}

#[derive(serde::Serialize)]
pub struct ServerInfo {
    pub port: u16,
    pub urls: Vec<String>,
    pub directory: String,
}

/// Get local IP addresses for LAN transfer display
fn get_local_ips() -> Vec<String> {
    let mut ips = Vec::new();
    // Try to get local IPs
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

/// Start the HTTP file server
pub fn start_server(state: Arc<HttpServerState>, dir: PathBuf, port: u16, allow_upload: bool) -> Result<ServerInfo, String> {
    // Check if already running
    {
        let running = state.running.lock().unwrap();
        if *running {
            return Err("Server is already running".to_string());
        }
    }

    if !dir.exists() {
        return Err(format!("Directory does not exist: {:?}", dir));
    }

    let addr: SocketAddr = format!("0.0.0.0:{}", port)
        .parse()
        .map_err(|e| format!("Invalid address: {}", e))?;

    let server = Server::http(addr).map_err(|e| format!("Failed to bind port {}: {}", port, e))?;

    // Update state
    {
        let mut running = state.running.lock().unwrap();
        *running = true;
    }
    {
        let mut p = state.port.lock().unwrap();
        *p = port;
    }
    {
        let mut d = state.server_dir.lock().unwrap();
        *d = dir.clone();
    }
    {
        let mut au = state.allow_upload.lock().unwrap();
        *au = allow_upload;
    }

    let running = state.running.clone();
    let server_dir = state.server_dir.clone();
    let allow_upload = state.allow_upload.clone();

    thread::spawn(move || {
        while *running.lock().unwrap() {
            match server.recv_timeout(std::time::Duration::from_millis(500)) {
                Ok(Some(request)) => {
                    let dir = server_dir.lock().unwrap().clone();
                    let upload_allowed = *allow_upload.lock().unwrap();
                    handle_request(request, &dir, upload_allowed);
                }
                Ok(None) => continue,
                Err(e) => {
                    eprintln!("[A7Box HTTP] Server error: {}", e);
                    break;
                }
            }
        }
    });

    let ips = get_local_ips();
    let urls: Vec<String> = ips.iter().map(|ip| format!("http://{}:{}", ip, port)).collect();

    Ok(ServerInfo {
        port,
        urls,
        directory: dir.to_string_lossy().to_string(),
    })
}

/// Stop the HTTP server
pub fn stop_server(state: &HttpServerState) {
    let mut running = state.running.lock().unwrap();
    *running = false;
}

/// Handle a single HTTP request
fn handle_request(request: tiny_http::Request, base_dir: &PathBuf, upload_allowed: bool) {
    let url = request.url().to_string();
    let method = request.method().clone();

    // Web UI routes
    if url == "/" || url == "/index.html" {
        let response = Response::from_data(web_ui::WEB_UI_HTML.as_bytes().to_vec())
            .with_header(Header::from_bytes("Content-Type", "text/html; charset=utf-8").unwrap())
            .with_status_code(StatusCode(200));
        let _ = request.respond(response);
        return;
    }

    // API: Config (tells frontend whether upload is allowed)
    if url == "/api/config" && method == Method::Get {
        let json = format!("{{\"allowUpload\":{}}}", upload_allowed);
        let response = Response::from_string(json)
            .with_header(Header::from_bytes("Content-Type", "application/json").unwrap())
            .with_status_code(StatusCode(200));
        let _ = request.respond(response);
        return;
    }

    // API: Get file list (supports ?path=subdir for subdirectory browsing)
    if url.starts_with("/api/files") && method == Method::Get {
        let sub_path = extract_query_param(&url, "path").unwrap_or_default();
        let sub_path = sanitize_path(&sub_path);
        let target_dir = if sub_path.is_empty() {
            base_dir.clone()
        } else {
            base_dir.join(&sub_path)
        };

        // Security: ensure resolved path is within base_dir
        if !target_dir.starts_with(base_dir) || !target_dir.exists() {
            let response = Response::from_string("[]")
                .with_header(Header::from_bytes("Content-Type", "application/json").unwrap())
                .with_status_code(StatusCode(200));
            let _ = request.respond(response);
            return;
        }

        match fs::read_dir(&target_dir) {
            Ok(entries) => {
                let mut items: Vec<serde_json::Value> = Vec::new();
                for entry in entries.flatten() {
                    let meta = entry.metadata().ok();
                    let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
                    let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
                    items.push(serde_json::json!({
                        "name": entry.file_name().to_string_lossy(),
                        "isDir": is_dir,
                        "size": size,
                    }));
                }
                let json = serde_json::to_string(&items).unwrap_or_else(|_| "[]".to_string());
                let response = Response::from_string(json)
                    .with_header(Header::from_bytes("Content-Type", "application/json").unwrap())
                    .with_status_code(StatusCode(200));
                let _ = request.respond(response);
            }
            Err(_) => {
                let response = Response::from_string("[]")
                    .with_header(Header::from_bytes("Content-Type", "application/json").unwrap())
                    .with_status_code(StatusCode(200));
                let _ = request.respond(response);
            }
        }
        return;
    }

    // API: Upload file
    if url == "/api/upload" && method == Method::Post {
        if !upload_allowed {
            let response = Response::from_string("{\"error\":\"Upload is disabled\"}")
                .with_header(Header::from_bytes("Content-Type", "application/json").unwrap())
                .with_status_code(StatusCode(403));
            let _ = request.respond(response);
            return;
        }
        handle_upload(request, base_dir);
        return;
    }

    // File download: /files/{path} (supports subdirectories)
    if url.starts_with("/files/") {
        let file_path_str = percent_decode(&url[7..]);
        let file_path_str = sanitize_path(&file_path_str);
        let file_path = base_dir.join(&file_path_str);
        if !file_path.starts_with(base_dir) || !file_path.is_file() {
            let response = Response::from_string("404 Not Found").with_status_code(StatusCode(404));
            let _ = request.respond(response);
            return;
        }
        let display_name = file_path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "download".to_string());
        match File::open(&file_path) {
            Ok(file) => {
                let len = file.metadata().map(|m| m.len()).unwrap_or(0);
                let content_type = guess_content_type(&file_path);
                let response = Response::from_file(file)
                    .with_header(Header::from_bytes("Content-Type", content_type).unwrap())
                    .with_header(Header::from_bytes("Content-Length", len.to_string()).unwrap())
                    .with_header(Header::from_bytes(
                        "Content-Disposition",
                        format!("attachment; filename=\"{}\"", display_name),
                    ).unwrap())
                    .with_status_code(StatusCode(200));
                let _ = request.respond(response);
            }
            Err(e) => {
                let response = Response::from_string(format!("Error: {}", e))
                    .with_status_code(StatusCode(500));
                let _ = request.respond(response);
            }
        }
        return;
    }

    // Legacy: serve static files from directory
    let path = if url == "/" { "/index.html" } else { &url };
    let decoded = percent_decode(path);
    let file_path = base_dir.join(decoded.trim_start_matches('/'));

    if !file_path.starts_with(base_dir) {
        let response = Response::from_string("403 Forbidden").with_status_code(StatusCode(403));
        let _ = request.respond(response);
        return;
    }

    if file_path.is_file() {
        match fs::read(&file_path) {
            Ok(data) => {
                let content_type = guess_content_type(&file_path);
                let response = Response::from_data(data)
                    .with_header(Header::from_bytes("Content-Type", content_type).unwrap())
                    .with_status_code(StatusCode(200));
                let _ = request.respond(response);
            }
            Err(e) => {
                let response = Response::from_string(format!("Error: {}", e))
                    .with_status_code(StatusCode(500));
                let _ = request.respond(response);
            }
        }
    } else {
        let response = Response::from_string("404 Not Found").with_status_code(StatusCode(404));
        let _ = request.respond(response);
    }
}

/// Handle multipart file upload
fn handle_upload(mut request: tiny_http::Request, base_dir: &PathBuf) {
    let content_type = request
        .headers()
        .iter()
        .find(|h| h.field.as_str().to_string().to_lowercase() == "content-type")
        .map(|h| h.value.as_str().to_string())
        .unwrap_or_default();

    // Extract boundary from Content-Type
    let boundary = content_type
        .split(';')
        .find_map(|part| {
            let part = part.trim();
            if part.starts_with("boundary=") {
                Some(part[9..].trim_matches('"').to_string())
            } else {
                None
            }
        });

    let boundary = match boundary {
        Some(b) => b,
        None => {
            let response = Response::from_string("Missing boundary")
                .with_status_code(StatusCode(400));
            let _ = request.respond(response);
            return;
        }
    };

    // Parse multipart body
    let mut reader = BufReader::new(request.as_reader());
    let boundary_line = format!("--{}", boundary);
    let end_line = format!("--{}--", boundary);

    let mut line = String::new();
    let mut uploaded_files = 0;
    let mut upload_subdir = String::new();

    loop {
        line.clear();
        if reader.read_line(&mut line).unwrap_or(0) == 0 { break; }
        let trimmed = line.trim_end();

        if trimmed == end_line { break; }
        if trimmed != boundary_line { continue; }

        // Read headers until empty line
        let mut filename: Option<String> = None;
        let mut field_name = String::new();
        loop {
            line.clear();
            if reader.read_line(&mut line).unwrap_or(0) == 0 { break; }
            let header_line = line.trim_end();
            if header_line.is_empty() { break; }

            if header_line.to_lowercase().starts_with("content-disposition:") {
                // Extract field name
                if let Some(idx) = header_line.find("name=\"") {
                    let start = idx + 6;
                    if let Some(end) = header_line[start..].find('"') {
                        field_name = header_line[start..start + end].to_string();
                    }
                }
                // Extract filename from Content-Disposition header
                if let Some(idx) = header_line.find("filename=\"") {
                    let start = idx + 10;
                    if let Some(end) = header_line[start..].find('"') {
                        filename = Some(header_line[start..start + end].to_string());
                    }
                }
            }
        }

        // Handle "path" text field (subdirectory for upload)
        if field_name == "path" && filename.is_none() {
            let mut path_val = String::new();
            loop {
                line.clear();
                if reader.read_line(&mut line).unwrap_or(0) == 0 { break; }
                let lt = line.trim_end_matches('\n').trim_end_matches('\r');
                if lt == boundary_line || lt == end_line { break; }
                path_val.push_str(lt);
            }
            upload_subdir = sanitize_path(path_val.trim());
            continue;
        }

        // Read file content as raw bytes until next boundary
        if let Some(fname) = filename {
            let safe_name = sanitize_filename(&fname);
            let dest_dir = if upload_subdir.is_empty() {
                base_dir.clone()
            } else {
                let d = base_dir.join(&upload_subdir);
                // Ensure still within base_dir
                if !d.starts_with(base_dir) {
                    base_dir.clone()
                } else {
                    let _ = fs::create_dir_all(&d);
                    d
                }
            };
            let dest = dest_dir.join(&safe_name);

            match File::create(&dest) {
                Ok(mut out) => {
                    // Read content byte-by-byte with buffer for boundary detection
                    let mut buf = Vec::new();
                    let boundary_prefix = format!("\r\n{}", boundary_line);
                    let end_prefix = format!("\r\n{}", end_line);
                    loop {
                        let mut chunk = Vec::new();
                        let n = reader.read_until(b'\n', &mut chunk).unwrap_or(0);
                        if n == 0 { break; }
                        buf.extend_from_slice(&chunk);
                        // Check if buffer ends with boundary delimiter
                        let buf_str = String::from_utf8_lossy(&buf);
                        if buf_str.ends_with(&boundary_prefix) || buf_str.ends_with(&end_prefix) {
                            // Remove the trailing CRLF + boundary from content
                            let prefix_len = if buf_str.ends_with(&end_prefix) {
                                end_prefix.len()
                            } else {
                                boundary_prefix.len()
                            };
                            buf.truncate(buf.len() - prefix_len);
                            break;
                        }
                    }
                    let _ = out.write_all(&buf);
                    uploaded_files += 1;
                }
                Err(e) => {
                    eprintln!("[A7Box HTTP] Upload error: {}", e);
                }
            }
        }
    }

    let response = Response::from_string(format!("{{\"uploaded\":{}}}", uploaded_files))
        .with_header(Header::from_bytes("Content-Type", "application/json").unwrap())
        .with_status_code(StatusCode(200));
    let _ = request.respond(response);
}

/// Sanitize filename to prevent path traversal
fn sanitize_filename(name: &str) -> String {
    let name = name
        .replace('\\', "/")
        .split('/')
        .last()
        .unwrap_or("unnamed")
        .to_string();

    if name.is_empty() || name == "." || name == ".." {
        return "unnamed".to_string();
    }
    name
}

/// Sanitize a relative path to prevent directory traversal
fn sanitize_path(path: &str) -> String {
    let path = path.replace('\\', "/");
    let parts: Vec<&str> = path.split('/')
        .filter(|p| !p.is_empty() && *p != "." && *p != "..")
        .collect();
    parts.join("/")
}

/// Extract a query parameter value from a URL
fn extract_query_param(url: &str, key: &str) -> Option<String> {
    let query_start = url.find('?')?;
    let query = &url[query_start + 1..];
    for pair in query.split('&') {
        let mut kv = pair.splitn(2, '=');
        if let (Some(k), Some(v)) = (kv.next(), kv.next()) {
            if k == key {
                // Simple percent-decode for the value
                return Some(percent_decode(v));
            }
        }
    }
    None
}

fn percent_decode(s: &str) -> String {
    let mut result = String::new();
    let mut chars = s.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let h = chars.next().unwrap_or(b'0');
            let l = chars.next().unwrap_or(b'0');
            let hex = format!("{}{}", h as char, l as char);
            if let Ok(n) = u8::from_str_radix(&hex, 16) {
                result.push(n as char);
            }
        } else {
            result.push(b as char);
        }
    }
    result
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
        Some("pdf") => "application/pdf",
        Some("txt") | Some("md") => "text/plain; charset=utf-8",
        Some("xml") => "application/xml",
        Some("zip") => "application/zip",
        Some("mp4") => "video/mp4",
        Some("mp3") => "audio/mpeg",
        _ => "application/octet-stream",
    }
}
