/**
 * Clipboard Manager — Tauri IPC Bridge
 * Wraps all cm_* commands; returns safe fallbacks outside Tauri.
 */

import { getInvoke, getListen } from '../../shared/utils/tauriBridge/common'
import type {
  ClipEntry,
  ClipStats,
  CmSettingsResponse,
  ClipboardSettings,
  HistoryChangedPayload,
  RuleEntry,
  SnippetEntry,
} from './types'

export interface HistoryQuery {
  limit?: number
  offset?: number
  category?: string
  clipType?: string
  search?: string
  onlyPinned?: boolean
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

export async function startClipboardManager(): Promise<void> {
  const invoke = await getInvoke()
  if (invoke) await invoke('start_clipboard_manager')
}

export async function stopClipboardManager(): Promise<void> {
  const invoke = await getInvoke()
  if (invoke) await invoke('stop_clipboard_manager')
}

/**
 * Sync the module master switch to the backend. Disabling stops capture and
 * closes the popup window; it does NOT touch the user's capture preference
 * (settings.enabled) inside the module page.
 */
export async function setModuleEnabled(enabled: boolean): Promise<void> {
  const invoke = await getInvoke()
  if (invoke) await invoke('cm_set_module_enabled', { enabled })
}

// ── History ──────────────────────────────────────────────────────────────────

export async function getHistory(query: HistoryQuery = {}): Promise<ClipEntry[]> {
  const invoke = await getInvoke()
  if (!invoke) return []
  return invoke<ClipEntry[]>('cm_get_history', {
    limit: query.limit ?? 50,
    offset: query.offset ?? 0,
    category: query.category || null,
    clipType: query.clipType || null,
    search: query.search || null,
    onlyPinned: query.onlyPinned ?? false,
  })
}

export async function getClip(id: string): Promise<ClipEntry | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<ClipEntry>('cm_get_clip', { id })
  } catch {
    return null
  }
}

export async function deleteClip(id: string): Promise<void> {
  const invoke = await getInvoke()
  if (invoke) await invoke('cm_delete_clip', { id })
}

export async function deleteClips(ids: string[]): Promise<number> {
  const invoke = await getInvoke()
  if (!invoke) return 0
  return invoke<number>('cm_delete_clips', { ids })
}

export async function togglePin(id: string): Promise<boolean> {
  const invoke = await getInvoke()
  if (!invoke) return false
  return invoke<boolean>('cm_toggle_pin', { id })
}

export async function clearHistory(keepPinned = true): Promise<number> {
  const invoke = await getInvoke()
  if (!invoke) return 0
  return invoke<number>('cm_clear_history', { keepPinned })
}

export async function getStats(): Promise<ClipStats | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  return invoke<ClipStats>('cm_get_stats')
}

// ── Copy / Paste ─────────────────────────────────────────────────────────────

export async function copyClip(id: string): Promise<void> {
  const invoke = await getInvoke()
  if (invoke) await invoke('cm_copy_clip', { id })
}

/** Copy arbitrary text (transformed content) with self-write suppression. */
export async function copyText(text: string): Promise<void> {
  const invoke = await getInvoke()
  if (invoke) await invoke('cm_copy_text', { text })
}

/** Returns 'pasted' or 'copied:<reason>' when key injection is unavailable */
export async function pasteClip(id: string): Promise<string> {
  const invoke = await getInvoke()
  if (!invoke) return 'copied:no-tauri'
  return invoke<string>('cm_paste_clip', { id })
}

export async function pasteStack(ids: string[]): Promise<string> {
  const invoke = await getInvoke()
  if (!invoke) return 'copied:no-tauri'
  return invoke<string>('cm_paste_stack', { ids })
}

export async function openPopup(mode?: string): Promise<void> {
  const invoke = await getInvoke()
  if (invoke) await invoke('cm_open_popup', { mode: mode ?? null })
}

/**
 * Open a file/directory with the OS default app via Rust (ACL-independent).
 * Returns 'ok', 'not-found' (path missing) or 'failed' (anything else).
 */
