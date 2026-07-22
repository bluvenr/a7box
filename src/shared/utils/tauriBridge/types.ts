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
}
