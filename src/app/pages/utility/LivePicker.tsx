/**
 * Full-Screen Transparent Color Picker Overlay
 *
 * Created by Rust `start_screen_pick` command as a transparent window
 * that covers ALL monitors. This overlay:
 * - Shows a crosshair cursor across the entire screen
 * - Captures ALL mouse/keyboard input (prevents clicks reaching underlying apps)
 * - Displays a floating info card + magnifier that follow the cursor
 * - Left-click: quick copy color to clipboard
 * - Right-click: fill color into color tool float window
 * - Press Esc to cancel
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '')
  const expanded = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean
  const m = expanded.match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return null
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
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

interface CursorPos {
  x: number
  y: number
  color: string
}

interface MagData {
  data: number[]
  w: number
  h: number
  offX: number
  offY: number
}

const MAG_SIZE = 130 // magnifier circle diameter in CSS pixels

export default function LivePicker() {
  const { t } = useTranslation()
  const [hex, setHex] = useState('#888888')
  const [pickAction, setPickAction] = useState<'idle' | 'copied' | 'filled'>('idle')
  const [pickSource, setPickSource] = useState<'global' | 'float' | 'page'>('global')
  const [cardX, setCardX] = useState(0)
  const [cardY, setCardY] = useState(0)
  const [magX, setMagX] = useState(0)
  const [magY, setMagY] = useState(0)
  const magData = useRef<MagData | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Override html/body/#root background to transparent (the global CSS sets a dark bg)
  // Then signal Rust that we're ready so it can show the overlay (avoids black flash)
  useEffect(() => {
    const htmlEl = document.documentElement
    const bodyEl = document.body
    const rootEl = document.getElementById('root')
    const prevHtml = htmlEl.style.background
    const prevBody = bodyEl.style.background
    const prevRoot = rootEl?.style.background ?? ''
    htmlEl.style.background = 'transparent'
    bodyEl.style.background = 'transparent'
    if (rootEl) rootEl.style.background = 'transparent'

    // Signal Rust: CSS applied, safe to show overlay now
    // Wait 2 animation frames so WebView2 paints the transparent background BEFORE window.show()
    ;(async () => {
      try {
        await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
        const { emit } = await import('@tauri-apps/api/event')
        await emit('picker-ready', '')
      } catch { /* ignore */ }
    })()

    return () => {
      htmlEl.style.background = prevHtml
      bodyEl.style.background = prevBody
      if (rootEl) rootEl.style.background = prevRoot
    }
  }, [])

  // Prevent right-click context menu on the overlay
  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault()
    window.addEventListener('contextmenu', handler, true)
    return () => window.removeEventListener('contextmenu', handler, true)
  }, [])

  // Determine pick source: register event listener, then actively request the value.
  // The invoke call guarantees we get the correct value even if the event was lost
  // due to timing (event emitted before this component mounted).
  useEffect(() => {
    let unlisten: (() => void) | undefined
    ;(async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        const { invoke } = await import('@tauri-apps/api/core')
        // Register listener first (handles late re-emits from picker-ready)
        unlisten = await listen<string>('pick-source', (event) => {
          if (event.payload === 'global' || event.payload === 'float' || event.payload === 'page') {
            setPickSource(event.payload)
          }
        })
        // Then actively request the current value (reliable, synchronous from Rust)
        const source = await invoke<string>('get_pick_source')
        if (source === 'global' || source === 'float' || source === 'page') {
          setPickSource(source)
        }
      } catch { /* ignore */ }
    })()
    return () => { unlisten?.() }
  }, [])

  // Listen for "cursor-color" events from Rust polling thread (~30fps)
  useEffect(() => {
    let unlisten: (() => void) | undefined
    ;(async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        unlisten = await listen<string>('cursor-color', (event) => {
          if (event.payload) {
            setHex(event.payload)
            setPickAction('idle')
          }
        })
      } catch { /* ignore */ }
    })()
    return () => { unlisten?.() }
  }, [])

  // Listen for "cursor-position" events to move the card + magnifier near the cursor
  useEffect(() => {
    let unlisten: (() => void) | undefined
    ;(async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        unlisten = await listen<CursorPos>('cursor-position', (event) => {
          if (event.payload) {
            const { x, y, color } = event.payload
            if (color) setHex(color)

            const cardW = 240
            const cardH = 130
            const offset = 30
            const vw = window.innerWidth
            const vh = window.innerHeight

            // Position card: prefer right-bottom of cursor
            let cx = x + offset
            let cy = y + offset
            if (cx + cardW > vw) cx = x - offset - cardW
            if (cy + cardH > vh) cy = y - offset - cardH
            cx = Math.max(0, Math.min(cx, vw - cardW))
            cy = Math.max(0, Math.min(cy, vh - cardH))
            setCardX(cx)
            setCardY(cy)

            // Position magnifier: above cursor, horizontally centered on cursor
            let mx = x - MAG_SIZE / 2
            let my = y - MAG_SIZE - 20 // 20px above cursor
            // If magnifier goes above viewport, put it below cursor instead
            if (my < 0) my = y + 20
            // Clamp horizontally
            mx = Math.max(4, Math.min(mx, vw - MAG_SIZE - 4))
            setMagX(mx)
            setMagY(my)
          }
        })
      } catch { /* ignore */ }
    })()
    return () => { unlisten?.() }
  }, [])

  // Listen for "cursor-region" events — raw pixel data for magnifier (~10fps)
  useEffect(() => {
    let unlisten: (() => void) | undefined
    ;(async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        unlisten = await listen<MagData>('cursor-region', (event) => {
          if (event.payload) {
            magData.current = event.payload
            renderMagnifier()
          }
        })
      } catch { /* ignore */ }
    })()
    return () => { unlisten?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Render magnifier: draw zoomed pixels on canvas with crosshair
  const renderMagnifier = useCallback(() => {
    const canvas = canvasRef.current
    const data = magData.current
    if (!canvas || !data) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { w, h, offX, offY } = data
    const canvasSize = canvas.width
    const pxSize = canvasSize / Math.max(w, h) // each pixel's size on canvas

    ctx.clearRect(0, 0, canvasSize, canvasSize)

    // Draw each pixel as a filled rectangle (pixelated zoom)
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const i = (py * w + px) * 4
        ctx.fillStyle = `rgb(${data.data[i]}, ${data.data[i + 1]}, ${data.data[i + 2]})`
        ctx.fillRect(
          Math.round(px * pxSize),
          Math.round(py * pxSize),
          Math.ceil(pxSize),
          Math.ceil(pxSize)
        )
      }
    }

    // Draw grid lines for pixel boundaries
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.lineWidth = 0.5
    for (let i = 1; i < Math.max(w, h); i++) {
      const pos = Math.round(i * pxSize)
      ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, canvasSize); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(canvasSize, pos); ctx.stroke()
    }

    // Crosshair at the center pixel (cursor target)
    const centerX = (offX + 0.5) * pxSize
    const centerY = (offY + 0.5) * pxSize

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.lineWidth = 1.5
    // Horizontal line
    ctx.beginPath(); ctx.moveTo(0, centerY); ctx.lineTo(centerX - 4, centerY); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(centerX + 4, centerY); ctx.lineTo(canvasSize, centerY); ctx.stroke()
    // Vertical line
    ctx.beginPath(); ctx.moveTo(centerX, 0); ctx.lineTo(centerX, centerY - 4); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(centerX, centerY + 4); ctx.lineTo(centerX, canvasSize); ctx.stroke()

    // Small square around target pixel
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(offX * pxSize, offY * pxSize, pxSize, pxSize)
  }, [])

  // Left-click / Enter / Space: behavior depends on pickSource
  const handlePickQuick = useCallback(async () => {
    setPickAction('copied')
    try {
      const { emit } = await import('@tauri-apps/api/event')
      if (pickSource === 'global') {
        // Global mode: copy to clipboard + close overlay
        try { await navigator.clipboard.writeText(hex) } catch { /* ignore */ }
        await new Promise(r => setTimeout(r, 400))
        await emit('screen-color-picked', hex)
        await emit('pick-confirm', JSON.stringify({ color: hex, mode: 'quick' }))
      } else {
        // Float or page mode: just fill the color, no clipboard copy
        await new Promise(r => setTimeout(r, 300))
        await emit('screen-color-picked', hex)
        await emit('pick-confirm', JSON.stringify({ color: hex, mode: 'quick' }))
      }
    } catch { /* ignore */ }
  }, [hex, pickSource])

  // Right-click: behavior depends on pickSource
  const handlePickFill = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    setPickAction('filled')
    try {
      const { emit } = await import('@tauri-apps/api/event')
      if (pickSource === 'global') {
        // Global mode: fill into float window
        await new Promise(r => setTimeout(r, 400))
        await emit('screen-color-picked', hex)
        await emit('right-click-pick', hex)
      } else {
        // Float or page mode: same as left-click (just fill the target)
        await new Promise(r => setTimeout(r, 300))
        await emit('screen-color-picked', hex)
        await emit('pick-confirm', JSON.stringify({ color: hex, mode: 'quick' }))
      }
    } catch { /* ignore */ }
  }, [hex, pickSource])

  // Cancel: emit event, Rust listener handles restore based on pick mode
  const handleCancel = useCallback(async () => {
    try {
      const { emit } = await import('@tauri-apps/api/event')
      await emit('pick-cancel', '')
    } catch { /* ignore */ }
  }, [])

  // Keyboard handler: Enter/Space to pick, Esc to cancel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        e.stopPropagation()
        handlePickQuick()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        handleCancel()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [handlePickQuick, handleCancel])

  const rgb = hexToRgb(hex)
  const hsl = rgb ? rgbToHsl(rgb.r, rgb.g, rgb.b) : null

  return (
    <div
      onClick={handlePickQuick}
      onContextMenu={handlePickFill}
      style={{
        position: 'fixed',
        inset: 0,
        cursor: 'crosshair',
        background: 'transparent',
      }}
    >
      {/* Magnifier circle — zoomed pixel view, pointer-events: none */}
      <div
        style={{
          position: 'fixed',
          left: magX,
          top: magY,
          width: MAG_SIZE,
          height: MAG_SIZE,
          borderRadius: '50%',
          overflow: 'hidden',
          pointerEvents: 'none',
          border: '2px solid rgba(255, 255, 255, 0.25)',
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.5)',
          transition: 'left 0.03s linear, top 0.03s linear',
          zIndex: 20,
          background: '#111',
        }}
      >
        <canvas
          ref={canvasRef}
          width={MAG_SIZE - 4}
          height={MAG_SIZE - 4}
          style={{
            width: MAG_SIZE - 4,
            height: MAG_SIZE - 4,
            imageRendering: 'pixelated',
          }}
        />
      </div>

      {/* Floating info card — follows cursor, pointer-events: none */}
      <div
        style={{
          position: 'fixed',
          left: cardX,
          top: cardY,
          pointerEvents: 'none',
          background: pickAction !== 'idle'
            ? `rgba(${pickAction === 'copied' ? '22, 60, 35' : '18, 30, 55'}, 0.95)`
            : 'rgba(18, 18, 21, 0.92)',
          backdropFilter: 'blur(12px)',
          border: pickAction !== 'idle'
            ? `2px solid ${pickAction === 'copied' ? 'rgba(74, 222, 128, 0.7)' : 'rgba(96, 165, 250, 0.7)'}`
            : '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12,
          padding: '12px 16px',
          minWidth: 220,
          userSelect: 'none',
          transition: 'left 0.03s linear, top 0.03s linear, background 0.15s, border 0.15s, box-shadow 0.15s',
          boxShadow: pickAction !== 'idle'
            ? `0 0 24px ${pickAction === 'copied' ? 'rgba(74, 222, 128, 0.25)' : 'rgba(96, 165, 250, 0.25)'}, 0 4px 16px rgba(0,0,0,0.4)`
            : '0 4px 16px rgba(0, 0, 0, 0.3)',
          zIndex: 10,
        }}
      >
        {/* Color info row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 8,
              background: hex,
              border: pickAction !== 'idle'
                ? `2px solid ${pickAction === 'copied' ? '#4ade80' : '#60a5fa'}`
                : '1px solid rgba(255, 255, 255, 0.1)',
              flexShrink: 0,
              position: 'relative',
            }}
          >
            {/* Action feedback overlay on swatch */}
            {pickAction !== 'idle' && (
              <div style={{
                position: 'absolute', inset: 0, borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: pickAction === 'copied'
                  ? 'rgba(74, 222, 128, 0.25)' : 'rgba(96, 165, 250, 0.25)',
                fontSize: 18, fontWeight: 700,
                color: pickAction === 'copied' ? '#4ade80' : '#60a5fa',
              }}>
                {pickAction === 'copied' ? '\u2713' : '\u2192'}
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontFamily: 'monospace', fontSize: 18, fontWeight: 700,
              color: '#fff', lineHeight: 1.2, margin: 0, letterSpacing: '0.03em',
            }}>
              {hex.toUpperCase()}
            </p>
            {rgb && (
              <p style={{
                fontFamily: 'monospace', fontSize: 11,
                color: 'rgba(255,255,255,0.5)', lineHeight: 1.3, margin: '2px 0 0',
              }}>
                rgb({rgb.r}, {rgb.g}, {rgb.b})
              </p>
            )}
            {hsl && (
              <p style={{
                fontFamily: 'monospace', fontSize: 11,
                color: 'rgba(255,255,255,0.5)', lineHeight: 1.3, margin: '1px 0 0',
              }}>
                hsl({hsl.h}, {hsl.s}%, {hsl.l}%)
              </p>
            )}
          </div>
        </div>

        {/* Hints / Action feedback */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            marginTop: 8, paddingTop: 6,
          }}
        >
          {pickAction !== 'idle' ? (
            <span style={{
              fontSize: 11, fontWeight: 600,
              color: pickAction === 'copied' ? '#4ade80' : '#60a5fa',
            }}>
              {pickSource === 'global'
                ? (pickAction === 'copied'
                    ? `\u2713 ${t('livePicker.copiedHint', { defaultValue: 'Color value copied' })}`
                    : `\u2192 ${t('livePicker.filled', { defaultValue: 'Filled to float!' })}`
                  )
                : `\u2713 ${pickSource === 'float'
                    ? t('livePicker.colorUpdatedFloat', { defaultValue: 'Color updated in float' })
                    : t('livePicker.colorUpdatedPage', { defaultValue: 'Color updated in page' })
                  }`
              }
            </span>
          ) : pickSource === 'global' ? (
            <>
              <span style={{
                fontSize: 9, color: 'rgba(255,255,255,0.45)',
                fontFamily: 'inherit',
              }}>
                {t('livePicker.leftClickCopy', { defaultValue: 'Left-click: copy' })}
              </span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>|</span>
              <span style={{
                fontSize: 9, color: 'rgba(255,255,255,0.45)',
                fontFamily: 'inherit',
              }}>
                {t('livePicker.rightClickFill', { defaultValue: 'Right-click: fill float' })}
              </span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>|</span>
              <span style={{
                fontSize: 9, color: 'rgba(255,255,255,0.45)',
                fontFamily: 'inherit',
              }}>
                Esc: {t('common.cancel', { defaultValue: 'Cancel' })}
              </span>
            </>
          ) : (
            <>
              <span style={{
                fontSize: 9, color: 'rgba(255,255,255,0.45)',
                fontFamily: 'inherit',
              }}>
                {pickSource === 'float'
                  ? t('livePicker.clickFillFloat', { defaultValue: 'Click: fill float' })
                  : t('livePicker.clickFillPage', { defaultValue: 'Click: fill page' })
                }
              </span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>|</span>
              <span style={{
                fontSize: 9, color: 'rgba(255,255,255,0.45)',
                fontFamily: 'inherit',
              }}>
                Esc: {t('common.cancel', { defaultValue: 'Cancel' })}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
