/**
 * A7Box Global Shortcuts Hook
 * Listens for Tauri global shortcut events and dispatches to command palette / navigation
 */
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCommandPalette } from '../command-palette'
import { useShortcutStore } from './shortcutStore'
import { useModuleRegistry } from '../registry'
import { isTauri } from '../../shared/utils'

export function useGlobalShortcuts() {
  const navigate = useNavigate()
  const toggle = useCommandPalette((s) => s.toggle)

  // Sync shortcuts to Rust on mount, respecting module enabled state
  // Wait for modules to register before syncing (they may not be ready yet)
  useEffect(() => {
    if (!isTauri()) return

    const syncShortcuts = (enabledIds: Set<string>) => {
      const shortcuts = useShortcutStore.getState().shortcuts

      import('@tauri-apps/api/core').then(({ invoke }) => {
        for (const sc of shortcuts) {
          const moduleEnabled = !sc.moduleId || enabledIds.has(sc.moduleId)
          const shouldRegister = sc.enabled && moduleEnabled
          invoke('update_shortcut', {
            action: sc.action,
            keys: sc.keys,
            enabled: shouldRegister,
          }).catch(() => {})
        }
      }).catch(() => {})
    }

    // Check if modules are already registered
    const currentIds = useModuleRegistry.getState().enabledModuleIds
    if (currentIds.size > 0) {
      syncShortcuts(currentIds)
    } else {
      // Modules not ready yet — wait for them to register
      const unsub = useModuleRegistry.subscribe((state) => {
        if (state.enabledModuleIds.size > 0) {
          syncShortcuts(state.enabledModuleIds)
          unsub()
        }
      })
      return unsub
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
    let unlistenPalette: (() => void) | undefined

    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        unlisten = await listen<string>('global-shortcut', (event) => {
          switch (event.payload) {
            // 'open-screenshot' is now handled entirely on the Rust side
            case 'clipboard-to-qr':
              break
          }
        })

        // Listen for palette navigation events (from standalone palette window)
        unlistenPalette = await listen<{ path: string }>('palette-navigate', (event) => {
          const { path } = event.payload
          if (path) {
            // Show and focus main window
            import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
              const win = getCurrentWindow()
              win.show()
              win.unminimize()
              win.setFocus()
            }).catch(() => {})
            // Navigate to the selected path
            navigate(path)
          }
        })
      } catch {
        // Tauri API not available
      }
    })()

    return () => { unlisten?.(); unlistenPalette?.() }
  }, [navigate])

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
