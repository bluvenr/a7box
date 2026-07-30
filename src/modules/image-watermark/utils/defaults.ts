/**
 * Image Watermark Module — Default Configuration
 */

import type { WatermarkConfig } from '../types'

export const DEFAULT_CONFIG: WatermarkConfig = {
  type: 'text',
  text: {
    text: 'A7Box',
    fontFamily: 'sans-serif',
    fontSize: 48,
    color: '#FFFFFF',
    opacity: 50,
    bold: false,
    rotation: -30,
    shadow: false,
    shadowColor: '#000000',
  },
  image: {
    logoUrl: null,
    logoBitmap: null,
    scale: 15,
    opacity: 50,
    rotation: 0,
  },
  timestamp: {
    format: 'yyyy-MM-dd HH:mm',
    fontSize: 32,
    color: '#FFFFFF',
    opacity: 70,
  },
  layout: {
    mode: 'tile',
    position: 'center',
    customX: null,
    customY: null,
    margin: 20,
    tileGapX: 200,
    tileGapY: 150,
    tileStagger: true,
  },
  output: {
    format: 'original',
    quality: 92,
    suffix: '_watermark',
  },
}

/** Polling interval for Tauri right-click file injection */
export const _POLL_MS = 1500

// ── Dedup protection for right-click poll ──
const _DEDUP_MS = 3000
const _consumedPathTimes = new Map<string, number>()

export function isRecentlyConsumed(path: string): boolean {
  const now = Date.now()
  const last = _consumedPathTimes.get(path)
  if (last && now - last < _DEDUP_MS) return true
  _consumedPathTimes.set(path, now)
  for (const [p, t] of _consumedPathTimes) {
    if (now - t > 6000) _consumedPathTimes.delete(p)
  }
  return false
}
