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

/** Start clipboard watcher */
export async function startClipboardWatcher(): Promise<void> {
  const invoke = await getInvoke()
  if (invoke) await invoke('start_clipboard_watcher')
}

/** Stop clipboard watcher */
export async function stopClipboardWatcher(): Promise<void> {
  const invoke = await getInvoke()
  if (invoke) await invoke('stop_clipboard_watcher')
}

/** Get current clipboard text */
export async function getClipboardText(): Promise<string | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<string>('get_clipboard_text')
  } catch {
    return null
  }
}

/** Listen for clipboard changes (emitted from Rust watcher) */
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
