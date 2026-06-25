/**
 * A7Box Tauri IPC Bridge
 * Frontend wrapper for invoking Rust backend commands
 */

// Check if running in Tauri context
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

// Dynamic import of @tauri-apps/api invoke
let _invoke: typeof import('@tauri-apps/api/core').invoke | null = null

async function getInvoke() {
  if (!isTauri()) return null
  if (!_invoke) {
    const mod = await import('@tauri-apps/api/core')
    _invoke = mod.invoke
  }
  return _invoke
}

// Dynamic import of listen
let _listen: typeof import('@tauri-apps/api/event').listen | null = null

async function getListen() {
  if (!isTauri()) return null
  if (!_listen) {
    const mod = await import('@tauri-apps/api/event')
    _listen = mod.listen
  }
  return _listen
}

// ============ Clipboard ============

export async function startClipboardWatcher(): Promise<void> {
  const invoke = await getInvoke()
  if (invoke) await invoke('start_clipboard_watcher')
}

export async function stopClipboardWatcher(): Promise<void> {
  const invoke = await getInvoke()
  if (invoke) await invoke('stop_clipboard_watcher')
}

export async function getClipboardText(): Promise<string | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<string>('get_clipboard_text')
  } catch {
    return null
  }
}

export async function onClipboardChanged(
  callback: (text: string) => void
): Promise<(() => void) | null> {
  const listen = await getListen()
  if (!listen) return null

  const unlisten = await listen<string>('clipboard-changed', (event) => {
    callback(event.payload)
  })

  return unlisten
}

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

export async function captureFullScreen(): Promise<CaptureResult | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<CaptureResult>('capture_full_screen')
  } catch (e) {
    console.error('[A7Box] Screenshot failed:', e)
    return null
  }
}

export async function captureRegion(x: number, y: number, w: number, h: number): Promise<CaptureResult | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<CaptureResult>('capture_region', { x, y, width: w, height: h })
  } catch (e) {
    console.error('[A7Box] Region capture failed:', e)
    return null
  }
}

export async function captureToBase64(): Promise<string | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<string>('capture_to_base64')
  } catch (e) {
    console.error('[A7Box] Base64 capture failed:', e)
    return null
  }
}

export async function getMonitors(): Promise<MonitorInfo[]> {
  const invoke = await getInvoke()
  if (!invoke) return []
  try {
    return await invoke<MonitorInfo[]>('get_monitors')
  } catch {
    return []
  }
}

export async function fileToBase64(path: string): Promise<string | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<string>('file_to_base64', { path })
  } catch (e) {
    console.error('[A7Box] fileToBase64 failed:', e)
    return null
  }
}

export async function saveEditedImage(data: string): Promise<CaptureResult | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<CaptureResult>('save_edited_image', { data })
  } catch (e) {
    console.error('[A7Box] saveEditedImage failed:', e)
    return null
  }
}

// ============ HTTP Server ============

export interface ServerInfo {
  port: number
  urls: string[]
  directory: string
}

export async function startHttpServer(directory: string, port: number, allowUpload: boolean = true): Promise<ServerInfo | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<ServerInfo>('start_http_server', { directory, port, allowUpload })
  } catch (e) {
    console.error('[A7Box] HTTP server failed:', e)
    return null
  }
}

export async function stopHttpServer(): Promise<void> {
  const invoke = await getInvoke()
  if (invoke) await invoke('stop_http_server')
}

export async function getHttpServerInfo(): Promise<ServerInfo | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<ServerInfo | null>('get_http_server_info')
  } catch {
    return null
  }
}

// ============ Independent HTTP Service ============

export interface HttpInstanceInfo {
  id: string
  port: number
  urls: string[]
  directory: string
}

export async function httpStartServer(directory: string, port?: number): Promise<HttpInstanceInfo | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<HttpInstanceInfo>('http_start_server', { directory, port: port ?? null })
  } catch (e) {
    console.error('[A7Box] HTTP service start failed:', e)
    return null
  }
}

export async function httpStopServer(id: string): Promise<void> {
  const invoke = await getInvoke()
  if (invoke) {
    try { await invoke('http_stop_server', { id }) } catch (e) { console.error('[A7Box] HTTP service stop failed:', e) }
  }
}

export async function httpListServers(): Promise<HttpInstanceInfo[]> {
  const invoke = await getInvoke()
  if (!invoke) return []
  try {
    return await invoke<HttpInstanceInfo[]>('http_list_servers')
  } catch { return [] }
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

export async function p2pGetIdentity(): Promise<P2PIdentity | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<P2PIdentity>('p2p_get_identity')
  } catch { return null }
}

export async function p2pSetAlias(alias: string): Promise<void> {
  const invoke = await getInvoke()
  if (invoke) await invoke('p2p_set_alias', { alias })
}

export async function p2pGetPeers(): Promise<P2PPeer[]> {
  const invoke = await getInvoke()
  if (!invoke) return []
  try {
    return await invoke<P2PPeer[]>('p2p_get_peers')
  } catch { return [] }
}

export async function p2pStartService(): Promise<number | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<number>('p2p_start_service')
  } catch (e) {
    console.error('[A7Box] P2P start failed:', e)
    return null
  }
}

export async function p2pGetRunningPort(): Promise<number> {
  const invoke = await getInvoke()
  if (!invoke) return 0
  try {
    return await invoke<number>('p2p_get_running_port')
  } catch { return 0 }
}

export async function p2pSendFile(peerCode: string, filePath: string): Promise<string | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<string>('p2p_send_file', { peerCode, filePath })
  } catch (e) {
    console.error('[A7Box] P2P send file failed:', e)
    return null
  }
}

