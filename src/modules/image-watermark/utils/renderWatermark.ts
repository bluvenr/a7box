/**
 * Image Watermark Module — Canvas Watermark Rendering Engine
 * Pure Canvas 2D API implementation for drawing watermarks onto images.
 */

import type { WatermarkConfig, GridPosition } from '../types'

/** Format a timestamp using a pattern like yyyy-MM-dd HH:mm:ss */
export function formatTimestamp(pattern: string, date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return pattern
    .replace('yyyy', String(date.getFullYear()))
    .replace('MM', pad(date.getMonth() + 1))
    .replace('dd', pad(date.getDate()))
    .replace('HH', pad(date.getHours()))
    .replace('mm', pad(date.getMinutes()))
    .replace('ss', pad(date.getSeconds()))
}

/** Get normalized position (0-1) from grid position identifier */
function getGridCoords(pos: GridPosition): { x: number; y: number } {
  const map: Record<GridPosition, { x: number; y: number }> = {
    'top-left': { x: 0, y: 0 },
    'top-center': { x: 0.5, y: 0 },
    'top-right': { x: 1, y: 0 },
    'center-left': { x: 0, y: 0.5 },
    'center': { x: 0.5, y: 0.5 },
    'center-right': { x: 1, y: 0.5 },
    'bottom-left': { x: 0, y: 1 },
    'bottom-center': { x: 0.5, y: 1 },
    'bottom-right': { x: 1, y: 1 },
  }
  return map[pos] ?? { x: 0.5, y: 0.5 }
}

/**
 * Render watermark onto a canvas context.
 * @param ctx - Canvas 2D rendering context
 * @param canvasW - Canvas width
 * @param canvasH - Canvas height
 * @param config - Full watermark configuration
 */
export function renderWatermark(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  config: WatermarkConfig,
): void {
  const { layout } = config

  ctx.save()

  if (layout.mode === 'single') {
    renderSingle(ctx, canvasW, canvasH, config)
  } else {
    renderTile(ctx, canvasW, canvasH, config)
  }

  ctx.restore()
}

/** Render a single watermark at the configured position */
function renderSingle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  config: WatermarkConfig,
): void {
  const { layout } = config

  // Determine position
  let px: number
  let py: number
  if (layout.customX !== null && layout.customY !== null) {
    px = (layout.customX / 100) * w
    py = (layout.customY / 100) * h
  } else {
    const grid = getGridCoords(layout.position)
    const margin = layout.margin
    // Map grid position to pixel coords with margin
    px = grid.x === 0 ? margin : grid.x === 1 ? w - margin : w / 2
    py = grid.y === 0 ? margin : grid.y === 1 ? h - margin : h / 2
  }

  ctx.save()
  ctx.translate(px, py)
  drawWatermarkElement(ctx, config, w)
  ctx.restore()
}

/** Render tiled watermarks across the entire canvas */
function renderTile(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  config: WatermarkConfig,
): void {
  const { layout } = config
  const gapX = Math.max(layout.tileGapX, 50)
  const gapY = Math.max(layout.tileGapY, 50)

  // Calculate element bounds for spacing
  const elemW = getElementWidth(config, w)
  const elemH = getElementHeight(config, w)

  const stepX = elemW + gapX
  const stepY = elemH + gapY

  // Start from negative offset to cover rotated edges
  const diagonal = Math.sqrt(w * w + h * h)
  const startX = -diagonal / 2
  const startY = -diagonal / 2
  const endX = w + diagonal / 2
  const endY = h + diagonal / 2

  // Safety cap: limit total tiles to avoid freezing on huge images
  const MAX_TILES = 5000
  const estimatedTiles = ((endX - startX) / stepX) * ((endY - startY) / stepY)
  const skipFactor = estimatedTiles > MAX_TILES ? Math.ceil(Math.sqrt(estimatedTiles / MAX_TILES)) : 1

  let row = 0
  for (let y = startY; y < endY; y += stepY * skipFactor) {
    const offsetX = layout.tileStagger && row % 2 === 1 ? stepX / 2 : 0
    for (let x = startX; x < endX; x += stepX * skipFactor) {
      ctx.save()
      ctx.translate(x + offsetX, y)
      drawWatermarkElement(ctx, config, w)
      ctx.restore()
    }
    row++
  }
}

/** Get approximate element width for spacing calculations */
function getElementWidth(config: WatermarkConfig, canvasW: number): number {
  switch (config.type) {
    case 'text': {
      // Approximate: fontSize * text.length * 0.6
      return config.text.fontSize * Math.max(config.text.text.length, 1) * 0.6
    }
    case 'image': {
      return canvasW * (config.image.scale / 100)
    }
    case 'timestamp': {
      const sample = formatTimestamp(config.timestamp.format)
      return config.timestamp.fontSize * sample.length * 0.6
    }
  }
}

