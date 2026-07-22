/**
 * A7Box Tauri IPC — Common Helpers
 * Dynamic import wrappers for @tauri-apps/api to support non-Tauri environments.
 */

// Dynamic import of @tauri-apps/api invoke
let _invoke: typeof import('@tauri-apps/api/core').invoke | null = null

export async function getInvoke() {
  if (!isTauri()) return null
  if (!_invoke) {
    const mod = await import('@tauri-apps/api/core')
    _invoke = mod.invoke
  }
  return _invoke
}

// Dynamic import of listen
let _listen: typeof import('@tauri-apps/api/event').listen | null = null

export async function getListen() {
  if (!isTauri()) return null
  if (!_listen) {
    const mod = await import('@tauri-apps/api/event')
    _listen = mod.listen
  }
  return _listen
}

/** Check if running in Tauri context (single source of truth) */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
