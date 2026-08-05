/**
 * Shortcut Configuration Store
 * Manages global keyboard shortcuts with zustand persist middleware.
 * Keys use Tauri format: CommandOrControl+Shift+Q (cross-platform)
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
  // ── Clipboard manager ──
  {
    action: 'open-clipboard-popup',
    labelI18n: 'settings.shortcutClipboardPopup',
    descriptionI18n: 'settings.shortcutClipboardPopupDesc',
    keys: 'Alt+V',
    enabled: true,
    moduleId: 'clipboard-manager',
  },
  {
    action: 'clipboard-paste-stack',
    labelI18n: 'settings.shortcutPasteStack',
    descriptionI18n: 'settings.shortcutPasteStackDesc',
    keys: 'Alt+Shift+V',
    enabled: true,
    moduleId: 'clipboard-manager',
  },
]

export const useShortcutStore = create<ShortcutState>()(

  persist(
    (set) => ({
      shortcuts: DEFAULT_SHORTCUTS,

      updateShortcut: (action, keys) =>
        set((state) => ({
          shortcuts: state.shortcuts.map((s) =>
            s.action === action ? { ...s, keys } : s
          ),
        })),

      toggleShortcut: (action, enabled) =>
        set((state) => ({
          shortcuts: state.shortcuts.map((s) =>
            s.action === action ? { ...s, enabled } : s
          ),
        })),

      resetDefaults: () => set({ shortcuts: DEFAULT_SHORTCUTS }),
    }),
    {
      name: 'a7box-shortcuts',
      version: 1,
      partialize: (state: ShortcutState) => ({ shortcuts: state.shortcuts }),
      merge: (persistedState: unknown, currentState: ShortcutState): ShortcutState => {
        const stored = (persistedState as Partial<ShortcutState> | undefined)?.shortcuts
        if (!stored) return currentState
        const map = new Map(stored.map((s) => [s.action, s]))
        return {
          ...currentState,
          shortcuts: DEFAULT_SHORTCUTS.map((def) => {
            const user = map.get(def.action)
            return user ? { ...def, keys: user.keys, enabled: user.enabled } : def
          }),
        }
      },
    }
  )
)
