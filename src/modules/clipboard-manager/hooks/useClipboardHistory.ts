/**
 * Clipboard Manager — History data hook
 * Loads history on mount, subscribes to cross-window change events.
 */
import { useEffect } from 'react'
import { initClipboardEvents, useClipboardStore } from '../clipboardStore'

/**
 * Ensures history is loaded and stays in sync with Rust broadcasts.
 * Safe to call from multiple components — event subscription is idempotent.
 */
export function useClipboardHistory() {
  const loadHistory = useClipboardStore((s) => s.loadHistory)
  const loadStats = useClipboardStore((s) => s.loadStats)
  const loadSettings = useClipboardStore((s) => s.loadSettings)

  useEffect(() => {
    const stop = initClipboardEvents()
    void loadHistory(true)
    void loadStats()
    void loadSettings()
    return stop
  }, [loadHistory, loadStats, loadSettings])

  return useClipboardStore
}
