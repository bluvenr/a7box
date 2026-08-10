// A7Box HTTP Server & Service Commands

use crate::http_server::{self, HttpServerState};
use crate::http_service::{self, HttpServiceState};
use std::path::PathBuf;
use std::sync::Arc;

// ── HTTP Server (single instance) ────────────────────────────────────────────

#[tauri::command]
pub fn start_http_server(
    state: tauri::State<'_, Arc<HttpServerState>>,
    directory: String,
    port: u16,
    #[allow(unused_variables)] allow_upload: Option<bool>,
) -> Result<http_server::ServerInfo, String> {
    let upload = allow_upload.unwrap_or(true);
    http_server::start_server(state.inner().clone(), PathBuf::from(directory), port, upload)
}

#[tauri::command]
pub fn stop_http_server(state: tauri::State<'_, Arc<HttpServerState>>) {
    http_server::stop_server(state.inner());
}

#[tauri::command]
pub fn get_http_server_info(state: tauri::State<'_, Arc<HttpServerState>>) -> Option<http_server::ServerInfo> {
    let running = state.running.lock().unwrap();
    if !*running {
        return None;
    }
    let port = *state.port.lock().unwrap();
    let dir = state.server_dir.lock().unwrap().clone();
    Some(http_server::ServerInfo {
        port,
        urls: vec![format!("http://127.0.0.1:{}", port)],
        directory: dir.to_string_lossy().to_string(),
    })
}

// ── Independent HTTP Service (multi-instance) ────────────────────────────────

#[tauri::command]
pub fn http_start_server(
    state: tauri::State<'_, Arc<HttpServiceState>>,
    directory: String,
    port: Option<u16>,
) -> Result<http_service::HttpInstanceInfo, String> {
    http_service::start_instance(state.inner(), PathBuf::from(directory), port)
}

#[tauri::command]
pub fn http_stop_server(
    state: tauri::State<'_, Arc<HttpServiceState>>,
    id: String,
) -> Result<(), String> {
    http_service::stop_instance(state.inner(), &id)
}

#[tauri::command]
pub fn http_list_servers(
    state: tauri::State<'_, Arc<HttpServiceState>>,
) -> Vec<http_service::HttpInstanceInfo> {
    http_service::list_instances(state.inner())
}

/// Change the port of a running instance (exact bind, no fallback).
/// Pre-binds the new port first, so a busy target fails without downtime.
#[tauri::command]
pub fn http_change_port(
    state: tauri::State<'_, Arc<HttpServiceState>>,
    id: String,
    port: u16,
) -> Result<http_service::HttpInstanceInfo, String> {
    http_service::change_instance_port(state.inner(), &id, port)
}

/// Probe whether a port is currently free (ports held by our own instances
/// report as occupied, since they hold real sockets).
#[tauri::command]
pub fn http_check_port(port: u16) -> bool {
    http_service::is_port_available(port)
}
