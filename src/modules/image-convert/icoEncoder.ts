/**
 * ICO File Encoder
 * Packs one or more PNG images into a valid .ico file.
 * Pure JS, zero dependencies — runs in browser.
 */

/** All supported ICO square sizes */
export const ICO_ALL_SIZES = [16, 32, 48, 64, 128, 256] as const

/**
 * Render a source image (File) at the given square size and return PNG bytes.
 */
async function renderPng(file: File, size: number): Promise<Uint8Array> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image()
    const url = URL.createObjectURL(file)
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = reject
    image.src = url
  })

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  // Scale source to fit square (center-crop if aspect ratio differs)
  const sw = img.naturalWidth
  const sh = img.naturalHeight
  const side = Math.min(sw, sh)
  const sx = (sw - side) / 2
  const sy = (sh - side) / 2
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png')
  })

  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * Build a valid ICO binary from one or more PNG byte arrays.
 * Each entry's dimensions are derived from the PNG IHDR chunk.
 */
function buildIco(pngBuffers: Uint8Array[]): Uint8Array {
  const count = pngBuffers.length
  // Read width/height from each PNG's IHDR (bytes 16-23)
  const dims = pngBuffers.map((buf) => {
    // PNG IHDR starts at byte 16: 4 bytes width, 4 bytes height (big-endian)
    const w = (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19]
    const h = (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23]
    return { w, h }
  })

  // ICO header: 6 bytes
  // ICO directory entries: 16 bytes each
  const headerSize = 6
  const dirSize = 16 * count
  let dataOffset = headerSize + dirSize

  // Calculate total file size
  const totalSize = dataOffset + pngBuffers.reduce((acc, buf) => acc + buf.length, 0)
  const ico = new Uint8Array(totalSize)
  const view = new DataView(ico.buffer)

  // ── ICONDIR header ──
  view.setUint16(0, 0, true)    // Reserved, must be 0
  view.setUint16(2, 1, true)    // Type: 1 = ICO
  view.setUint16(4, count, true) // Number of images

  // ── ICONDIRENTRY for each image ──
  let offset = headerSize
  for (let i = 0; i < count; i++) {
    const { w, h } = dims[i]
    // Width (0 means 256 in ICO spec)
    ico[offset + 0] = w >= 256 ? 0 : w
    // Height (0 means 256)
    ico[offset + 1] = h >= 256 ? 0 : h
    ico[offset + 2] = 0          // Color palette (0 = no palette)
    ico[offset + 3] = 0          // Reserved
    view.setUint16(offset + 4, 1, true)   // Color planes
    view.setUint16(offset + 6, 32, true)  // Bits per pixel
    view.setUint32(offset + 8, pngBuffers[i].length, true)  // Image data size
    view.setUint32(offset + 12, dataOffset, true)            // Image data offset
    dataOffset += pngBuffers[i].length
    offset += 16
  }

  // ── Image data ──
  offset = headerSize + dirSize
  for (const buf of pngBuffers) {
    ico.set(buf, offset)
    offset += buf.length
  }

  return ico
}

/**
 * Convert an image file to ICO format with the specified sizes.
 * @param file  Source image file
 * @param sizes Array of square sizes to include (e.g. [16, 32, 256])
 * @returns Blob with type 'image/x-icon'
 */
export async function convertToIco(file: File, sizes: number[]): Promise<Blob> {
  if (sizes.length === 0) throw new Error('At least one size must be selected')

  // Sort ascending (ICO spec: smaller entries first)
  const sorted = [...sizes].sort((a, b) => a - b)

  // Render PNG for each target size
  const pngBuffers = await Promise.all(sorted.map((size) => renderPng(file, size)))

  // Pack into ICO container
  const icoBytes = buildIco(pngBuffers)

  return new Blob([icoBytes.buffer as ArrayBuffer], { type: 'image/x-icon' })
}
