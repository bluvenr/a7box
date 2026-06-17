/**
 * A7Box App Entry Point
 */

import { useEffect } from 'react'
import { I18nextProvider } from 'react-i18next'
import { i18n } from './core/i18n'
import { AppRouter } from './app/router'
import { initUsageHistory } from './core/command-palette'
import { useModuleRegistry } from './core/registry'
import { allModules } from './modules'
import { ToastProvider } from './shared/components'
import { useThemeProvider } from './core/theme/ThemeProvider'

function App() {
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

  return (
    <I18nextProvider i18n={i18n}>
      <ToastProvider>
        <AppRouter />
      </ToastProvider>
    </I18nextProvider>
  )
}

export default App
