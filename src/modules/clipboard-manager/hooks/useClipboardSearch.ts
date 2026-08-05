/**
 * Clipboard Manager — Search hook
 * Local input state with debounced store update (FTS query runs on Rust side).
 */
import { useEffect, useRef, useState } from 'react'
import { useClipboardStore } from '../clipboardStore'

export function useClipboardSearch(debounceMs = 200) {
  const filters = useClipboardStore((s) => s.filters)
  const setSearch = useClipboardStore((s) => s.setSearch)
  const [query, setQuery] = useState(filters.search)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep local input in sync when filters are reset externally
  useEffect(() => {
    setQuery((prev) => (prev === filters.search ? prev : filters.search))
  }, [filters.search])

  const update = (value: string) => {
    setQuery(value)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setSearch(value.trim())
    }, debounceMs)
  }

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  return { query, update }
}
