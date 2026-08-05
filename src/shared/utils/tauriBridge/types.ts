/**
 * A7Box Tauri IPC Type Definitions
 */

// ============ Screenshot ============

export interface CaptureResult {
  path: string
  width: number
  height: number
  filename: string
}

export interface MonitorInfo {
  id: number
  width: number
  height: number
  x: number
  y: number
  scale: number
}

// ============ HTTP Server ============

export interface ServerInfo {
  port: number
  urls: string[]
  directory: string
}

// ============ Independent HTTP Service ============

export interface HttpInstanceInfo {
  id: string
  port: number
  urls: string[]
  directory: string
}

// ============ P2P LAN Transfer ============

export interface P2PIdentity {
  code: string
  alias: string
}

export interface P2PPeer {
  code: string
  alias: string
  ip: string
  port: number
}

export interface P2PTransferInfo {
  id: string
  filename: string
  size: number
  progress: number
  status: string
  direction: string
  peer_code: string
  file_path: string
}

export interface P2PDirFile {
  name: string
  size: number
  is_dir: boolean
}

export interface P2PAccessLogEntry {
  timestamp: string
  peer_code: string
  peer_alias: string
  action: string
  path: string
}

export interface P2PSharedInfo {
  directory: string
  enabled: boolean
  files: P2PDirFile[]
  accessLog: P2PAccessLogEntry[]
}

// ============ Cache Management ============

export interface CacheSizes {
  p2pDownloads: number
  p2pDownloadsPath: string
  p2pFileCount: number
  screenshots: number
  screenshotsPath: string
  screenshotFileCount: number
  transferCount: number
  clipboardDb: number
  clipboardDbPath: string
  clipboardImages: number
  clipboardImageCount: number
}

// ============ System Stats ============

export interface SystemStats {
  cpu: {
    brand: string
    cores: number
    /** Overall CPU usage percentage (0–100) */
    usage: number
  }
  memory: {
    total: number
    used: number
  }
  /** Highest CPU temperature in °C, null if sensors unavailable */
  temperature: number | null
  disks: Array<{
    name: string
    mount_point: string
    total: number
    available: number
    kind: string
  }>
  os: {
    name: string
    version: string
    kernel: string
    arch: string
    hostname: string
    /** Seconds since system boot */
    uptime: number
  }
  /** Number of running processes */
  processes: number
}

// ============ Network Details ============

export interface NetInterface {
  name: string
  friendly_name: string | null
  /** "wifi" | "ethernet" | "loopback" | "tunnel" | "ppp" | "other" */
  if_type: string
  mac: string | null
  /** e.g. ["192.168.1.5/24"] */
  ipv4: string[]
  gateway: string | null
  /** Link speed in Mbps */
  speed_mbps: number | null
  is_default: boolean
}

export interface WifiInfo {
  ssid: string | null
  /** Signal strength percentage (0–100) */
  signal_percent: number | null
  channel: string | null
  /** e.g. "802.11ax" */
  radio_type: string | null
}

export interface NetworkDetails {
  interfaces: NetInterface[]
  wifi: WifiInfo | null
}
