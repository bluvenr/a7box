/**
 * A7Box Global Shortcuts Hook
 * Listens for Tauri global shortcut events and dispatches to command palette / navigation
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCommandPalette } from '../command-palette'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function useGlobalShortcuts() {
  const navigate = useNavigate()
  const toggle = useCommandPalette((s) => s.toggle)

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
              // Show window (in case hidden to tray) and navigate
              navigate('/screenshot')
              import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
                const win = getCurrentWindow()
                win.show()
                win.setFocus()
              }).catch(() => {})
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
