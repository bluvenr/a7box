// A7Box HTTP File Server Module
// Serves files from a directory over HTTP for LAN transfer

use std::fs;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use tiny_http::{Header, Response, Server, StatusCode};

pub struct HttpServerState {
    pub running: Arc<Mutex<bool>>,
    pub port: Arc<Mutex<u16>>,
    pub server_dir: Arc<Mutex<PathBuf>>,
}

impl HttpServerState {
    pub fn new() -> Self {
        Self {
            running: Arc::new(Mutex::new(false)),
            port: Arc::new(Mutex::new(0)),
            server_dir: Arc::new(Mutex::new(PathBuf::new())),
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
pub fn start_server(state: Arc<HttpServerState>, dir: PathBuf, port: u16) -> Result<ServerInfo, String> {
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

    let running = state.running.clone();
    let server_dir = state.server_dir.clone();

    thread::spawn(move || {
        while *running.lock().unwrap() {
            match server.recv_timeout(std::time::Duration::from_millis(500)) {
                Ok(Some(request)) => {
                    let dir = server_dir.lock().unwrap().clone();
                    handle_request(request, &dir);
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
fn handle_request(request: tiny_http::Request, base_dir: &PathBuf) {
    let url = request.url().to_string();
    let path = if url == "/" { "/index.html" } else { &url };

    // Decode URL path
    let decoded = percent_decode(path);
    let file_path = base_dir.join(decoded.trim_start_matches('/'));

    // Security: prevent path traversal
    if !file_path.starts_with(base_dir) {
        let response = Response::from_string("403 Forbidden").with_status_code(StatusCode(403));
        let _ = request.respond(response);
        return;
    }

    if file_path.is_dir() {
        // Serve directory listing as JSON
        match fs::read_dir(&file_path) {
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
                let json = serde_json::to_string_pretty(&items).unwrap_or_default();
                let response = Response::from_string(json)
                    .with_header(
                        Header::from_bytes("Content-Type", "application/json").unwrap()
                    )
                    .with_status_code(StatusCode(200));
                let _ = request.respond(response);
            }
            Err(e) => {
                let response = Response::from_string(format!("Error: {}", e))
                    .with_status_code(StatusCode(500));
                let _ = request.respond(response);
            }
        }
    } else if file_path.is_file() {
        // Serve file
        match fs::read(&file_path) {
            Ok(data) => {
                let content_type = guess_content_type(&file_path);
                let response = Response::from_data(data)
                    .with_header(
                        Header::from_bytes("Content-Type", content_type).unwrap()
                    )
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
