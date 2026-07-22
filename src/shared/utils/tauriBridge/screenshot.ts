/**
 * A7Box Tauri IPC — Screenshot
 */

import { getInvoke } from './common'
import type { CaptureResult, MonitorInfo } from './types'

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

export async function scanScreenshotHistory(limit?: number): Promise<CaptureResult[]> {
  const invoke = await getInvoke()
  if (!invoke) return []
  try {
    return await invoke<CaptureResult[]>('scan_screenshot_history', { limit: limit ?? 50 })
  } catch {
    return []
  }
}
