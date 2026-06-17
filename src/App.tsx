/**
 * A7Box App Entry Point
 */

import { useEffect } from 'react'
import { I18nextProvider } from 'react-i18next'
import { i18n } from './core/i18n'
import { AppRouter } from './app/router'
import { useCommandPalette, initUsageHistory } from './core/command-palette'
import { useModuleRegistry } from './core/registry'
import { allModules } from './modules'
import { ToastProvider } from './shared/components'
import { useThemeProvider } from './core/theme/ThemeProvider'

function App() {
  const toggle = useCommandPalette((state) => state.toggle)
  const registerAll = useModuleRegistry((state) => state.registerAll)

  // Theme management
  useThemeProvider()

  // Initialization
  useEffect(() => {
    // Initialize usage history
    initUsageHistory()
    // Register all modules
    registerAll(allModules)
  }, [registerAll])

  // Global keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+A to open command palette
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault()
        toggle()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggle])

  return (
    <I18nextProvider i18n={i18n}>
      <ToastProvider>
        <AppRouter />
      </ToastProvider>
    </I18nextProvider>
  )
}

export default App
