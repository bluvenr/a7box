/**
 * A7Box Global Shortcuts Hook
 * Listens for Tauri global shortcut events and dispatches to command palette / navigation
 */
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCommandPalette } from '../command-palette'
import { useShortcutStore } from './shortcutStore'
import { useModuleRegistry } from '../registry'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function useGlobalShortcuts() {
  const navigate = useNavigate()
  const toggle = useCommandPalette((s) => s.toggle)

  // Sync shortcuts to Rust on mount, respecting module enabled state
  useEffect(() => {
    if (!isTauri()) return

    const STORAGE_KEY = 'a7box-shortcuts'
    const enabledIds = useModuleRegistry.getState().enabledModuleIds

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const shortcuts: Array<{ action: string; keys: string; enabled: boolean; moduleId?: string | null }> =
        stored ? JSON.parse(stored) : useShortcutStore.getState().shortcuts

      import('@tauri-apps/api/core').then(({ invoke }) => {
        for (const sc of shortcuts) {
          // If the shortcut depends on a module that is disabled, skip registration
          const moduleEnabled = !sc.moduleId || enabledIds.has(sc.moduleId)
          const shouldRegister = sc.enabled && moduleEnabled
          invoke('update_shortcut', {
            action: sc.action,
            keys: sc.keys,
            enabled: shouldRegister,
          }).catch(() => {})
        }
      }).catch(() => {})
    } catch {
      // localStorage not available or invalid JSON
    }
  }, [])

  // Watch module registry changes and toggle dependent shortcuts in Rust
  const prevEnabledIds = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!isTauri()) return
    return useModuleRegistry.subscribe((state) => {
      const currentIds = state.enabledModuleIds
      if (prevEnabledIds.current === null) { prevEnabledIds.current = currentIds; return }

      // Find changed module IDs
      const prev = prevEnabledIds.current
      prevEnabledIds.current = currentIds
      const changed: Array<{ moduleId: string; enabled: boolean }> = []
      for (const id of currentIds) if (!prev.has(id)) changed.push({ moduleId: id, enabled: true })
      for (const id of prev) if (!currentIds.has(id)) changed.push({ moduleId: id, enabled: false })
      if (changed.length === 0) return

      const shortcuts = useShortcutStore.getState().shortcuts
      import('@tauri-apps/api/core').then(({ invoke }) => {
        for (const { moduleId, enabled: modEnabled } of changed) {
          const affected = shortcuts.filter((s) => s.moduleId === moduleId)
          for (const sc of affected) {
            // Only register if both user-toggle and module are enabled
            invoke('update_shortcut', {
              action: sc.action,
              keys: sc.keys,
              enabled: sc.enabled && modEnabled,
            }).catch(() => {})
          }
        }
      }).catch(() => {})
    })
  }, [])

  // Listen for Tauri global-shortcut events and dispatch in frontend
  useEffect(() => {
    if (!isTauri()) return

    let unlisten: (() => void) | undefined

    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        unlisten = await listen<string>('global-shortcut', (event) => {
          switch (event.payload) {
            case 'toggle-command-palette':
              toggle()
              break
            case 'open-screenshot':
              navigate('/screenshot')
              import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
                const win = getCurrentWindow()
                win.show()
                win.setFocus()
              }).catch(() => {})
              break
            case 'clipboard-to-qr':
              break
          }
        })
      } catch {
        // Tauri API not available
      }
    })()

    return () => { unlisten?.() }
  }, [toggle, navigate])

  // Also listen for Ctrl+K / Ctrl+Shift+P keyboard shortcuts (browser fallback)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K → toggle command palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggle])
}
