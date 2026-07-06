/**
 * Region Picker + Inline Editor
 * Phase 1 (select): Full-screen transparent overlay for selecting a screenshot region.
 * Phase 2 (edit): Shows captured image at position with annotation toolbar.
 *   - Dark mask outside selection (box-shadow cutout)
 *   - Context-aware toolbar options (width/fontSize/mosaicSize)
 *   - Unified SVG icons
 *   - Copy exits after clipboard write
 *   - Save via Rust-side dialog (not blocked by overlay)
 *   - Pin creates always-on-top preview window
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../../core/i18n/i18n'

interface Point { x: number; y: number }
interface WindowBounds { x: number; y: number; width: number; height: number; title: string }
interface CaptureData {
  base64: string; tempPath: string
  x: number; y: number; width: number; height: number
  imgWidth: number; imgHeight: number
}

type Tool = 'pencil' | 'rect' | 'ellipse' | 'arrow' | 'text' | 'mosaic'

const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ffffff', '#000000']
const WIDTHS = [2, 4, 8]
const FONT_SIZES = [
  { label: 'S', labelZh: '小', size: 16 },
  { label: 'M', labelZh: '中', size: 24 },
  { label: 'L', labelZh: '大', size: 36 },
]
const MOSAIC_SIZES = [8, 12, 20]

// Custom SVG cursors for edit tools
const CURSOR_PEN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M3 21l1-4 13-13 3 3L7 20z' fill='white' stroke='black' stroke-width='0.5'/%3E%3C/svg%3E") 3 21, crosshair`
const CURSOR_BLUR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle cx='10' cy='10' r='7' fill='rgba(160,160,160,0.45)' stroke='%23555' stroke-width='1.5'/%3E%3Ccircle cx='10' cy='10' r='1.5' fill='%23555'/%3E%3C/svg%3E") 4 4, crosshair`

function dataURLtoBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',')
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png'
  const byteStr = atob(parts[1])
  const arr = new Uint8Array(byteStr.length)
  for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

// ── Inline SVG Icons (lucide/feather style) ──
const iconSvg = {
  rect: 'M3 3h18v18H3z',
  ellipse: 'M2 12a10 8 0 1020 0 10 8 0 00-20 0z',
  arrow: 'M3 12h18M13 4l8 8-8 8',
  pencil: 'M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z',
  text: 'M4 7V4h16v3M9 20h6M12 4v16',
  mosaic: 'M3 3h9v9H3zM13 3h8v8h-8zM3 13h8v8H3z',
  undo: 'M3 7v6h6M21 17a9 9 0 00-15-6.7L3 13',
  redo: 'M21 7v6h-6M3 17a9 9 0 0115-6.7L21 13',
  copy: 'M8 4h10a2 2 0 012 2v10M16 8H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V8z',
  save: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
  pin: 'M12 17v5M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V16h14v-.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V7a1 1 0 011-1 1 1 0 001-1V4a1 1 0 00-1-1H8a1 1 0 00-1 1v1a1 1 0 001 1 1 1 0 011 1z',
  close: 'M18 6L6 18M6 6l12 12',
}

function Icon({ d, size = 14, stroke }: { d: string; size?: number; stroke?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={stroke ? 'none' : 'currentColor'} stroke={stroke ? 'currentColor' : 'none'}
      strokeWidth={stroke ? 2 : undefined} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

export default function RegionPicker() {
  const { t } = useTranslation()

  // === Phase 1: Select mode state ===
  const [mode, setMode] = useState<'select' | 'edit'>('select')
  const [dragging, setDragging] = useState(false)
  const [start, setStart] = useState<Point | null>(null)
  const [end, setEnd] = useState<Point | null>(null)
  const [hoverWindow, setHoverWindow] = useState<WindowBounds | null>(null)
  const scaleRef = useRef(window.devicePixelRatio || 1)
  const lastDetectRef = useRef(0)
  const invokeRef = useRef<typeof import('@tauri-apps/api/core').invoke | null>(null)

  // === Phase 2: Edit mode state ===
  const [capture, setCapture] = useState<CaptureData | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const [tool, setTool] = useState<Tool>('rect')
  const [color, setColor] = useState('#ef4444')
  const [lineWidth, setLineWidth] = useState(4)
  const [fontSize, setFontSize] = useState(24)
  const [mosaicSize, setMosaicSize] = useState(12)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [textEditing, setTextEditing] = useState<{ x: number; y: number } | null>(null)
  const [textValue, setTextValue] = useState('')
  const [copied, setCopied] = useState(false)
  const drawing = useRef(false)
  const drawStart = useRef<Point>({ x: 0, y: 0 })
  const pencilPoints = useRef<Point[]>([])
  const mosaicDrawn = useRef(new Set<string>())
  const hist = useRef<string[]>([])
  const hIdx = useRef(-1)
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })

  // Preload invoke
  useEffect(() => {
    import('@tauri-apps/api/core').then(m => { invokeRef.current = m.invoke })
  }, [])

  // Listen for capture-result from Rust → enter edit mode
  useEffect(() => {
    let unlisten: (() => void) | undefined
    ;(async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        unlisten = await listen<CaptureData>('capture-result', (event) => {
          setCapture(event.payload)
          setMode('edit')
        })
      } catch { /* ignore */ }
    })()
    return () => { unlisten?.() }
  }, [])

  // Listen for save-capture-done → exit
  useEffect(() => {
    let unlisten: (() => void) | undefined
    ;(async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        unlisten = await listen('save-capture-done', () => { handleDone() })
      } catch { /* ignore */ }
    })()
    return () => { unlisten?.() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // === Window detection (select mode) ===
  const detectWindow = useCallback(async () => {
    const now = Date.now()
    if (now - lastDetectRef.current < 33) return
    lastDetectRef.current = now
    if (!invokeRef.current) return
    try {
      const result = await invokeRef.current<WindowBounds | null>('detect_window_at_cursor')
      setHoverWindow(result)
    } catch { /* ignore */ }
  }, [])

  // Transparent background + signal ready
  useEffect(() => {
    const htmlEl = document.documentElement
    const bodyEl = document.body
    const rootEl = document.getElementById('root')
    htmlEl.style.background = 'transparent'
    bodyEl.style.background = 'transparent'
    if (rootEl) rootEl.style.background = 'transparent'

    ;(async () => {
      try {
        const { emit } = await import('@tauri-apps/api/event')
        await new Promise<void>(resolve => {
          requestAnimationFrame(() => { requestAnimationFrame(() => resolve()) })
        })
        await emit('region-picker-ready', '')
      } catch { /* ignore */ }
    })()
  }, [])

  // Prevent context menu
  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault()
    window.addEventListener('contextmenu', handler, true)
    return () => window.removeEventListener('contextmenu', handler)
  }, [])

  // === Select mode handlers ===
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (mode !== 'select') return
    setDragging(true)
    setStart({ x: e.clientX, y: e.clientY })
    setEnd({ x: e.clientX, y: e.clientY })
  }, [mode])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (mode !== 'select') return
    if (dragging) {
      setEnd({ x: e.clientX, y: e.clientY })
    } else {
      detectWindow()
    }
  }, [mode, dragging, detectWindow])

  const emitRegion = useCallback(async (x: number, y: number, w: number, h: number) => {
    try {
      const { emit } = await import('@tauri-apps/api/event')
      await emit('region-selected', { x, y, width: w, height: h })
    } catch { /* ignore */ }
  }, [])

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    if (mode !== 'select' || !dragging || !start) return
    setDragging(false)
    const p2 = { x: e.clientX, y: e.clientY }
    setEnd(p2)
    const dx = Math.abs(p2.x - start.x)
    const dy = Math.abs(p2.y - start.y)
    if (dx < 5 && dy < 5 && hoverWindow) {
      emitRegion(hoverWindow.x, hoverWindow.y, hoverWindow.width, hoverWindow.height)
      setStart(null); setEnd(null) // clear dashed border immediately
      return
    }
    const x1 = Math.round(Math.min(start.x, p2.x))
    const y1 = Math.round(Math.min(start.y, p2.y))
    const x2 = Math.round(Math.max(start.x, p2.x))
    const y2 = Math.round(Math.max(start.y, p2.y))
    if (x2 - x1 >= 10 && y2 - y1 >= 10) {
      emitRegion(x1, y1, x2 - x1, y2 - y1)
      setStart(null); setEnd(null) // clear dashed border immediately
    }
  }, [mode, dragging, start, hoverWindow, emitRegion])

  // === Edit mode: init canvas when capture arrives ===
  useEffect(() => {
    if (!capture || mode !== 'edit') return
    const img = new Image()
    img.onload = () => {
      const w = capture.width
      const h = capture.height
      setCanvasSize({ w, h })
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
    img.src = capture.base64
  }, [capture, mode])

  // === Edit mode: drawing helpers ===
  const getCanvasPos = useCallback((e: React.MouseEvent): Point => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }, [])

  const saveHistory = useCallback(() => {
    const canvas = canvasRef.current!
    hist.current = hist.current.slice(0, hIdx.current + 1)
    hist.current.push(canvas.toDataURL())
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
      ctx.clearRect(0, 0, canvasSize.w, canvasSize.h)
      ctx.drawImage(img, 0, 0)
    }
    img.src = hist.current[hIdx.current]
    setCanUndo(hIdx.current > 0)
    setCanRedo(true)
  }, [canvasSize])

  const redo = useCallback(() => {
    if (hIdx.current >= hist.current.length - 1) return
    hIdx.current++
    const img = new Image()
    img.onload = () => {
      const ctx = canvasRef.current!.getContext('2d')!
      ctx.clearRect(0, 0, canvasSize.w, canvasSize.h)
      ctx.drawImage(img, 0, 0)
    }
    img.src = hist.current[hIdx.current]
    setCanUndo(true)
    setCanRedo(hIdx.current < hist.current.length - 1)
  }, [canvasSize])

  const clearPreview = useCallback(() => {
    const ctx = previewRef.current!.getContext('2d')!
    ctx.clearRect(0, 0, canvasSize.w, canvasSize.h)
  }, [canvasSize])

  const drawRect = useCallback((ctx: CanvasRenderingContext2D, p1: Point, p2: Point, shiftKey = false) => {
    let dx = Math.abs(p2.x - p1.x)
    let dy = Math.abs(p2.y - p1.y)
    if (shiftKey) {
      const side = Math.max(dx, dy)
      dx = dy = side
    }
    const x = p2.x >= p1.x ? p1.x : p1.x - dx
    const y = p2.y >= p1.y ? p1.y : p1.y - dy
    ctx.strokeStyle = color; ctx.lineWidth = lineWidth
    ctx.strokeRect(x, y, dx, dy)
  }, [color, lineWidth])

  const drawEllipse = useCallback((ctx: CanvasRenderingContext2D, p1: Point, p2: Point, shiftKey = false) => {
    let rx = Math.abs(p2.x - p1.x) / 2
    let ry = Math.abs(p2.y - p1.y) / 2
    if (shiftKey) {
      const r = Math.max(rx, ry)
      rx = ry = r
    }
    const cx = (p1.x + p2.x) / 2
    const cy = (p1.y + p2.y) / 2
    ctx.strokeStyle = color; ctx.lineWidth = lineWidth
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
  }, [color, lineWidth])

  const drawArrow = useCallback((ctx: CanvasRenderingContext2D, p1: Point, p2: Point) => {
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
    const headLen = Math.max(16, lineWidth * 4)
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(p2.x, p2.y)
    ctx.lineTo(p2.x - headLen * Math.cos(angle - Math.PI / 6), p2.y - headLen * Math.sin(angle - Math.PI / 6))
    ctx.lineTo(p2.x - headLen * Math.cos(angle + Math.PI / 6), p2.y - headLen * Math.sin(angle + Math.PI / 6))
    ctx.closePath(); ctx.fill()
  }, [color, lineWidth])

  const drawPencilStroke = useCallback((ctx: CanvasRenderingContext2D, pts: Point[]) => {
    if (pts.length < 2) return
    ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.stroke()
  }, [color, lineWidth])

  const applyMosaic = useCallback((pos: Point) => {
    const ctx = canvasRef.current!.getContext('2d')!
    const b = mosaicSize
    const bx = Math.floor(pos.x / b) * b, by = Math.floor(pos.y / b) * b
    const key = `${bx},${by}`
    if (mosaicDrawn.current.has(key)) return
    mosaicDrawn.current.add(key)
    if (bx < 0 || by < 0 || bx + b > canvasSize.w || by + b > canvasSize.h) return
    const px = ctx.getImageData(bx, by, b, b).data
    let r = 0, g = 0, bl = 0; const count = b * b
    for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; bl += px[i + 2] }
    ctx.fillStyle = `rgb(${Math.round(r / count)},${Math.round(g / count)},${Math.round(bl / count)})`
    ctx.fillRect(bx, by, b, b)
  }, [canvasSize, mosaicSize])

  // === Edit mode: mouse handlers ===
  const onCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    const pos = getCanvasPos(e)
    drawing.current = true; drawStart.current = pos
    if (tool === 'pencil') pencilPoints.current = [pos]
    else if (tool === 'mosaic') { mosaicDrawn.current = new Set(); applyMosaic(pos) }
  }, [tool, getCanvasPos, applyMosaic])

  const onCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawing.current) return
    const pos = getCanvasPos(e)
    const ctx = previewRef.current!.getContext('2d')!
    ctx.clearRect(0, 0, canvasSize.w, canvasSize.h)
    switch (tool) {
      case 'pencil': pencilPoints.current.push(pos); drawPencilStroke(ctx, pencilPoints.current); break
      case 'rect': drawRect(ctx, drawStart.current, pos, e.shiftKey); break
      case 'ellipse': drawEllipse(ctx, drawStart.current, pos, e.shiftKey); break
      case 'arrow': drawArrow(ctx, drawStart.current, pos); break
      case 'mosaic': applyMosaic(pos); break
    }
  }, [tool, getCanvasPos, canvasSize, drawPencilStroke, drawRect, drawEllipse, drawArrow, applyMosaic])

  const onCanvasMouseUp = useCallback((e: React.MouseEvent) => {
    if (!drawing.current) return
    drawing.current = false
    const pos = getCanvasPos(e)
    const mainCtx = canvasRef.current!.getContext('2d')!
    switch (tool) {
      case 'pencil':
        if (pencilPoints.current.length > 1) { drawPencilStroke(mainCtx, pencilPoints.current); saveHistory() }
        clearPreview(); break
      case 'rect': drawRect(mainCtx, drawStart.current, pos, e.shiftKey); saveHistory(); clearPreview(); break
      case 'ellipse': drawEllipse(mainCtx, drawStart.current, pos, e.shiftKey); saveHistory(); clearPreview(); break
      case 'arrow': drawArrow(mainCtx, drawStart.current, pos); saveHistory(); clearPreview(); break
      case 'mosaic': saveHistory(); clearPreview(); break
      case 'text': setTextEditing({ x: pos.x, y: pos.y }); setTextValue(''); break
    }
  }, [tool, getCanvasPos, drawPencilStroke, drawRect, drawEllipse, drawArrow, saveHistory, clearPreview])

  const submitText = useCallback(() => {
    if (!textEditing || !textValue.trim()) { setTextEditing(null); return }
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.fillStyle = color
    ctx.font = `${fontSize}px system-ui, sans-serif`
    ctx.textBaseline = 'top'
    ctx.fillText(textValue, textEditing.x, textEditing.y)
    saveHistory(); setTextEditing(null); setTextValue('')
  }, [textEditing, textValue, color, fontSize, saveHistory])

  // === Actions ===
  const handleCopy = useCallback(async () => {
    try {
      const blob = dataURLtoBlob(canvasRef.current!.toDataURL('image/png'))
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopied(true)
      setTimeout(() => { setCopied(false); handleDone() }, 800)
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = useCallback(async () => {
    try {
      const { emit } = await import('@tauri-apps/api/event')
      const dataUrl = canvasRef.current!.toDataURL('image/png')
      await emit('save-capture-request', dataUrl)
    } catch { /* ignore */ }
  }, [])

  const handlePinTop = useCallback(async () => {
    try {
      const { emit } = await import('@tauri-apps/api/event')
      const dataUrl = canvasRef.current!.toDataURL('image/png')
      await emit('pin-capture-request', dataUrl)
      // The Rust side will close us; just in case:
      setTimeout(() => handleDone(), 200)
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDone = useCallback(async () => {
    try {
      const { emit } = await import('@tauri-apps/api/event')
      await emit('capture-done', '')
    } catch { /* ignore */ }
  }, [])

  // === Keyboard shortcuts ===
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (textEditing) return
      if (e.key === 'Escape') {
        if (mode === 'select') {
          emitRegion(0, 0, 0, 0)
        } else {
          handleDone()
        }
      } else if (e.key === 'Enter' && mode === 'select') {
        const w = Math.round(window.innerWidth), h = Math.round(window.innerHeight)
        emitRegion(0, 0, w, h)
      } else if (mode === 'edit' && (e.ctrlKey || e.metaKey)) {
        if (e.key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
        else if (e.key === 'c') { e.preventDefault(); handleCopy() }
        else if (e.key === 's') { e.preventDefault(); handleSave() }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mode, textEditing, emitRegion, handleDone, undo, redo, handleCopy, handleSave])

  // === Computed values ===
  const rect = start && end ? {
    left: Math.min(start.x, end.x), top: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y),
  } : null
  const showWindowHighlight = mode === 'select' && !dragging && !rect && hoverWindow && hoverWindow.width > 20 && hoverWindow.height > 20

  // Toolbar position: below capture, or above if no space
  const toolbarY = capture ? (capture.y + capture.height + 8 > window.innerHeight - 60 ? capture.y - 52 : capture.y + capture.height + 8) : 0
  const toolbarX = capture ? Math.max(0, Math.min(capture.x + capture.width / 2 - 280, window.innerWidth - 580)) : 0

  // Determine which tool options to show
  const showWidths = tool === 'rect' || tool === 'ellipse' || tool === 'arrow' || tool === 'pencil'
  const showFontSize = tool === 'text'
  const showMosaicSize = tool === 'mosaic'

  // === SELECT MODE ===
  if (mode === 'select') {
    return (
      <div onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
        style={{ position: 'fixed', inset: 0, cursor: 'crosshair', background: 'rgba(0,0,0,0.15)', userSelect: 'none' }}>
        {showWindowHighlight && (
          <div style={{ position: 'fixed', left: hoverWindow!.x, top: hoverWindow!.y, width: hoverWindow!.width, height: hoverWindow!.height,
            border: '2px solid rgba(0,150,255,0.8)', boxShadow: '0 0 0 9999px rgba(0,0,0,0.15), 0 0 12px rgba(0,150,255,0.4)',
            background: 'rgba(0,150,255,0.06)', pointerEvents: 'none', zIndex: 5, transition: 'all 0.08s ease-out' }}>
            {hoverWindow!.title && (
              <div style={{ position: 'absolute', bottom: -22, left: 0, background: 'rgba(0,100,200,0.85)', color: '#fff',
                fontFamily: 'system-ui', fontSize: 11, padding: '2px 8px', borderRadius: 3, whiteSpace: 'nowrap', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {hoverWindow!.title}
              </div>
            )}
          </div>
        )}
        {rect && rect.width > 2 && rect.height > 2 && (
          <div style={{ position: 'fixed', left: rect.left, top: rect.top, width: rect.width, height: rect.height,
            border: '2px dashed rgba(255,255,255,0.9)', boxShadow: '0 0 0 9999px rgba(0,0,0,0.3)', background: 'transparent', pointerEvents: 'none', zIndex: 10 }}>
            <div style={{ position: 'absolute', bottom: -24, left: 0, background: 'rgba(0,0,0,0.7)', color: '#fff',
              fontFamily: 'monospace', fontSize: 11, padding: '2px 6px', borderRadius: 3 }}>
              {Math.round(rect.width * scaleRef.current)} × {Math.round(rect.height * scaleRef.current)}
            </div>
          </div>
        )}
        <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(8px)', color: 'rgba(255,255,255,0.8)', fontFamily: 'system-ui', fontSize: 13, padding: '8px 20px',
          borderRadius: 8, pointerEvents: 'none', zIndex: 20 }}>
          {t('modules.screenshot.ui.clickWindow', { defaultValue: 'Click window or drag region' })}
          {' · '}<span style={{ opacity: 0.6 }}>Enter {t('modules.screenshot.ui.fullscreen', { defaultValue: 'Full Screen' })}</span>
          {' · '}<span style={{ opacity: 0.6 }}>ESC {t('common.cancel', { defaultValue: 'Cancel' })}</span>
        </div>
      </div>
    )
  }

  // === EDIT MODE ===
  return (
    <div style={{ position: 'fixed', inset: 0, userSelect: 'none' }}>
      {/* Dark overlay with cutout for the capture area */}
      {capture && (
        <div style={{ position: 'fixed', left: capture.x, top: capture.y, width: capture.width, height: capture.height, zIndex: 10,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.55), 0 4px 32px rgba(0,0,0,0.6)',
          border: '2px solid rgba(255,255,255,0.7)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ position: 'relative', width: canvasSize.w, height: canvasSize.h }}>
            <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, cursor: tool === 'text' ? 'text' : tool === 'pencil' ? CURSOR_PEN : tool === 'mosaic' ? CURSOR_BLUR : 'crosshair' }}
              onMouseDown={onCanvasMouseDown} onMouseMove={onCanvasMouseMove} onMouseUp={onCanvasMouseUp}
              onMouseLeave={() => { if (drawing.current && tool !== 'text') { drawing.current = false; const mc = canvasRef.current!.getContext('2d')!; if (tool === 'pencil' && pencilPoints.current.length > 1) drawPencilStroke(mc, pencilPoints.current); saveHistory(); clearPreview() } }} />
            <canvas ref={previewRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
          </div>
          {/* Text input overlay */}
          {textEditing && (
            <div style={{ position: 'absolute', left: textEditing.x, top: textEditing.y, zIndex: 20 }}>
              <input autoFocus type="text" value={textValue} onChange={e => setTextValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitText(); if (e.key === 'Escape') setTextEditing(null) }}
                onBlur={submitText}
                style={{ border: `2px solid ${color}`, background: 'rgba(0,0,0,0.7)', color, padding: '2px 6px', fontSize,
                  outline: 'none', borderRadius: 3, minWidth: 120, fontFamily: 'system-ui' }} />
            </div>
          )}
        </div>
      )}

      {/* Annotation toolbar */}
      {capture && (
        <div style={{ position: 'fixed', left: toolbarX, top: toolbarY, zIndex: 30,
          display: 'flex', alignItems: 'center', gap: 2, padding: '5px 8px',
          background: 'rgba(24,24,27,0.96)', backdropFilter: 'blur(12px)', borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', fontFamily: 'system-ui' }}>

          {/* Tool buttons with i18n tooltips */}
          {([['rect', iconSvg.rect, 'rect'], ['ellipse', iconSvg.ellipse, 'ellipse'], ['arrow', iconSvg.arrow, 'arrow'], ['pencil', iconSvg.pencil, 'pencil'], ['text', iconSvg.text, 'text'], ['mosaic', iconSvg.mosaic, 'mosaic']] as [Tool, string, string][]).map(([id, d, tip]) => (
            <TBtn key={id} active={tool === id} onClick={() => setTool(id)} title={t(`modules.screenshot.editor.${tip}`)}>
              <Icon d={d} stroke={id !== 'mosaic'} />
            </TBtn>
          ))}

          <Sep />

          {/* Colors — always visible */}
          <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            {COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                style={{ width: 18, height: 18, borderRadius: '50%', border: color === c ? '2px solid #fff' : '2px solid transparent',
                  background: c, cursor: 'pointer', opacity: color === c ? 1 : 0.5, transition: 'all 0.15s', padding: 0 }} />
            ))}
          </div>

          {/* Context-dependent options */}
          {showWidths && (
            <>
              <Sep />
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                {WIDTHS.map(w => (
                  <button key={w} onClick={() => setLineWidth(w)} title={`${w}px`}
                    style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: lineWidth === w ? 'rgba(255,255,255,0.15)' : 'transparent', color: lineWidth === w ? '#fff' : 'rgba(255,255,255,0.4)', transition: 'all 0.15s' }}>
                    <div style={{ width: w + 2, height: w + 2, borderRadius: '50%', background: 'currentColor' }} />
                  </button>
                ))}
              </div>
            </>
          )}

          {showFontSize && (
            <>
              <Sep />
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                {FONT_SIZES.map(f => {
                  const isZh = i18n.language?.startsWith('zh')
                  const lbl = isZh ? f.labelZh : f.label
                  return (
                  <button key={f.label} onClick={() => setFontSize(f.size)} title={`${f.size}px`}
                    style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: fontSize === f.size ? 'rgba(255,255,255,0.15)' : 'transparent', color: fontSize === f.size ? '#fff' : 'rgba(255,255,255,0.4)',
                      fontSize: isZh ? 13 : 11, fontWeight: 600, transition: 'all 0.15s' }}>
                    {lbl}
                  </button>
                  )
                })}
              </div>
            </>
          )}

          {showMosaicSize && (
            <>
              <Sep />
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                {MOSAIC_SIZES.map(s => (
                  <button key={s} onClick={() => setMosaicSize(s)} title={`${s}px`}
                    style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: mosaicSize === s ? 'rgba(255,255,255,0.15)' : 'transparent', color: mosaicSize === s ? '#fff' : 'rgba(255,255,255,0.4)', transition: 'all 0.15s' }}>
                    <div style={{ width: Math.min(s, 18), height: Math.min(s, 18), background: 'currentColor', opacity: 0.7 }} />
                  </button>
                ))}
              </div>
            </>
          )}

          <Sep />

          {/* Undo/Redo with i18n tooltips */}
          <TBtn onClick={undo} disabled={!canUndo} title={t('modules.screenshot.editor.undo')}><Icon d={iconSvg.undo} stroke /></TBtn>
          <TBtn onClick={redo} disabled={!canRedo} title={t('modules.screenshot.editor.redo')}><Icon d={iconSvg.redo} stroke /></TBtn>

          <Sep />

          {/* Actions with i18n tooltips */}
          <TBtn onClick={handleCopy} title={copied ? t('modules.screenshot.editor.copied') : t('modules.screenshot.editor.copy')}>
            <Icon d={copied ? 'M5 12l5 5L20 7' : iconSvg.copy} stroke />
          </TBtn>
          <TBtn onClick={handleSave} title={t('modules.screenshot.editor.save')}>
            <Icon d={iconSvg.save} stroke />
          </TBtn>
          <TBtn onClick={handlePinTop} title={t('modules.screenshot.editor.pin')}>
            <Icon d={iconSvg.pin} stroke />
          </TBtn>

          <Sep />

          <TBtn onClick={handleDone} close title={t('modules.screenshot.editor.close') + ' (ESC)'}>
            <Icon d={iconSvg.close} stroke />
          </TBtn>
        </div>
      )}

      {/* Copied toast — fixed at screen top center */}
      {copied && (
        <div style={{ position: 'fixed', top: 28, left: '50%', transform: 'translateX(-50%)', background: 'rgba(34,197,94,0.92)',
          color: '#fff', padding: '10px 28px', borderRadius: 10, fontSize: 14, fontWeight: 600, zIndex: 50, pointerEvents: 'none',
          boxShadow: '0 4px 20px rgba(0,0,0,0.35)', backdropFilter: 'blur(8px)' }}>
          {t('modules.screenshot.editor.copied')}
        </div>
      )}
    </div>
  )
}

// ── Small helper components ──

function Sep() {
  return <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.08)', margin: '0 2px', flexShrink: 0 }} />
}

function TBtn({ onClick, children, active, disabled, close, title }: {
  onClick: () => void; children: React.ReactNode; active?: boolean; disabled?: boolean; close?: boolean; title?: string
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6,
        border: 'none', cursor: disabled ? 'default' : 'pointer',
        background: active ? '#3b82f6' : 'transparent',
        color: disabled ? 'rgba(255,255,255,0.2)' : active ? '#fff' : 'rgba(255,255,255,0.7)',
        transition: 'all 0.15s' }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = close ? 'rgba(239,68,68,0.25)' : active ? '#3b82f6' : 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = close ? '#ef4444' : '#fff' } }}
      onMouseLeave={e => { e.currentTarget.style.background = active ? '#3b82f6' : 'transparent'; e.currentTarget.style.color = disabled ? 'rgba(255,255,255,0.2)' : active ? '#fff' : 'rgba(255,255,255,0.7)' }}>
      {children}
    </button>
  )
}
