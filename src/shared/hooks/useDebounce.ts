/**
 * A7Box useDebounce Hook
 * Debounced value and callback utilities
 */

import { useState, useEffect, useCallback, useRef } from 'react'

/** Debounce a value - returns the debounced value after delay */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

/** Debounce a callback - returns a debounced version of the function */
export function useDebouncedCallback<T extends (...args: never[]) => unknown>(
  callback: T,
  delay = 300
): T {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const callbackRef = useRef(callback)

  // Always keep latest callback
  callbackRef.current = callback

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return useCallback(
    ((...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => callbackRef.current(...args), delay)
    }) as T,
    [delay]
  )
}
