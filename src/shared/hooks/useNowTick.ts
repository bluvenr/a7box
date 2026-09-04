/**
 * A7Box useNowTick Hook
 * Periodically re-renders the component so relative-time displays
 * (e.g. "overdue by X min", "starts in X min") stay fresh.
 */

import { useState, useEffect } from 'react'

/**
 * Returns the current timestamp, refreshed every `intervalMs`.
 * Display granularity is minute-level in most callers, so the default
 * 15s tick keeps text up-to-date at negligible cost.
 */
export function useNowTick(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])

  return now
}
