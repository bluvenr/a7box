/**
 * A7Box App Entry Point
 */

import { useEffect, useCallback } from 'react'
import { I18nextProvider } from 'react-i18next'
import { i18n } from './core/i18n'
import { AppRouter } from './app/router'
import { initUsageHistory } from './core/command-palette'
import { useModuleRegistry } from './core/registry'
import { allModules } from './modules'
import { ToastProvider } from './shared/components'
import { useThemeProvider } from './core/theme/ThemeProvider'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function App() {
  const registerAll = useModuleRegistry((state) => state.registerAll)

  // Theme management
  useThemeProvider()

  // Build localized window title
  const getWindowTitle = useCallback(() => {
    const name = i18n.t('app.name')
    const desc = i18n.t('app.description')
    return `${name} - ${desc}`
  }, [])

  // Sync window title with current language (Tauri native title bar + browser tab)
  useEffect(() => {
    const updateTitle = () => {
      const title = getWindowTitle()
      document.title = title
      if (isTauri()) {
        import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
          getCurrentWindow().setTitle(title)
        }).catch(() => {})
      }
    }

    // Set title on mount
    updateTitle()

    // Update on language change
    i18n.on('languageChanged', updateTitle)
    return () => { i18n.off('languageChanged', updateTitle) }
  }, [getWindowTitle])

  // Initialization
  useEffect(() => {
    initUsageHistory()
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
