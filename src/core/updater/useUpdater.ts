/**
 * A7Box Auto-Updater Hook
 * Thin wrapper around the global updater zustand store.
 * API-compatible with the previous hook-based implementation.
 */

import { useUpdaterStore } from './updaterStore'

export type { UpdateInfo } from './updaterStore'

export interface UpdateState {
  checking: boolean
  available: boolean
  downloading: boolean
  progress: number
  info: { version: string; body: string; date: string } | null
  error: string | null
  notificationVisible: boolean
  checkForUpdates: (silent?: boolean) => Promise<void>
  downloadAndInstall: () => Promise<void>
  dismissVersion: () => void
  remindLater: () => void
  hideNotification: () => void
  showNotification: () => void
}

export function useUpdater(): UpdateState {
  return {
    checking: useUpdaterStore((s) => s.checking),
    available: useUpdaterStore((s) => s.available),
    downloading: useUpdaterStore((s) => s.downloading),
    progress: useUpdaterStore((s) => s.progress),
    info: useUpdaterStore((s) => s.info),
    error: useUpdaterStore((s) => s.error),
    notificationVisible: useUpdaterStore((s) => s.notificationVisible),
    checkForUpdates: useUpdaterStore((s) => s.checkForUpdates),
    downloadAndInstall: useUpdaterStore((s) => s.downloadAndInstall),
    dismissVersion: useUpdaterStore((s) => s.dismissVersion),
    remindLater: useUpdaterStore((s) => s.remindLater),
    hideNotification: useUpdaterStore((s) => s.hideNotification),
    showNotification: useUpdaterStore((s) => s.showNotification),
  }
}
