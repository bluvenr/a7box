/**
 * Image Convert — Types, constants, and utility functions
 */

export type OutputFormat = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/x-icon'

// Polling constants for right-click file loading
export const _POLL_MS = 300
const _DEDUP_MS = 2000
const _consumedPathTimes = new Map<string, number>()

export function isRecentlyConsumed(path: string): boolean {
  const now = Date.now()
  const last = _consumedPathTimes.get(path)
  if (last && now - last < _DEDUP_MS) return true
  _consumedPathTimes.set(path, now)
  return false
}

export const FORMATS: { value: OutputFormat; label: string; ext: string }[] = [
  { value: 'image/png', label: 'PNG', ext: 'png' },
  { value: 'image/jpeg', label: 'JPEG', ext: 'jpg' },
  { value: 'image/webp', label: 'WebP', ext: 'webp' },
  { value: 'image/x-icon', label: 'ICO', ext: 'ico' },
]

/** Infer original format label from file name extension */
export function getOriginalFormat(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = { png: 'PNG', jpg: 'JPEG', jpeg: 'JPEG', webp: 'WebP', bmp: 'BMP', gif: 'GIF', ico: 'ICO' }
  return map[ext] || ext.toUpperCase()
}

export interface ConvertResult {
  id: string
  originalFile: File
  originalUrl: string
  convertedBlob: Blob | null
  convertedUrl: string | null
  convertedSize: number | null
  outputFormat: OutputFormat
  status: 'pending' | 'converting' | 'done' | 'error'
  error?: string
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

/** Convert image using Canvas (PNG/JPEG/WebP) or ICO encoder */
export async function convertImage(
  file: File,
  format: OutputFormat,
  quality: number,
  icoSizes: number[]
): Promise<{ blob: Blob; url: string }> {
  // ICO uses dedicated encoder
  if (format === 'image/x-icon') {
    const { convertToIco } = await import('./icoEncoder')
    const blob = await convertToIco(file, icoSizes)
    return { blob, url: URL.createObjectURL(blob) }
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image()
    const url = URL.createObjectURL(file)
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = reject
    image.src = url
  })

  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  // JPEG doesn't support transparency - fill white background
  if (format === 'image/jpeg') {
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  ctx.drawImage(img, 0, 0)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => b ? resolve(b) : reject(new Error('Conversion failed')),
      format,
      quality
    )
  })

  return { blob, url: URL.createObjectURL(blob) }
}
