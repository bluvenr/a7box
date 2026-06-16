/**
 * A7Box Core Type Definitions
 */

import { type LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'

/** i18n key type */
export type I18nKey = string

/** Module metadata */
export interface A7ModuleMeta {
  /** Unique identifier, e.g. 'json-formatter' */
  id: string
  /** Display name */
  name: string
  /** i18n key for name, takes priority over name */
  nameI18n?: I18nKey
  /** Module description */
  description?: string
  /** i18n key for description */
  descriptionI18n?: I18nKey
  /** Icon (lucide-react component or SVG path) */
  icon: LucideIcon | string
  /** Category */
  category: ModuleCategory
  /** Search tags for command palette fuzzy search */
  tags?: string[]
  /** Module version */
  version: string
  /** Author */
  author?: string
  /** Whether enabled by default (default: true) */
  enabledByDefault?: boolean
}

/** Module categories */
export type ModuleCategory =
  | 'text'      // Text tools (JSON, Markdown, Code minify)
  | 'image'     // Image tools (Compress, Convert, QR code)
  | 'screen'    // Screen tools (Screenshot, GIF, Screen record)
  | 'network'   // Network tools (LAN transfer, HTTP server, Code share)
  | 'dev'       // Dev tools (MCP, AI)
  | 'misc'      // Other

/** Command definition */
export interface A7Command {
  /** Command ID, unique within module */
  id: string
  /** Display label */
  label: string
  /** i18n key for label */
  labelI18n?: I18nKey
  /** Command description */
  description?: string
  /** i18n key for description */
  descriptionI18n?: I18nKey
  /** Icon */
  icon?: LucideIcon | string
  /** Default shortcut, e.g. 'Ctrl+Shift+J' */
  shortcut?: string
  /** Conditional display function */
  when?: () => boolean
  /** Execute function */
  run: (context: CommandContext) => void | Promise<void>
  /** Sub-commands */
  children?: A7Command[]
}

/** Command execution context */
export interface CommandContext {
  /** Current clipboard text */
  clipboardText?: string
  /** Clipboard image */
  clipboardImage?: Blob
  /** Active window info */
  activeWindow?: WindowInfo
  /** Passed arguments */
  args?: Record<string, unknown>
  /** Navigate to module page */
  navigate: (path: string) => void
}

/** Window information */
export interface WindowInfo {
  title: string
  processName: string
  pid: number
}

/** Tray menu item */
export interface TrayMenuItem {
  id: string
  label: string
  labelI18n?: I18nKey
  icon?: string
  shortcut?: string
  action: () => void
  children?: TrayMenuItem[]
}

/** Setting item definition */
export interface A7SettingItem {
  /** Setting key */
  key: string
  /** Display label */
  label: string
  /** i18n key */
  labelI18n?: I18nKey
  /** Setting type */
  type: 'switch' | 'select' | 'input' | 'slider' | 'keybind'
  /** Default value */
  defaultValue: unknown
  /** Options for select type */
  options?: Array<{ label: string; value: unknown }>
  /** Description */
  description?: string
  /** i18n key for description */
  descriptionI18n?: I18nKey
}

/** Module registration interface */
export interface A7Module {
  /** Module metadata */
  meta: A7ModuleMeta
  /** Command list */
  commands: A7Command[]
  /** Lazy-loaded component */
  component?: () => Promise<{ default: ComponentType }>
  /** Module-level settings */
  settings?: A7SettingItem[]
  /** Callback when module is activated */
  onActivate?: () => void | Promise<void>
  /** Callback when module is deactivated */
  onDeactivate?: () => void | Promise<void>
  /** Clipboard listener callback */
  onClipboard?: (text: string) => void | Promise<void>
  /** Tray menu items */
  trayMenu?: TrayMenuItem[]
}

/** Command palette search result item */
export interface CommandSearchItem {
  id: string
  moduleId: string
  moduleName: string
  moduleIcon: LucideIcon | string
  label: string
  description?: string
  icon?: LucideIcon | string
  shortcut?: string
  tags?: string[]
  lastUsedAt?: number
  run: (context: CommandContext) => void | Promise<void>
}

/** Category metadata */
export interface CategoryMeta {
  id: ModuleCategory
  name: string
  nameI18n?: I18nKey
  icon: LucideIcon
}

/** Category configuration */
export const CATEGORIES: CategoryMeta[] = [
  { id: 'text', name: 'Text Tools', nameI18n: 'categories.text', icon: null as unknown as LucideIcon },
  { id: 'image', name: 'Image Tools', nameI18n: 'categories.image', icon: null as unknown as LucideIcon },
  { id: 'screen', name: 'Screen Tools', nameI18n: 'categories.screen', icon: null as unknown as LucideIcon },
  { id: 'network', name: 'Network Tools', nameI18n: 'categories.network', icon: null as unknown as LucideIcon },
  { id: 'dev', name: 'Dev Tools', nameI18n: 'categories.dev', icon: null as unknown as LucideIcon },
  { id: 'misc', name: 'Other', nameI18n: 'categories.misc', icon: null as unknown as LucideIcon },
]
