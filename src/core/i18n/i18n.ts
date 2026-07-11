/**
 * A7Box i18n Configuration
 */

import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from '../../locales/zh-CN.json'
import enUS from '../../locales/en-US.json'
import { isTauri } from '../../shared/utils'

// Supported languages
export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', name: '简体中文' },
  { code: 'en-US', name: 'English' },
] as const

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code']

// Detect system language
export function detectLanguage(): LanguageCode {
  const browserLang = navigator.language
  if (browserLang.startsWith('zh')) {
    return 'zh-CN'
  }
  return 'en-US'
}

/**
 * Resolve initial language.
 * Priority: injected global (Tauri init script) > localStorage > system detect.
 */
function getInitialLanguage(): LanguageCode {
  // 1. Check injected global (set by Tauri initialization_script BEFORE page scripts run)
  const injected = (window as any).__A7BOX_LANG__ as string | undefined
  if (injected && SUPPORTED_LANGUAGES.some((l) => l.code === injected)) {
    localStorage.setItem('a7box-language', injected)
    return injected as LanguageCode
  }
  // 2. localStorage saved preference
  const saved = localStorage.getItem('a7box-language') as LanguageCode | null
  if (saved) return saved
  // 3. System detection
  const detected = detectLanguage()
  localStorage.setItem('a7box-language', detected)
  return detected
}

// Initialize i18next
export const i18n = i18next.createInstance()

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS },
  },
  lng: getInitialLanguage(),
  fallbackLng: 'en-US',
  interpolation: {
    escapeValue: false, // React handles XSS
  },
})

// Change language
export async function changeLanguage(lang: LanguageCode): Promise<void> {
  await i18n.changeLanguage(lang)
  localStorage.setItem('a7box-language', lang)

  // Notify Rust backend to update tray menu language
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('update_tray_language', { lang })
    } catch { /* ignore in browser mode */ }
  }
}

export default i18n