export async function openOsPath(path: string): Promise<'ok' | 'not-found' | 'failed'> {
  const invoke = await getInvoke()
  if (!invoke) return 'failed'
  try {
    await invoke('cm_open_path', { path })
    return 'ok'
  } catch (e) {
    return String(e).includes('not-found') ? 'not-found' : 'failed'
  }
}

// ── Snippets ─────────────────────────────────────────────────────────────────

export async function listSnippets(): Promise<SnippetEntry[]> {
  const invoke = await getInvoke()
  if (!invoke) return []
  return invoke<SnippetEntry[]>('cm_snippet_list')
}

export async function saveSnippet(snippet: SnippetEntry): Promise<SnippetEntry | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  return invoke<SnippetEntry>('cm_snippet_save', { snippet })
}

export async function deleteSnippet(id: string): Promise<void> {
  const invoke = await getInvoke()
  if (invoke) await invoke('cm_snippet_delete', { id })
}

// ── Rules ────────────────────────────────────────────────────────────────────

export async function listRules(): Promise<RuleEntry[]> {
  const invoke = await getInvoke()
  if (!invoke) return []
  return invoke<RuleEntry[]>('cm_rule_list')
}

export async function saveRule(rule: RuleEntry): Promise<RuleEntry | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  return invoke<RuleEntry>('cm_rule_save', { rule })
}

export async function deleteRule(id: string): Promise<void> {
  const invoke = await getInvoke()
  if (invoke) await invoke('cm_rule_delete', { id })
}

export async function toggleRule(id: string, enabled: boolean): Promise<void> {
  const invoke = await getInvoke()
  if (invoke) await invoke('cm_rule_toggle', { id, enabled })
}

// ── Settings ─────────────────────────────────────────────────────────────────

export async function getCmSettings(): Promise<CmSettingsResponse | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  return invoke<CmSettingsResponse>('cm_get_settings')
}

export async function saveCmSettings(settings: ClipboardSettings): Promise<void> {
  const invoke = await getInvoke()
  if (invoke) await invoke('cm_save_settings', { settings })
}

// ── Export / Import ──────────────────────────────────────────────────────────

export async function exportClips(format: 'json' | 'csv', path: string): Promise<number> {
  const invoke = await getInvoke()
  if (!invoke) return 0
  return invoke<number>('cm_export', { format, path })
}

export async function importClips(path: string): Promise<number> {
  const invoke = await getInvoke()
  if (!invoke) return 0
  return invoke<number>('cm_import', { path })
}

// ── Assets ───────────────────────────────────────────────────────────────────

export async function assetPath(fileName: string): Promise<string | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<string>('cm_asset_path', { fileName })
  } catch {
    return null
  }
}

/** Data URL for a stored image/thumbnail (safe to use as <img src>). */
export async function imageDataUrl(fileName: string): Promise<string | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<string>('cm_image_data_url', { fileName })
  } catch {
    return null
  }
}

// ── Events ───────────────────────────────────────────────────────────────────

/** Subscribe to history change broadcasts; returns an unlisten function. */
export async function onHistoryChanged(
  callback: (payload: HistoryChangedPayload) => void
): Promise<(() => void) | null> {
  const listen = await getListen()
  if (!listen) return null
  const unlisten = await listen<HistoryChangedPayload>('clipboard-history-changed', (event) => {
    callback(event.payload)
  })
  return unlisten
}

/** Subscribe to rule notification events (toast driven). */
export async function onRuleNotify(
  callback: (payload: { ruleName: string }) => void
): Promise<(() => void) | null> {
  const listen = await getListen()
  if (!listen) return null
  const unlisten = await listen<{ ruleName: string }>('clipboard-rule-notify', (event) => {
    callback(event.payload)
  })
  return unlisten
}

/** Subscribe to backend toast messages (e.g. image too large). */
export async function onToast(
  callback: (payload: { messageKey: string }) => void
): Promise<(() => void) | null> {
  const listen = await getListen()
  if (!listen) return null
  const unlisten = await listen<{ messageKey: string }>('clipboard-toast', (event) => {
    callback(event.payload)
  })
  return unlisten
}
