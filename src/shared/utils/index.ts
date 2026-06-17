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
  captureFullScreen,
  captureRegion,
  captureToBase64,
  getMonitors,
  // HTTP Server
  startHttpServer,
  stopHttpServer,
  getHttpServerInfo,
} from './tauriBridge'
export type { CaptureResult, MonitorInfo, ServerInfo } from './tauriBridge'
