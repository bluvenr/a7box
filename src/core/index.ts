/**
 * A7Box Core Module Exports
 */

// Type definitions
export type {
  A7Module,
  A7ModuleMeta,
  A7Command,
  A7SettingItem,
  CommandContext,
  CommandSearchItem,
  ModuleCategory,
  TrayMenuItem,
  WindowInfo,
  CategoryMeta,
} from './types'

export { CATEGORIES } from './types'

// Module registry
export { useModuleRegistry } from './registry'

// Settings system
export { useSettingsStore, useSetting, useUpdateSetting } from './settings'
export type { AppSettings } from './settings'

// i18n
export { i18n, changeLanguage, getCurrentLanguage, SUPPORTED_LANGUAGES } from './i18n'
export type { LanguageCode } from './i18n'
