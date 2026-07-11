/**
 * A7Box Shared Utils
 */

export { recordUsage, getRecentModuleIds, getAllHistory } from './usageHistory'
export {
  // Clipboard
  startClipboardWatcher,
  stopClipboardWatcher,
  getClipboardText,
  onClipboardChanged,
  // Screenshot
  scanScreenshotHistory,
  // HTTP Server
  startHttpServer,
  stopHttpServer,
  getHttpServerInfo,
} from './tauriBridge'
export type { CaptureResult, ServerInfo } from './tauriBridge'

// ── Environment detection ──

/** Detect whether running in Tauri context (vs plain browser) */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** Detect whether running on macOS */
export function isMac(): boolean {
  return typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
}

// ── Cross-platform shortcut display helpers ──

/** Format a Tauri shortcut string (e.g. "CommandOrControl+Shift+A") for display with platform symbols. */
export function formatShortcut(keys: string): string {
  const mac = isMac()
  return keys
    .replace(/CommandOrControl/g, mac ? '⌘' : 'Ctrl')
    .replace(/Command/g, '⌘')
    .replace(/Control/g, mac ? '⌃' : 'Ctrl')
    .replace(/Shift/g, mac ? '⇧' : 'Shift')
    .replace(/Alt/g, mac ? '⌥' : 'Alt')
    .replace(/Super/g, mac ? '⌘' : 'Win')
    .replace(/\+/g, mac ? '' : '+')
}

/** Format plain-text shortcut hints (e.g. "Alt+F Format · Alt+M Compress") with macOS ⌥ symbol. */
export function formatPlainShortcuts(text: string): string {
  if (!isMac()) return text
  return text.replace(/Alt\+/g, '⌥')
}
