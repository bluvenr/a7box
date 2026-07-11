/**
 * Image Compress — types, constants, utility functions, and file buffer
 */

export type OutputFormat = 'original' | 'jpeg' | 'png' | 'webp'

export interface CompressedImage {
  id: string
  originalFile: File
  originalUrl: string
  originalSize: number
  compressedBlob: Blob | null
  compressedUrl: string | null
  compressedSize: number | null
  status: 'pending' | 'compressing' | 'done' | 'error'
  error?: string
}

export const FORMAT_OPTIONS: { value: OutputFormat; label: string; labelKey?: string }[] = [
  { value: 'original', label: 'Original', labelKey: 'modules.imageCompress.ui.formatOriginal' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
]

export const MAX_SIZE_OPTIONS = [
  { value: 9999, labelKey: 'modules.imageCompress.ui.maxSizeUnlimited' },
  { value: 5, label: '5 MB' },
  { value: 2, label: '2 MB' },
  { value: 1, label: '1 MB' },
  { value: 0.5, label: '500 KB' },
]

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function savingsPercent(orig: number, comp: number): string {
  if (orig === 0) return '0%'
  return ((1 - comp / orig) * 100).toFixed(1) + '%'
}

// ── Right-click context menu: single-channel poll architecture ─────────
// Rust stores the file path in PendingImageFile state (both cold & warm start)
// and emits an event for navigation only. This module polls the Rust state
// via get_pending_image_file (which atomically reads + clears the path).

export const _POLL_MS = 300
const _DEDUP_MS = 2000
const _consumedPathTimes = new Map<string, number>()

// Cross-poll file buffer: collects files from multiple polls into one batch
const _FILE_BUFFER_MS = 600
let _fileBuffer: File[] = []
let _fileBufferTimer: ReturnType<typeof setTimeout> | null = null
let _fileBufferFlushFn: ((files: File[]) => void) | null = null

export function _enqueueFiles(files: File[]) {
  _fileBuffer.push(...files)
  if (_fileBufferFlushFn) {
    if (_fileBufferTimer) clearTimeout(_fileBufferTimer)
    _fileBufferTimer = setTimeout(() => {
      const batch = _fileBuffer.splice(0)
      _fileBufferTimer = null
      _fileBufferFlushFn?.(batch)
    }, _FILE_BUFFER_MS)
  }
}

export function _setFileBufferFlushFn(fn: ((files: File[]) => void) | null) {
  _fileBufferFlushFn = fn
}

export function _cleanupFileBuffer(flushFn: ((files: File[]) => void) | null) {
  if (_fileBuffer.length > 0 && flushFn) {
    const batch = _fileBuffer.splice(0)
    flushFn(batch)
  }
  if (_fileBufferTimer) { clearTimeout(_fileBufferTimer); _fileBufferTimer = null }
  _fileBufferFlushFn = null
}

export function isRecentlyConsumed(path: string): boolean {
  const now = Date.now()
  const last = _consumedPathTimes.get(path)
  if (last && now - last < _DEDUP_MS) return true
  _consumedPathTimes.set(path, now)
  for (const [p, t] of _consumedPathTimes) {
    if (now - t > 5000) _consumedPathTimes.delete(p)
  }
  return false
}
