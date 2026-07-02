/**
 * Image Convert Main Component
 * Converts images between formats using Canvas API
 * Supports PNG, JPEG, WebP with Tauri native drag-drop
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ImageIcon, Upload, Download, X, Shield, Layers, RefreshCw, ZoomIn, ZoomOut, RotateCcw, AlertCircle, MousePointerClick } from 'lucide-react'
import { useToast } from '../../components/Toast'
import { usePageActive } from '../../app/layouts/CachedOutlet'

type OutputFormat = 'image/png' | 'image/jpeg' | 'image/webp'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

// Polling constants for right-click file loading
const _POLL_MS = 300
const _DEDUP_MS = 2000
const _consumedPathTimes = new Map<string, number>()

function isRecentlyConsumed(path: string): boolean {
  const now = Date.now()
  const last = _consumedPathTimes.get(path)
  if (last && now - last < _DEDUP_MS) return true
  _consumedPathTimes.set(path, now)
  return false
}

const FORMATS: { value: OutputFormat; label: string; ext: string }[] = [
  { value: 'image/png', label: 'PNG', ext: 'png' },
  { value: 'image/jpeg', label: 'JPEG', ext: 'jpg' },
  { value: 'image/webp', label: 'WebP', ext: 'webp' },
]

/** Infer original format label from file name extension */
function getOriginalFormat(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = { png: 'PNG', jpg: 'JPEG', jpeg: 'JPEG', webp: 'WebP', bmp: 'BMP', gif: 'GIF' }
  return map[ext] || ext.toUpperCase()
}

interface ConvertResult {
  id: string
  originalFile: File
  originalUrl: string
  convertedBlob: Blob | null
  convertedUrl: string | null
  convertedSize: number | null
  outputFormat: OutputFormat
  status: 'pending' | 'converting' | 'done' | 'error'
  error?: string
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}


/** Convert image using Canvas */
async function convertImage(file: File, format: OutputFormat, quality: number): Promise<{ blob: Blob; url: string }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image()
    const url = URL.createObjectURL(file)
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = reject
    image.src = url
  })

  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  // JPEG doesn't support transparency - fill white background
  if (format === 'image/jpeg') {
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  ctx.drawImage(img, 0, 0)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => b ? resolve(b) : reject(new Error('Conversion failed')),
      format,
      quality
    )
  })

  return { blob, url: URL.createObjectURL(blob) }
}