export async function p2pRequestDir(peerCode: string): Promise<P2PDirFile[]> {
  const invoke = await getInvoke()
  if (!invoke) return []
  try {
    return await invoke<P2PDirFile[]>('p2p_request_dir', { peerCode })
  } catch (e) {
    console.error('[A7Box] P2P request dir failed:', e)
    return []
  }
}

export async function p2pDownloadFile(peerCode: string, remotePath: string, localDir: string): Promise<string | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<string>('p2p_download_file', { peerCode, remotePath, localDir })
  } catch (e) {
    console.error('[A7Box] P2P download failed:', e)
    return null
  }
}

export async function p2pSetSharedDir(dir: string, enabled: boolean): Promise<void> {
  const invoke = await getInvoke()
  if (invoke) await invoke('p2p_set_shared_dir', { dir, enabled })
}

export async function p2pGetSharedInfo(): Promise<P2PSharedInfo | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<P2PSharedInfo>('p2p_get_shared_info')
  } catch { return null }
}

export async function p2pGetTransfers(): Promise<P2PTransferInfo[]> {
  const invoke = await getInvoke()
  if (!invoke) return []
  try {
    return await invoke<P2PTransferInfo[]>('p2p_get_transfers')
  } catch { return [] }
}

export async function p2pGetLocalIps(): Promise<string[]> {
  const invoke = await getInvoke()
  if (!invoke) return []
  try {
    return await invoke<string[]>('p2p_get_local_ips')
  } catch { return [] }
}

export async function p2pManualConnect(addr: string): Promise<P2PPeer | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<P2PPeer>('p2p_manual_connect', { addr })
  } catch (e) {
    console.error('[P2P] Manual connect failed:', e)
    return null
  }
}

export async function p2pRetryTransfer(transferId: string): Promise<string | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<string>('p2p_retry_transfer', { transferId })
  } catch (e) {
    console.error('[P2P] Retry failed:', e)
    return null
  }
}

export async function p2pStopService(): Promise<void> {
  const invoke = await getInvoke()
  if (!invoke) return
  try {
    await invoke('p2p_stop_service')
  } catch (e) {
    console.error('[P2P] Stop service failed:', e)
  }
}

export async function p2pValidateDir(dir: string): Promise<boolean> {
  const invoke = await getInvoke()
  if (!invoke) return false
  try {
    return await invoke<boolean>('p2p_validate_dir', { dir })
  } catch { return false }
}

export async function p2pAcceptTransfer(transferId: string): Promise<boolean> {
  const invoke = await getInvoke()
  if (!invoke) return false
  try {
    return await invoke<boolean>('p2p_accept_transfer', { transferId })
  } catch { return false }
}

export async function p2pRejectTransfer(transferId: string): Promise<boolean> {
  const invoke = await getInvoke()
  if (!invoke) return false
  try {
    return await invoke<boolean>('p2p_reject_transfer', { transferId })
  } catch { return false }
}

export async function p2pCancelTransfer(transferId: string): Promise<boolean> {
  const invoke = await getInvoke()
  if (!invoke) return false
  try {
    return await invoke<boolean>('p2p_cancel_transfer', { transferId })
  } catch { return false }
}

export async function p2pSetDownloadDir(dir: string): Promise<void> {
  const invoke = await getInvoke()
  if (!invoke) return
  try {
    await invoke('p2p_set_download_dir', { dir })
  } catch (e) {
    console.error('[P2P] Set download dir failed:', e)
  }
}

export async function p2pGetDownloadDir(): Promise<string> {
  const invoke = await getInvoke()
  if (!invoke) return ''
  try {
    return await invoke<string>('p2p_get_download_dir')
  } catch { return '' }
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

export async function getCacheSizes(): Promise<CacheSizes | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<CacheSizes>('get_cache_sizes')
  } catch { return null }
}

export async function clearCache(category: 'p2pDownloads' | 'screenshots' | 'transferHistory'): Promise<boolean> {
  const invoke = await getInvoke()
  if (!invoke) return false
  try {
    return await invoke<boolean>('clear_cache', { category })
  } catch { return false }
}

// P2P event listeners
export async function onP2PPeerDiscovered(callback: (peer: P2PPeer) => void): Promise<(() => void) | null> {
  const listen = await getListen()
  if (!listen) return null
  const unlisten = await listen<P2PPeer>('p2p-peer-discovered', (e) => callback(e.payload))
  return unlisten
}

export async function onP2PPeerLost(callback: (code: string) => void): Promise<(() => void) | null> {
  const listen = await getListen()
  if (!listen) return null
  const unlisten = await listen<string>('p2p-peer-lost', (e) => callback(e.payload))
  return unlisten
}

export async function onP2PTransferProgress(callback: (data: { transfer_id: string; progress: number; status: string; path?: string }) => void): Promise<(() => void) | null> {
  const listen = await getListen()
  if (!listen) return null
  const unlisten = await listen<{ transfer_id: string; progress: number; status: string; path?: string }>('p2p-transfer-progress', (e) => callback(e.payload))
  return unlisten
}

export async function onP2PIncomingFile(callback: (data: { transfer_id: string; filename: string; size: number; peer_code: string; peer_alias: string }) => void): Promise<(() => void) | null> {
  const listen = await getListen()
  if (!listen) return null
  const unlisten = await listen<{ transfer_id: string; filename: string; size: number; peer_code: string; peer_alias: string }>('p2p-incoming-file', (e) => callback(e.payload))
  return unlisten
}

export async function onP2PAccessLog(callback: (data: P2PAccessLogEntry) => void): Promise<(() => void) | null> {
  const listen = await getListen()
  if (!listen) return null
  const unlisten = await listen<P2PAccessLogEntry>('p2p-access-log', (e) => callback(e.payload))
  return unlisten
}
