/**
 * Clipboard Manager — External opener helpers.
 * Wraps @tauri-apps/plugin-opener with scheme guards and safe fallbacks so a
 * missing file or unsupported environment never throws into the UI layer.
 */
import type { ClipEntry } from '../types'
import * as bridge from '../bridge'

/** Result of a system open attempt ('not-found' = path no longer exists). */
export type OpenResult = 'ok' | 'not-found' | 'failed'

/** Strip surrounding whitespace and quotes (Windows "Copy as path"). */
function sanitizePath(path: string): string {
  return path.trim().replace(/^"+|"+$/g, '').trim()
}

/** Contextual quick-open kind for a clip (null = no opener action applies). */
export type QuickOpenKind = 'url' | 'file-path' | 'file'

export function quickOpenKind(clip: Pick<ClipEntry, 'clipType' | 'category'>): QuickOpenKind | null {
  if (clip.clipType === 'file') return 'file'
  if (clip.category === 'url') return 'url'
  if (clip.category === 'file-path') return 'file-path'
  return null
}

/** Normalise a stored url for opening (classifier also accepts www. prefix). */
function toOpenableUrl(text: string): string | null {
  const trimmed = text.trim()
  const lower = trimmed.toLowerCase()
  if (lower.startsWith('http://') || lower.startsWith('https://')) return trimmed
  if (lower.startsWith('www.')) return `https://${trimmed}`
  return null
}

/** Open a link in the default browser. Returns false when it fails. */
export async function openUrlInBrowser(text: string): Promise<boolean> {
  const url = toOpenableUrl(text)
  if (!url) return false
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
    return true
  } catch {
    return false
  }
}

/** Open a file or directory with the OS default application (via Rust). */
export async function openFileOrDir(path: string): Promise<OpenResult> {
  const cleaned = sanitizePath(path)
  if (!cleaned) return 'failed'
  return bridge.openOsPath(cleaned)
}

/** Reveal a path in the system file explorer. */
export async function revealInDir(path: string): Promise<boolean> {
  const cleaned = sanitizePath(path)
  if (!cleaned) return false
  try {
    const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
    await revealItemInDir(cleaned)
    return true
  } catch {
    return false
  }
}

/** i18n key matching an open attempt result (caller appends `modules.clipboardManager.`). */
export function openErrorKey(result: OpenResult, kind: QuickOpenKind): string {
  if (kind === 'url') return 'openUrlFailed'
  return result === 'not-found' ? 'openNotFound' : 'openFailed'
}

/** File paths stored in a `file` clip (content is a JSON string array). */
export function fileClipPaths(clip: Pick<ClipEntry, 'clipType' | 'content'>): string[] {
  if (clip.clipType !== 'file') return []
  try {
    const parsed: unknown = JSON.parse(clip.content)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((p): p is string => typeof p === 'string' && p.length > 0)
  } catch {
    return []
  }
}

/** Path of a text clip classified as file-path (single line only). */
export function textClipPath(
  clip: Pick<ClipEntry, 'clipType' | 'category' | 'content'>
): string | null {
  if (clip.clipType !== 'text' || clip.category !== 'file-path') return null
  const cleaned = sanitizePath(clip.content)
  return cleaned && !cleaned.includes('\n') ? cleaned : null
}
