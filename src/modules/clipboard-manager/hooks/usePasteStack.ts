/**
 * Clipboard Manager — Paste Stack hook
 * Batch paste queue: queue entries, reorder, run sequential paste.
 */
import { useCallback, useMemo, useState } from 'react'
import { useClipboardStore } from '../clipboardStore'
import type { ClipEntry } from '../types'

export function usePasteStack() {
  const pasteStack = useClipboardStore((s) => s.pasteStack)
  const items = useClipboardStore((s) => s.items)
  const addToStack = useClipboardStore((s) => s.addToStack)
  const removeFromStack = useClipboardStore((s) => s.removeFromStack)
  const moveInStack = useClipboardStore((s) => s.moveInStack)
  const clearStack = useClipboardStore((s) => s.clearStack)
  const runStack = useClipboardStore((s) => s.runStack)
  const [running, setRunning] = useState(false)

  /** Resolve queued ids to entries (entries may be absent when paged out). */
  const entries: ClipEntry[] = useMemo(() => {
    return pasteStack
      .map((id) => items.find((c) => c.id === id))
      .filter((c): c is ClipEntry => Boolean(c))
  }, [pasteStack, items])

  const run = useCallback(async (): Promise<string> => {
    if (running) return 'running'
    setRunning(true)
    try {
      return await runStack()
    } finally {
      setRunning(false)
    }
  }, [running, runStack])

  return {
    ids: pasteStack,
    entries,
    running,
    add: addToStack,
    remove: removeFromStack,
    move: moveInStack,
    clear: clearStack,
    run,
  }
}
