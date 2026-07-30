// A7Box Network Details Commands
// Enumerates network interfaces via `default-net` (already a transitive dependency)
// and retrieves WiFi details (SSID / signal / channel) via platform-native commands.

use serde::Serialize;

#[derive(Serialize)]
pub struct WifiInfo {
    pub ssid: Option<String>,
    /// Signal strength percentage (0–100)
    pub signal_percent: Option<u8>,
    pub channel: Option<String>,
    /// e.g. "802.11ax"
    pub radio_type: Option<String>,
}

#[derive(Serialize)]
pub struct NetInterface {
    pub name: String,
    pub friendly_name: Option<String>,
    /// "wifi" | "ethernet" | "loopback" | "tunnel" | "ppp" | "other"
    pub if_type: String,
    pub mac: Option<String>,
    /// e.g. ["192.168.1.5/24"]
    pub ipv4: Vec<String>,
    pub gateway: Option<String>,
    /// Link speed in Mbps
    pub speed_mbps: Option<u64>,
    pub is_default: bool,
}

#[derive(Serialize)]
pub struct NetworkDetails {
    pub interfaces: Vec<NetInterface>,
    pub wifi: Option<WifiInfo>,
}

fn if_type_label(t: default_net::interface::InterfaceType) -> &'static str {
    use default_net::interface::InterfaceType::*;
    match t {
        Wireless80211 => "wifi",
        Ethernet | GigabitEthernet | FastEthernetT | FastEthernetFx | Ethernet3Megabit => "ethernet",
        Loopback => "loopback",
        Tunnel => "tunnel",
        Ppp => "ppp",
        _ => "other",
    }
}

fn collect_interfaces() -> Vec<NetInterface> {
    let default_name = default_net::get_default_interface().ok().map(|i| i.name.clone());
    default_net::get_interfaces()
        .into_iter()
        // Skip interfaces that carry no IPv4 and are not the default (noise: virtual adapters etc.)
        .filter(|i| !i.ipv4.is_empty() || Some(&i.name) == default_name.as_ref())
        .map(|i| NetInterface {
            name: i.name.clone(),
            friendly_name: i.friendly_name.clone(),
            if_type: if_type_label(i.if_type).to_string(),
            mac: i.mac_addr.map(|m| m.to_string()),
            ipv4: i.ipv4.iter().map(|n| format!("{}/{}", n.addr, n.prefix_len)).collect(),
            gateway: i.gateway.map(|g| g.ip_addr.to_string()),
            speed_mbps: i.transmit_speed.map(|s| s / 1_000_000),
            is_default: Some(&i.name) == default_name.as_ref(),
        })
        .collect()
}

// ── WiFi details (best-effort, platform-native commands) ─────────────────────

