/**
 * Color Tool Main Component
 * Color picker, HEX/RGB/HSL converter, palette generator, contrast checker
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Palette, Copy, Pipette, Keyboard, Check, ArrowLeftRight } from 'lucide-react'
import { useShortcutStore } from '../../core/shortcuts'
import { usePageActive } from '../../app/layouts/CachedOutlet'
import { formatShortcut, isTauri, isMac } from '../../shared/utils'
import {
  type RGB,
  MAX_HISTORY,
  hexToRgb, rgbToHex, rgbToHsl, hslToRgb, rgbToHsb, hsbToRgb,
  normalizeHex, contrastRatio, generatePalette,
} from './utils'
import { FormatRow } from './components/FormatRow'
import { ContrastCard, CustomContrastCard } from './components/ContrastCards'

const _isMac = isMac()

export default function ColorTool() {
  const { t } = useTranslation()
  const [hexInput, setHexInput] = useState('#FF4D4F')
  const [rgbInput, setRgbInput] = useState('')
  const [hslInput, setHslInput] = useState('')
  const [hsbInput, setHsbInput] = useState('')
  const [customFg, setCustomFg] = useState('#000000')
  const [customBg, setCustomBg] = useState('#FFFFFF')
  const [copied, setCopied] = useState<string | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const hexInputRef = useRef<HTMLInputElement>(null)
  const colorInputRef = useRef<HTMLInputElement>(null)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pageActive = usePageActive()

  const colorShortcut = useShortcutStore(s => s.shortcuts.find(sc => sc.action === 'open-color-picker'))
  const shortcutKeys = colorShortcut?.enabled ? colorShortcut.keys : null

  // Open live picker via event
  const handlePickFromScreen = useCallback(async () => {
    try {
      const { emit } = await import('@tauri-apps/api/event')
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const win = getCurrentWindow()
      await win.hide()
      await emit('pick-from-page', '')
    } catch { /* ignore */ }
  }, [])

  // Listen for screen-color-picked event
  useEffect(() => {
    let unlisten: (() => void) | undefined
    ;(async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        unlisten = await listen<string>('screen-color-picked', (event) => {
          if (event.payload) setHexInput(event.payload)
        })
      } catch { /* ignore */ }
    })()
    return () => { unlisten?.() }
  }, [])

  // Alt+C in-page shortcut
  useEffect(() => {
    if (!pageActive) return
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        if (e.key === 'c' || e.key === 'C' || e.code === 'KeyC') {
          e.preventDefault()
          handlePickFromScreen()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pageActive, handlePickFromScreen])

  const normalizedHex = normalizeHex(hexInput)
  const currentRgb = hexToRgb(normalizedHex)
  const isValid = currentRgb !== null

  const lastValidRef = useRef<string>('')
  const currentHsl = useMemo(() => currentRgb ? rgbToHsl(currentRgb) : null, [currentRgb])

  if (currentRgb && rgbToHex(currentRgb) !== lastValidRef.current) {
    const hex = rgbToHex(currentRgb)
    lastValidRef.current = hex
    setTimeout(() => {
      setHistory(prev => {
        const filtered = prev.filter(h => h.toLowerCase() !== hex.toLowerCase())
        return [hex, ...filtered].slice(0, MAX_HISTORY)
      })
    }, 0)
  }

  const displayRgb = currentRgb ? `rgb(${currentRgb.r}, ${currentRgb.g}, ${currentRgb.b})` : ''
  const displayHsl = currentHsl ? `hsl(${currentHsl.h}, ${currentHsl.s}%, ${currentHsl.l}%)` : ''
  const currentHsb = useMemo(() => currentRgb ? rgbToHsb(currentRgb) : null, [currentRgb])
  const displayHsb = currentHsb ? `hsb(${currentHsb.h}, ${currentHsb.s}%, ${currentHsb.b}%)` : ''

  const handleCopy = useCallback(async (text: string, label: string) => {
    await navigator.clipboard.writeText(text)
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    setCopied(label)
    copiedTimerRef.current = setTimeout(() => setCopied(null), 1500)
  }, [])

  const handleHexChange = useCallback((raw: string) => { setHexInput(raw) }, [])

  const handleHexPaste = useCallback(async (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').trim()
    const normalized = normalizeHex(text)
    if (hexToRgb(normalized)) {
      e.preventDefault()
      setHexInput(normalized)
    }
  }, [])

  const handleRgbEdit = useCallback((val: string) => {
    setRgbInput(val)
    const m = val.match(/(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/)
    if (m) {
      const r = parseInt(m[1]), g = parseInt(m[2]), b = parseInt(m[3])
      if (r <= 255 && g <= 255 && b <= 255) setHexInput(rgbToHex({ r, g, b }))
    }
  }, [])

  const handleHslEdit = useCallback((val: string) => {
    setHslInput(val)
    const m = val.match(/(\d{1,3})\s*,\s*(\d{1,3})%?\s*,\s*(\d{1,3})%?/)
    if (m) {
      const h = parseInt(m[1]), s = parseInt(m[2]), l = parseInt(m[3])
      if (h <= 360 && s <= 100 && l <= 100) setHexInput(rgbToHex(hslToRgb({ h, s, l })))
    }
  }, [])

  const handleHsbEdit = useCallback((val: string) => {
    setHsbInput(val)
    const m = val.match(/(\d{1,3})\s*,\s*(\d{1,3})%?\s*,\s*(\d{1,3})%?/)
    if (m) {
      const h = parseInt(m[1]), s = parseInt(m[2]), b = parseInt(m[3])
      if (h <= 360 && s <= 100 && b <= 100) setHexInput(rgbToHex(hsbToRgb({ h, s, b })))
    }
  }, [])

  const handleEyeDropper = useCallback(async () => {
    if (!('EyeDropper' in window)) return
    try {
      // @ts-expect-error EyeDropper API
      const dropper = new window.EyeDropper()
      const result = await dropper.open()
      if (result?.sRGBHex) setHexInput(result.sRGBHex)
    } catch { /* user cancelled */ }
  }, [])

  const hasEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window

  const color = useMemo(() => {
    if (!currentRgb) return null
    const hsl = rgbToHsl(currentRgb)
    const hsb = rgbToHsb(currentRgb)
    const palette = generatePalette(hsl)
    const white: RGB = { r: 255, g: 255, b: 255 }
    const black: RGB = { r: 0, g: 0, b: 0 }
    const tintStops = [0.2, 0.4, 0.6, 0.8, 0.95]
    const shadeStops = [0.8, 0.6, 0.4, 0.2, 0.05]
    const tints = tintStops.map(f => {
      const l = hsl.l + (100 - hsl.l) * f
      return rgbToHex(hslToRgb({ ...hsl, l: Math.round(l) }))
    })
    const shades = shadeStops.map(f => {
      const l = hsl.l * f
      return rgbToHex(hslToRgb({ ...hsl, l: Math.round(l) }))
    })
    return {
      rgb: currentRgb, hsl, hsb,
      hex: rgbToHex(currentRgb),
      contrastWhite: contrastRatio(currentRgb, white),
      contrastBlack: contrastRatio(currentRgb, black),
      palette, tints, shades,
    }
  }, [currentRgb])

  return (
    <div className="relative flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border-subtle bg-bg-elevated px-4 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Palette size={20} />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-text-primary">{t('modules.colorTool.name')}</h1>
          <p className="text-sm text-text-secondary">{t('modules.colorTool.description')}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Color picker + inputs */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center gap-2">
              <div
                className="h-32 w-32 cursor-pointer rounded-xl border border-border-base shadow-inner transition-shadow hover:shadow-md"
                style={{ backgroundColor: color?.hex ?? (lastValidRef.current || '#cccccc') }}
                onClick={() => colorInputRef.current?.click()}
                title={t('modules.colorTool.ui.clickToPick', { defaultValue: 'Click to pick a color' })}
              />
              <div className="flex gap-1">
                <input
                  ref={colorInputRef}
                  type="color"
                  value={color?.hex ?? '#000000'}
                  onChange={(e) => setHexInput(e.target.value)}
                  className="h-8 w-0 cursor-pointer border-0 bg-transparent opacity-0 absolute"
                  tabIndex={-1}
                />
                {isTauri() ? (
                  <button onClick={handlePickFromScreen} className="flex h-8 w-8 items-center justify-center rounded border border-border-base text-text-muted hover:bg-bg-hover hover:text-text-primary" title={t('modules.colorTool.ui.pickFromScreen', { defaultValue: 'Pick from screen' })}>
                    <Pipette size={14} />
                  </button>
                ) : hasEyeDropper && (
                  <button onClick={handleEyeDropper} className="flex h-8 w-8 items-center justify-center rounded border border-border-base text-text-muted hover:bg-bg-hover hover:text-text-primary" title={t('modules.colorTool.ui.eyedropperTooltip')}>
                    <Pipette size={14} />
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 space-y-3">
              {/* HEX input */}
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">HEX</label>
                <div className="flex items-center gap-2">
                  <input
                    ref={hexInputRef}
                    type="text"
                    value={hexInput}
                    onChange={(e) => handleHexChange(e.target.value)}
                    onPaste={handleHexPaste}
                    className={`flex-1 rounded-md border bg-bg-base px-3 py-2 font-mono text-sm text-text-primary focus:outline-none ${isValid ? 'border-border-base focus:border-border-focus' : 'border-error/50 focus:border-error'}`}
                    spellCheck={false}
                  />
                  <button onClick={() => handleCopy(hexInput, 'HEX')} className="rounded p-1.5 text-text-muted hover:bg-bg-hover hover:text-text-primary">
                    {copied === 'HEX' ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                {!isValid && hexInput.trim().length > 0 && (
                  <p className="mt-1 text-[10px] text-error">{t('modules.colorTool.ui.invalidHex')}</p>
                )}
              </div>

              <FormatRow label="RGB" value={rgbInput || displayRgb} displayValue={displayRgb} onEdit={handleRgbEdit} onBlur={() => setRgbInput('')} onCopy={handleCopy} copied={copied} />
              <FormatRow label="HSL" value={hslInput || displayHsl} displayValue={displayHsl} onEdit={handleHslEdit} onBlur={() => setHslInput('')} onCopy={handleCopy} copied={copied} />
              <FormatRow label="HSB" value={hsbInput || displayHsb} displayValue={displayHsb} onEdit={handleHsbEdit} onBlur={() => setHsbInput('')} onCopy={handleCopy} copied={copied} />
            </div>
          </div>

          {/* Color history */}
          {history.length > 0 && (
            <div className="rounded-lg border border-border-subtle bg-bg-elevated p-4">
              <h3 className="mb-2 text-sm font-medium text-text-primary">{t('modules.colorTool.ui.historyTitle')}</h3>
              <div className="flex flex-wrap gap-2">
                {history.map((hex, i) => (
                  <button key={`${hex}-${i}`} onClick={() => setHexInput(hex)} className="group h-8 w-8 rounded-lg border border-border-subtle transition-transform hover:scale-110" style={{ backgroundColor: hex }} title={hex} />
                ))}
              </div>
            </div>
          )}

          {/* Contrast check */}
          {color && (
            <div className="rounded-lg border border-border-subtle bg-bg-elevated p-4">
              <h3 className="mb-3 text-sm font-medium text-text-primary">{t('modules.colorTool.ui.contrastTitle')}</h3>
              <div className="grid grid-cols-2 gap-3">
                <ContrastCard label={t('modules.colorTool.ui.contrastOnWhite')} color={color.hex} bgColor="#FFFFFF" ratio={color.contrastWhite} />
                <ContrastCard label={t('modules.colorTool.ui.contrastOnBlack')} color={color.hex} bgColor="#000000" ratio={color.contrastBlack} />
              </div>
              <div className="mt-4 border-t border-border-subtle pt-4">
                <h4 className="mb-3 text-xs font-medium text-text-secondary">{t('modules.colorTool.ui.customContrast', { defaultValue: 'Custom Contrast' })}</h4>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-[11px] text-text-muted">{t('modules.colorTool.ui.foreground', { defaultValue: 'Foreground' })}</label>
                    <div className="flex items-center gap-1.5">
                      <input type="color" value={customFg} onChange={(e) => setCustomFg(e.target.value)} className="h-8 w-8 shrink-0 cursor-pointer rounded border border-border-base bg-transparent" />
                      <input type="text" value={customFg} onChange={(e) => setCustomFg(e.target.value)} className="w-full rounded border border-border-base bg-bg-base px-2 py-1.5 font-mono text-xs text-text-primary focus:border-border-focus focus:outline-none" />
                    </div>
                  </div>
                  <button onClick={() => { const tmp = customFg; setCustomFg(customBg); setCustomBg(tmp) }} className="mb-0.5 rounded p-1.5 text-text-muted hover:bg-bg-hover hover:text-text-primary" title={t('modules.colorTool.ui.swap', { defaultValue: 'Swap' })}>
                    <ArrowLeftRight size={14} />
                  </button>
                  <div className="flex-1">
                    <label className="mb-1 block text-[11px] text-text-muted">{t('modules.colorTool.ui.background', { defaultValue: 'Background' })}</label>
                    <div className="flex items-center gap-1.5">
                      <input type="color" value={customBg} onChange={(e) => setCustomBg(e.target.value)} className="h-8 w-8 shrink-0 cursor-pointer rounded border border-border-base bg-transparent" />
                      <input type="text" value={customBg} onChange={(e) => setCustomBg(e.target.value)} className="w-full rounded border border-border-base bg-bg-base px-2 py-1.5 font-mono text-xs text-text-primary focus:border-border-focus focus:outline-none" />
                    </div>
                  </div>
                </div>
                {(() => {
                  const fg = hexToRgb(normalizeHex(customFg))
                  const bg = hexToRgb(normalizeHex(customBg))
                  if (!fg || !bg) return null
                  return <div className="mt-3"><CustomContrastCard fgHex={customFg} bgHex={customBg} ratio={contrastRatio(fg, bg)} /></div>
                })()}
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
                        const palId = `palette-${name}-${i}`
                        return (
                          <button key={i} onClick={() => handleCopy(hex, palId)} className="group relative h-12 flex-1 rounded-lg border border-border-subtle transition-transform hover:scale-105" style={{ backgroundColor: hex }} title={hex}>
                            <span className={`absolute inset-x-0 bottom-0 rounded-b-lg bg-black/40 px-1 py-0.5 text-center text-[10px] font-mono text-white transition-opacity ${copied === palId ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}>{hex}</span>
                            {copied === palId && (
                              <span className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/50">
                                <Check size={14} className="text-white drop-shadow" />
                                <span className="mt-0.5 text-[9px] font-medium text-white drop-shadow">{t('common.copied')}</span>
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

          {/* Tints & Shades */}
          {color && (
            <div className="rounded-lg border border-border-subtle bg-bg-elevated p-4">
              <h3 className="mb-3 text-sm font-medium text-text-primary">{t('modules.colorTool.ui.tintsAndShades', { defaultValue: 'Tints & Shades' })}</h3>
              <p className="mb-1.5 text-xs text-text-muted">{t('modules.colorTool.ui.tints', { defaultValue: 'Tints (mix with white)' })}</p>
              <div className="flex gap-1.5 mb-4">
                {color.tints.map((hex, i) => (
                  <button key={`t-${i}`} onClick={() => handleCopy(hex, `tint-${i}`)} className="group relative h-10 flex-1 rounded-lg border border-border-subtle transition-transform hover:scale-105" style={{ backgroundColor: hex }} title={hex}>
                    <span className={`absolute inset-x-0 bottom-0 rounded-b-lg bg-black/30 px-0.5 py-0.5 text-center text-[9px] font-mono text-white transition-opacity ${copied === `tint-${i}` ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}>{hex}</span>
                    {copied === `tint-${i}` && <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40"><Check size={12} className="text-white drop-shadow" /></span>}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-6 w-6 rounded border border-border-base" style={{ backgroundColor: color.hex }} />
                <span className="text-[11px] font-mono text-text-secondary">{color.hex} ({t('modules.colorTool.ui.baseColor', { defaultValue: 'Base' })})</span>
              </div>
              <p className="mb-1.5 text-xs text-text-muted">{t('modules.colorTool.ui.shades', { defaultValue: 'Shades (mix with black)' })}</p>
              <div className="flex gap-1.5">
                {color.shades.map((hex, i) => (
                  <button key={`s-${i}`} onClick={() => handleCopy(hex, `shade-${i}`)} className="group relative h-10 flex-1 rounded-lg border border-border-subtle transition-transform hover:scale-105" style={{ backgroundColor: hex }} title={hex}>
                    <span className={`absolute inset-x-0 bottom-0 rounded-b-lg bg-black/40 px-0.5 py-0.5 text-center text-[9px] font-mono text-white transition-opacity ${copied === `shade-${i}` ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}>{hex}</span>
                    {copied === `shade-${i}` && <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40"><Check size={12} className="text-white drop-shadow" /></span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Keyboard shortcuts */}
          <div className="flex items-center gap-4 rounded-lg border border-border-subtle bg-bg-hover/40 px-4 py-2.5">
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <Keyboard size={12} />
              <span className="font-medium">{t('modules.colorTool.ui.shortcuts', { defaultValue: 'Shortcuts' })}</span>
            </div>
            <span className="flex items-center gap-1 text-[11px] text-text-disabled">
              <kbd className="rounded bg-bg-base px-1.5 py-0.5 font-mono text-text-muted">{_isMac ? '⌥' : 'Alt'}</kbd>
              <span>+</span>
              <kbd className="rounded bg-bg-base px-1.5 py-0.5 font-mono text-text-muted">C</kbd>
              <span className="ml-0.5">{t('modules.colorTool.ui.pickFromScreen', { defaultValue: 'Pick from screen' })}</span>
            </span>
            {shortcutKeys && (
              <span className="flex items-center gap-1 text-[11px] text-text-disabled pl-2 border-l border-border-subtle">
                <kbd className="rounded bg-bg-base px-1.5 py-0.5 font-mono text-text-muted">{formatShortcut(shortcutKeys)}</kbd>
                <span className="ml-0.5">{t('modules.colorTool.ui.globalPick', { defaultValue: 'Global pick + float' })}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
