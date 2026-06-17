/**
 * A7Box Settings System
 * Uses Zustand for global app settings management with persistence
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { detectLanguage } from '../i18n/i18n'

/** App settings type */
export interface AppSettings {
  // General
  language: 'zh-CN' | 'en-US'
  autoStart: boolean
  minimizeToTray: boolean
  checkUpdateOnStart: boolean

  // Appearance
  theme: 'dark' | 'light' | 'system'
  fontSize: number

  // Shortcuts
  commandPaletteShortcut: string
  customShortcuts: Record<string, string>

  // Module enabled status
  enabledModules: Record<string, boolean>
}

/** Default settings */
const defaultSettings: AppSettings = {
  language: detectLanguage(),
  autoStart: false,
  minimizeToTray: true,
  checkUpdateOnStart: true,
  theme: 'dark',
  fontSize: 14,
  commandPaletteShortcut: 'CommandOrControl+Shift+A',
  customShortcuts: {},
  enabledModules: {},
}

interface SettingsState extends AppSettings {
  /** Update a single setting */
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  /** Update multiple settings */
  updateSettings: (updates: Partial<AppSettings>) => void
  /** Reset to defaults */
  resetSettings: () => void
  /** Check if module is enabled */
  isModuleEnabled: (moduleId: string) => boolean
  /** Set module enabled status */
  setModuleEnabled: (moduleId: string, enabled: boolean) => void
  /** Get custom shortcut for a command */
  getCustomShortcut: (commandId: string) => string | undefined
  /** Set custom shortcut for a command */
  setCustomShortcut: (commandId: string, shortcut: string) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...defaultSettings,

      updateSetting: (key, value) => {
        set({ [key]: value })
      },

      updateSettings: (updates) => {
        set(updates)
      },

      resetSettings: () => {
        set(defaultSettings)
      },

      isModuleEnabled: (moduleId) => {
        const { enabledModules } = get()
        return enabledModules[moduleId] ?? true
      },

      setModuleEnabled: (moduleId, enabled) => {
        set((state) => ({
          enabledModules: {
            ...state.enabledModules,
            [moduleId]: enabled,
          },
        }))
      },

      getCustomShortcut: (commandId) => {
        return get().customShortcuts[commandId]
      },

      setCustomShortcut: (commandId, shortcut) => {
        set((state) => ({
          customShortcuts: {
            ...state.customShortcuts,
            [commandId]: shortcut,
          },
        }))
      },
    }),
    {
      name: 'a7box-settings',
    }
  )
)

// Convenience hooks
export function useSetting<K extends keyof AppSettings>(key: K) {
  return useSettingsStore((state) => state[key])
}

export function useUpdateSetting() {
  return useSettingsStore((state) => state.updateSetting)
}
