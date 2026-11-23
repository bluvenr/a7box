// A7Box HTTP File Server Module
// Serves files from a directory over HTTP for LAN transfer
// Also provides Web UI for browser-based file sharing

mod web_ui;

use std::fs::{self, File};
use std::io::{self, BufWriter, Read, Write};
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use tiny_http::{Header, Method, Response, Server, StatusCode};

/// How many requests may be processed at the same time. Browsers open at most
/// six connections per host, so this leaves room for browsing while uploading.
const MAX_CONCURRENT_REQUESTS: usize = 8;
/// Hard ceiling on accepted-but-unfinished requests, so a stalled client cannot
/// make the server spawn threads without bound.
const MAX_INFLIGHT_REQUESTS: usize = 64;
/// Read granularity for upload bodies (also the streaming memory footprint).
const BODY_CHUNK: usize = 64 * 1024;
/// Upper bound for a single non-file multipart field (e.g. the target path).
const MAX_FIELD_BYTES: u64 = 8 * 1024;

fn json_header() -> Header {
    Header::from_bytes("Content-Type", "application/json").unwrap()
}

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

    // Port 0 asks the OS for a free port; report the one actually bound.
    let port = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(port);

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
        // Each request gets its own worker so a slow upload never blocks file
        // browsing or the other uploads running in parallel.
        let slots = Arc::new((Mutex::new(0usize), Condvar::new()));
        let inflight = Arc::new(AtomicUsize::new(0));

        while *running.lock().unwrap() {
            match server.recv_timeout(std::time::Duration::from_millis(500)) {
                Ok(Some(request)) => {
                    if inflight.load(Ordering::Relaxed) >= MAX_INFLIGHT_REQUESTS {
                        let response = Response::from_string("{\"ok\":false,\"error\":\"Server busy\"}")
                            .with_header(json_header())
                            .with_status_code(StatusCode(503));
                        let _ = request.respond(response);
                        continue;
                    }
                    let dir = server_dir.lock().unwrap().clone();
                    let upload_allowed = *allow_upload.lock().unwrap();
                    let slots = slots.clone();
                    let inflight = inflight.clone();
                    inflight.fetch_add(1, Ordering::Relaxed);
                    thread::spawn(move || {
                        let (lock, cvar) = &*slots;
                        let mut active = lock.lock().unwrap();
                        while *active >= MAX_CONCURRENT_REQUESTS {
                            active = cvar.wait(active).unwrap();
                        }
                        *active += 1;
                        drop(active);

                        handle_request(request, &dir, upload_allowed);

                        let mut active = lock.lock().unwrap();
                        *active -= 1;
                        cvar.notify_one();
                        inflight.fetch_sub(1, Ordering::Relaxed);
                    });
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
            let response = Response::from_string("{\"ok\":false,\"error\":\"Upload is disabled\"}")
                .with_header(json_header())
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

/// Per-file result reported back to the browser so it can show real outcomes.
#[derive(serde::Serialize)]
struct UploadedPart {
    name: String,
    size: u64,
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// Handle multipart file upload, streaming every part straight to disk.
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
        })
        .filter(|b| !b.is_empty());

    let boundary = match boundary {
        Some(b) => b,
        None => {
            let response = Response::from_string("{\"ok\":false,\"error\":\"Missing boundary\"}")
                .with_header(json_header())
                .with_status_code(StatusCode(400));
            let _ = request.respond(response);
            return;
        }
    };

    let mut parts: Vec<UploadedPart> = Vec::new();
    let mut parse_error: Option<String> = None;
    {
        let mut reader = BodyReader::new(request.as_reader());
        if let Err(e) = parse_multipart(&mut reader, &boundary, base_dir, &mut parts) {
            parse_error = Some(e);
        }
    }

    if parse_error.is_none() && parts.is_empty() {
        parse_error = Some("No file received".to_string());
    }

    let succeeded = parts.iter().filter(|p| p.status == "ok").count();
    let ok = parse_error.is_none() && succeeded == parts.len();
    let status = if ok {
        200
    } else if parse_error.is_some() {
        400
    } else {
        500
    };
    let body = serde_json::json!({
        "ok": ok,
        "uploaded": succeeded,
        "files": parts,
        "error": parse_error,
    });
    let response = Response::from_string(body.to_string())
        .with_header(json_header())
        .with_status_code(StatusCode(status));
    let _ = request.respond(response);
}

/// Walk the multipart body part by part. File parts are copied to disk while
/// they arrive, so memory stays flat regardless of the file size.
fn parse_multipart(
    reader: &mut BodyReader<'_>,
    boundary: &str,
    base_dir: &Path,
    parts: &mut Vec<UploadedPart>,
) -> Result<(), String> {
    let delimiter = format!("--{}", boundary);
    let marker = format!("\r\n--{}", boundary);
    let marker = marker.as_bytes();

    let first = reader.read_line().map_err(io_msg)?;
    if trim_crlf(&first) != delimiter.as_bytes() {
        return Err("Malformed multipart body".to_string());
    }

    let mut subdir = String::new();

    loop {
        // Part headers, terminated by an empty line
        let mut filename: Option<String> = None;
        let mut field = String::new();
        loop {
            let line = reader.read_line().map_err(io_msg)?;
            if line.is_empty() {
                return Err("Unexpected end of upload body".to_string());
            }
            let text = String::from_utf8_lossy(&line);
            let text = text.trim_end();
            if text.is_empty() {
                break;
            }
            if text.to_lowercase().starts_with("content-disposition:") {
                if let Some(v) = quoted_param(text, "name=\"") {
                    field = v;
                }
                if let Some(v) = quoted_param(text, "filename=\"") {
                    filename = Some(v);
                }
            }
        }

        let mut found = false;
        let mut abort: Option<String> = None;
        let mut report: Option<UploadedPart> = None;

        if let Some(fname) = filename {
            let safe = sanitize_filename(&fname);
            let dest_dir = resolve_dest_dir(base_dir, &subdir);
            let dest = unique_destination(&dest_dir, &safe);
            let saved = dest
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| safe.clone());

            let mut err: Option<String> = None;
            // A failed create still drains the part into a sink so the rest of
            // the request stays parseable and the failure is reported honestly.
            let mut out: Box<dyn Write> = match File::create(&dest) {
                Ok(f) => Box::new(BufWriter::new(f)),
                Err(e) => {
                    err = Some(format!("{}: {}", saved, e));
                    Box::new(io::sink())
                }
            };

            let mut size = 0u64;
            match reader.copy_to(&mut *out, marker, u64::MAX) {
                Ok((n, hit)) => {
                    size = n;
                    found = hit;
                    if let Err(e) = out.flush() {
                        err.get_or_insert_with(|| io_msg(e));
                    }
                }
                Err(e) => abort = Some(io_msg(e)),
            }

            let incomplete = !found && abort.is_none();
            if err.is_some() || abort.is_some() || incomplete {
                let _ = fs::remove_file(&dest);
            }
            let error = err
                .or_else(|| abort.clone())
                .or_else(|| if incomplete { Some("Incomplete upload".to_string()) } else { None });
            report = Some(UploadedPart {
                name: saved,
                size,
                status: if error.is_none() { "ok" } else { "error" },
                error,
            });
        } else {
            let mut value: Vec<u8> = Vec::new();
            match reader.copy_to(&mut value, marker, MAX_FIELD_BYTES) {
                Ok((_, hit)) => {
                    found = hit;
                    if field == "path" {
                        subdir = sanitize_path(String::from_utf8_lossy(&value).trim());
                    }
                }
                Err(e) => abort = Some(io_msg(e)),
            }
        }

        if let Some(part) = report {
            parts.push(part);
        }
        if let Some(e) = abort {
            return Err(e);
        }
        if !found {
            return Err("Unexpected end of upload body".to_string());
        }
        // The delimiter is followed either by "--" (end) or by the next part.
        if reader.after_delimiter().map_err(io_msg)? {
            return Ok(());
        }
    }
}

