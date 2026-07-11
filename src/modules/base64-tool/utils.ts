/**
 * Base64 Tool — Types, encoding/decoding, and file detection utilities
 */

/** Convert Uint8Array to Base64 safely (chunk-based to avoid stack overflow) */
export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 8192
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
    binary += String.fromCharCode.apply(null, Array.from(chunk))
  }
  return btoa(binary)
}

export function encodeText(text: string): string {
  const bytes = new TextEncoder().encode(text)
  return bytesToBase64(bytes)
}

export function decodeText(base64: string): string {
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

/** Detect image MIME type from base64 header bytes */
export function detectImageMime(base64: string): string | null {
  try {
    const header = atob(base64.substring(0, 24))
    if (header.startsWith('\x89PNG')) return 'image/png'
    if (header.startsWith('GIF8')) return 'image/gif'
    if (header.startsWith('RIFF')) return 'image/webp'
    if (header.startsWith('\xff\xd8\xff')) return 'image/jpeg'
    if (header.includes('JFIF') || header.includes('Exif')) return 'image/jpeg'
    return null
  } catch {
    return null
  }
}

/** Detect file extension from binary magic bytes */
export function detectFileExt(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null
  const h = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  // Images
  if (h.startsWith('\x89PNG')) return '.png'
  if (h.startsWith('GIF8')) return '.gif'
  if (h.startsWith('RIFF')) return '.webp'
  if (h.startsWith('\xff\xd8\xff')) return '.jpg'
  if (h.startsWith('BM')) return '.bmp'
  // Documents
  if (h === '%PDF') return '.pdf'
  // Archives
  if (h.startsWith('PK\x03\x04')) return '.zip'
  if (h.startsWith('\x1f\x8b')) return '.gz'
  if (h === 'Rar!') return '.rar'
  if (h.startsWith('7z\xbc\xaf')) return '.7z'
  // Audio/Video
  if (h.startsWith('ID3') || h.startsWith('\xff\xfb')) return '.mp3'
  if (h.startsWith('\x00\x00\x00') && bytes.length > 8 && String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]) === 'ftyp') return '.mp4'
  if (h.startsWith('OggS')) return '.ogg'
  if (h.startsWith('fLaC')) return '.flac'
  if (h.startsWith('RIFF') && bytes.length > 12 && String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === 'WAVE') return '.wav'
  // Executables
  if (h.startsWith('MZ')) return '.exe'
  // Fonts
  if (h === '\x00\x01\x00\x00') return '.ttf'
  if (h === 'OTTO') return '.otf'
  if (h === 'wOFF') return '.woff'
  if (h === 'wOF2') return '.woff2'
  return null
}

/** Detect if file is likely a text file by extension */
export function isTextFile(name: string): boolean {
  const textExts = ['.txt', '.json', '.xml', '.csv', '.md', '.html', '.css', '.js', '.ts',
    '.jsx', '.tsx', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.log', '.env', '.sh',
    '.bat', '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp']
  const lower = name.toLowerCase()
  return textExts.some((ext) => lower.endsWith(ext))
}

export type ImportedFile = { name: string; mime: string }
