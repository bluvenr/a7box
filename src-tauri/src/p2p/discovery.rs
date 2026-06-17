// A7Box P2P Discovery Module
// Uses mDNS to discover and advertise A7Box peers on LAN

use crate::p2p::{PeerInfo, P2PStateArc};
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use std::thread;
use tauri::Emitter;

const SERVICE_TYPE: &str = "_a7box._tcp.local.";

/// Start mDNS service advertisement and discovery
pub fn start_discovery(
    app_handle: tauri::AppHandle,
    state: P2PStateArc,
) -> Result<ServiceDaemon, String> {
    let daemon = ServiceDaemon::new().map_err(|e| format!("mDNS daemon error: {}", e))?;

    let identity = state.get_identity();
    let port = *state.tcp_port.lock().unwrap();

    // Register our service with TXT records
    let hostname = format!("{}.{}", identity.code.to_lowercase().replace('-', ""), SERVICE_TYPE);
    let mut props = std::collections::HashMap::new();
    props.insert("alias".to_string(), identity.alias.clone());
    props.insert("code".to_string(), identity.code.clone());
    props.insert("version".to_string(), "1".to_string());
    let service = ServiceInfo::new(
        SERVICE_TYPE,
        &identity.code,
        &hostname,
        "",
        port,
        Some(props),
    )
    .map_err(|e| format!("ServiceInfo error: {}", e))?;

    daemon.register(service).map_err(|e| format!("Register error: {}", e))?;

    // Browse for peers
    let receiver = daemon.browse(SERVICE_TYPE).map_err(|e| format!("Browse error: {}", e))?;

    let state_clone = state.clone();
    let handle = app_handle.clone();
    thread::spawn(move || {
        while let Ok(event) = receiver.recv() {
            match event {
                ServiceEvent::ServiceResolved(info) => {
                    // Skip ourselves
                    if info.get_fullname().starts_with(&identity.code) {
                        continue;
                    }

                    let peer_code = info.get_property_val_str("code")
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| info.get_fullname().to_string());
                    let peer_alias = info.get_property_val_str("alias")
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| "Unknown".to_string());

                    let ip = info.get_addresses_v4().iter().next()
                        .map(|a| a.to_string())
                        .unwrap_or_default();
                    let port = info.get_port();

                    let peer = PeerInfo {
                        code: peer_code,
                        alias: peer_alias,
                        ip,
                        port,
                    };

                    state_clone.add_peer(peer.clone());
                    let _ = handle.emit("p2p-peer-discovered", &peer);
                }
                ServiceEvent::ServiceRemoved(_, full_name) => {
                    // Extract code from full name
                    let code = full_name.split('.').next().unwrap_or("");
                    state_clone.remove_peer(code);
                    let _ = handle.emit("p2p-peer-lost", code);
                }
                _ => {}
            }
        }
    });

    Ok(daemon)
}

/// Stop mDNS discovery
pub fn stop_discovery(daemon: &ServiceDaemon) {
    let _ = daemon.shutdown();
}
