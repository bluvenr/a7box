/**
 * Image Compress Main Component
 * Drag & drop image compression with quality slider and format conversion
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, Download, X, ImageDown, RotateCcw, AlertCircle, ZoomIn, ZoomOut, Shield, Layers, RefreshCw, SlidersHorizontal } from 'lucide-react'
import imageCompression from 'browser-image-compression'
import { useToast } from '../../components/Toast'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export type OutputFormat = 'original' | 'jpeg' | 'png' | 'webp'

interface CompressedImage {
  id: string
  originalFile: File
  originalUrl: string
  originalSize: number
  compressedBlob: Blob | null
  compressedUrl: string | null
  compressedSize: number | null
  status: 'pending' | 'compressing' | 'done' | 'error'
  error?: string
}

const FORMAT_OPTIONS: { value: OutputFormat; label: string; labelKey?: string }[] = [
  { value: 'original', label: 'Original', labelKey: 'modules.imageCompress.ui.formatOriginal' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
]

const MAX_SIZE_OPTIONS = [
  { value: 9999, labelKey: 'modules.imageCompress.ui.maxSizeUnlimited' },
  { value: 5, label: '5 MB' },
  { value: 2, label: '2 MB' },
  { value: 1, label: '1 MB' },
  { value: 0.5, label: '500 KB' },
]

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function savingsPercent(orig: number, comp: number): string {
  if (orig === 0) return '0%'
  return ((1 - comp / orig) * 100).toFixed(1) + '%'
}

export default function ImageCompress() {
  const { t } = useTranslation()
  const [images, setImages] = useState<CompressedImage[]>([])
  const [quality, setQuality] = useState(70)
  const [maxWidth, setMaxWidth] = useState(1920)
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('original')
  const [isDragging, setIsDragging] = useState(false)
  const [maxSizeMB, setMaxSizeMB] = useState(9999)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addFilesRef = useRef<(files: FileList | File[]) => void>(() => {})
  const toast = useToast()
  const [previewImage, setPreviewImage] = useState<CompressedImage | null>(null)

  // ── Detect parameter changes ──
  const paramsSnapshot = JSON.stringify({ quality, maxWidth, maxSizeMB, outputFormat })
  const lastCompressedParamsRef = useRef<string | null>(null)
  const paramsChanged = images.some((i) => i.status === 'done') && lastCompressedParamsRef.current !== null && lastCompressedParamsRef.current !== paramsSnapshot

  // Cleanup all Object URLs on unmount
  useEffect(() => {
    return () => {
      images.forEach((img) => {
        if (img.originalUrl) URL.revokeObjectURL(img.originalUrl)
        if (img.compressedUrl) URL.revokeObjectURL(img.compressedUrl)
      })
    }
  }, [images])

  /** Compress a single image */
  const compressImage = useCallback(
    async (img: CompressedImage): Promise<CompressedImage> => {
      try {
        const options: Parameters<typeof imageCompression>[1] = {
          maxSizeMB: maxSizeMB,
          maxWidthOrHeight: maxWidth,
          useWebWorker: true,
          initialQuality: quality / 100,
        }

        if (outputFormat !== 'original') {
          const mimeMap: Record<string, string> = {
            jpeg: 'image/jpeg',
            png: 'image/png',
            webp: 'image/webp',
          }
          options.fileType = mimeMap[outputFormat]
        }

        const compressedFile = await imageCompression(img.originalFile, options)
        const compressedUrl = URL.createObjectURL(compressedFile)

        return {
          ...img,
          compressedBlob: compressedFile,
          compressedUrl,
          compressedSize: compressedFile.size,
          status: 'done',
        }
      } catch (e) {
        return {
          ...img,
          status: 'error',
          error: (e as Error).message,
        }
      }
    },
    [quality, maxWidth, outputFormat, maxSizeMB]
  )

  /** Add files and start compression */
  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'))
      if (imageFiles.length === 0) return

      const newImages: CompressedImage[] = imageFiles.map((file) => ({
        id: crypto.randomUUID(),
        originalFile: file,
        originalUrl: URL.createObjectURL(file),
        originalSize: file.size,
        compressedBlob: null,
        compressedUrl: null,
        compressedSize: null,
        status: 'pending' as const,
      }))

      setImages((prev) => [...newImages, ...prev])

      // Compress each
      const compressed = await Promise.all(
        newImages.map(async (img) => {
          const result = await compressImage({ ...img, status: 'compressing' })
          setImages((prev) => prev.map((p) => (p.id === img.id ? result : p)))
          return result
        })
      )

      const successCount = compressed.filter((c) => c.status === 'done').length
      toast(t('modules.imageCompress.ui.toastCompressed', { success: successCount, total: compressed.length }))
      lastCompressedParamsRef.current = JSON.stringify({ quality, maxWidth, maxSizeMB, outputFormat })
    },
    [compressImage, toast]
  )

  addFilesRef.current = addFiles

  // ── Tauri native drag-drop ──
  useEffect(() => {
    if (!isTauri()) return
    let unlistenFn: (() => void) | undefined
    let cleanedUp = false
    ;(async () => {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview')
        if (cleanedUp) return
        unlistenFn = await getCurrentWebview().onDragDropEvent(async (event) => {
          if (cleanedUp) return
          if (event.payload.type === 'over') {
            setIsDragging(true)
          } else if (event.payload.type === 'drop') {
            setIsDragging(false)
            const paths = event.payload.paths
            if (paths.length > 0) {
              const files: File[] = []
              const { readFile } = await import('@tauri-apps/plugin-fs')
              for (const p of paths) {
                try {
                  const data = await readFile(p)
                  const name = p.split(/[\\/]/).pop() || 'image'
                  const blob = new Blob([data])
                  files.push(new File([blob], name, { type: blob.type || 'image/png' }))
                } catch { /* skip unreadable files */ }
              }
              if (files.length > 0) addFilesRef.current(files)
            }
          } else if (event.payload.type === 'leave') {
            setIsDragging(false)
          }
        })
        if (cleanedUp) {
          unlistenFn?.()
          unlistenFn = undefined
        }
      } catch { /* not supported */ }
    })()
    return () => {
      cleanedUp = true
      if (unlistenFn) {
        unlistenFn()
        unlistenFn = undefined
      }
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      // Skip in Tauri — native onDragDropEvent already handles it
      if (isTauri()) return
      addFiles(e.dataTransfer.files)
    },
    [addFiles]
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) addFiles(e.target.files)
      e.target.value = ''
    },
    [addFiles]
  )

  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const img = prev.find((i) => i.id === id)
      if (img?.originalUrl) URL.revokeObjectURL(img.originalUrl)
      if (img?.compressedUrl) URL.revokeObjectURL(img.compressedUrl)
      return prev.filter((i) => i.id !== id)
    })
  }, [])

  const downloadImage = useCallback(async (img: CompressedImage) => {
    if (!img.compressedBlob) return
    const ext = outputFormat === 'original'
      ? img.originalFile.name.split('.').pop() ?? 'png'
      : outputFormat
    const baseName = img.originalFile.name.replace(/\.[^.]+$/, '')
    const defaultFilename = `${baseName}_compressed.${ext}`

    if (isTauri()) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { writeFile } = await import('@tauri-apps/plugin-fs')
        const filePath = await save({ defaultPath: defaultFilename })
        if (filePath) {
          const data = new Uint8Array(await img.compressedBlob.arrayBuffer())
          await writeFile(filePath, data)
          toast(t('modules.imageCompress.ui.toastDownloaded'))
        }
        return
      } catch { /* fallback to browser */ }
    }

    // Browser fallback
    if (!img.compressedUrl) return
    const a = document.createElement('a')
    a.href = img.compressedUrl
    a.download = defaultFilename
    a.click()
  }, [outputFormat, toast, t])

  const downloadAll = useCallback(async () => {
    const doneImgs = images.filter((i) => i.status === 'done')
    if (doneImgs.length === 0) return

    if (isTauri()) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog')
        const { writeFile } = await import('@tauri-apps/plugin-fs')
        const dir = await open({ directory: true, multiple: false })
        if (!dir) return
        for (const img of doneImgs) {
          if (!img.compressedBlob) continue
          const ext = outputFormat === 'original'
            ? img.originalFile.name.split('.').pop() ?? 'png'
            : outputFormat
          const baseName = img.originalFile.name.replace(/\.[^.]+$/, '')
          const data = new Uint8Array(await img.compressedBlob.arrayBuffer())
          await writeFile(`${dir}/${baseName}_compressed.${ext}`, data)
        }
        toast(t('modules.imageCompress.ui.toastDownloading'))
        return
      } catch { /* fallback to browser */ }
    }

    // Browser fallback
    doneImgs.forEach((img) => downloadImage(img))
    toast(t('modules.imageCompress.ui.toastDownloading'))
  }, [images, outputFormat, downloadImage, toast, t])

  const clearAll = useCallback(() => {
    images.forEach((img) => {
      if (img.originalUrl) URL.revokeObjectURL(img.originalUrl)
      if (img.compressedUrl) URL.revokeObjectURL(img.compressedUrl)
    })
    setImages([])
  }, [images])

  const recompressAll = useCallback(async () => {
    // Update params snapshot immediately to prevent yellow bar flash during re-render
    lastCompressedParamsRef.current = JSON.stringify({ quality, maxWidth, maxSizeMB, outputFormat })

    const pending = images.filter((i) => i.status !== 'pending' && i.status !== 'compressing')
    const reset = pending.map((img) => {
      if (img.compressedUrl) URL.revokeObjectURL(img.compressedUrl)
      return { ...img, compressedBlob: null, compressedUrl: null, compressedSize: null, status: 'compressing' as const }
    })
    setImages((prev) => {
      const map = new Map(prev.map((p) => [p.id, p]))
      reset.forEach((r) => map.set(r.id, r))
      return Array.from(map.values())
    })

    await Promise.all(
      reset.map(async (img) => {
        const result = await compressImage(img)
        setImages((prev) => prev.map((p) => (p.id === img.id ? result : p)))
      })
    )
    toast(t('modules.imageCompress.ui.toastRecompressed'))
  }, [images, compressImage, toast, quality, maxWidth, maxSizeMB, outputFormat])

  const doneImages = images.filter((i) => i.status === 'done')
  const totalOriginal = doneImages.reduce((acc, img) => acc + img.originalSize, 0)
  const totalCompressed = doneImages.reduce((acc, img) => acc + (img.compressedSize ?? 0), 0)

  return (
    <div className="relative flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border-subtle bg-bg-elevated px-4 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ImageDown size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            {t('modules.imageCompress.name')}
          </h1>
          <p className="text-sm text-text-secondary">
            {t('modules.imageCompress.description')}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 border-b border-border-subtle bg-bg-elevated/50 px-4 py-3">

        {/* Quality slider */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-secondary">{t('modules.imageCompress.ui.qualityLabel')}</label>
          <input
            type="range" min="10" max="100" value={quality}
            onChange={(e) => setQuality(parseInt(e.target.value))}
            className="w-24"
          />
          <span className="w-8 text-right text-xs text-text-muted">{quality}%</span>
        </div>

        {/* Max width */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-secondary">{t('modules.imageCompress.ui.maxWidthLabel')}</label>
          <select
            value={maxWidth}
            onChange={(e) => setMaxWidth(parseInt(e.target.value))}
            className="rounded border border-border-base bg-bg-base px-2 py-1 text-xs text-text-primary focus:border-border-focus focus:outline-none cursor-pointer"
          >
            <option value={9999}>{t('modules.imageCompress.ui.widthOriginal')}</option>
            <option value={3840}>3840px</option>
            <option value={1920}>1920px</option>
            <option value={1280}>1280px</option>
            <option value={800}>800px</option>
            <option value={400}>400px</option>
          </select>
        </div>

        {/* Max size */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-secondary">{t('modules.imageCompress.ui.maxSizeLabel')}</label>
          <select
            value={maxSizeMB}
            onChange={(e) => setMaxSizeMB(Number(e.target.value))}
            className="rounded border border-border-base bg-bg-base px-2 py-1 text-xs text-text-primary focus:border-border-focus focus:outline-none cursor-pointer"
          >
            {MAX_SIZE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.labelKey ? t(opt.labelKey) : opt.label}</option>
            ))}
          </select>
        </div>

        {/* Output format */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-secondary">{t('modules.imageCompress.ui.formatLabel')}</label>
          <select
            value={outputFormat}
            onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
            className="rounded border border-border-base bg-bg-base px-2 py-1 text-xs text-text-primary focus:border-border-focus focus:outline-none cursor-pointer"
          >
            {FORMAT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>{f.labelKey ? t(f.labelKey) : f.label}</option>
            ))}
          </select>
        </div>

        <div className="flex-1" />

        {/* Batch actions */}
        {doneImages.length > 0 && (
          <div className="flex items-center gap-2">
            <button onClick={recompressAll} className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary" title={t('modules.imageCompress.ui.recompressBtn')}>
              <RotateCcw className="h-3.5 w-3.5" /> {t('modules.imageCompress.ui.recompressBtn')}
            </button>
            <button onClick={downloadAll} className="flex cursor-pointer items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20">
              <Download className="h-3.5 w-3.5" /> {t('modules.imageCompress.ui.downloadAllBtn')}
            </button>
            <button onClick={clearAll} className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-text-muted hover:text-error">
              <X className="h-3.5 w-3.5" /> {t('common.clear')}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Upload area */}
        <div
          className={`mb-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors cursor-pointer ${
            isDragging ? 'border-primary bg-primary/5' : 'border-border-subtle hover:border-border-base'
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mb-3 h-10 w-10 text-text-disabled" />
          <p className="text-sm text-text-secondary">
            {t('modules.imageCompress.ui.dropText')}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {t('modules.imageCompress.ui.dropHint')}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Landing features – shown when no images */}
        {images.length === 0 && (
          <div className="pointer-events-none mt-16 select-none">
            <div className="grid grid-cols-2 gap-x-8 gap-y-6 lg:grid-cols-4">
              {[
                { Icon: Shield, title: t('modules.imageCompress.ui.featureLocalTitle'), desc: t('modules.imageCompress.ui.featureLocalDesc') },
                { Icon: Layers, title: t('modules.imageCompress.ui.featureBatchTitle'), desc: t('modules.imageCompress.ui.featureBatchDesc') },
                { Icon: RefreshCw, title: t('modules.imageCompress.ui.featureFormatTitle'), desc: t('modules.imageCompress.ui.featureFormatDesc') },
                { Icon: SlidersHorizontal, title: t('modules.imageCompress.ui.featureControlTitle'), desc: t('modules.imageCompress.ui.featureControlDesc') },
              ].map(({ Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-2.5 px-1">
                  <Icon size={15} className="mt-0.5 shrink-0 text-text-disabled" />
                  <div>
                    <p className="text-[11px] font-medium text-text-muted">{title}</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-text-disabled">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats bar */}
        {images.length > 0 && (
          <div className="mb-3 flex items-center gap-3 text-xs text-text-muted">
            <span>{t('modules.imageCompress.ui.statsCount', { count: images.length })}</span>
            {doneImages.length > 0 && (
              <>
                <span className="text-text-disabled">·</span>
                <span>{formatBytes(totalOriginal)} → <span className="text-text-primary font-medium">{formatBytes(totalCompressed)}</span></span>
                <span className="text-text-disabled">·</span>
                <span className="text-success">-{savingsPercent(totalOriginal, totalCompressed)}</span>
              </>
            )}
          </div>
        )}

        {/* Params changed notification */}
        {paramsChanged && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
            <AlertCircle size={14} className="shrink-0" />
            <span>{t('modules.imageCompress.ui.paramsChanged')}</span>
            <button
              onClick={recompressAll}
              className="ml-auto flex cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-yellow-400 hover:bg-yellow-500/20"
            >
              <RotateCcw size={12} /> {t('modules.imageCompress.ui.recompressBtn')}
            </button>
          </div>
        )}

        {/* Image grid */}
        {images.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {images.map((img) => (
              <ImageCard key={img.id} img={img} onRemove={removeImage} onDownload={downloadImage} onPreview={setPreviewImage} />
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewImage ? <PreviewModal img={previewImage} onClose={() => setPreviewImage(null)} onDownload={downloadImage} /> : null}
    </div>
  )
}

// ── Preview Modal with synchronized zoom & pan ──

function PreviewModal({ img, onClose, onDownload }: { img: CompressedImage; onClose: () => void; onDownload: (img: CompressedImage) => void }) {
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

  // Compute baseScale so each image fits its container independently
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

  // Wheel zoom (native listener for non-passive)
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

function ImageCard({
  img,
  onRemove,
  onDownload,
  onPreview,
}: {
  img: CompressedImage
  onRemove: (id: string) => void
  onDownload: (img: CompressedImage) => void
  onPreview: (img: CompressedImage) => void
}) {
  const { t } = useTranslation()
  return (
    <div
      className={`group rounded-lg border border-border-subtle bg-bg-elevated overflow-hidden transition-colors ${
        img.status === 'done' ? 'cursor-pointer hover:border-primary/40' : ''
      }`}
      onClick={() => { if (img.status === 'done') onPreview(img) }}
    >
      {/* Thumbnail */}
      <div className="relative h-32 overflow-hidden bg-bg-base">
        <img
          src={img.originalUrl}
          alt={img.originalFile.name}
          className={`h-full w-full object-cover transition-transform duration-200 ${img.status === 'done' ? 'group-hover:scale-105' : ''}`}
        />
        {img.status === 'done' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
            <ZoomIn className="h-5 w-5 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100" />
          </div>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(img.id) }}
          className="absolute right-1 top-1 cursor-pointer rounded-full bg-black/60 p-1 text-white/80 opacity-0 transition-opacity hover:!opacity-100 hover:text-white group-hover:opacity-70"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="truncate text-xs font-medium text-text-primary" title={img.originalFile.name}>
          {img.originalFile.name}
        </p>

        {img.status === 'compressing' && (
          <p className="mt-1 text-xs text-text-muted animate-pulse">{t('modules.imageCompress.ui.statusCompressing')}</p>
        )}

        {img.status === 'done' && img.compressedSize !== null && (
          <div className="mt-2 flex items-center justify-between">
            <div className="text-xs">
              <span className="text-text-muted">{formatBytes(img.originalSize)}</span>
              <span className="mx-1 text-text-disabled">→</span>
              <span className="text-text-primary font-medium">{formatBytes(img.compressedSize)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">
                -{savingsPercent(img.originalSize, img.compressedSize)}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onDownload(img) }}
                className="cursor-pointer rounded-md bg-bg-hover p-1.5 text-text-secondary hover:text-text-primary"
                title={t('common.download', { defaultValue: 'Download' })}
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {img.status === 'error' && (
          <p className="mt-1 text-xs text-error">{img.error ?? t('modules.imageCompress.ui.compressFailed')}</p>
        )}
      </div>
    </div>
  )
}
