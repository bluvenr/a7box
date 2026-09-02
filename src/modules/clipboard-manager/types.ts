/**
 * Clipboard Manager — Type Definitions
 * Mirrors the Rust-side structures (camelCase serde).
 */

export type ClipType = 'text' | 'image' | 'file'

export type ClipCategory =
  | 'general'
  | 'url'
  | 'code'
  | 'json'
  | 'email'
  | 'file-path'
  | 'color'
  | 'secret'

/** All categories in display order */
export const CLIP_CATEGORIES: ClipCategory[] = [
  'general',
  'url',
  'code',
  'json',
  'email',
  'file-path',
  'color',
  'secret',
]

export interface ClipEntry {
  id: string
  clipType: ClipType
  category: ClipCategory
  /** Text content / image file name / JSON array of file paths */
  content: string
  preview: string
  thumbnailPath?: string
  /** Attached image of a TEXT entry (mixed text+image capture); file name in images dir */
  attachedImagePath?: string
  sourceApp?: string
  sourceTitle?: string
  isPinned: boolean
  isSecret: boolean
  isEncrypted: boolean
  copyCount: number
  createdAt: number
  lastUsedAt?: number
  size: number
}

export interface SnippetEntry {
  id: string
  name: string
  content: string
  variables: string[]
  shortcut?: string
  category?: string
  createdAt: number
}

export type RuleTriggerType = 'regex' | 'contains' | 'category'
export type RuleActionType = 'classify' | 'transform' | 'copy-as' | 'notify'

export interface RuleEntry {
  id: string
  name: string
  enabled: boolean
  triggerPattern: string
  triggerType: RuleTriggerType
  actionType: RuleActionType
  /** JSON action configuration */
  actionConfig?: string
  priority: number
}

export interface ClipStats {
  total: number
  pinned: number
  secrets: number
  byType: Array<[string, number]>
  byCategory: Array<[string, number]>
}

export interface PasteCapability {
  capable: boolean
  /** i18n suffix: '' | 'wayland' | 'accessibility' */
  reason: string
}

export interface ClipboardSettings {
  enabled: boolean
  captureImages: boolean
  captureFiles: boolean
  maxHistory: number
  retentionDays: number
  maxTextBytes: number
  maxImageBytes: number
  imageCacheLimitMb: number
  pasteDelayMs: number
  pasteStackIntervalMs: number
  encryptSecrets: boolean
  ignoredApps: string[]
}

export interface CmSettingsResponse extends ClipboardSettings {
  capability: PasteCapability
  imagesDir: string
}

export interface PasteTarget {
  nativeHandle: number
  windowTitle: string
  processName: string
}

/** Payload of the "clipboard-history-changed" broadcast event */
export interface HistoryChangedPayload {
  action: 'added' | 'touched' | 'deleted' | 'deletedMany' | 'pinned' | 'cleared' | 'imported'
  id?: string
  clipType?: string
  count?: number
  pinned?: boolean
}

/** Popup open mode (passed via URL query) */
export type PopupMode = 'normal' | 'paste-stack'
