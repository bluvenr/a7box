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

  // Module management
  enabledModules: Record<string, boolean>
  moduleOrder: string[]
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
  moduleOrder: [],
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
  /** Get ordered module IDs (for sidebar/home sorting) */
  getModuleOrder: () => string[]
  /** Move a module up or down in the order */
  moveModule: (moduleId: string, direction: 'up' | 'down') => void
  /** Reorder module from one index to another (for drag-and-drop) */
  reorderModule: (fromIndex: number, toIndex: number) => void
  /** Sync module order with registered modules (add new, remove deleted) */
  syncModuleOrder: (registeredIds: string[]) => void
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

      getModuleOrder: () => {
        return get().moduleOrder
      },

      moveModule: (moduleId, direction) => {
        set((state) => {
          const order = [...state.moduleOrder]
          const idx = order.indexOf(moduleId)
          if (idx < 0) return state
          const swapIdx = direction === 'up' ? idx - 1 : idx + 1
          if (swapIdx < 0 || swapIdx >= order.length) return state
          ;[order[idx], order[swapIdx]] = [order[swapIdx], order[idx]]
          return { moduleOrder: order }
        })
      },

      reorderModule: (fromIndex, toIndex) => {
        set((state) => {
          const order = [...state.moduleOrder]
          if (fromIndex < 0 || fromIndex >= order.length) return state
          if (toIndex < 0 || toIndex >= order.length) return state
          if (fromIndex === toIndex) return state
          const [item] = order.splice(fromIndex, 1)
          order.splice(toIndex, 0, item)
          return { moduleOrder: order }
        })
      },

      syncModuleOrder: (registeredIds) => {
        set((state) => {
          const existing = state.moduleOrder.filter((id) => registeredIds.includes(id))
          const newIds = registeredIds.filter((id) => !existing.includes(id))
          return { moduleOrder: [...existing, ...newIds] }
        })
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
