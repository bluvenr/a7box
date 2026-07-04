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
