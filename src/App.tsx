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

    // Sync current language to Rust so utility windows get correct lang via initialization_script
    if (isTauri()) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('sync_app_language', { lang: i18n.language || 'zh-CN' }).catch(() => {})
      })

      // Signal Rust: React has mounted, safe to show this utility window (avoids flicker)
      // Exclude: main window, pick-overlay (own picker-ready), color-quick (own color-quick-ready)
      import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
        const label = getCurrentWindow().label
        const skip = ['main', 'pick-overlay', 'color-quick']
        if (label && !skip.includes(label)) {
          const { emit } = await import('@tauri-apps/api/event')
          emit('util-window-ready', label)
        }
      }).catch(() => {})
    }
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
