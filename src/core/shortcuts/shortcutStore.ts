/**
 * Shortcut Configuration Store
 * Manages global keyboard shortcuts with localStorage persistence.
 * Keys use Tauri format: CommandOrControl+Shift+Q (cross-platform)
 */
import { create } from 'zustand'

export interface ShortcutConfig {
  action: string
  labelI18n: string
  /** Optional description i18n key for tooltip */
  descriptionI18n?: string
  keys: string
  enabled: boolean
  /** Module ID this shortcut depends on. null = core (always available) */
  moduleId: string | null
}

interface ShortcutState {
  shortcuts: ShortcutConfig[]
  updateShortcut: (action: string, keys: string) => void
  toggleShortcut: (action: string, enabled: boolean) => void
  resetDefaults: () => void
}

const STORAGE_KEY = 'a7box-shortcuts'

const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  // ── Core controls ──
  {
    action: 'toggle-command-palette',
    labelI18n: 'settings.shortcutCommandPalette',
    descriptionI18n: 'settings.shortcutCommandPaletteDesc',
    keys: 'CommandOrControl+Shift+A',
    enabled: true,
    moduleId: null,
  },
  {
    action: 'toggle-window',
    labelI18n: 'settings.shortcutToggleWindow',
    descriptionI18n: 'settings.shortcutToggleWindowDesc',
    keys: 'CommandOrControl+Shift+H',
    enabled: true,
    moduleId: null,
  },
  // ── Standalone action tools ──
  {
    action: 'open-screenshot',
    labelI18n: 'settings.shortcutScreenshot',
    descriptionI18n: 'settings.shortcutScreenshotDesc',
    keys: 'CommandOrControl+Shift+S',
    enabled: true,
    moduleId: 'screenshot',
  },
  {
    action: 'open-color-picker',
    labelI18n: 'settings.shortcutColorPicker',
    descriptionI18n: 'settings.shortcutColorPickerDesc',
    keys: 'CommandOrControl+Shift+C',
    enabled: true,
    moduleId: 'color-tool',
  },
  // ── Clipboard quick actions ──
  {
    action: 'clipboard-to-json',
    labelI18n: 'settings.shortcutClipboardJson',
    descriptionI18n: 'settings.shortcutClipboardJsonDesc',
    keys: 'CommandOrControl+Shift+J',
    enabled: true,
    moduleId: 'json-formatter',
  },
  {
    action: 'clipboard-to-code-minify',
    labelI18n: 'settings.shortcutClipboardCodeMinify',
    descriptionI18n: 'settings.shortcutClipboardCodeMinifyDesc',
    keys: 'CommandOrControl+Shift+K',
    enabled: true,
    moduleId: 'code-minify',
  },
  {
    action: 'clipboard-to-md',
    labelI18n: 'settings.shortcutClipboardMd',
    descriptionI18n: 'settings.shortcutClipboardMdDesc',
    keys: 'CommandOrControl+Shift+M',
    enabled: true,
    moduleId: 'markdown-preview',
  },
  {
    action: 'clipboard-to-qr',
    labelI18n: 'settings.shortcutClipboardQr',
    descriptionI18n: 'settings.shortcutClipboardQrDesc',
    keys: 'CommandOrControl+Shift+Q',
    enabled: true,
    moduleId: 'qr-code',
  },
  // ── Quick create ──
  {
    action: 'quick-create-reminder',
    labelI18n: 'settings.shortcutQuickReminder',
    descriptionI18n: 'settings.shortcutQuickReminderDesc',
    keys: 'CommandOrControl+Shift+R',
    enabled: true,
    moduleId: 'reminder',
  },
]

function loadShortcuts(): ShortcutConfig[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return DEFAULT_SHORTCUTS

    const parsed: ShortcutConfig[] = JSON.parse(stored)
    // Merge with defaults: keep user customizations, add new defaults
    const map = new Map(parsed.map((s) => [s.action, s]))
    return DEFAULT_SHORTCUTS.map((def) => {
      const user = map.get(def.action)
      return user
        ? { ...def, keys: user.keys, enabled: user.enabled }
        : def
    })
  } catch {
    return DEFAULT_SHORTCUTS
  }
}

function saveShortcuts(shortcuts: ShortcutConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts))
}

export const useShortcutStore = create<ShortcutState>((set) => ({
  shortcuts: loadShortcuts(),

  updateShortcut: (action, keys) =>
    set((state) => {
      const next = state.shortcuts.map((s) =>
        s.action === action ? { ...s, keys } : s
      )
      saveShortcuts(next)
      return { shortcuts: next }
    }),

  toggleShortcut: (action, enabled) =>
    set((state) => {
      const next = state.shortcuts.map((s) =>
        s.action === action ? { ...s, enabled } : s
      )
      saveShortcuts(next)
      return { shortcuts: next }
    }),

  resetDefaults: () =>
    set(() => {
      saveShortcuts(DEFAULT_SHORTCUTS)
      return { shortcuts: DEFAULT_SHORTCUTS }
    }),
}))
