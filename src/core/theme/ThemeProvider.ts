/**
 * A7Box Theme System
 * Manages dark/light theme via data-theme attribute on <html>
 * Reads/writes theme preference from settings store
 */

import { useEffect } from 'react'
import { useSettingsStore } from '../settings'

type Theme = 'dark' | 'light' | 'system'

/** Apply theme to document */
function applyTheme(theme: Theme) {
  const root = document.documentElement

  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
  } else {
    root.setAttribute('data-theme', theme)
  }
}

/** Theme provider hook - call once in App root */
export function useThemeProvider() {
  const theme = useSettingsStore((s) => s.theme)

  useEffect(() => {
    applyTheme(theme)

    // Listen for system theme changes when 'system' mode
    if (theme !== 'system') return

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])
}

/** Get current effective theme */
export function getEffectiveTheme(): 'dark' | 'light' {
  const stored = useSettingsStore.getState().theme
  if (stored === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return stored
}
