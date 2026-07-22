/**
 * A7Box Tauri IPC — Clipboard
 */

import { getInvoke, getListen } from './common'

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