#[cfg(target_os = "windows")]
fn collect_wifi() -> Option<WifiInfo> {
    use std::os::windows::process::CommandExt;
    // CREATE_NO_WINDOW: `netsh` is a console-subsystem app. Launched from our GUI
    // (windows-subsystem) binary, it would otherwise flash a console window on every
    // query. This flag runs it silently in the background.
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    // `netsh` labels are localized, but field ORDER within each interface block is stable.
    let out = std::process::Command::new("netsh")
        .args(["wlan", "show", "interfaces"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    // Group indented "key : value" lines into per-interface blocks. A non-indented
    // line (header / blank separator) closes the current block. This keeps parsing
    // correct even when multiple wireless interfaces are present.
    let mut blocks: Vec<Vec<&str>> = Vec::new();
    for line in text.lines() {
        let indented = line.starts_with(' ') || line.starts_with('\t');
        if !indented {
            // Boundary: only start a fresh block if the previous one has content
            if blocks.last().is_some_and(|b| !b.is_empty()) {
                blocks.push(Vec::new());
            }
            continue;
        }
        if let Some((_, v)) = line.trim_start().split_once(':') {
            if blocks.is_empty() {
                blocks.push(Vec::new());
            }
            blocks.last_mut().unwrap().push(v.trim());
        }
    }
    // Field order: 0 Name, 1 Description, 2 GUID, 3 Physical address, 4 State,
    //              5 SSID, 6 BSSID, 7 Network type, 8 Radio type, 9 Auth, 10 Cipher,
    //              11 Connection mode, 12 Channel, 13 Rx rate, 14 Tx rate, 15 Signal, 16 Profile
    // A connected interface exposes >= 16 fields; a disconnected one stops at State (5).
    // Pick the first connected block so multi-interface output is handled correctly.
    let values = blocks.into_iter().find(|b| b.len() >= 16)?;
    let signal = values[15].trim_end_matches('%').trim().parse::<u8>().ok();
    Some(WifiInfo {
        ssid: Some(values[5].to_string()),
        signal_percent: signal,
        channel: Some(values[12].to_string()),
        radio_type: Some(values[8].to_string()),
    })
}

#[cfg(target_os = "macos")]
fn collect_wifi() -> Option<WifiInfo> {
    // SSID: `networksetup` prints "<localized prefix>: <SSID>" — take text after the last ':'
    let out = std::process::Command::new("networksetup").args(["-getairportnetwork", "en0"]).output().ok()?;
    let line = String::from_utf8_lossy(&out.stdout);
    let ssid = line.trim().rsplit(':').next().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());

    // Signal / channel: `airport -I` keys are stable (agrCtlRSSI, channel)
    let airport = "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport";
    let (signal_percent, channel) = match std::process::Command::new(airport).arg("-I").output() {
        Ok(o) => {
            let txt = String::from_utf8_lossy(&o.stdout);
            let rssi = txt.lines().find_map(|l| {
                let t = l.trim();
                t.strip_prefix("agrCtlRSSI:").and_then(|v| v.trim().parse::<i32>().ok())
            });
            let ch = txt.lines().find_map(|l| {
                let t = l.trim();
                t.strip_prefix("channel:").map(|v| v.trim().to_string())
            });
            // Rough RSSI → percent mapping (-30 dBm ≈ 100%, -90 dBm ≈ 0%)
            (rssi.map(|r| r.clamp(-90, -30).abs_diff(-90) as u8 * 100 / 60), ch)
        }
        Err(_) => (None, None),
    };
    Some(WifiInfo { ssid, signal_percent, channel, radio_type: None })
}

#[cfg(target_os = "linux")]
fn collect_wifi() -> Option<WifiInfo> {
    // Prefer `iwgetid -r` (wireless-tools): prints the raw active SSID directly.
    if let Ok(out) = std::process::Command::new("iwgetid").arg("-r").output() {
        let ssid = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !ssid.is_empty() {
            return Some(WifiInfo { ssid: Some(ssid), signal_percent: None, channel: None, radio_type: None });
        }
    }
    // Fallback: NetworkManager's `nmcli` (default on most modern distros, also yields signal).
    // Output of `-t -f active,ssid,signal dev wifi` looks like:
    //   yes:MyNetwork:75
    //   no:Neighbor:40
    // Colons inside an SSID are escaped as "\:", so take the signal from the last field
    // (rsplit_once) and unescape the SSID.
    let out = std::process::Command::new("nmcli")
        .args(["-t", "-f", "active,ssid,signal", "dev", "wifi"])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    for line in text.lines() {
        let Some(rest) = line.strip_prefix("yes:") else { continue };
        let (ssid_raw, signal) = match rest.rsplit_once(':') {
            Some((s, sig)) => (s, sig.trim().parse::<u8>().ok()),
            None => (rest, None),
        };
        let ssid = ssid_raw.replace("\\:", ":");
        if ssid.is_empty() { return None; } // hidden network
        return Some(WifiInfo { ssid: Some(ssid), signal_percent: signal, channel: None, radio_type: None });
    }
    None
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn collect_wifi() -> Option<WifiInfo> { None }

fn collect_network_details() -> NetworkDetails {
    NetworkDetails {
        interfaces: collect_interfaces(),
        wifi: collect_wifi(),
    }
}

/// Returns all network interfaces plus WiFi details (SSID / signal / channel).
#[tauri::command]
pub async fn get_network_details() -> Result<NetworkDetails, String> {
    tokio::task::spawn_blocking(collect_network_details)
        .await
        .map_err(|e| e.to_string())
}