fn io_msg(e: std::io::Error) -> String {
    e.to_string()
}

fn trim_crlf(line: &[u8]) -> &[u8] {
    let mut end = line.len();
    while end > 0 && (line[end - 1] == b'\n' || line[end - 1] == b'\r') {
        end -= 1;
    }
    &line[..end]
}

/// Read a quoted Content-Disposition parameter, ignoring keys that merely end
/// with the same text (so `name="` never matches inside `filename="`).
fn quoted_param(header: &str, key: &str) -> Option<String> {
    let bytes = header.as_bytes();
    let mut from = 0;
    while let Some(rel) = header[from..].find(key) {
        let idx = from + rel;
        from = idx + key.len();
        if idx > 0 && bytes[idx - 1].is_ascii_alphanumeric() {
            continue;
        }
        let rest = &header[from..];
        let end = rest.find('"')?;
        return Some(rest[..end].to_string());
    }
    None
}

fn resolve_dest_dir(base_dir: &Path, subdir: &str) -> PathBuf {
    if subdir.is_empty() {
        return base_dir.to_path_buf();
    }
    let d = base_dir.join(subdir);
    if !d.starts_with(base_dir) {
        return base_dir.to_path_buf();
    }
    let _ = fs::create_dir_all(&d);
    d
}

/// Never silently overwrite an existing file: fall back to "name (1).ext".
fn unique_destination(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    for n in 1..1000 {
        let candidate = dir.join(format!("{} ({}){}", stem, n, ext));
        if !candidate.exists() {
            return candidate;
        }
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    dir.join(format!("{}-{}", stamp, name))
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    let first = needle[0];
    let last = haystack.len() - needle.len();
    let mut i = 0;
    while i <= last {
        if haystack[i] == first && &haystack[i..i + needle.len()] == needle {
            return Some(i);
        }
        i += 1;
    }
    None
}

/// Buffered view over the request body that can search for a boundary marker
/// spanning chunk borders without ever holding the whole payload in memory.
struct BodyReader<'a> {
    inner: &'a mut dyn Read,
    buf: Vec<u8>,
    pos: usize,
    eof: bool,
}

