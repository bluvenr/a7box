/**
 * PreviewCanvas — Real-time Canvas preview with watermark overlay
 * Renders the selected image with the current watermark config applied.
 * Supports prev/next navigation and keyboard arrow keys for batch browsing.
 */

import { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ZoomIn, ZoomOut, Maximize, ChevronLeft, ChevronRight } from 'lucide-react'
import type { WatermarkConfig, WatermarkImage } from '../types'
import { renderWatermark } from '../utils/renderWatermark'

interface PreviewCanvasProps {
  image: WatermarkImage | null
  config: WatermarkConfig
  /** Total image count for navigation UI */
  totalCount: number
  /** Current index (0-based) */
  currentIndex: number
  onPrev: () => void
  onNext: () => void
}

type ZoomLevel = 'fit' | number

export function PreviewCanvas({ image, config, totalCount, currentIndex, onPrev, onNext }: PreviewCanvasProps) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState<ZoomLevel>('fit')
  const rafRef = useRef<number>(0)

  // Anchor point used to keep zoom centered on the cursor / viewport center
  const zoomAnchorRef = useRef<{ fx: number; fy: number; clientX: number; clientY: number } | null>(null)
  // Left-click drag panning state
  const panRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null)
  const [isPanning, setIsPanning] = useState(false)

  // Effective zoom percent of the current "fit" display (capped at 100%)
  const getFitPercent = useCallback(() => {
    const el = scrollAreaRef.current
    if (!el || !image || image.width === 0 || image.height === 0) return 100
    const availW = el.clientWidth - 32 // account for p-4 padding
    const availH = el.clientHeight - 32
    if (availW <= 0 || availH <= 0) return 100
    return Math.min(availW / image.width, availH / image.height, 1) * 100
  }, [image])

  const anchorAtCursor = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    zoomAnchorRef.current = {
      fx: (clientX - rect.left) / rect.width,
      fy: (clientY - rect.top) / rect.height,
      clientX,
      clientY,
    }
  }

  const anchorViewportCenter = () => {
    const el = scrollAreaRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    anchorAtCursor(r.left + r.width / 2, r.top + r.height / 2)
  }

  // Step zoom by one level; from "fit", snap to the nearest 25% grid around the fit value
  const stepZoom = (dir: 1 | -1) => {
    setZoom((z) => {
      if (z === 'fit') {
        const fit = getFitPercent()
        return dir > 0
          ? Math.min(Math.floor(fit / 25) * 25 + 25, 400)
          : Math.max(Math.ceil(fit / 25) * 25 - 25, 25)
      }
      return dir > 0 ? Math.min(z + 25, 400) : Math.max(z - 25, 25)
    })
  }

  // After zoom changes, adjust scroll so the anchored point stays under the cursor
  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current
    const canvas = canvasRef.current
    const el = scrollAreaRef.current
    if (!anchor || !canvas || !el) return
    zoomAnchorRef.current = null
    const rect = canvas.getBoundingClientRect()
    const curX = rect.left + anchor.fx * rect.width
    const curY = rect.top + anchor.fy * rect.height
    el.scrollLeft += curX - anchor.clientX
    el.scrollTop += curY - anchor.clientY
  }, [zoom])

  // Ctrl+wheel zoom — native listener with passive:false to allow preventDefault
  useEffect(() => {
    const el = scrollAreaRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      anchorAtCursor(e.clientX, e.clientY)
      stepZoom(e.deltaY < 0 ? 1 : -1)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [image])

  // Left-click drag to pan the preview
  const handlePanStart = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    const el = scrollAreaRef.current
    if (!el) return
    e.preventDefault()
    panRef.current = { startX: e.clientX, startY: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop }
    setIsPanning(true)
    const onMove = (ev: MouseEvent) => {
      const pan = panRef.current
      const area = scrollAreaRef.current
      if (!pan || !area) return
      area.scrollLeft = pan.scrollLeft - (ev.clientX - pan.startX)
      area.scrollTop = pan.scrollTop - (ev.clientY - pan.startY)
    }
    const onUp = () => {
      panRef.current = null
      setIsPanning(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Main render effect — redraws whenever image or config changes
  useEffect(() => {
    if (!image?.bitmap || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Cancel any pending frame
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    rafRef.current = requestAnimationFrame(() => {
      const bitmap = image.bitmap!
      canvas.width = bitmap.width
      canvas.height = bitmap.height

      // Clear and draw source image
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(bitmap, 0, 0)

      // Draw watermark overlay
      renderWatermark(ctx, canvas.width, canvas.height, config)
    })

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [image, config])

  // Compute display style based on zoom level
  const getCanvasStyle = (): React.CSSProperties => {
    if (!image || zoom === 'fit') {
      return { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }
    }
    return { width: `${(image.width * zoom) / 100}px`, height: 'auto' }
  }

  const cycleZoom = () => {
    anchorViewportCenter()
    if (zoom === 'fit') setZoom(100)
    else if (zoom === 100) setZoom(200)
    else setZoom('fit')
  }

  const zoomIn = () => {
    anchorViewportCenter()
    stepZoom(1)
  }

  const zoomOut = () => {
    anchorViewportCenter()
    stepZoom(-1)
  }

  if (!image) return null

  const hasMultiple = totalCount > 1

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Canvas area — Ctrl+wheel to zoom, drag to pan */}
      <div
        ref={scrollAreaRef}
        className={`flex flex-1 overflow-auto bg-[repeating-conic-gradient(#80808015_0%_25%,transparent_0%_50%)] bg-[length:20px_20px] p-4 ${isPanning ? 'cursor-grabbing' : ''}`}
        onDoubleClick={cycleZoom}
        onMouseDown={handlePanStart}
      >
        <canvas
          ref={canvasRef}
          style={getCanvasStyle()}
          className="m-auto shrink-0 rounded shadow-lg shadow-black/10"
        />
      </div>

      {/* Prev / Next navigation arrows */}
      {hasMultiple && (
        <>
          <button
            onClick={onPrev}
            className="absolute left-2 top-1/2 z-20 -translate-y-1/2 cursor-pointer rounded-full border border-border-subtle bg-bg-elevated/90 p-1.5 text-text-muted shadow-sm backdrop-blur-sm transition-colors hover:bg-bg-hover hover:text-text-primary"
            title={t('modules.imageWatermark.ui.prevImage', { defaultValue: 'Previous (←)' })}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={onNext}
            className="absolute right-2 top-1/2 z-20 -translate-y-1/2 cursor-pointer rounded-full border border-border-subtle bg-bg-elevated/90 p-1.5 text-text-muted shadow-sm backdrop-blur-sm transition-colors hover:bg-bg-hover hover:text-text-primary"
            title={t('modules.imageWatermark.ui.nextImage', { defaultValue: 'Next (→)' })}
          >
            <ChevronRight size={18} />
          </button>
        </>
      )}

      {/* Image counter badge */}
      {hasMultiple && (
        <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-border-subtle bg-bg-elevated/90 px-3 py-1 text-[11px] font-medium text-text-secondary shadow-sm backdrop-blur-sm">
          {currentIndex + 1} / {totalCount}
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border border-border-subtle bg-bg-elevated/90 px-1.5 py-1 shadow-sm backdrop-blur-sm">
        <button onClick={zoomOut} className="cursor-pointer rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary">
          <ZoomOut size={14} />
        </button>
        <button
          onClick={cycleZoom}
          className="cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium text-text-secondary hover:bg-bg-hover"
        >
          {zoom === 'fit' ? t('modules.imageWatermark.ui.zoomFit', { defaultValue: 'Fit' }) : `${zoom}%`}
        </button>
        <button onClick={zoomIn} className="cursor-pointer rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary">
          <ZoomIn size={14} />
        </button>
        <button onClick={() => setZoom('fit')} className="cursor-pointer rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary">
          <Maximize size={14} />
        </button>
      </div>

      {/* Image dimensions info */}
      <div className="absolute left-3 top-3 rounded-md bg-bg-elevated/80 px-2 py-1 text-[10px] text-text-muted backdrop-blur-sm">
        {image.width} × {image.height}px
      </div>
    </div>
  )
}
