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

// ============ HTTP Server ============

export interface ServerInfo {
  port: number
  urls: string[]
  directory: string
}

export async function startHttpServer(directory: string, port: number): Promise<ServerInfo | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<ServerInfo>('start_http_server', { directory, port })
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