export default function ImageConvert() {
  const { t } = useTranslation()
  const pageActive = usePageActive()
  const pageActiveRef = useRef(pageActive)
  pageActiveRef.current = pageActive
  const [results, setResults] = useState<ConvertResult[]>([])
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('image/png')
  const [quality, setQuality] = useState(92)
  const [isDragging, setIsDragging] = useState(false)
  const [previewImage, setPreviewImage] = useState<ConvertResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addFilesRef = useRef<(files: FileList | File[]) => void>(() => {})
  const toast = useToast()

  // ── Batch progress ──
  const batchTotalRef = useRef(0)
  const batchDoneRef = useRef(0)
  const [batchProgress, setBatchProgress] = useState<{ total: number; done: number } | null>(null)

  // ── Detect parameter changes ──
  const doneItems = results.filter((r) => r.status === 'done')
  const paramsSnapshot = JSON.stringify({ outputFormat, quality })
  const lastConvertedParamsRef = useRef<string | null>(null)
  const paramsChanged = doneItems.length > 0 && lastConvertedParamsRef.current !== null && lastConvertedParamsRef.current !== paramsSnapshot

  // Cleanup all Object URLs on unmount
  useEffect(() => {
    return () => {
      results.forEach((r) => {
        if (r.originalUrl) URL.revokeObjectURL(r.originalUrl)
        if (r.convertedUrl) URL.revokeObjectURL(r.convertedUrl)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (!imageFiles.length) return

    const newItems: ConvertResult[] = imageFiles.map((file) => ({
      id: crypto.randomUUID(),
      originalFile: file,
      originalUrl: URL.createObjectURL(file),
      convertedBlob: null,
      convertedUrl: null,
      convertedSize: null,
      outputFormat,
      status: 'pending' as const,
    }))

    // Insert at top
    setResults((prev) => [...newItems, ...prev])

    // Track batch progress
    batchTotalRef.current += newItems.length
    setBatchProgress({ total: batchTotalRef.current, done: batchDoneRef.current })

    // Convert each and track success count
    let successCount = 0
    await Promise.all(
      newItems.map(async (item) => {
        try {
          setResults((prev) => prev.map((p) => p.id === item.id ? { ...p, status: 'converting' } : p))
          const { blob, url } = await convertImage(item.originalFile, outputFormat, quality / 100)
          setResults((prev) => prev.map((p) => p.id === item.id
            ? { ...p, convertedBlob: blob, convertedUrl: url, convertedSize: blob.size, status: 'done' }
            : p
          ))
          batchDoneRef.current++
          setBatchProgress({ total: batchTotalRef.current, done: batchDoneRef.current })
          successCount++
        } catch (e) {
          batchDoneRef.current++
          setBatchProgress({ total: batchTotalRef.current, done: batchDoneRef.current })
          setResults((prev) => prev.map((p) => p.id === item.id
            ? { ...p, status: 'error', error: (e as Error).message }
            : p
          ))
        }
      })
    )

    const formatLabel = FORMATS.find(f => f.value === outputFormat)?.label ?? ''
    toast(t('modules.imageConvert.ui.toastConverted', { success: successCount, total: newItems.length, format: formatLabel }))
    lastConvertedParamsRef.current = JSON.stringify({ outputFormat, quality })

    // Clear batch progress after a short delay
    setTimeout(() => setBatchProgress(null), 1500)
  }, [outputFormat, quality, toast, t])

  addFilesRef.current = addFiles

  // ── Tauri native drag-drop with triple protection ──
  useEffect(() => {
    if (!isTauri()) return
    let unlistenFn: (() => void) | undefined
    let cleanedUp = false
    ;(async () => {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview')
        if (cleanedUp) return
        unlistenFn = await getCurrentWebview().onDragDropEvent(async (event) => {
          if (cleanedUp || !pageActiveRef.current) return
          if (event.payload.type === 'over') {
            setIsDragging(true)
          } else if (event.payload.type === 'drop') {
            setIsDragging(false)
            const paths = event.payload.paths
            if (paths.length > 0) {
              const files: File[] = []
              const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'])
              const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp', gif: 'image/gif' }
              const { readFile } = await import('@tauri-apps/plugin-fs')
              for (const p of paths) {
                try {
                  const name = p.split(/[\\/]/).pop() || ''
                  const ext = name.split('.').pop()?.toLowerCase() || ''
                  if (!IMAGE_EXTS.has(ext)) continue
                  const data = await readFile(p)
                  const blob = new Blob([data], { type: MIME[ext] })
                  files.push(new File([blob], name, { type: blob.type }))
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

  // ── Poll for right-click convert image files ──
  useEffect(() => {
    if (!isTauri() || !pageActive) return

    const MIME_MAP: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp' }

    const pollAndLoad = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const paths = await invoke<string[]>('get_pending_convert_file')
        if (!paths || paths.length === 0) return

        const fresh = paths.filter((p) => !isRecentlyConsumed(p))
        if (fresh.length === 0) return

        const files: File[] = []
        for (const path of fresh) {
          try {
            const data = await invoke<number[]>('read_local_image', { path })
            const name = path.split(/[\\/]/).pop() || 'image'
            const ext = name.split('.').pop()?.toLowerCase() || ''
            const mime = MIME_MAP[ext] || 'image/png'
            const blob = new Blob([new Uint8Array(data)], { type: mime })
            files.push(new File([blob], name, { type: mime }))
          } catch (err) {
            console.error('[ImageConvert] Failed to load image:', path, err)
          }
        }
        if (files.length > 0) {
          addFilesRef.current(files)
        }
      } catch { /* no pending file or read error */ }
    }

    pollAndLoad()
    const onFocus = () => { pollAndLoad() }
    window.addEventListener('focus', onFocus)
    const timer = setInterval(pollAndLoad, _POLL_MS)

    return () => {
      window.removeEventListener('focus', onFocus)
      clearInterval(timer)
    }
  }, [pageActive])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (isTauri()) return
    addFiles(e.dataTransfer.files)
  }, [addFiles])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files)
    e.target.value = ''
  }, [addFiles])

  const removeItem = useCallback((id: string) => {
    setResults((prev) => {
      const item = prev.find((i) => i.id === id)
      if (item?.originalUrl) URL.revokeObjectURL(item.originalUrl)
      if (item?.convertedUrl) URL.revokeObjectURL(item.convertedUrl)
      return prev.filter((i) => i.id !== id)
    })
  }, [])

  const downloadItem = useCallback(async (item: ConvertResult) => {
    if (!item.convertedBlob) return
    const ext = FORMATS.find((f) => f.value === item.outputFormat)?.ext ?? 'png'
    const baseName = item.originalFile.name.replace(/\.[^.]+$/, '')
    const defaultFilename = `${baseName}_converted.${ext}`

    if (isTauri()) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { writeFile } = await import('@tauri-apps/plugin-fs')
        const filePath = await save({ defaultPath: defaultFilename })
        if (filePath) {
          const data = new Uint8Array(await item.convertedBlob.arrayBuffer())
          await writeFile(filePath, data)
          toast(t('modules.imageConvert.ui.toastDownloaded'))
        }
        return
      } catch { /* fallback to browser */ }
    }

    if (!item.convertedUrl) return
    const a = document.createElement('a')
    a.href = item.convertedUrl
    a.download = defaultFilename
    a.click()
  }, [toast, t])

  const downloadAll = useCallback(async () => {
    const doneItems = results.filter((r) => r.status === 'done')
    if (!doneItems.length) return

    if (isTauri()) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog')
        const { writeFile } = await import('@tauri-apps/plugin-fs')
        const dir = await open({ directory: true, multiple: false })
        if (!dir) return
        for (const item of doneItems) {
          if (!item.convertedBlob) continue
          const ext = FORMATS.find((f) => f.value === item.outputFormat)?.ext ?? 'png'
          const baseName = item.originalFile.name.replace(/\.[^.]+$/, '')
          const data = new Uint8Array(await item.convertedBlob.arrayBuffer())
          await writeFile(`${dir}/${baseName}_converted.${ext}`, data)
        }
        toast(t('modules.imageConvert.ui.toastDownloading'))
        return
      } catch { /* fallback to browser */ }
    }

    doneItems.forEach((item) => downloadItem(item))
    toast(t('modules.imageConvert.ui.toastDownloading'))
  }, [results, downloadItem, toast, t])

  const clearAll = useCallback(() => {
    results.forEach((r) => {
      if (r.originalUrl) URL.revokeObjectURL(r.originalUrl)
      if (r.convertedUrl) URL.revokeObjectURL(r.convertedUrl)
    })
    setResults([])
  }, [results])

  const reconvertAll = useCallback(async () => {
    lastConvertedParamsRef.current = JSON.stringify({ outputFormat, quality })
    const pending = results.filter((r) => r.status !== 'converting')
    const reset = pending.map((item) => {
      if (item.convertedUrl) URL.revokeObjectURL(item.convertedUrl)
      return { ...item, convertedBlob: null, convertedUrl: null, convertedSize: null, outputFormat, status: 'converting' as const }
    })
    setResults((prev) => {
      const map = new Map(prev.map((p) => [p.id, p]))
      reset.forEach((r) => map.set(r.id, r))
      return Array.from(map.values())
    })

    // Track reconvert progress
    batchTotalRef.current = reset.length
    batchDoneRef.current = 0
    setBatchProgress({ total: reset.length, done: 0 })

    await Promise.all(
      reset.map(async (item) => {
        try {
          const { blob, url } = await convertImage(item.originalFile, outputFormat, quality / 100)
          setResults((prev) => prev.map((p) => p.id === item.id
            ? { ...p, convertedBlob: blob, convertedUrl: url, convertedSize: blob.size, status: 'done' }
            : p
          ))
        } catch (e) {
          setResults((prev) => prev.map((p) => p.id === item.id
            ? { ...p, status: 'error', error: (e as Error).message }
            : p
          ))
        } finally {
          batchDoneRef.current++
          setBatchProgress({ total: batchTotalRef.current, done: batchDoneRef.current })
        }
      })
    )
    toast(t('modules.imageConvert.ui.toastReconverted'))
    setTimeout(() => setBatchProgress(null), 1500)
  }, [results, outputFormat, quality, toast, t])

  const totalOriginal = doneItems.reduce((acc, r) => acc + r.originalFile.size, 0)
  const totalConverted = doneItems.reduce((acc, r) => acc + (r.convertedSize ?? 0), 0)

  return (
    <div className="relative flex h-full flex-col">
      {/* Header - large style consistent with ImageCompress */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border-subtle bg-bg-elevated px-4 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ImageIcon size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">{t('modules.imageConvert.name')}</h1>
          <p className="text-sm text-text-secondary">{t('modules.imageConvert.description')}</p>
        </div>
      </div>

      {/* Controls — hidden when no results */}
      {results.length > 0 && (
      <div className="flex flex-wrap items-center gap-4 border-b border-border-subtle bg-bg-elevated/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-secondary">{t('modules.imageConvert.ui.outputLabel')}</label>
          <select
            value={outputFormat}
            onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
            className="rounded border border-border-base bg-bg-base px-2 py-1 text-xs text-text-primary focus:border-border-focus focus:outline-none cursor-pointer"
          >
            {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        {(outputFormat === 'image/jpeg' || outputFormat === 'image/webp') && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary">{t('modules.imageConvert.ui.qualityLabel')}</label>
            <input type="range" min="10" max="100" value={quality} onChange={(e) => setQuality(parseInt(e.target.value))} className="w-24" />
            <span className="w-8 text-right text-xs text-text-muted">{quality}%</span>
          </div>
        )}

        {/* Reconvert button – only when params changed, placed next to parameter controls */}
        {paramsChanged && (
          <button onClick={reconvertAll} className="flex cursor-pointer items-center gap-1 rounded-md bg-yellow-500/10 px-2 py-1 text-xs text-yellow-600 hover:bg-yellow-500/20 dark:text-yellow-400">
            <RotateCcw className="h-3.5 w-3.5" /> {t('modules.imageConvert.ui.reconvertBtn')}
          </button>
        )}

        <div className="flex-1" />

        {doneItems.length > 0 && (
          <div className="flex items-center gap-2">
            <button onClick={downloadAll} className="flex cursor-pointer items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20">
              <Download className="h-3.5 w-3.5" /> {t('modules.imageConvert.ui.downloadAllBtn')}
            </button>
            <button onClick={clearAll} className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-text-muted hover:text-error">
              <X className="h-3.5 w-3.5" /> {t('common.clear')}
            </button>
          </div>
        )}
      </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Upload zone */}
        <div
          className={`mb-4 flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-bg-elevated/30 p-8 transition-colors ${isDragging ? 'border-primary bg-primary/5' : 'border-border-subtle hover:border-border-base hover:bg-bg-elevated/50'}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mb-3 h-10 w-10 text-text-disabled" />
          <p className="text-sm text-text-secondary">{t('modules.imageConvert.ui.dropText')}</p>
          <p className="mt-1 text-xs text-text-muted">{t('modules.imageConvert.ui.dropHint')}</p>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
        </div>

        {/* Landing features – shown when no images */}
        {results.length === 0 && (
          <div className="pointer-events-none mt-12 select-none">
            {/* Right-click hint – Tauri desktop only, placed above feature cards */}
            {isTauri() && (
              <p className="mb-16 flex items-center justify-center gap-1.5 text-[11px] text-text-disabled">
                <MousePointerClick size={12} />
                {t('modules.imageConvert.ui.rightClickHint')}
              </p>
            )}
            <div className="grid grid-cols-2 gap-x-8 gap-y-5 lg:grid-cols-4">
              {[
                { Icon: Shield, title: t('modules.imageConvert.ui.featureLocalTitle'), desc: t('modules.imageConvert.ui.featureLocalDesc') },
                { Icon: Layers, title: t('modules.imageConvert.ui.featureBatchTitle'), desc: t('modules.imageConvert.ui.featureBatchDesc') },
                { Icon: RefreshCw, title: t('modules.imageConvert.ui.featureFormatTitle'), desc: t('modules.imageConvert.ui.featureFormatDesc') },
                { Icon: ZoomIn, title: t('modules.imageConvert.ui.featureQualityTitle'), desc: t('modules.imageConvert.ui.featureQualityDesc') },
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
        {results.length > 0 && (
          <div className="mb-3 flex items-center gap-3 text-xs text-text-muted">
            <span>{t('modules.imageConvert.ui.statsCount', { count: results.length })}</span>
            {doneItems.length > 0 && totalOriginal > 0 && (
              <>
                <span className="text-text-disabled">·</span>
                <span>{formatBytes(totalOriginal)} → <span className="text-text-primary font-medium">{formatBytes(totalConverted)}</span></span>
              </>
            )}
          </div>
        )}

        {/* Results grid */}
        {results.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {results.map((item) => (
              <ConvertCard key={item.id} item={item} onRemove={removeItem} onDownload={downloadItem} onPreview={setPreviewImage} />
            ))}
          </div>
        )}
      </div>

      {/* Floating batch progress bar */}
      {batchProgress && batchProgress.done < batchProgress.total && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 w-72 -translate-x-1/2">
          <div className="rounded-xl border border-border-subtle bg-bg-elevated/95 p-3 shadow-lg shadow-black/20 backdrop-blur-sm">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-text-secondary">
                {t('modules.imageConvert.ui.progressLabel', { done: batchProgress.done, total: batchProgress.total })}
              </span>
              <span className="text-text-muted">{batchProgress.total - batchProgress.done} {t('modules.imageConvert.ui.progressRemaining')}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-bg-hover">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${(batchProgress.done / batchProgress.total) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Floating params-changed pill – clickable to re-convert */}
      {paramsChanged && !batchProgress && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
          <button
            onClick={reconvertAll}
            className="flex cursor-pointer items-center gap-2.5 rounded-full border border-yellow-500/30 bg-bg-elevated/95 px-4 py-2 shadow-lg shadow-black/20 backdrop-blur-sm transition-colors hover:border-yellow-500/50 hover:bg-bg-elevated"
          >
            <AlertCircle size={14} className="shrink-0 text-yellow-400" />
            <span className="text-xs text-text-secondary">{t('modules.imageConvert.ui.paramsChanged')}</span>
            <RotateCcw size={12} className="text-yellow-500" />
          </button>
        </div>
      )}

      {/* Preview Modal */}
      {previewImage ? <PreviewModal item={previewImage} onClose={() => setPreviewImage(null)} onDownload={downloadItem} /> : null}
    </div>
  )
}

// ── Convert Card ──

function ConvertCard({
  item,
  onRemove,
  onDownload,
  onPreview,
}: {
  item: ConvertResult
  onRemove: (id: string) => void
  onDownload: (item: ConvertResult) => void
  onPreview: (item: ConvertResult) => void
}) {
  const { t } = useTranslation()
  return (
    <div
      className={`group rounded-lg border border-border-subtle bg-bg-elevated overflow-hidden transition-colors ${
        item.status === 'done' ? 'cursor-pointer hover:border-primary/40' : ''
      }`}
      onClick={() => { if (item.status === 'done') onPreview(item) }}
    >
      {/* Thumbnail */}
      <div className="relative h-32 overflow-hidden bg-bg-base">
        <img
          src={item.originalUrl}
          alt={item.originalFile.name}
          className={`h-full w-full object-cover transition-transform duration-200 ${item.status === 'done' ? 'group-hover:scale-105' : ''}`}
        />
        {item.status === 'done' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
            <ZoomIn className="h-5 w-5 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100" />
          </div>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(item.id) }}
          className="absolute right-1 top-1 cursor-pointer rounded-full bg-black/60 p-1 text-white/80 opacity-0 transition-opacity hover:!opacity-100 hover:text-white group-hover:opacity-70"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="truncate text-xs font-medium text-text-primary" title={item.originalFile.name}>
          {item.originalFile.name}
        </p>

        {item.status === 'converting' && (
          <p className="mt-1 text-xs text-text-muted animate-pulse">{t('modules.imageConvert.ui.statusConverting')}</p>
        )}

        {item.status === 'done' && item.convertedSize !== null && (
          <div className="mt-2 flex items-center justify-between">
            <div className="text-xs">
              <span className="text-text-muted">{formatBytes(item.originalFile.size)}</span>
              <span className="mx-1 text-text-disabled">→</span>
              <span className="text-text-primary font-medium">{formatBytes(item.convertedSize)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="rounded bg-bg-hover px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                {getOriginalFormat(item.originalFile)}
              </span>
              <span className="text-[10px] text-text-disabled">→</span>
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {FORMATS.find(f => f.value === item.outputFormat)?.label}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onDownload(item) }}
                className="cursor-pointer rounded-md bg-bg-hover p-1.5 text-text-secondary hover:text-text-primary"
                title={t('common.download', { defaultValue: 'Download' })}
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {item.status === 'error' && (
          <p className="mt-1 text-xs text-error">{item.error ?? t('modules.imageConvert.ui.convertFailed')}</p>
        )}
      </div>
    </div>
  )
}

// ── Preview Modal with synchronized zoom & pan ──

function PreviewModal({ item, onClose, onDownload }: { item: ConvertResult; onClose: () => void; onDownload: (item: ConvertResult) => void }) {
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

  useEffect(() => {
    const reader = new FileReader()
    reader.onload = () => setOrigDataUrl(reader.result as string)
    reader.readAsDataURL(item.originalFile)
  }, [item.originalFile])

  useEffect(() => {
    if (item.convertedBlob) {
      const reader = new FileReader()
      reader.onload = () => setCompDataUrl(reader.result as string)
      reader.readAsDataURL(item.convertedBlob)
    }
  }, [item.convertedBlob])

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

  const handleMouseUp = useCallback(() => { isDraggingRef.current = false }, [])
  const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }) }, [])

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
          <h3 className="truncate text-sm font-semibold text-text-primary" title={item.originalFile.name}>{item.originalFile.name}</h3>
          <button onClick={onClose} className="cursor-pointer text-text-muted hover:text-text-primary p-1"><X size={16} /></button>
        </div>
        {/* Images comparison with sync zoom/pan */}
        <div className="relative grid grid-cols-2 gap-4 p-4">
          <div>
            <p className="mb-2 text-center text-xs font-medium text-text-muted">{t('modules.imageConvert.ui.previewOriginal')}</p>
            <div ref={leftRef} {...panelProps}>
              {origDataUrl
                ? <img src={origDataUrl} alt="original" className="pointer-events-none absolute left-1/2 top-1/2 max-w-none" style={origStyle} draggable={false} onLoad={handleOrigLoad} />
                : <span className="flex h-full items-center justify-center text-xs text-text-disabled">—</span>
              }
            </div>
            <p className="mt-1 text-center text-xs text-text-muted">{formatBytes(item.originalFile.size)}</p>
          </div>
          <div>
            <p className="mb-2 text-center text-xs font-medium text-text-muted">{t('modules.imageConvert.ui.previewConverted')}</p>
            <div ref={rightRef} {...panelProps}>
              {compDataUrl
                ? <img src={compDataUrl} alt="converted" className="pointer-events-none absolute left-1/2 top-1/2 max-w-none" style={compStyle} draggable={false} onLoad={handleCompLoad} />
                : <span className="flex h-full items-center justify-center text-xs text-text-disabled">—</span>
              }
            </div>
            <p className="mt-1 text-center text-xs text-text-primary font-medium">{item.convertedSize !== null ? formatBytes(item.convertedSize) : '—'}</p>
          </div>
          {/* Floating zoom toolbar */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded-full border border-border-subtle bg-bg-elevated/95 px-1 py-1 shadow-lg backdrop-blur-sm">
            <button onClick={() => setZoom((p) => Math.max(1, p * 0.8))} disabled={!isZoomed} className="cursor-pointer rounded-full p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed"><ZoomOut size={14} /></button>
            <button onClick={resetView} className="min-w-[3rem] cursor-pointer rounded-full px-1.5 py-1 text-center text-xs font-medium text-text-secondary hover:bg-bg-hover">{Math.round(zoom * 100)}%</button>
            <button onClick={() => setZoom((p) => Math.min(5, p * 1.25))} disabled={zoom >= 5} className="cursor-pointer rounded-full p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed"><ZoomIn size={14} /></button>
            {isZoomed && (
              <>
                <div className="mx-0.5 h-3 w-px bg-border-subtle" />
                <button onClick={resetView} className="cursor-pointer rounded-full p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover" title={t('modules.imageConvert.ui.previewReset', { defaultValue: 'Reset' })}><RotateCcw size={13} /></button>
              </>
            )}
          </div>
        </div>
        {/* Stats + download */}
        <div className="flex items-center justify-between border-t border-border-subtle px-4 py-3">
          <div className="flex items-center gap-3 text-xs">
            {item.convertedSize !== null && (
              <span className="text-text-muted">{formatBytes(item.originalFile.size)} → <span className="text-text-primary font-medium">{formatBytes(item.convertedSize)}</span></span>
            )}
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {FORMATS.find(f => f.value === item.outputFormat)?.label}
            </span>
          </div>
          <button
            onClick={() => onDownload(item)}
            disabled={item.status !== 'done'}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={14} /> {t('common.download', { defaultValue: 'Download' })}
          </button>
        </div>
      </div>
    </div>
  )
}
