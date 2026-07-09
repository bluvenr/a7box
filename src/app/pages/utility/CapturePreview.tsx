/**
 * Capture Preview — Always-on-top image preview window
 * Created by "Pin" action in RegionPicker.
 * Supports: mouse wheel zoom, drag to pan, double-click reset, ESC/close to dismiss.
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

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

  // Drag to pan (skip when clicking on the drag region / title bar)
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    // Don't start image pan when interacting with the drag region (title bar)
    if ((e.target as HTMLElement).closest('[data-tauri-drag-region]')) return
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

  // Double-click to reset (skip when on drag region to let Tauri handle maximize)
  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-tauri-drag-region]')) return
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
      className={`relative h-screen w-screen overflow-hidden bg-bg-elevated ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}>

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex h-8 items-center justify-between bg-black/60 px-2 text-[11px] text-white/50 select-none">
        <div data-tauri-drag-region className="flex-1">{pct}%</div>
        <button onClick={handleClose}
          className="flex h-5 w-5 items-center justify-center rounded text-white/50 transition-colors hover:bg-red-500/30 hover:text-red-500 cursor-pointer">
          <X size={12} />
        </button>
      </div>

      {/* Image */}
      {imageSrc && (
        <div
          className="absolute top-1/2 left-1/2 pointer-events-none"
          style={{
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
            transformOrigin: 'center',
            transition: dragging ? 'none' : 'transform 0.15s ease-out',
          }}>
          <img src={imageSrc} alt="Preview" className="block max-w-none select-none" draggable={false} />
        </div>
      )}

      {/* Zoom hint on first load */}
      {imageSrc && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-black/50 px-2.5 py-1 text-[10px] text-white/40 select-none">
          {t('modules.screenshot.editor.previewHint', { defaultValue: 'Scroll to zoom · Drag to pan · Double-click reset · ESC close' })}
        </div>
      )}
    </div>
  )
}
