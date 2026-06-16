/**
 * Color Tool Main Component
 * Color picker, HEX/RGB/HSL converter, palette generator, contrast checker
 */

import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Palette, Copy } from 'lucide-react'

interface RGB { r: number; g: number; b: number }
interface HSL { h: number; s: number; l: number }

function hexToRgb(hex: string): RGB | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return null
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

function rgbToHex({ r, g, b }: RGB): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
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
  if (h < 60) { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else { r = c; b = x }
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) }
}

/** Calculate WCAG contrast ratio */
function contrastRatio(c1: RGB, c2: RGB): number {
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
function generatePalette(hsl: HSL) {
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

export default function ColorTool() {
  const { t } = useTranslation()
  const [hexInput, setHexInput] = useState('#FF4D4F')
  const [copied, setCopied] = useState<string | null>(null)

  const handleCopy = useCallback(async (text: string, label: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 1500)
  }, [])

  const color = useMemo(() => {
    const rgb = hexToRgb(hexInput)
    if (!rgb) return null
    const hsl = rgbToHsl(rgb)
    const palette = generatePalette(hsl)
    const white: RGB = { r: 255, g: 255, b: 255 }
    const black: RGB = { r: 0, g: 0, b: 0 }
    return {
      rgb,
      hsl,
      hex: rgbToHex(rgb),
      contrastWhite: contrastRatio(rgb, white),
      contrastBlack: contrastRatio(rgb, black),
      palette,
    }
  }, [hexInput])

  return (
    <div className="relative flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border-subtle bg-bg-elevated px-4 py-2">
        <Palette className="h-4 w-4 text-text-muted" />
        <span className="text-sm font-medium text-text-primary">{t('modules.colorTool.name')}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Color picker + input */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center gap-2">
              <div className="h-32 w-32 rounded-xl border border-border-base shadow-inner" style={{ backgroundColor: hexInput }} />
              <input
                type="color"
                value={hexInput}
                onChange={(e) => setHexInput(e.target.value)}
                className="h-8 w-32 cursor-pointer rounded border border-border-base bg-transparent"
              />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">HEX</label>
                <input
                  type="text"
                  value={hexInput}
                  onChange={(e) => setHexInput(e.target.value)}
                  className="w-full rounded-md border border-border-base bg-bg-base px-3 py-2 font-mono text-sm text-text-primary focus:border-border-focus focus:outline-none"
                />
              </div>
              {color && (
                <>
                  <FormatRow label="RGB" value={`rgb(${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b})`} onCopy={handleCopy} copied={copied} />
                  <FormatRow label="HSL" value={`hsl(${color.hsl.h}, ${color.hsl.s}%, ${color.hsl.l}%)`} onCopy={handleCopy} copied={copied} />
                </>
              )}
            </div>
          </div>

          {/* Contrast check */}
          {color && (
            <div className="rounded-lg border border-border-subtle bg-bg-elevated p-4">
              <h3 className="mb-3 text-sm font-medium text-text-primary">{t('modules.colorTool.ui.contrastTitle')}</h3>
              <div className="grid grid-cols-2 gap-3">
                <ContrastCard label={t('modules.colorTool.ui.contrastOnWhite')} color={color.hex} bgColor="#FFFFFF" ratio={color.contrastWhite} failLabel={t('modules.colorTool.ui.wcagFail')} />
                <ContrastCard label={t('modules.colorTool.ui.contrastOnBlack')} color={color.hex} bgColor="#000000" ratio={color.contrastBlack} failLabel={t('modules.colorTool.ui.wcagFail')} />
              </div>
            </div>
          )}

          {/* Palette */}
          {color && (
            <div className="rounded-lg border border-border-subtle bg-bg-elevated p-4">
              <h3 className="mb-3 text-sm font-medium text-text-primary">{t('modules.colorTool.ui.palettesTitle')}</h3>
              {(['complementary', 'analogous', 'triadic'] as const).map((name) => {
                const nameKey = `palette${name.charAt(0).toUpperCase() + name.slice(1)}` as 'paletteComplementary' | 'paletteAnalogous' | 'paletteTriadic'
                return (
                <div key={name} className="mb-3">
                  <p className="mb-1.5 text-xs capitalize text-text-muted">{t(`modules.colorTool.ui.${nameKey}`)}</p>
                  <div className="flex gap-2">
                    {color.palette[name].map((c, i) => {
                      const rgb = hslToRgb(c)
                      const hex = rgbToHex(rgb)
                      return (
                        <button
                          key={i}
                          onClick={() => { setHexInput(hex); handleCopy(hex, `palette-${name}-${i}`) }}
                          className="group relative h-12 flex-1 rounded-lg border border-border-subtle transition-transform hover:scale-105"
                          style={{ backgroundColor: hex }}
                          title={hex}
                        >
                          <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-black/40 px-1 py-0.5 text-center text-[10px] font-mono text-white opacity-0 transition-opacity group-hover:opacity-100">
                            {hex}
                          </span>
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
    </div>
  )
}

function FormatRow({ label, value, onCopy, copied }: { label: string; value: string; onCopy: (text: string, label: string) => void; copied: string | null }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-text-secondary">{label}</label>
      <div className="flex items-center gap-2">
        <input readOnly value={value} className="flex-1 rounded-md border border-border-base bg-bg-base px-3 py-2 font-mono text-sm text-text-primary" />
        <button onClick={() => onCopy(value, label)} className="rounded p-1.5 text-text-muted hover:bg-bg-hover hover:text-text-primary">
          {copied === label ? <span className="text-xs text-success">Copied!</span> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

function ContrastCard({ label, color, bgColor, ratio, failLabel }: { label: string; color: string; bgColor: string; ratio: number; failLabel: string }) {
  const pass = ratio >= 4.5
  const passAA = ratio >= 3
  return (
    <div className="rounded-lg p-3" style={{ backgroundColor: bgColor }}>
      <p className="text-sm font-medium" style={{ color }}>Aa Text Sample</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs font-mono" style={{ color: bgColor === '#FFFFFF' ? '#666' : '#aaa' }}>{ratio.toFixed(2)}:1</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${pass ? 'bg-green-500/20 text-green-400' : passAA ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
          {pass ? 'AAA' : passAA ? 'AA' : failLabel}
        </span>
        <span className="text-[10px]" style={{ color: bgColor === '#FFFFFF' ? '#999' : '#888' }}>{label}</span>
      </div>
    </div>
  )
}
