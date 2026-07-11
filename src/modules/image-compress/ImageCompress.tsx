/**
 * Image Compress Main Component
 * Drag & drop image compression with quality slider and format conversion
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, Download, X, ImageDown, RotateCcw, AlertCircle, Shield, Layers, RefreshCw, SlidersHorizontal, MousePointerClick } from 'lucide-react'
import imageCompression from 'browser-image-compression'
import { useToast } from '../../components/Toast'
import { usePageActive } from '../../app/layouts/CachedOutlet'
import { isTauri } from '../../shared/utils'
import {
  type OutputFormat, type CompressedImage,
  FORMAT_OPTIONS, MAX_SIZE_OPTIONS, formatBytes, savingsPercent,
  _POLL_MS, _enqueueFiles, _setFileBufferFlushFn, _cleanupFileBuffer,
  isRecentlyConsumed,
} from './utils'
import { PreviewModal } from './components/PreviewModal'
import { ImageCard } from './components/ImageCard'

export type { OutputFormat } from './utils'

export default function ImageCompress() {
  const { t } = useTranslation()
  const pageActive = usePageActive()
  const pageActiveRef = useRef(pageActive)
  pageActiveRef.current = pageActive
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

  const imagesRef = useRef<CompressedImage[]>([])
  imagesRef.current = images

  // Cleanup all Object URLs on unmount
  useEffect(() => {
    return () => {
      imagesRef.current.forEach((img) => {
        if (img.originalUrl) URL.revokeObjectURL(img.originalUrl)
        if (img.compressedUrl) URL.revokeObjectURL(img.compressedUrl)
      })
    }
  }, [])

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

  // ── Right-click context menu: poll Rust state for pending images ──
  useEffect(() => {
    if (!isTauri() || !pageActive) return

    _setFileBufferFlushFn((files) => { addFilesRef.current(files) })

    const MIME_MAP: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp' }

    const pollAndLoad = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const paths = await invoke<string[]>('get_pending_image_file')
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
            console.error('[ImageCompress] Failed to load image:', path, err)
          }
        }
        if (files.length > 0) {
          _enqueueFiles(files)
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
      _cleanupFileBuffer(addFilesRef.current)
    }
  }, [pageActive])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
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
  const activeImages = images.filter((i) => i.status === 'pending' || i.status === 'compressing')
  const totalOriginal = doneImages.reduce((acc, img) => acc + img.originalSize, 0)
  const totalCompressed = doneImages.reduce((acc, img) => acc + (img.compressedSize ?? 0), 0)

  const batchTotal = activeImages.length + doneImages.length
  const isBatchCompressing = activeImages.length > 1

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

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Upload area */}
        <div
          className={`mb-4 flex min-h-[180px] flex-col items-center justify-center rounded-xl border-2 border-dashed bg-bg-elevated/30 p-8 transition-colors cursor-pointer ${
            isDragging ? 'border-primary bg-primary/5' : 'border-border-subtle hover:border-border-base hover:bg-bg-elevated/50'
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
          <p className="mt-1.5 text-xs text-text-muted">
            {t('modules.imageCompress.ui.dropHint')}
          </p>
          {images.length === 0 && (
            <p className="mt-4 rounded-md bg-bg-hover/60 px-3 py-1.5 text-[11px] text-text-muted">
              {t('modules.imageCompress.ui.defaultSettingsPrefix')}{outputFormat === 'original' ? t('modules.imageCompress.ui.formatOriginal') : outputFormat.toUpperCase()} · {t('modules.imageCompress.ui.qualityLabel')} {quality}% · {t('modules.imageCompress.ui.maxWidthLabel')} {maxWidth === 0 ? t('modules.imageCompress.ui.widthOriginal') : `${maxWidth}px`}
            </p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Controls */}
        {images.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-border-subtle bg-bg-elevated/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary">{t('modules.imageCompress.ui.qualityLabel')}</label>
            <input
              type="range" min="10" max="100" value={quality}
              onChange={(e) => setQuality(parseInt(e.target.value))}
              className="w-24"
            />
            <span className="w-8 text-right text-xs text-text-muted">{quality}%</span>
          </div>

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

          {paramsChanged && (
            <button onClick={recompressAll} className="flex cursor-pointer items-center gap-1 rounded-md bg-yellow-500/10 px-2 py-1 text-xs text-yellow-600 hover:bg-yellow-500/20 dark:text-yellow-400">
              <RotateCcw className="h-3.5 w-3.5" /> {t('modules.imageCompress.ui.recompressBtn')}
            </button>
          )}

          <div className="flex-1" />

          {doneImages.length > 0 && (
            <div className="flex items-center gap-2">
              <button onClick={downloadAll} className="flex cursor-pointer items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20">
                <Download className="h-3.5 w-3.5" /> {t('modules.imageCompress.ui.downloadAllBtn')}
              </button>
              <button onClick={clearAll} className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-text-muted hover:text-error">
                <X className="h-3.5 w-3.5" /> {t('common.clear')}
              </button>
            </div>
          )}
        </div>
        )}

        {/* Landing features */}
        {images.length === 0 && (
          <div className="pointer-events-none mt-12 select-none">
            {isTauri() && (
              <p className="mb-16 flex items-center justify-center gap-1.5 text-[11px] text-text-disabled">
                <MousePointerClick size={12} />
                {t('modules.imageCompress.ui.rightClickHint')}
              </p>
            )}
            <div className="grid grid-cols-2 gap-x-8 gap-y-5 lg:grid-cols-4">
              {[
                { Icon: Shield, title: t('modules.imageCompress.ui.featureLocalTitle'), desc: t('modules.imageCompress.ui.featureLocalDesc') },
                { Icon: Layers, title: t('modules.imageCompress.ui.featureBatchTitle'), desc: t('modules.imageCompress.ui.featureBatchDesc') },
                { Icon: RefreshCw, title: t('modules.imageCompress.ui.featureFormatTitle'), desc: t('modules.imageCompress.ui.featureFormatDesc') },
                { Icon: SlidersHorizontal, title: t('modules.imageCompress.ui.featureControlTitle'), desc: t('modules.imageCompress.ui.featureControlDesc') },
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

        {/* Image grid */}
        {images.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {images.map((img) => (
              <ImageCard key={img.id} img={img} onRemove={removeImage} onDownload={downloadImage} onPreview={setPreviewImage} />
            ))}
          </div>
        )}
      </div>

      {/* Floating batch compression progress bar */}
      {isBatchCompressing && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 w-72 -translate-x-1/2">
          <div className="rounded-xl border border-border-subtle bg-bg-elevated/95 px-4 py-2.5 shadow-lg shadow-black/20 backdrop-blur-sm">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-text-primary">
                {t('modules.imageCompress.ui.progressLabel', { done: batchTotal - activeImages.length, total: batchTotal })}
              </span>
              <span className="text-text-disabled">
                {activeImages.length} {t('modules.imageCompress.ui.progressRemaining')}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-border-subtle">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${((batchTotal - activeImages.length) / batchTotal) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Floating params-changed pill */}
      {!isBatchCompressing && paramsChanged && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
          <button
            onClick={recompressAll}
            className="flex cursor-pointer items-center gap-2.5 rounded-full border border-yellow-500/30 bg-bg-elevated/95 px-4 py-2 shadow-lg shadow-black/20 backdrop-blur-sm transition-colors hover:border-yellow-500/50 hover:bg-bg-elevated"
          >
            <AlertCircle size={14} className="shrink-0 text-yellow-400" />
            <span className="text-xs text-text-secondary">{t('modules.imageCompress.ui.paramsChanged')}</span>
            <RotateCcw size={12} className="text-yellow-500" />
          </button>
        </div>
      )}

      {/* Preview Modal */}
      {previewImage ? <PreviewModal img={previewImage} onClose={() => setPreviewImage(null)} onDownload={downloadImage} /> : null}
    </div>
  )
}
