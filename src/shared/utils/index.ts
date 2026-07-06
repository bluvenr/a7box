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

// ── Cross-platform shortcut display helpers ──

const _isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0

/** Format a Tauri shortcut string (e.g. "CommandOrControl+Shift+A") for display with platform symbols. */
export function formatShortcut(keys: string): string {
  return keys
    .replace(/CommandOrControl/g, _isMac ? '⌘' : 'Ctrl')
    .replace(/Command/g, '⌘')
    .replace(/Control/g, _isMac ? '⌃' : 'Ctrl')
    .replace(/Shift/g, _isMac ? '⇧' : 'Shift')
    .replace(/Alt/g, _isMac ? '⌥' : 'Alt')
    .replace(/Super/g, _isMac ? '⌘' : 'Win')
    .replace(/\+/g, _isMac ? '' : '+')
}

/** Format plain-text shortcut hints (e.g. "Alt+F Format · Alt+M Compress") with macOS ⌥ symbol. */
export function formatPlainShortcuts(text: string): string {
  if (!_isMac) return text
  return text.replace(/Alt\+/g, '⌥')
}
