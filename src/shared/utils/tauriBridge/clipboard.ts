/**
 * A7Box Tauri IPC — Clipboard
 */

import { getInvoke, getListen } from './common'

/**
 * @deprecated The clipboard-manager module is the sole clipboard listener.
 * Do NOT start this legacy watcher — it creates a second polling source.
 * Kept only for backward compatibility; has no active callers.
 */
export async function startClipboardWatcher(): Promise<void> {
  const invoke = await getInvoke()
  if (invoke) await invoke('start_clipboard_watcher')
}

/**
 * @deprecated See startClipboardWatcher. No active callers.
 */
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

/**
 * @deprecated Subscribe to clipboard events via the clipboard-manager module's
 * broadcast instead (see clipboardStore.initClipboardEvents / module.onClipboard
 * hooks). This legacy 'clipboard-changed' event has no active emitters.
 */
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
