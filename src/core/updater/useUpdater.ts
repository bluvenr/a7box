/**
 * A7Box Auto-Updater Hook
 * Checks for updates via Tauri updater plugin
 */
import { useState, useCallback } from 'react'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export interface UpdateInfo {
  version: string
  body: string
  date: string
}

export interface UpdateState {
  checking: boolean
  available: boolean
  downloading: boolean
  progress: number
  info: UpdateInfo | null
  error: string | null
}

const initialState: UpdateState = {
  checking: false,
  available: false,
  downloading: false,
  progress: 0,
  info: null,
  error: null,
}

export function useUpdater() {
  const [state, setState] = useState<UpdateState>(initialState)

  const checkForUpdates = useCallback(async () => {
    if (!isTauri()) {
      setState((s) => ({ ...s, error: 'Auto-update requires desktop app (Tauri)' }))
      return
    }

    setState((s) => ({ ...s, checking: true, error: null }))

    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()

      if (update) {
        setState((s) => ({
          ...s,
          checking: false,
          available: true,
          info: {
            version: update.version,
            body: update.body || '',
            date: update.date || '',
          },
        }))
      } else {
        setState((s) => ({ ...s, checking: false, available: false, info: null }))
      }
    } catch (e) {
      setState((s) => ({
        ...s,
        checking: false,
        error: String(e),
      }))
    }
  }, [])

  const downloadAndInstall = useCallback(async () => {
    if (!isTauri()) return

    setState((s) => ({ ...s, downloading: true, progress: 0 }))

    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()

      if (!update) {
        setState((s) => ({ ...s, downloading: false, error: 'No update available' }))
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
              setState((s) => ({
                ...s,
                progress: Math.round((downloaded / total) * 100),
              }))
            }
            break
          case 'Finished':
            setState((s) => ({ ...s, downloading: false, progress: 100 }))
            break
        }
      })

      // Restart after install
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch (e) {
      setState((s) => ({
        ...s,
        downloading: false,
        error: String(e),
      }))
    }
  }, [])

  return { ...state, checkForUpdates, downloadAndInstall }
}
