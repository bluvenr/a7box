/**
 * PDF Toolkit — File save helpers
 * Tauri native save dialog / directory picker with browser download fallback.
 */

import { isTauri } from '../../shared/utils'

/** Save a single Blob; returns false if the user cancelled the native dialog. */
export async function saveBlob(blob: Blob, filename: string): Promise<boolean> {
  if (isTauri()) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const { writeFile } = await import('@tauri-apps/plugin-fs')
      const filePath = await save({ defaultPath: filename })
      if (filePath) {
        await writeFile(filePath, new Uint8Array(await blob.arrayBuffer()))
        return true
      }
      return false
    } catch { /* fall through to browser */ }
  }
  triggerDownload(blob, filename)
  return true
}

/** Save many Blobs into a user-picked directory (Tauri) or sequential downloads. */
export async function saveMany(items: { blob: Blob; name: string }[]): Promise<boolean> {
  if (items.length === 0) return false
  if (isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const { writeFile } = await import('@tauri-apps/plugin-fs')
      const dir = await open({ directory: true, multiple: false })
      if (!dir) return false
      for (const it of items) {
        await writeFile(`${dir}/${it.name}`, new Uint8Array(await it.blob.arrayBuffer()))
      }
      return true
    } catch { /* fall through to browser */ }
  }
  for (const it of items) triggerDownload(it.blob, it.name)
  return true
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}