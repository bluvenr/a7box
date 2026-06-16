/**
 * A7Box i18n Configuration
 */

import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from '../../locales/zh-CN.json'
import enUS from '../../locales/en-US.json'

// Supported languages
export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', name: '简体中文' },
  { code: 'en-US', name: 'English' },
] as const

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code']

// Detect system language
function detectLanguage(): LanguageCode {
  const browserLang = navigator.language
  if (browserLang.startsWith('zh')) {
    return 'zh-CN'
  }
  return 'en-US'
}

// Initialize i18next
export const i18n = i18next.createInstance()

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS },
  },
  lng: detectLanguage(),
  fallbackLng: 'en-US',
  interpolation: {
    escapeValue: false, // React handles XSS
  },
})

// Change language
export async function changeLanguage(lang: LanguageCode): Promise<void> {
  await i18n.changeLanguage(lang)
  localStorage.setItem('a7box-language', lang)
}

// Get current language
export function getCurrentLanguage(): LanguageCode {
  return (i18n.language as LanguageCode) || 'en-US'
}

// Get saved language (used on startup)
export function getSavedLanguage(): LanguageCode | null {
  return localStorage.getItem('a7box-language') as LanguageCode | null
}

export default i18n
