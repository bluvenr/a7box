/**
 * PDF Toolkit — Types, constants, and pure utility functions
 */

/** Raster output formats for PDF → image (browser canvas encodable) */
export type OutputFormat = 'image/png' | 'image/jpeg' | 'image/webp'

export const FORMATS: { value: OutputFormat; label: string; ext: string }[] = [
  { value: 'image/png', label: 'PNG', ext: 'png' },
  { value: 'image/jpeg', label: 'JPEG', ext: 'jpg' },
  { value: 'image/webp', label: 'WebP', ext: 'webp' },
]

/** Render scale presets (1x = 72 DPI baseline) */
export const SCALES: { value: number; label: string }[] = [
  { value: 1, label: '1x · 72 DPI' },
  { value: 1.5, label: '1.5x · 108 DPI' },
  { value: 2, label: '2x · 144 DPI' },
  { value: 3, label: '3x · 216 DPI' },
]

/** Toolkit tabs */
export type TabId = 'to-image' | 'to-pdf' | 'merge-split' | 'pages'

export const TABS: TabId[] = ['to-image', 'to-pdf', 'merge-split', 'pages']

/** Page size presets for image → PDF (points, 1pt = 1/72 inch) */
export type PageSize = 'fit' | 'a4' | 'letter'

export const PAGE_SIZES: { value: PageSize; labelKey: string; w: number; h: number }[] = [
  { value: 'fit', labelKey: 'modules.pdfToolkit.ui.pageSizeFit', w: 0, h: 0 },
  { value: 'a4', labelKey: 'modules.pdfToolkit.ui.pageSizeA4', w: 595.28, h: 841.89 },
  { value: 'letter', labelKey: 'modules.pdfToolkit.ui.pageSizeLetter', w: 612, h: 792 },
]

/** A rendered PDF page (PDF → image result) */
export interface RenderedPage {
  id: string
  pageNum: number // 1-based
  blob: Blob | null
  url: string | null
  size: number | null
  status: 'pending' | 'rendering' | 'done' | 'error'
  error?: string
}

/** An ordered image item for image → PDF */
export interface ImageItem {
  id: string
  file: File
  url: string
}

/** An ordered PDF file item (merge / split input) */
export interface PdfItem {
  id: string
  file: File
  pageCount: number | null
}

/** A manageable page thumbnail (page manager) */
export interface ManagedPage {
  id: string
  originalIndex: number // 0-based index in the source PDF
  rotation: number // accumulated degrees (multiple of 90)
  url: string | null
  status: 'rendering' | 'done' | 'error'
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

/** Strip the extension from a file name */
export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

/**
 * Parse a page-range expression like "1-3,5,8-10" into sorted, unique,
 * 1-based page numbers clamped to [1, max]. Returns [] when empty or invalid.
 */
export function parsePageRange(input: string, max: number): number[] {
  const trimmed = input.trim()
  if (!trimmed || max < 1) return []
  const result = new Set<number>()
  for (const part of trimmed.split(',')) {
    const p = part.trim()
    const m = p.match(/^(\d+)(?:\s*-\s*(\d+))?$/)
    if (!m) return []
    const a = parseInt(m[1], 10)
    const b = m[2] ? parseInt(m[2], 10) : a
    if (a < 1 || b < a || b > max) return []
    for (let i = a; i <= b; i++) result.add(i)
  }
  return Array.from(result).sort((x, y) => x - y)
}

/**
 * Parse a comma-separated group expression like "1-3,4-6" into per-group
 * page arrays (each comma part becomes one output PDF). Returns [] when invalid.
 */
export function parsePageGroups(input: string, max: number): number[][] {
  const trimmed = input.trim()
  if (!trimmed || max < 1) return []
  const groups: number[][] = []
  for (const part of trimmed.split(',')) {
    const pages = parsePageRange(part, max)
    if (pages.length === 0) return []
    groups.push(pages)
  }
  return groups
}

/** Chunk [1..max] into groups of n pages each */
export function chunkPages(max: number, n: number): number[][] {
  if (n < 1 || max < 1) return []
  const groups: number[][] = []
  for (let start = 1; start <= max; start += n) {
    const group: number[] = []
    for (let i = start; i < start + n && i <= max; i++) group.push(i)
    groups.push(group)
  }
  return groups
}

// ── File type detection (cross-platform path handling) ──

export const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'])
export const IMAGE_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', bmp: 'image/bmp', gif: 'image/gif',
}

export function fileExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() || ''
}

export function isPdfName(name: string): boolean {
  return fileExt(name) === 'pdf'
}

export function isImageName(name: string): boolean {
  return IMAGE_EXTS.has(fileExt(name))
}

/** Extract a file name from a full path (Windows `\` or POSIX `/`) */
export function pathBaseName(path: string): string {
  return path.split(/[\\/]/).pop() || ''
}