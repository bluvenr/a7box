/**
 * A7Box Tauri IPC — HTTP Server
 */

import { getInvoke } from './common'
import type { ServerInfo, HttpInstanceInfo } from './types'

// ============ Legacy HTTP Server ============

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

/** Change the port of a running instance (exact bind). Keeps the error
 *  message so the UI can explain a busy target port. */
export async function httpChangePort(
  id: string,
  port: number
): Promise<{ ok: boolean; info?: HttpInstanceInfo; error?: string }> {
  const invoke = await getInvoke()
  if (!invoke) return { ok: false, error: 'no-tauri' }
  try {
    const info = await invoke<HttpInstanceInfo>('http_change_port', { id, port })
    return { ok: true, info }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/** Probe whether a port is currently free. null = cannot probe (non-Tauri). */
export async function httpCheckPort(port: number): Promise<boolean | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<boolean>('http_check_port', { port })
  } catch { return null }
}
