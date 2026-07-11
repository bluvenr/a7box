/**
 * A7Box Global Updater Store
 * Shared state for update checking, downloading and notification visibility.
 * Consumed by both the UpdateNotification popup and the Settings page.
 */

import { create } from 'zustand'
import { isTauri } from '../../shared/utils'

// LocalStorage keys for persisting dismiss/remind decisions
const SKIP_KEY = 'a7box-skip-version'
const REMIND_KEY = 'a7box-remind-later'
const DISMISSED_AT_KEY = 'a7box-update-dismissed-at'

/** Read persisted skip version */
function getSkipVersion(): string | null {
  try { return localStorage.getItem(SKIP_KEY) } catch { return null }
}

/** Read persisted remind-later timestamp */
function getRemindLater(): number | null {
  try {
    const v = localStorage.getItem(REMIND_KEY)
    return v ? Number(v) : null
  } catch { return null }
}

/** Read when user last closed the notification with X */
function getDismissedAt(): number | null {
  try {
    const v = localStorage.getItem(DISMISSED_AT_KEY)
    return v ? Number(v) : null
  } catch { return null }
}

export interface UpdateInfo {
  version: string
  body: string
  date: string
}

interface UpdaterState {
  // Status
  checked: boolean  // whether a check has been performed at least once
  checking: boolean
  available: boolean
  downloading: boolean
  progress: number
  info: UpdateInfo | null
  error: string | null

  // Notification visibility (for the bottom-left popup)
  notificationVisible: boolean

  // Actions
  checkForUpdates: (silent?: boolean) => Promise<void>
  downloadAndInstall: () => Promise<void>
  dismissVersion: () => void
  remindLater: () => void
  hideNotification: () => void
  showNotification: () => void
}

export const useUpdaterStore = create<UpdaterState>()((set, get) => ({
  checked: false,
  checking: false,
  available: false,
  downloading: false,
  progress: 0,
  info: null,
  error: null,
  notificationVisible: false,

  checkForUpdates: async (silent = false) => {
    if (!isTauri()) {
      if (!silent) set({ error: 'Auto-update requires desktop app', checked: true })
      return
    }

    // Prevent concurrent checks
    if (get().checking) return

    set({ checking: true, error: null })

    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()

      if (update) {
        const info: UpdateInfo = {
          version: update.version,
          body: update.body || '',
          date: update.date || '',
        }

        // Check if user dismissed or skipped this version
        const skipped = getSkipVersion()
        const reminded = getRemindLater()
        const dismissedAt = getDismissedAt()
        const isDismissed = skipped === update.version
        // Remind later: 24 hours cooldown
        const isRemindCooldown = reminded !== null && (Date.now() - reminded < 24 * 60 * 60 * 1000)
        // X-close: 4 hours cooldown to avoid periodic check pop-up fatigue
        const isDismissCooldown = dismissedAt !== null && (Date.now() - dismissedAt < 4 * 60 * 60 * 1000)
        const shouldShow = !isDismissed && !isRemindCooldown && !isDismissCooldown

        set({
          checking: false,
          checked: true,
          available: true,
          info,
          notificationVisible: shouldShow && !silent,
        })
      } else {
        set({ checking: false, checked: true, available: false, info: null, notificationVisible: false })
      }
    } catch (e) {
      set({ checking: false, checked: true, error: String(e) })
      if (!silent) set({ notificationVisible: false })
    }
  },

  downloadAndInstall: async () => {
    if (!isTauri()) return

    set({ downloading: true, progress: 0 })

    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()

      if (!update) {
        set({ downloading: false, error: 'No update available' })
        return
      }

      let downloaded = 0
      let total = 0

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            total = event.data.contentLength || 0
            break
          case 'Progress':
            downloaded += event.data.chunkLength
            if (total > 0) {
              set({ progress: Math.round((downloaded / total) * 100) })
            }
            break
          case 'Finished':
            set({ downloading: false, progress: 100 })
            break
        }
      })

      // Restart after install
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch (e) {
      set({ downloading: false, error: String(e) })
    }
  },

  dismissVersion: () => {
    const { info } = get()
    if (info?.version) {
      try { localStorage.setItem(SKIP_KEY, info.version) } catch { /* ignore */ }
    }
    set({ notificationVisible: false })
  },

  remindLater: () => {
    try { localStorage.setItem(REMIND_KEY, String(Date.now())) } catch { /* ignore */ }
    set({ notificationVisible: false })
  },

  hideNotification: () => {
    try { localStorage.setItem(DISMISSED_AT_KEY, String(Date.now())) } catch { /* ignore */ }
    set({ notificationVisible: false, error: null })
  },

  showNotification: () => {
    const { available } = get()
    if (available) set({ notificationVisible: true })
  },
}))
