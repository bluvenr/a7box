/**
 * Capture Preview — Always-on-top image preview window
 * Created by "Pin" action in RegionPicker.
 * Supports: mouse wheel zoom, drag to pan, double-click reset, ESC/close to dismiss.
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'

export default function CapturePreview() {
  const { t } = useTranslation()
  const [imageSrc, setImageSrc] = useState<string>('')
  const [scale, setScale] = useState(1)
  const initialScaleRef = useRef(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Fetch pin data from Rust state (avoids timing issues with event push)
  useEffect(() => {
    ;(async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const { getCurrentWindow, currentMonitor } = await import('@tauri-apps/api/window')
        const { LogicalSize } = await import('@tauri-apps/api/dpi')
        const data = await invoke<string | null>('get_pending_pin_data')
        if (data) {
          // Decode image to get natural dimensions
          const img = new Image()
          await new Promise<void>((resolve) => {
            img.onload = () => resolve()
            img.src = data
          })

          const win = getCurrentWindow()
          const mon = await currentMonitor()
          const imgW = img.naturalWidth
          const imgH = img.naturalHeight
          const monW = mon?.size.width ?? 1920
          const monH = mon?.size.height ?? 1080

          // Chrome: top bar 32px + bottom hint ~28px
          const chromeH = 60
          // Max window bounds: 85% of screen
          const maxW = Math.round(monW * 0.85)
          const maxH = Math.round(monH * 0.85)

          // Calculate fit scale so image fully displays within window
          const fitScale = Math.min(
            (maxW) / imgW,
            (maxH - chromeH) / imgH,
            1 // don't upscale small images
          )

          const winW = Math.max(Math.round(imgW * fitScale), 300)
          const winH = Math.max(Math.round(imgH * fitScale) + chromeH, 200)

          await win.setSize(new LogicalSize(winW, winH))
          initialScaleRef.current = fitScale
          setScale(fitScale)
          setImageSrc(data)
        }
        // Show the window now that we're ready
        await getCurrentWindow().show()
      } catch { /* ignore */ }
    })()
  }, [])

  // Dark background
  useEffect(() => {
    document.documentElement.style.background = '#141416'
    document.body.style.background = '#141416'
    const root = document.getElementById('root')
    if (root) root.style.background = '#141416'
  }, [])

  // ESC to close
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window')
          await getCurrentWindow().close()
        } catch { /* ignore */ }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Mouse wheel zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setScale(prev => Math.max(0.1, Math.min(10, prev * (e.deltaY < 0 ? 1.15 : 0.87))))
  }, [])

  // Drag to pan
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    setDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
  }, [offset])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    setOffset({ x: dragStart.current.ox + dx, y: dragStart.current.oy + dy })
  }, [dragging])

  const onMouseUp = useCallback(() => setDragging(false), [])

  // Double-click to reset
  const onDoubleClick = useCallback(() => {
    setScale(initialScaleRef.current)
    setOffset({ x: 0, y: 0 })
  }, [])

  // Close window
  const handleClose = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().close()
    } catch { /* ignore */ }
  }, [])

  const pct = Math.round(scale * 100)

  return (
    <div ref={containerRef}
      onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
      onDoubleClick={onDoubleClick}
      style={{ width: '100vw', height: '100vh', background: '#141416', overflow: 'hidden', position: 'relative', cursor: dragging ? 'grabbing' : 'grab' }}>

      {/* Top bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 32, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 8px', background: 'rgba(0,0,0,0.6)', zIndex: 10,
        fontFamily: 'system-ui', fontSize: 11, color: 'rgba(255,255,255,0.5)', userSelect: 'none',
        WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <span>{pct}%</span>
        <button onClick={handleClose}
          style={{ WebkitAppRegion: 'no-drag', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 4, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer', fontSize: 14, transition: 'all 0.15s' } as React.CSSProperties}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.3)'; e.currentTarget.style.color = '#ef4444' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)' }}>
          ✕
        </button>
      </div>

      {/* Image */}
      {imageSrc && (
        <div style={{ position: 'absolute', top: '50%', left: '50%',
          transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
          transformOrigin: 'center', transition: dragging ? 'none' : 'transform 0.15s ease-out',
          pointerEvents: 'none' }}>
          <img src={imageSrc} alt="Preview" style={{ maxWidth: 'none', display: 'block', userSelect: 'none' }}
            draggable={false} />
        </div>
      )}

      {/* Zoom hint on first load */}
      {imageSrc && (
        <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.4)', fontFamily: 'system-ui',
          fontSize: 10, padding: '3px 10px', borderRadius: 6, pointerEvents: 'none', userSelect: 'none' }}>
          {t('modules.screenshot.editor.previewHint', { defaultValue: 'Scroll to zoom · Drag to pan · Double-click reset · ESC close' })}
        </div>
      )}
    </div>
  )
}
