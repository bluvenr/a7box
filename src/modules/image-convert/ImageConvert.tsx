/**
 * Image Convert Main Component
 * Converts images between formats using Canvas API
 * Supports PNG, JPEG, WebP with Tauri native drag-drop
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, Download, X, Shield, Layers, RefreshCw, AlertCircle, MousePointerClick, ImageIcon, RotateCcw, ZoomIn } from 'lucide-react'
import { useToast } from '../../components/Toast'
import { usePageActive } from '../../app/layouts/CachedOutlet'
import { isTauri } from '../../shared/utils'
import { ICO_ALL_SIZES } from './icoEncoder'
import {
  type OutputFormat, type ConvertResult,
  _POLL_MS, isRecentlyConsumed, FORMATS,
  formatBytes, convertImage,
} from './utils'
import { ConvertCard } from './components/ConvertCard'
import { PreviewModal } from './components/PreviewModal'

export default function ImageConvert() {
  const { t } = useTranslation()
  const pageActive = usePageActive()
  const pageActiveRef = useRef(pageActive)
  pageActiveRef.current = pageActive
  const [results, setResults] = useState<ConvertResult[]>([])
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('image/png')
  const [quality, setQuality] = useState(92)
  const [icoSizes, setIcoSizes] = useState<number[]>([256])
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
  const paramsSnapshot = JSON.stringify({ outputFormat, quality, icoSizes })
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
          const { blob, url } = await convertImage(item.originalFile, outputFormat, quality / 100, icoSizes)
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
    lastConvertedParamsRef.current = JSON.stringify({ outputFormat, quality, icoSizes })

    // Clear batch progress after a short delay
    setTimeout(() => setBatchProgress(null), 1500)
  }, [outputFormat, quality, icoSizes, toast, t])

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
              const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'ico'])
              const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp', gif: 'image/gif', ico: 'image/x-icon' }
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

    const MIME_MAP: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon' }

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
    lastConvertedParamsRef.current = JSON.stringify({ outputFormat, quality, icoSizes })
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
          const { blob, url } = await convertImage(item.originalFile, outputFormat, quality / 100, icoSizes)
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
  }, [results, outputFormat, quality, icoSizes, toast, t])

  const totalOriginal = doneItems.reduce((acc, r) => acc + r.originalFile.size, 0)
  const totalConverted = doneItems.reduce((acc, r) => acc + (r.convertedSize ?? 0), 0)

  return (
    <div className="relative flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border-subtle bg-bg-elevated px-4 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ImageIcon size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">{t('modules.imageConvert.name')}</h1>
          <p className="text-sm text-text-secondary">{t('modules.imageConvert.description')}</p>
        </div>
      </div>

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

        {/* Controls */}
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-border-subtle bg-bg-elevated/50 px-4 py-3">
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

          {/* ICO size checkboxes */}
          {outputFormat === 'image/x-icon' && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <label className="text-xs text-text-secondary">{t('modules.imageConvert.ui.icoSizeLabel')}</label>
              {ICO_ALL_SIZES.map((size) => (
                <label key={size} className="flex cursor-pointer items-center gap-1 text-xs text-text-secondary select-none">
                  <input
                    type="checkbox"
                    checked={icoSizes.includes(size)}
                    onChange={() => {
                      setIcoSizes((prev) =>
                        prev.includes(size)
                          ? prev.filter((s) => s !== size)
                          : [...prev, size]
                      )
                    }}
                    disabled={icoSizes.length === 1 && icoSizes.includes(size)}
                    className="h-3.5 w-3.5 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                  />
                  {size}
                </label>
              ))}
              <span className="text-[10px] text-text-disabled">{t('modules.imageConvert.ui.icoSizeHint')}</span>
            </div>
          )}

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

        {/* Landing features */}
        {results.length === 0 && (
          <div className="pointer-events-none mt-12 select-none">
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
                <div key={title} className="flex items-start gap-3 rounded-lg bg-bg-elevated/40 px-3 py-2.5">
                  <Icon size={16} className="mt-0.5 shrink-0 text-text-muted" />
                  <div>
                    <p className="text-xs font-medium text-text-secondary">{title}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-text-muted">{desc}</p>
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

      {/* Floating params-changed pill */}
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
