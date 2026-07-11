/**
 * Color Quick Utility Window
 * Compact color tool triggered by global shortcut (Ctrl+Shift+C).
 * Receives the picked color via "screen-color-picked" event + get_last_picked_color.
 */
import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Palette, Copy, Pipette, X, Check } from 'lucide-react'
import { isTauri } from '../../../shared/utils'

// ── Color conversion utilities (duplicated from ColorTool for float isolation) ──

interface RGB { r: number; g: number; b: number }
interface HSL { h: number; s: number; l: number }
interface HSB { h: number; s: number; b: number }

function hexToRgb(hex: string): RGB | null {
  const clean = hex.replace('#', '')
  const expanded = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean
  const m = expanded.match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return null
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

function rgbToHex({ r, g, b }: RGB): string {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')
}

function rgbToHsl({ r, g, b }: RGB): HSL {
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

function hslToRgb({ h, s, l }: HSL): RGB {
  const sn = s / 100, ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = ln - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x } else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c } else { r = c; b = x }
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) }
}

function rgbToHsb({ r, g, b }: RGB): HSB {
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

function contrastRatio(c1: RGB, c2: RGB): number {
  const luminance = ({ r, g, b }: RGB) => {
    const [rs, gs, bs] = [r, g, b].map(v => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
  }
  const l1 = luminance(c1), l2 = luminance(c2)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

function generatePalette(hsl: HSL) {
  const wrap = (h: number) => ((h % 360) + 360) % 360
  return {
    complementary: [hsl, { ...hsl, h: wrap(hsl.h + 180) }],
    analogous: [{ ...hsl, h: wrap(hsl.h - 30) }, hsl, { ...hsl, h: wrap(hsl.h + 30) }],
    triadic: [hsl, { ...hsl, h: wrap(hsl.h + 120) }, { ...hsl, h: wrap(hsl.h + 240) }],
  }
}

// ── Main component ──

export default function ColorQuick() {
  const { t } = useTranslation()
  const [hex, setHex] = useState('#cccccc')
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Listen for "screen-color-picked" from the screen picker overlay — update hex
  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    ;(async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        unlisten = await listen<string>('screen-color-picked', (event) => {
          if (event.payload) {
            setHex(event.payload)
            setError(null)
          }
        })
        // Signal Rust: listeners registered, safe to show window (avoids black flash)
        const { emit } = await import('@tauri-apps/api/event')
        await emit('color-quick-ready', '')
      } catch { /* ignore */ }
    })()
    return () => { unlisten?.() }
  }, [])

  // On mount, fetch the last picked color (handles case where window was created after the pick event)
  useEffect(() => {
    if (!isTauri()) return
    ;(async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const color = await invoke<string>('get_last_picked_color')
        if (color) {
          setHex(color)
          setError(null)
        }
      } catch { /* ignore */ }
    })()
  }, [])

  // Track repick state: when repicking, show self on any pick outcome
  const isRepicking = useRef(false)

  // Listen for pick outcomes to restore self when repicking
  useEffect(() => {
    if (!isTauri()) return
    let u1: (() => void) | undefined
    let u2: (() => void) | undefined
    let u3: (() => void) | undefined
    ;(async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        // right-click-pick: global mode shows float, repick also shows float
        u1 = await listen('right-click-pick', () => {
          if (isRepicking.current) {
            isRepicking.current = false
            try { getCurrentWindow().show(); getCurrentWindow().setFocus() } catch { /* */ }
          }
        })
        // pick-confirm: page mode restores main, but repick needs to show float
        u2 = await listen('pick-confirm', () => {
          if (isRepicking.current) {
            isRepicking.current = false
            try { getCurrentWindow().show(); getCurrentWindow().setFocus() } catch { /* */ }
          }
        })
        // pick-cancel: if repicking, show self again
        u3 = await listen('pick-cancel', () => {
          if (isRepicking.current) {
            isRepicking.current = false
            try { getCurrentWindow().show(); getCurrentWindow().setFocus() } catch { /* */ }
          }
        })
      } catch { /* ignore */ }
    })()
    return () => { u1?.(); u2?.(); u3?.() }
  }, [])

  // Open live picker: hide float → emit event → Rust handles the rest
  const handleRepick = useCallback(async () => {
    if (!isTauri()) return
    try {
      isRepicking.current = true
      const { emit } = await import('@tauri-apps/api/event')
      const win = getCurrentWindow()
      await win.hide()
      await emit('repick-from-float', '')
    } catch (e) {
      isRepicking.current = false
      setError(String(e))
      try { getCurrentWindow().show() } catch { /* ignore */ }
    }
  }, [])

  const closeWindow = useCallback(async () => {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('close_utility_window', { label: 'color-quick' })
      } catch { /* ignore */ }
    }
  }, [])

  const toggleMaximize = useCallback(async () => {
    try {
      const win = getCurrentWindow()
      if (await win.isMaximized()) await win.unmaximize()
      else await win.maximize()
    } catch { /* ignore */ }
  }, [])

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeWindow()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [closeWindow])

  const handleCopy = useCallback(async (text: string, label: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 1500)
  }, [])

  const color = useMemo(() => {
    const rgb = hexToRgb(hex)
    if (!rgb) return null
    const hsl = rgbToHsl(rgb)
    const palette = generatePalette(hsl)
    const white: RGB = { r: 255, g: 255, b: 255 }
    const black: RGB = { r: 0, g: 0, b: 0 }
    return {
      rgb, hsl, hsb: rgbToHsb(rgb), hex: rgbToHex(rgb),
      contrastWhite: contrastRatio(rgb, white),
      contrastBlack: contrastRatio(rgb, black),
      palette,
    }
  }, [hex])

  const displayRgb = color ? `rgb(${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b})` : ''
  const displayHsl = color ? `hsl(${color.hsl.h}, ${color.hsl.s}%, ${color.hsl.l}%)` : ''
  const displayHsb = color ? `hsb(${color.hsb.h}, ${color.hsb.s}%, ${color.hsb.b}%)` : ''

  return (
    <div className="flex h-full flex-col bg-bg-base text-text-primary">
      {/* Title bar */}
      <div
        className="flex shrink-0 cursor-default select-none items-center justify-between border-b border-border-subtle bg-bg-elevated px-3 py-2"
      >
        <div className="flex flex-1 items-center gap-2" data-tauri-drag-region onDoubleClick={toggleMaximize}>
          <Palette size={14} className="text-primary" />
          <span className="text-sm font-medium text-text-primary">
            {t('colorQuick.title', { defaultValue: 'Color Picker' })}
          </span>
        </div>
        <button
          onClick={closeWindow}
          className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary"
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Color swatch + re-pick */}
        <div className="flex items-center gap-3">
          <div
            className="h-20 w-20 shrink-0 rounded-xl border border-border-base shadow-inner"
            style={{ backgroundColor: color?.hex ?? hex }}
          />
          <div className="flex-1">
            <p className="mb-1 text-2xl font-bold font-mono tracking-wide text-text-primary">
              {(color?.hex ?? hex).toUpperCase()}
            </p>
            {error && <p className="text-xs text-error mb-1">{error}</p>}
            <button
              onClick={handleRepick}
              className="flex items-center gap-1.5 rounded-md border border-border-base bg-bg-hover px-2.5 py-1.5 text-xs text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
              title={t('colorQuick.repick', { defaultValue: 'Pick another color' })}
            >
              <Pipette size={12} />
              <span>{t('colorQuick.repick', { defaultValue: 'Pick another color' })}</span>
            </button>
          </div>
        </div>

        {/* Format rows */}
        <div className="space-y-2">
          <FormatRow label="HEX" value={color?.hex ?? hex} onCopy={handleCopy} copied={copied} />
          <FormatRow label="RGB" value={displayRgb} onCopy={handleCopy} copied={copied} />
          <FormatRow label="HSL" value={displayHsl} onCopy={handleCopy} copied={copied} />
          <FormatRow label="HSB" value={displayHsb} onCopy={handleCopy} copied={copied} />
        </div>

        {/* Contrast */}
        {color && (
          <div>
            <h3 className="mb-2 text-xs font-medium text-text-secondary">
              {t('modules.colorTool.ui.contrastTitle', { defaultValue: 'Contrast (WCAG)' })}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <MiniContrastCard label={t('modules.colorTool.ui.contrastOnWhite', { defaultValue: 'On White' })} color={color.hex} bg="#FFFFFF" ratio={color.contrastWhite} />
              <MiniContrastCard label={t('modules.colorTool.ui.contrastOnBlack', { defaultValue: 'On Black' })} color={color.hex} bg="#000000" ratio={color.contrastBlack} />
            </div>
          </div>
        )}

        {/* Palette */}
        {color && (
          <div>
            <h3 className="mb-2 text-xs font-medium text-text-secondary">
              {t('modules.colorTool.ui.palettesTitle', { defaultValue: 'Palettes' })}
            </h3>
            {(['complementary', 'analogous', 'triadic'] as const).map(name => {
              const nameKey = `palette${name.charAt(0).toUpperCase() + name.slice(1)}` as 'paletteComplementary' | 'paletteAnalogous' | 'paletteTriadic'
              return (
                <div key={name} className="mb-2">
                  <p className="mb-1 text-[10px] text-text-muted capitalize">
                    {t(`modules.colorTool.ui.${nameKey}`)}
                  </p>
                  <div className="flex gap-1.5">
                    {color.palette[name].map((c, i) => {
                      const rgb = hslToRgb(c)
                      const h = rgbToHex(rgb)
                      const palId = `pal-${name}-${i}`
                      return (
                        <button
                          key={i}
                          onClick={() => handleCopy(h, palId)}
                          className="group relative h-9 flex-1 rounded-lg border border-border-subtle transition-transform hover:scale-105"
                          style={{ backgroundColor: h }}
                          title={h}
                        >
                          <span className={`absolute inset-x-0 bottom-0 rounded-b-lg bg-black/50 px-1 py-0.5 text-center text-[9px] font-mono text-white transition-opacity ${copied === palId ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}>
                            {h}
                          </span>
                          {copied === palId && (
                            <span className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/50">
                              <Check size={12} className="text-white drop-shadow" />
                              <span className="mt-0.5 text-[8px] font-medium text-white drop-shadow">{t('common.copied')}</span>
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ──

function FormatRow({ label, value, onCopy, copied }: {
  label: string; value: string
  onCopy: (text: string, label: string) => void; copied: string | null
}) {
  if (!value) return null
  return (
    <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-elevated px-3 py-2">
      <span className="w-8 shrink-0 text-[10px] font-medium text-text-muted uppercase">{label}</span>
      <span className="flex-1 truncate font-mono text-xs text-text-primary">{value}</span>
      <button
        onClick={() => onCopy(value, label)}
        className="shrink-0 rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary"
      >
        {copied === label
          ? <Check size={12} className="text-success" />
          : <Copy size={12} />
        }
      </button>
    </div>
  )
}

function MiniContrastCard({ label, color, bg, ratio }: { label: string; color: string; bg: string; ratio: number }) {
  const passAAA = ratio >= 7
  const passAA = ratio >= 4.5
  const passAALarge = ratio >= 3
  const textSecondary = bg === '#FFFFFF' ? '#555' : '#bbb'
  return (
    <div className="rounded-lg p-2" style={{ backgroundColor: bg }}>
      <p className="text-xs font-medium" style={{ color }}>{label}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="text-[10px] font-mono" style={{ color: textSecondary }}>{ratio.toFixed(1)}:1</span>
        <span className={`rounded px-1 py-0.5 text-[9px] font-medium ${passAAA ? 'bg-green-500/20 text-green-500' : passAA ? 'bg-green-500/15 text-green-400' : passAALarge ? 'bg-yellow-500/20 text-yellow-500' : 'bg-red-500/20 text-red-400'}`}>
          {passAAA ? 'AAA' : passAA ? 'AA' : passAALarge ? 'AA Large' : 'Fail'}
        </span>
      </div>
    </div>
  )
}
