/**
 * Color Tool — Types, constants, and color conversion utilities
 */

export interface RGB { r: number; g: number; b: number }
export interface HSL { h: number; s: number; l: number }
export interface HSB { h: number; s: number; b: number }

export const MAX_HISTORY = 12

export function hexToRgb(hex: string): RGB | null {
  const clean = hex.replace('#', '')
  const expanded = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean
  const m = expanded.match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return null
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

export function rgbToHex({ r, g, b }: RGB): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
    else if (max === gn) h = ((bn - rn) / d + 2) / 6
    else h = ((rn - gn) / d + 4) / 6
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const sn = s / 100, ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = ln - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else { r = c; b = x }
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) }
}

/** RGB → HSB (Hue, Saturation, Brightness) — the format designers use in Figma/Sketch */
export function rgbToHsb({ r, g, b }: RGB): HSB {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const brightness = max
  const saturation = max === 0 ? 0 : (max - min) / max
  let hue = 0
  if (max !== min) {
    const d = max - min
    if (max === rn) hue = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
    else if (max === gn) hue = ((bn - rn) / d + 2) * 60
    else hue = ((rn - gn) / d + 4) * 60
  }
  return { h: Math.round(hue), s: Math.round(saturation * 100), b: Math.round(brightness * 100) }
}

/** HSB → RGB */
export function hsbToRgb({ h, s, b }: HSB): RGB {
  const sn = s / 100, bn = b / 100
  const c = bn * sn
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = bn - c
  let r = 0, g = 0, bl = 0
  if (h < 60) { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; bl = x }
  else if (h < 240) { g = x; bl = c }
  else if (h < 300) { r = x; bl = c }
  else { r = c; bl = x }
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((bl + m) * 255) }
}

/** Normalize hex input: auto-prefix #, validate */
export function normalizeHex(raw: string): string {
  let v = raw.trim()
  if (!v.startsWith('#')) v = '#' + v
  return v
}

/** WCAG contrast ratio */
export function contrastRatio(c1: RGB, c2: RGB): number {
  const luminance = ({ r, g, b }: RGB) => {
    const [rs, gs, bs] = [r, g, b].map((v) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
  }
  const l1 = luminance(c1), l2 = luminance(c2)
  const lighter = Math.max(l1, l2), darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Generate complementary/analogous/triadic palettes */
export function generatePalette(hsl: HSL) {
  const wrap = (h: number) => ((h % 360) + 360) % 360
  return {
    complementary: [
      hsl,
      { ...hsl, h: wrap(hsl.h + 180) },
    ],
    analogous: [
      { ...hsl, h: wrap(hsl.h - 30) },
      hsl,
      { ...hsl, h: wrap(hsl.h + 30) },
    ],
    triadic: [
      hsl,
      { ...hsl, h: wrap(hsl.h + 120) },
      { ...hsl, h: wrap(hsl.h + 240) },
    ],
  }
}
