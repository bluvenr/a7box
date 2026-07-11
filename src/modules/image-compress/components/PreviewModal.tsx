/**
 * Image Compress — Preview Modal with synchronized zoom & pan
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Download, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { formatBytes, savingsPercent, type CompressedImage } from '../utils'

interface Props {
  img: CompressedImage
  onClose: () => void
  onDownload: (img: CompressedImage) => void
}

export function PreviewModal({ img, onClose, onDownload }: Props) {
  const { t } = useTranslation()
  const [origDataUrl, setOrigDataUrl] = useState<string | null>(null)
  const [compDataUrl, setCompDataUrl] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const isDraggingRef = useRef(false)
  const lastPosRef = useRef({ x: 0, y: 0 })
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const origBaseScaleRef = useRef(1)
  const compBaseScaleRef = useRef(1)
  const [origImgSize, setOrigImgSize] = useState<{ w: number; h: number } | null>(null)
  const [compImgSize, setCompImgSize] = useState<{ w: number; h: number } | null>(null)

  // Convert blobs to data URLs
  useEffect(() => {
    const reader = new FileReader()
    reader.onload = () => setOrigDataUrl(reader.result as string)
    reader.readAsDataURL(img.originalFile)
  }, [img.originalFile])

  useEffect(() => {
    if (img.compressedBlob) {
      const reader = new FileReader()
      reader.onload = () => setCompDataUrl(reader.result as string)
      reader.readAsDataURL(img.compressedBlob)
    }
  }, [img.compressedBlob])

  const handleOrigLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const container = leftRef.current
    if (!container) return
    const cw = container.clientWidth
    const ch = container.clientHeight
    const iw = e.currentTarget.naturalWidth
    const ih = e.currentTarget.naturalHeight
    if (iw > 0 && ih > 0) {
      origBaseScaleRef.current = Math.min(cw / iw, ch / ih)
      setOrigImgSize({ w: iw, h: ih })
    }
  }, [])

  const handleCompLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const container = rightRef.current
    if (!container) return
    const cw = container.clientWidth
    const ch = container.clientHeight
    const iw = e.currentTarget.naturalWidth
    const ih = e.currentTarget.naturalHeight
    if (iw > 0 && ih > 0) {
      compBaseScaleRef.current = Math.min(cw / iw, ch / ih)
      setCompImgSize({ w: iw, h: ih })
    }
  }, [])

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Wheel zoom
  useEffect(() => {
    const els = [leftRef.current, rightRef.current].filter(Boolean) as HTMLElement[]
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      setZoom((prev) => {
        const factor = e.deltaY < 0 ? 1.25 : 0.8
        const next = Math.max(1, Math.min(5, prev * factor))
        if (Math.abs(next - 1) < 0.01) setPan({ x: 0, y: 0 })
        return next
      })
    }
    els.forEach((el) => el.addEventListener('wheel', handleWheel, { passive: false }))
    return () => els.forEach((el) => el.removeEventListener('wheel', handleWheel))
  }, [])

  // Drag to pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return
    isDraggingRef.current = true
    lastPosRef.current = { x: e.clientX, y: e.clientY }
  }, [zoom])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current) return
    const dx = e.clientX - lastPosRef.current.x
    const dy = e.clientY - lastPosRef.current.y
    lastPosRef.current = { x: e.clientX, y: e.clientY }
    setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
  }, [])

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false
  }, [])

  const resetView = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  const isZoomed = zoom > 1.01
  const origTotalScale = origBaseScaleRef.current * zoom
  const compTotalScale = compBaseScaleRef.current * zoom
  const origTx = origImgSize ? (pan.x - origTotalScale * origImgSize.w / 2) : 0
  const origTy = origImgSize ? (pan.y - origTotalScale * origImgSize.h / 2) : 0
  const compTx = compImgSize ? (pan.x - compTotalScale * compImgSize.w / 2) : 0
  const compTy = compImgSize ? (pan.y - compTotalScale * compImgSize.h / 2) : 0
  const noTransition = isDraggingRef.current
  const origStyle: React.CSSProperties = {
    transform: `translate(${origTx}px, ${origTy}px) scale(${origTotalScale})`,
    transformOrigin: '0 0',
    opacity: origImgSize ? 1 : 0,
    transition: noTransition ? 'none' : 'transform 0.15s ease-out',
  }
  const compStyle: React.CSSProperties = {
    transform: `translate(${compTx}px, ${compTy}px) scale(${compTotalScale})`,
    transformOrigin: '0 0',
    opacity: compImgSize ? 1 : 0,
    transition: noTransition ? 'none' : 'transform 0.15s ease-out',
  }

  const panelProps = {
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUp,
    onMouseLeave: handleMouseUp,
    className: `relative h-[55vh] min-h-[240px] overflow-hidden rounded-lg bg-bg-base cursor-grab active:cursor-grabbing`,
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative mx-4 w-[90vw] max-w-5xl rounded-xl border border-border-subtle bg-bg-elevated shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <h3 className="truncate text-sm font-semibold text-text-primary" title={img.originalFile.name}>{img.originalFile.name}</h3>
          <button onClick={onClose} className="cursor-pointer text-text-muted hover:text-text-primary p-1"><X size={16} /></button>
        </div>
        {/* Images comparison with sync zoom/pan */}
        <div className="relative grid grid-cols-2 gap-4 p-4">
          <div>
            <p className="mb-2 text-center text-xs font-medium text-text-muted">{t('modules.imageCompress.ui.previewOriginal')}</p>
            <div ref={leftRef} {...panelProps}>
              {origDataUrl
                ? <img src={origDataUrl} alt="original" className="pointer-events-none absolute left-1/2 top-1/2 max-w-none" style={origStyle} draggable={false} onLoad={handleOrigLoad} />
                : <span className="flex h-full items-center justify-center text-xs text-text-disabled">—</span>
              }
            </div>
            <p className="mt-1 text-center text-xs text-text-muted">{formatBytes(img.originalSize)}</p>
          </div>
          <div>
            <p className="mb-2 text-center text-xs font-medium text-text-muted">{t('modules.imageCompress.ui.previewCompressed')}</p>
            <div ref={rightRef} {...panelProps}>
              {compDataUrl
                ? <img src={compDataUrl} alt="compressed" className="pointer-events-none absolute left-1/2 top-1/2 max-w-none" style={compStyle} draggable={false} onLoad={handleCompLoad} />
                : <span className="flex h-full items-center justify-center text-xs text-text-disabled">—</span>
              }
            </div>
            <p className="mt-1 text-center text-xs text-text-primary font-medium">{img.compressedSize !== null ? formatBytes(img.compressedSize) : '—'}</p>
          </div>
          {/* Floating zoom toolbar */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded-full border border-border-subtle bg-bg-elevated/95 px-1 py-1 shadow-lg backdrop-blur-sm">
            <button onClick={() => setZoom((p) => Math.max(1, p * 0.8))} disabled={!isZoomed} className="cursor-pointer rounded-full p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed"><ZoomOut size={14} /></button>
            <button onClick={resetView} className="min-w-[3rem] cursor-pointer rounded-full px-1.5 py-1 text-center text-xs font-medium text-text-secondary hover:bg-bg-hover">{Math.round(zoom * 100)}%</button>
            <button onClick={() => setZoom((p) => Math.min(5, p * 1.25))} disabled={zoom >= 5} className="cursor-pointer rounded-full p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed"><ZoomIn size={14} /></button>
            {isZoomed && (
              <>
                <div className="mx-0.5 h-3 w-px bg-border-subtle" />
                <button onClick={resetView} className="cursor-pointer rounded-full p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover" title={t('modules.imageCompress.ui.previewReset', { defaultValue: 'Reset' })}><RotateCcw size={13} /></button>
              </>
            )}
          </div>
        </div>
        {/* Stats + download */}
        <div className="flex items-center justify-between border-t border-border-subtle px-4 py-3">
          <div className="flex items-center gap-3 text-xs">
            {img.compressedSize !== null && (
              <>
                <span className="text-text-muted">{formatBytes(img.originalSize)} → <span className="text-text-primary font-medium">{formatBytes(img.compressedSize)}</span></span>
                <span className="rounded bg-success/10 px-1.5 py-0.5 font-medium text-success">-{savingsPercent(img.originalSize, img.compressedSize)}</span>
              </>
            )}
          </div>
          <button
            onClick={() => onDownload(img)}
            disabled={img.status !== 'done'}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={14} /> {t('common.download', { defaultValue: 'Download' })}
          </button>
        </div>
      </div>
    </div>
  )
}