/** Get approximate element height for spacing calculations */
function getElementHeight(config: WatermarkConfig, canvasW: number): number {
  switch (config.type) {
    case 'text':
      return config.text.fontSize * 1.4
    case 'image': {
      // Assume roughly square logo
      return canvasW * (config.image.scale / 100)
    }
    case 'timestamp':
      return config.timestamp.fontSize * 1.4
  }
}

/** Draw the watermark element at origin (0,0) — caller handles translate */
function drawWatermarkElement(
  ctx: CanvasRenderingContext2D,
  config: WatermarkConfig,
  canvasW: number,
): void {
  switch (config.type) {
    case 'text':
      drawTextWatermark(ctx, config)
      break
    case 'image':
      drawImageWatermark(ctx, config, canvasW)
      break
    case 'timestamp':
      drawTimestampWatermark(ctx, config)
      break
  }
}

/** Draw text watermark centered at origin */
function drawTextWatermark(ctx: CanvasRenderingContext2D, config: WatermarkConfig): void {
  const { text } = config
  if (!text.text.trim()) return

  ctx.save()
  ctx.rotate((text.rotation * Math.PI) / 180)
  ctx.globalAlpha = text.opacity / 100
  ctx.font = `${text.bold ? 'bold ' : ''}${text.fontSize}px ${text.fontFamily}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (text.shadow) {
    ctx.shadowColor = text.shadowColor
    ctx.shadowBlur = 4
    ctx.shadowOffsetX = 2
    ctx.shadowOffsetY = 2
  }

  ctx.fillStyle = text.color
  ctx.fillText(text.text, 0, 0)
  ctx.restore()
}

/** Draw image watermark centered at origin */
function drawImageWatermark(
  ctx: CanvasRenderingContext2D,
  config: WatermarkConfig,
  canvasW: number,
): void {
  const { image } = config
  if (!image.logoBitmap) return

  const targetW = canvasW * (image.scale / 100)
  const aspect = image.logoBitmap.height / image.logoBitmap.width
  const targetH = targetW * aspect

  ctx.save()
  ctx.rotate((image.rotation * Math.PI) / 180)
  ctx.globalAlpha = image.opacity / 100
  ctx.drawImage(image.logoBitmap, -targetW / 2, -targetH / 2, targetW, targetH)
  ctx.restore()
}

/** Draw timestamp watermark centered at origin */
function drawTimestampWatermark(ctx: CanvasRenderingContext2D, config: WatermarkConfig): void {
  const { timestamp } = config
  const text = formatTimestamp(timestamp.format)

  ctx.save()
  ctx.globalAlpha = timestamp.opacity / 100
  ctx.font = `${timestamp.fontSize}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = timestamp.color
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

/** Map a file extension to a canvas-encodable MIME type (fallback to PNG). */
function mimeFromExt(ext: string): string {
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  return 'image/png'
}

/**
 * Render a full watermarked image to an offscreen canvas and return as Blob.
 * Used for export.
 * @param originalName - Original filename, used to preserve the source format when output.format is 'original'
 */
export async function renderToBlob(
  bitmap: ImageBitmap,
  config: WatermarkConfig,
  originalName: string,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')!

  // Draw source image
  ctx.drawImage(bitmap, 0, 0)

  // Draw watermark
  renderWatermark(ctx, canvas.width, canvas.height, config)

  // Determine output format. For 'original', derive the MIME from the resolved
  // extension so the encoded bytes always match the file extension.
  const { format, quality } = config.output
  let mimeType = 'image/png'
  if (format === 'jpeg') mimeType = 'image/jpeg'
  else if (format === 'webp') mimeType = 'image/webp'
  else if (format === 'png') mimeType = 'image/png'
  else if (format === 'original') mimeType = mimeFromExt(getOutputExt(config, originalName))

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Failed to export image'))
      },
      mimeType,
      quality / 100,
    )
  })
}

/** Get file extension from output config */
export function getOutputExt(config: WatermarkConfig, originalName: string): string {
  const { format } = config.output
  if (format === 'original') {
    const ext = originalName.split('.').pop()?.toLowerCase() ?? 'png'
    // Canvas can only encode PNG/JPEG/WebP; fall back to png for gif/bmp/etc.
    if (ext === 'jpg' || ext === 'jpeg') return 'jpg'
    if (ext === 'png' || ext === 'webp') return ext
    return 'png'
  }
  return format === 'jpeg' ? 'jpg' : format
}
