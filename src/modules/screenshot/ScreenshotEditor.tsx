/**
 * A7Box Screenshot Editor
 * Canvas-based image annotation tool
 * Tools: pencil, rectangle, arrow, text, mosaic
 * Supports undo/redo, save to file, copy to clipboard
 */
import { useRef, useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Pencil, Square, ArrowRight, Type, Grid3X3,
  Undo2, Redo2, Save, Copy, X, Check,
} from 'lucide-react'

type Tool = 'pencil' | 'rect' | 'arrow' | 'text' | 'mosaic'

interface Point { x: number; y: number }

interface EditorProps {
  imageData: string
  onSave: (dataUrl: string) => void
  onCopy?: (dataUrl: string) => void
  onClose: () => void
}

const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ffffff', '#000000']
const WIDTHS = [2, 4, 8]
const MOSAIC_SIZE = 12

function dataURLtoBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',')
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png'
  const byteStr = atob(parts[1])
  const arr = new Uint8Array(byteStr.length)
  for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

export default function ScreenshotEditor({ imageData, onSave, onCopy, onClose }: EditorProps) {
  const { t } = useTranslation()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [tool, setTool] = useState<Tool>('rect')
  const [color, setColor] = useState('#ef4444')
  const [width, setWidth] = useState(3)
  const [copied, setCopied] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [textEditing, setTextEditing] = useState<{ x: number; y: number; cx: number; cy: number } | null>(null)
  const [textValue, setTextValue] = useState('')

  // Drawing state refs (don't trigger re-render)
  const drawing = useRef(false)
  const start = useRef<Point>({ x: 0, y: 0 })
  const mosaicDrawn = useRef(new Set<string>())

  // History: array of canvas dataURLs
  const hist = useRef<string[]>([])
  const hIdx = useRef(-1)

  // Image dimensions (for coordinate conversion)
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })

  // ---- Canvas init ----
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      const cw = containerRef.current?.clientWidth || 1200
      const ch = (containerRef.current?.clientHeight || 700) - 60
      const scale = Math.min(cw / img.width, ch / img.height, 1)
      const w = Math.floor(img.width * scale)
      const h = Math.floor(img.height * scale)

      setImgSize({ w, h })

      const canvas = canvasRef.current
      const preview = previewRef.current
      if (!canvas || !preview) return

      canvas.width = w
      canvas.height = h
      preview.width = w
      preview.height = h

      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)

      hist.current = [canvas.toDataURL()]
      hIdx.current = 0
      setCanUndo(false)
      setCanRedo(false)
    }
    img.src = imageData
  }, [imageData])

  // ---- Coordinate helper ----
  const getPos = useCallback((e: React.MouseEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }, [])

  // ---- History helpers ----
  const saveHistory = useCallback(() => {
    const canvas = canvasRef.current!
    const data = canvas.toDataURL()
    hist.current = hist.current.slice(0, hIdx.current + 1)
    hist.current.push(data)
    hIdx.current++
    setCanUndo(true)
    setCanRedo(false)
  }, [])

  const undo = useCallback(() => {
    if (hIdx.current <= 0) return
    hIdx.current--
    const img = new Image()
    img.onload = () => {
      const ctx = canvasRef.current!.getContext('2d')!
      ctx.clearRect(0, 0, imgSize.w, imgSize.h)
      ctx.drawImage(img, 0, 0)
    }
    img.src = hist.current[hIdx.current]
    setCanUndo(hIdx.current > 0)
    setCanRedo(true)
  }, [imgSize])

  const redo = useCallback(() => {
    if (hIdx.current >= hist.current.length - 1) return
    hIdx.current++
    const img = new Image()
    img.onload = () => {
      const ctx = canvasRef.current!.getContext('2d')!
      ctx.clearRect(0, 0, imgSize.w, imgSize.h)
      ctx.drawImage(img, 0, 0)
    }
    img.src = hist.current[hIdx.current]
    setCanUndo(true)
    setCanRedo(hIdx.current < hist.current.length - 1)
  }, [imgSize])

  // ---- Export helpers ----
  const getExportURL = useCallback(() => canvasRef.current!.toDataURL('image/png'), [])

  const handleSave = useCallback(() => {
    onSave(getExportURL())
  }, [onSave, getExportURL])

  const handleCopy = useCallback(async () => {
    try {
      const blob = dataURLtoBlob(getExportURL())
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      onCopy?.(getExportURL())
    }
  }, [getExportURL, onCopy])

  // ---- Drawing primitives on preview canvas ----
  const clearPreview = useCallback(() => {
    const ctx = previewRef.current!.getContext('2d')!
    ctx.clearRect(0, 0, imgSize.w, imgSize.h)
  }, [imgSize])

  const drawRect = useCallback((ctx: CanvasRenderingContext2D, p1: Point, p2: Point) => {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.strokeRect(
      Math.min(p1.x, p2.x), Math.min(p1.y, p2.y),
      Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y)
    )
  }, [color, width])

  const drawArrow = useCallback((ctx: CanvasRenderingContext2D, p1: Point, p2: Point) => {
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
    const headLen = Math.max(16, width * 4)

    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // Shaft
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.stroke()

    // Head
    ctx.beginPath()
    ctx.moveTo(p2.x, p2.y)
    ctx.lineTo(p2.x - headLen * Math.cos(angle - Math.PI / 6), p2.y - headLen * Math.sin(angle - Math.PI / 6))
    ctx.lineTo(p2.x - headLen * Math.cos(angle + Math.PI / 6), p2.y - headLen * Math.sin(angle + Math.PI / 6))
    ctx.closePath()
    ctx.fill()
  }, [color, width])

  const drawPencilStroke = useCallback((ctx: CanvasRenderingContext2D, points: Point[]) => {
    if (points.length < 2) return
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y)
    }
    ctx.stroke()
  }, [color, width])

  // ---- Mouse handlers ----
  const pencilPoints = useRef<Point[]>([])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const pos = getPos(e)
    drawing.current = true
    start.current = pos

    if (tool === 'pencil') {
      pencilPoints.current = [pos]
    } else if (tool === 'mosaic') {
      mosaicDrawn.current = new Set()
      // Draw initial mosaic block
      applyMosaic(pos)
    } else if (tool === 'text') {
      // Defer to onMouseUp for text placement
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, getPos])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawing.current) return
    const pos = getPos(e)
    const ctx = previewRef.current!.getContext('2d')!
    ctx.clearRect(0, 0, imgSize.w, imgSize.h)

    switch (tool) {
      case 'pencil':
        pencilPoints.current.push(pos)
        drawPencilStroke(ctx, pencilPoints.current)
        break
      case 'rect':
        drawRect(ctx, start.current, pos)
        break
      case 'arrow':
        drawArrow(ctx, start.current, pos)
        break
      case 'mosaic':
        applyMosaic(pos)
        break
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, getPos, imgSize, drawPencilStroke, drawRect, drawArrow])

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    if (!drawing.current) return
    drawing.current = false
    const pos = getPos(e)
    const mainCtx = canvasRef.current!.getContext('2d')!

    switch (tool) {
      case 'pencil':
        if (pencilPoints.current.length > 1) {
          drawPencilStroke(mainCtx, pencilPoints.current)
          saveHistory()
        }
        clearPreview()
        break
      case 'rect':
        drawRect(mainCtx, start.current, pos)
        saveHistory()
        clearPreview()
        break
      case 'arrow':
        drawArrow(mainCtx, start.current, pos)
        saveHistory()
        clearPreview()
        break
      case 'mosaic':
        // Mosaic was drawn directly on main canvas during mouseMove
        saveHistory()
        clearPreview()
        break
      case 'text':
        // Show text input at click position
        setTextEditing({ x: pos.x, y: pos.y, cx: e.clientX, cy: e.clientY })
        setTextValue('')
        break
    }
  }, [tool, getPos, drawPencilStroke, drawRect, drawArrow, saveHistory, clearPreview])

  // ---- Mosaic helper ----
  const applyMosaic = useCallback((pos: Point) => {
    const ctx = canvasRef.current!.getContext('2d')!
    const b = MOSAIC_SIZE
    const bx = Math.floor(pos.x / b) * b
    const by = Math.floor(pos.y / b) * b
    const key = `${bx},${by}`

    if (mosaicDrawn.current.has(key)) return
    mosaicDrawn.current.add(key)

    // Read pixel block from canvas
    if (bx < 0 || by < 0 || bx + b > imgSize.w || by + b > imgSize.h) return
    const pixelData = ctx.getImageData(bx, by, b, b).data
    let r = 0, g = 0, bl = 0
    const count = b * b
    for (let i = 0; i < pixelData.length; i += 4) {
      r += pixelData[i]
      g += pixelData[i + 1]
      bl += pixelData[i + 2]
    }

    ctx.fillStyle = `rgb(${Math.round(r / count)},${Math.round(g / count)},${Math.round(bl / count)})`
    ctx.fillRect(bx, by, b, b)
  }, [imgSize])

  // ---- Text tool handlers ----
  const submitText = useCallback(() => {
    if (!textEditing || !textValue.trim()) {
      setTextEditing(null)
      return
    }
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.fillStyle = color
    ctx.font = `${Math.max(14, width * 5)}px system-ui, sans-serif`
    ctx.textBaseline = 'top'
    ctx.fillText(textValue, textEditing.x, textEditing.y)
    saveHistory()
    setTextEditing(null)
    setTextValue('')
  }, [textEditing, textValue, color, width, saveHistory])

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (textEditing) return
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, onClose, textEditing])

  // ---- Render ----
  const tools: { id: Tool; icon: typeof Pencil; label: string }[] = [
    { id: 'pencil', icon: Pencil, label: t('modules.screenshot.editor.pencil') },
    { id: 'rect', icon: Square, label: t('modules.screenshot.editor.rect') },
    { id: 'arrow', icon: ArrowRight, label: t('modules.screenshot.editor.arrow') },
    { id: 'text', icon: Type, label: t('modules.screenshot.editor.text') },
    { id: 'mosaic', icon: Grid3X3, label: t('modules.screenshot.editor.mosaic') },
  ]

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/85">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-white/10 bg-bg-elevated/95 px-3 py-2 backdrop-blur">
        {/* Tool buttons */}
        <div className="flex items-center gap-0.5">
          {tools.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setTool(id)}
              title={label}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition cursor-pointer ${
                tool === id
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
              }`}
            >
              <Icon size={15} />
            </button>
          ))}
        </div>

        <div className="mx-1 h-5 w-px bg-border-subtle" />

        {/* Color picker */}
        <div className="flex items-center gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`h-5 w-5 rounded-full border-2 transition cursor-pointer ${
                color === c ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <div className="mx-1 h-5 w-px bg-border-subtle" />

        {/* Stroke width */}
        <div className="flex items-center gap-0.5">
          {WIDTHS.map((w) => (
            <button
              key={w}
              onClick={() => setWidth(w)}
              title={`${w}px`}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition cursor-pointer ${
                width === w ? 'bg-bg-hover text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <div
                className="rounded-full bg-current"
                style={{ width: w + 2, height: w + 2 }}
              />
            </button>
          ))}
        </div>

        <div className="mx-1 h-5 w-px bg-border-subtle" />

        {/* Undo/Redo */}
        <button
          onClick={undo}
          disabled={!canUndo}
          title={t('modules.screenshot.editor.undo')}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition hover:bg-bg-hover hover:text-text-primary disabled:opacity-30 cursor-pointer"
        >
          <Undo2 size={15} />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          title={t('modules.screenshot.editor.redo')}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition hover:bg-bg-hover hover:text-text-primary disabled:opacity-30 cursor-pointer"
        >
          <Redo2 size={15} />
        </button>

        <div className="flex-1" />

        {/* Actions */}
        <button
          onClick={handleSave}
          title={t('modules.screenshot.editor.save')}
          className="flex items-center gap-1.5 rounded-lg bg-bg-hover px-3 py-1.5 text-xs text-text-secondary transition hover:bg-bg-elevated hover:text-text-primary cursor-pointer"
        >
          <Save size={13} />
          {t('modules.screenshot.editor.save')}
        </button>
        <button
          onClick={handleCopy}
          title={t('modules.screenshot.editor.copy')}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs text-white transition hover:bg-primary/90 cursor-pointer"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? t('modules.screenshot.editor.copied') : t('modules.screenshot.editor.copy')}
        </button>

        <div className="mx-1 h-5 w-px bg-border-subtle" />

        <button
          onClick={onClose}
          title="ESC"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition hover:bg-red-500/20 hover:text-red-400 cursor-pointer"
        >
          <X size={15} />
        </button>
      </div>

      {/* Canvas Area */}
      <div ref={containerRef} className="flex flex-1 items-center justify-center overflow-hidden p-4">
        <div
          className="relative shadow-2xl"
          style={{ width: imgSize.w, height: imgSize.h }}
        >
          {/* Main canvas (image + committed annotations) */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0"
            style={{
              cursor: tool === 'text' ? 'text' : tool === 'mosaic' ? 'grab' : 'crosshair',
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={() => {
              if (drawing.current && tool !== 'text') {
                drawing.current = false
                // Commit whatever was drawn
                const mainCtx = canvasRef.current!.getContext('2d')!
                if (tool === 'pencil' && pencilPoints.current.length > 1) {
                  drawPencilStroke(mainCtx, pencilPoints.current)
                }
                saveHistory()
                clearPreview()
              }
            }}
          />
          {/* Preview canvas (in-progress drawing) */}
          <canvas
            ref={previewRef}
            className="pointer-events-none absolute inset-0"
          />
        </div>
      </div>

      {/* Text Input Overlay */}
      {textEditing && (
        <div
          className="fixed z-10"
          style={{ left: textEditing.cx, top: textEditing.cy }}
        >
          <input
            autoFocus
            type="text"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitText()
              if (e.key === 'Escape') setTextEditing(null)
            }}
            onBlur={submitText}
            className="rounded border border-primary bg-bg-base px-2 py-1 text-sm text-text-primary outline-none"
            style={{ color, minWidth: 160 }}
            placeholder={t('modules.screenshot.editor.textPlaceholder')}
          />
        </div>
      )}

      {/* Bottom hint */}
      <div className="flex shrink-0 items-center justify-center gap-4 border-t border-white/5 py-1.5 text-[11px] text-text-muted">
        <span>Ctrl+Z {t('modules.screenshot.editor.undo')}</span>
        <span>Ctrl+Shift+Z {t('modules.screenshot.editor.redo')}</span>
        <span>ESC {t('modules.screenshot.editor.close')}</span>
      </div>
    </div>
  )
}