impl<'a> BodyReader<'a> {
    fn new(inner: &'a mut dyn Read) -> Self {
        Self { inner, buf: Vec::with_capacity(BODY_CHUNK), pos: 0, eof: false }
    }

    fn available(&self) -> &[u8] {
        &self.buf[self.pos..]
    }

    /// Pull one more chunk from the socket, keeping the unread tail intact.
    fn fill(&mut self) -> std::io::Result<usize> {
        if self.eof {
            return Ok(0);
        }
        if self.pos > 0 {
            self.buf.drain(..self.pos);
            self.pos = 0;
        }
        let start = self.buf.len();
        self.buf.resize(start + BODY_CHUNK, 0);
        let n = self.inner.read(&mut self.buf[start..])?;
        self.buf.truncate(start + n);
        if n == 0 {
            self.eof = true;
        }
        Ok(n)
    }

    fn ensure(&mut self, need: usize) -> std::io::Result<()> {
        while self.available().len() < need && !self.eof {
            self.fill()?;
        }
        Ok(())
    }

    fn read_line(&mut self) -> std::io::Result<Vec<u8>> {
        let mut out = Vec::new();
        loop {
            if let Some(i) = self.available().iter().position(|&b| b == b'\n') {
                out.extend_from_slice(&self.buf[self.pos..self.pos + i + 1]);
                self.pos += i + 1;
                return Ok(out);
            }
            out.extend_from_slice(self.available());
            self.pos = self.buf.len();
            if self.eof {
                return Ok(out);
            }
            if out.len() > BODY_CHUNK {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    "Multipart header line too long",
                ));
            }
            self.fill()?;
        }
    }

    /// Look for `marker` in the buffered bytes only. `scanned` remembers how far
    /// the search already got so repeated calls stay linear overall.
    fn search(&self, marker: &[u8], scanned: &mut usize) -> Option<usize> {
        let avail = self.available();
        if avail.len() < marker.len() {
            return None;
        }
        let end = avail.len() - marker.len() + 1;
        let from = (*scanned).min(end);
        match find_subslice(&avail[from..], marker) {
            Some(rel) => Some(from + rel),
            None => {
                *scanned = end;
                None
            }
        }
    }

    /// Copy bytes into `out` until `marker` is seen. Returns the byte count and
    /// whether the marker was actually reached.
    fn copy_to(
        &mut self,
        out: &mut dyn Write,
        marker: &[u8],
        limit: u64,
    ) -> std::io::Result<(u64, bool)> {
        let keep = marker.len().saturating_sub(1);
        let mut scanned = 0usize;
        let mut written = 0u64;
        loop {
            if let Some(idx) = self.search(marker, &mut scanned) {
                out.write_all(&self.buf[self.pos..self.pos + idx])?;
                written += idx as u64;
                self.pos += idx + marker.len();
                return Ok((written, true));
            }
            // Everything except a possible partial marker at the tail is safe
            // to hand over now.
            let flush = self.available().len().saturating_sub(keep);
            if flush > 0 {
                if written + flush as u64 > limit {
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        "Multipart field too large",
                    ));
                }
                out.write_all(&self.buf[self.pos..self.pos + flush])?;
                written += flush as u64;
                self.pos += flush;
                scanned = 0;
            }
            if self.eof {
                let rest = self.available().len();
                if rest > 0 {
                    out.write_all(&self.buf[self.pos..self.pos + rest])?;
                    written += rest as u64;
                    self.pos += rest;
                }
                return Ok((written, false));
            }
            self.fill()?;
        }
    }

    /// Consume what follows a boundary delimiter: "--" ends the body.
    fn after_delimiter(&mut self) -> std::io::Result<bool> {
        self.ensure(2)?;
        let (end, skip) = {
            let a = self.available();
            if a.starts_with(b"--") {
                (true, 2)
            } else if a.starts_with(b"\r\n") {
                (false, 2)
            } else if a.starts_with(b"\n") {
                (false, 1)
            } else {
                (false, 0)
            }
        };
        self.pos += skip;
        Ok(end)
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpStream;
    use std::time::{Duration, Instant};

    const BOUNDARY: &str = "A7BoxTestBoundary";

    struct TempDir(PathBuf);

    impl TempDir {
        fn new(tag: &str) -> Self {
            static SEQ: AtomicUsize = AtomicUsize::new(0);
            let n = SEQ.fetch_add(1, Ordering::Relaxed);
            let p = std::env::temp_dir().join(format!(
                "a7box-http-{}-{}-{}",
                tag,
                std::process::id(),
                n
            ));
            let _ = fs::remove_dir_all(&p);
            fs::create_dir_all(&p).unwrap();
            Self(p)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn spawn_server(dir: &Path, allow_upload: bool) -> (Arc<HttpServerState>, u16) {
        let state = Arc::new(HttpServerState::new());
        let info = start_server(state.clone(), dir.to_path_buf(), 0, allow_upload).unwrap();
        assert_ne!(info.port, 0, "port 0 must resolve to the real bound port");
        (state, info.port)
    }

    fn read_response(mut stream: TcpStream) -> (u16, String) {
        let mut raw = Vec::new();
        stream.read_to_end(&mut raw).unwrap();
        let text = String::from_utf8_lossy(&raw).into_owned();
        let status = text
            .split_whitespace()
            .nth(1)
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        let body = text.splitn(2, "\r\n\r\n").nth(1).unwrap_or("").to_string();
        (status, body)
    }

    fn connect(port: u16) -> TcpStream {
        let s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        s.set_read_timeout(Some(Duration::from_secs(30))).unwrap();
        s.set_write_timeout(Some(Duration::from_secs(30))).unwrap();
        s
    }

    fn get(port: u16, path: &str) -> (u16, String) {
        let mut s = connect(port);
        write!(
            s,
            "GET {} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
            path
        )
        .unwrap();
        s.flush().unwrap();
        read_response(s)
    }

    fn part_header(name: &str, filename: Option<&str>) -> Vec<u8> {
        match filename {
            Some(f) => format!(
                "--{}\r\nContent-Disposition: form-data; name=\"{}\"; filename=\"{}\"\r\nContent-Type: application/octet-stream\r\n\r\n",
                BOUNDARY, name, f
            ).into_bytes(),
            None => format!(
                "--{}\r\nContent-Disposition: form-data; name=\"{}\"\r\n\r\n",
                BOUNDARY, name
            ).into_bytes(),
        }
    }

    fn multipart_body(files: &[(&str, &[u8])], subdir: Option<&str>) -> Vec<u8> {
        let mut body = Vec::new();
        if let Some(p) = subdir {
            body.extend_from_slice(&part_header("path", None));
            body.extend_from_slice(p.as_bytes());
            body.extend_from_slice(b"\r\n");
        }
        for (name, data) in files {
            body.extend_from_slice(&part_header("file", Some(name)));
            body.extend_from_slice(data);
            body.extend_from_slice(b"\r\n");
        }
        body.extend_from_slice(format!("--{}--\r\n", BOUNDARY).as_bytes());
        body
    }

    fn upload_head(len: usize) -> String {
        format!(
            "POST /api/upload HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: multipart/form-data; boundary={}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            BOUNDARY, len
        )
    }

    fn post_upload(port: u16, body: &[u8]) -> (u16, String) {
        let mut s = connect(port);
        s.write_all(upload_head(body.len()).as_bytes()).unwrap();
        // Odd chunk size so delimiters land across read boundaries.
        for chunk in body.chunks(7 * 1024 + 13) {
            s.write_all(chunk).unwrap();
        }
        s.flush().unwrap();
        read_response(s)
    }

    fn payload(len: usize, seed: u8) -> Vec<u8> {
        (0..len)
            .map(|i| ((i * 31 + seed as usize * 7) % 251) as u8)
            .collect()
    }

    #[test]
    fn uploads_text_file_byte_exact() {
        let dir = TempDir::new("text");
        let (state, port) = spawn_server(&dir.0, true);
        let data = b"hello\r\nworld\r\n";
        let (status, body) = post_upload(port, &multipart_body(&[("note.txt", data)], None));
        assert_eq!(status, 200, "{}", body);
        let json: serde_json::Value = serde_json::from_str(&body).unwrap();
        assert_eq!(json["ok"], true);
        assert_eq!(json["uploaded"], 1);
        assert_eq!(json["files"][0]["name"], "note.txt");
        assert_eq!(json["files"][0]["size"], data.len());
        assert_eq!(fs::read(dir.0.join("note.txt")).unwrap(), data);
        stop_server(&state);
    }

    #[test]
    fn preserves_binary_bytes_and_boundary_lookalikes() {
        let dir = TempDir::new("binary");
        let (state, port) = spawn_server(&dir.0, true);
        let mut data = payload(4096, 3);
        // A delimiter without the leading CRLF is legal content.
        data.extend_from_slice(format!("--{}", BOUNDARY).as_bytes());
        // A truncated marker must not be mistaken for the real one.
        data.extend_from_slice(b"\r\n--A7BoxTestBoundar");
        data.extend_from_slice(&[0xff, 0x00, 0x0d]);
        let (status, body) = post_upload(port, &multipart_body(&[("blob.bin", &data)], None));
        assert_eq!(status, 200, "{}", body);
        assert_eq!(fs::read(dir.0.join("blob.bin")).unwrap(), data);
        stop_server(&state);
    }

    #[test]
    fn large_file_streams_across_many_chunks() {
        let dir = TempDir::new("large");
        let (state, port) = spawn_server(&dir.0, true);
        let data = payload(3 * 1024 * 1024 + 77, 9);
        let (status, body) = post_upload(port, &multipart_body(&[("big.bin", &data)], None));
        assert_eq!(status, 200, "{}", body);
        let saved = fs::read(dir.0.join("big.bin")).unwrap();
        assert_eq!(saved.len(), data.len());
        assert!(saved == data, "streamed content differs from source");
        stop_server(&state);
    }

    #[test]
    fn multiple_files_and_subdir_in_one_request() {
        let dir = TempDir::new("multi");
        let (state, port) = spawn_server(&dir.0, true);
        let body = multipart_body(
            &[("a.txt", b"aaa"), ("b.txt", b"bbbb"), ("c.txt", b"ccccc")],
            Some("inbox/2026"),
        );
        let (status, resp) = post_upload(port, &body);
        assert_eq!(status, 200, "{}", resp);
        let json: serde_json::Value = serde_json::from_str(&resp).unwrap();
        assert_eq!(json["uploaded"], 3);
        let target = dir.0.join("inbox").join("2026");
        assert_eq!(fs::read(target.join("a.txt")).unwrap(), b"aaa");
        assert_eq!(fs::read(target.join("b.txt")).unwrap(), b"bbbb");
        assert_eq!(fs::read(target.join("c.txt")).unwrap(), b"ccccc");
        stop_server(&state);
    }

    #[test]
    fn existing_file_is_not_overwritten() {
        let dir = TempDir::new("dup");
        let (state, port) = spawn_server(&dir.0, true);
        post_upload(port, &multipart_body(&[("same.txt", b"first")], None));
        let (status, resp) = post_upload(port, &multipart_body(&[("same.txt", b"second")], None));
        assert_eq!(status, 200, "{}", resp);
        let json: serde_json::Value = serde_json::from_str(&resp).unwrap();
        assert_eq!(json["files"][0]["name"], "same (1).txt");
        assert_eq!(fs::read(dir.0.join("same.txt")).unwrap(), b"first");
        assert_eq!(fs::read(dir.0.join("same (1).txt")).unwrap(), b"second");
        stop_server(&state);
    }

    #[test]
    fn traversal_filename_stays_inside_share_root() {
        let dir = TempDir::new("traversal");
        let (state, port) = spawn_server(&dir.0, true);
        let (status, resp) = post_upload(
            port,
            &multipart_body(&[("../../evil.txt", b"x")], Some("../..")),
        );
        assert_eq!(status, 200, "{}", resp);
        assert!(dir.0.join("evil.txt").is_file());
        stop_server(&state);
    }

    #[test]
    fn write_failure_is_reported_as_error() {
        let dir = TempDir::new("writefail");
        // A regular file where a directory is expected makes the write fail.
        fs::write(dir.0.join("blocker"), b"not a dir").unwrap();
        let (state, port) = spawn_server(&dir.0, true);
        let (status, resp) = post_upload(
            port,
            &multipart_body(&[("x.txt", b"data")], Some("blocker")),
        );
        assert_eq!(status, 500, "{}", resp);
        let json: serde_json::Value = serde_json::from_str(&resp).unwrap();
        assert_eq!(json["ok"], false);
        assert_eq!(json["uploaded"], 0);
        assert_eq!(json["files"][0]["status"], "error");
        assert!(json["files"][0]["error"].as_str().unwrap().len() > 0);
        stop_server(&state);
    }

    #[test]
    fn upload_is_rejected_when_disabled() {
        let dir = TempDir::new("disabled");
        let (state, port) = spawn_server(&dir.0, false);
        let (status, _) = post_upload(port, &multipart_body(&[("a.txt", b"a")], None));
        assert_eq!(status, 403);
        assert!(!dir.0.join("a.txt").exists());
        stop_server(&state);
    }

    #[test]
    fn parallel_uploads_all_succeed() {
        let dir = TempDir::new("parallel");
        let (state, port) = spawn_server(&dir.0, true);
        let mut handles = Vec::new();
        for i in 0..6u8 {
            let name = format!("p{}.bin", i);
            handles.push(thread::spawn(move || {
                let data = payload(1024 * 1024 + i as usize * 977, i);
                let (status, resp) = post_upload(port, &multipart_body(&[(&name, &data)], None));
                (name, data, status, resp)
            }));
        }
        for h in handles {
            let (name, data, status, resp) = h.join().unwrap();
            assert_eq!(status, 200, "{}: {}", name, resp);
            assert_eq!(fs::read(dir.0.join(&name)).unwrap(), data);
        }
        stop_server(&state);
    }

    #[test]
    fn slow_upload_does_not_block_browsing() {
        let dir = TempDir::new("nonblock");
        fs::write(dir.0.join("existing.txt"), b"hi").unwrap();
        let (state, port) = spawn_server(&dir.0, true);

        let data = payload(512 * 1024, 5);
        let body = multipart_body(&[("slow.bin", &data)], None);
        let head = upload_head(body.len());
        let uploader = thread::spawn(move || {
            let mut s = connect(port);
            s.write_all(head.as_bytes()).unwrap();
            s.write_all(&body[..body.len() / 2]).unwrap();
            s.flush().unwrap();
            // Hold the request open mid-body.
            thread::sleep(Duration::from_millis(2000));
            s.write_all(&body[body.len() / 2..]).unwrap();
            s.flush().unwrap();
            read_response(s)
        });

        thread::sleep(Duration::from_millis(300));
        let started = Instant::now();
        let (status, list) = get(port, "/api/files");
        let elapsed = started.elapsed();
        assert_eq!(status, 200);
        assert!(list.contains("existing.txt"));
        assert!(
            elapsed < Duration::from_millis(1200),
            "browsing was blocked by an in-flight upload ({:?})",
            elapsed
        );

        let (status, resp) = uploader.join().unwrap();
        assert_eq!(status, 200, "{}", resp);
        assert_eq!(fs::read(dir.0.join("slow.bin")).unwrap(), data);
        stop_server(&state);
    }
}
