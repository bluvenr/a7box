/**
 * Image Watermark Main Component
 * Left preview + right config layout with batch image support.
 * Supports text, image logo, and timestamp watermarks with real-time Canvas preview.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Stamp, Upload, Download, X, Plus, Shield, Layers, Type, Clock, Keyboard } from 'lucide-react'
import { useToast } from '../../components/Toast'
import { usePageActive } from '../../app/layouts/CachedOutlet'
import { isTauri, isMac } from '../../shared/utils'
import type { WatermarkConfig, WatermarkImage } from './types'
import { DEFAULT_CONFIG, _POLL_MS, isRecentlyConsumed } from './utils/defaults'
import { exportSingle, exportBatch } from './utils/exportImage'
import { PreviewCanvas } from './components/PreviewCanvas'
import { ThumbnailStrip } from './components/ThumbnailStrip'
import { ConfigPanel } from './components/ConfigPanel'

export default function ImageWatermark() {
  const { t } = useTranslation()
  const pageActive = usePageActive()
  const pageActiveRef = useRef(pageActive)
  pageActiveRef.current = pageActive
  const toast = useToast()

  // ── State ──
  const [images, setImages] = useState<WatermarkImage[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [config, setConfig] = useState<WatermarkConfig>({ ...DEFAULT_CONFIG })
  const [isDragging, setIsDragging] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const addFilesRef = useRef<(files: FileList | File[]) => void>(() => {})

  const selectedImage = images.find((img) => img.id === selectedId) ?? null
  const currentIndex = images.findIndex((img) => img.id === selectedId)

  const goToPrev = useCallback(() => {
    setSelectedId((prev) => {
      const idx = imagesRef.current.findIndex((i) => i.id === prev)
      if (idx <= 0) return imagesRef.current[imagesRef.current.length - 1]?.id ?? null
      return imagesRef.current[idx - 1].id
    })
  }, [])

  const goToNext = useCallback(() => {
    setSelectedId((prev) => {
      const idx = imagesRef.current.findIndex((i) => i.id === prev)
      if (idx >= imagesRef.current.length - 1) return imagesRef.current[0]?.id ?? null
      return imagesRef.current[idx + 1].id
    })
  }, [])

  // Page-level arrow key navigation for batch browsing.
  // Skipped while typing in form controls or when the page is not active.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!pageActiveRef.current || imagesRef.current.length === 0) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); goToPrev() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goToNext() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goToPrev, goToNext])

  // Cleanup Object URLs on unmount
  const imagesRef = useRef<WatermarkImage[]>([])
  imagesRef.current = images
  useEffect(() => {
    return () => {
      imagesRef.current.forEach((img) => {
        if (img.url) URL.revokeObjectURL(img.url)
        if (img.bitmap) img.bitmap.close()
      })
    }
  }, [])

  // ── Add files ──
  const addFiles = useCallback(async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return

    const newImages: WatermarkImage[] = []
    for (const file of imageFiles) {
      try {
        const bitmap = await createImageBitmap(file)
        newImages.push({
          id: crypto.randomUUID(),
          file,
          url: URL.createObjectURL(file),
          bitmap,
          width: bitmap.width,
          height: bitmap.height,
        })
      } catch { /* skip unreadable */ }
    }

    if (newImages.length === 0) return
    setImages((prev) => [...newImages, ...prev])
    setSelectedId((prev) => prev ?? newImages[0].id)
    toast(t('modules.imageWatermark.ui.toastAdded', { count: newImages.length, defaultValue: 'Added {{count}} images' }))
  }, [toast, t])

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
                } catch { /* skip */ }
              }
              if (files.length > 0) addFilesRef.current(files)
            }
          } else if (event.payload.type === 'leave') {
            setIsDragging(false)
          }
        })
        if (cleanedUp) { unlistenFn?.(); unlistenFn = undefined }
      } catch { /* not supported */ }
    })()
    return () => {
      cleanedUp = true
      if (unlistenFn) { unlistenFn(); unlistenFn = undefined }
    }
  }, [])

  // ── Tauri right-click poll ──
  useEffect(() => {
    if (!isTauri() || !pageActive) return
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
          } catch { /* skip */ }
        }
        if (files.length > 0) addFilesRef.current(files)
      } catch { /* no pending */ }
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

  // ── Handlers ──
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

  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const img = prev.find((i) => i.id === id)
      if (img?.url) URL.revokeObjectURL(img.url)
      if (img?.bitmap) img.bitmap.close()
      const next = prev.filter((i) => i.id !== id)
      return next
    })
    setSelectedId((prev) => {
      if (prev !== id) return prev
      const remaining = imagesRef.current.filter((i) => i.id !== id)
      return remaining.length > 0 ? remaining[0].id : null
    })
  }, [])

  const clearAll = useCallback(() => {
    images.forEach((img) => {
      if (img.url) URL.revokeObjectURL(img.url)
      if (img.bitmap) img.bitmap.close()
    })
    setImages([])
    setSelectedId(null)
  }, [images])

  const handleExportSingle = useCallback(async () => {
    if (!selectedImage) return
    setIsExporting(true)
    try {
      await exportSingle(selectedImage, config, toast, t)
    } catch { /* handled internally */ }
    setIsExporting(false)
  }, [selectedImage, config, toast, t])

  const handleExportBatch = useCallback(async () => {
    if (images.length === 0) return
    setIsExporting(true)
    setExportProgress({ done: 0, total: images.length })
    try {
      await exportBatch(
        images,
        config,
        (done, total) => setExportProgress({ done, total }),
        toast,
        t,
      )
    } catch { /* handled internally */ }
    setIsExporting(false)
    setTimeout(() => setExportProgress(null), 1500)
  }, [images, config, toast, t])

  const patchConfig = useCallback((patch: Partial<WatermarkConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }))
  }, [])

  // ── Render ──
  return (
    <div className="relative flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border-subtle bg-bg-elevated px-4 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Stamp size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            {t('modules.imageWatermark.name', { defaultValue: 'Image Watermark' })}
          </h1>
          <p className="text-sm text-text-secondary">
            {t('modules.imageWatermark.description', { defaultValue: 'Add text, logo or timestamp watermarks to images' })}
          </p>
        </div>
      </div>

      {/* Empty state */}
      {images.length === 0 ? (
        <div className="flex-1 overflow-y-auto p-4">
          <div
            className={`flex min-h-[220px] flex-col items-center justify-center rounded-xl border-2 border-dashed bg-bg-elevated/30 p-8 transition-colors cursor-pointer ${
              isDragging ? 'border-primary bg-primary/5' : 'border-border-subtle hover:border-border-base hover:bg-bg-elevated/50'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mb-3 h-10 w-10 text-text-disabled" />
            <p className="text-sm text-text-secondary">
              {t('modules.imageWatermark.ui.dropText', { defaultValue: 'Drop images here or click to upload' })}
            </p>
            <p className="mt-1.5 text-xs text-text-muted">
              {t('modules.imageWatermark.ui.dropHint', { defaultValue: 'Supports batch — PNG, JPG, WebP, BMP, GIF' })}
            </p>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />

          {/* Feature highlights */}
          <div className="pointer-events-none mt-12 select-none">
            <div className="grid grid-cols-2 gap-x-8 gap-y-5 lg:grid-cols-4">
              {[
                { Icon: Shield, title: t('modules.imageWatermark.ui.featureLocalTitle', { defaultValue: '100% Local' }), desc: t('modules.imageWatermark.ui.featureLocalDesc', { defaultValue: 'All processing on-device, nothing uploaded' }) },
                { Icon: Type, title: t('modules.imageWatermark.ui.featureTextTitle', { defaultValue: 'Text Watermark' }), desc: t('modules.imageWatermark.ui.featureTextDesc', { defaultValue: 'Custom font, color, opacity, rotation and tiling' }) },
                { Icon: Layers, title: t('modules.imageWatermark.ui.featureBatchTitle', { defaultValue: 'Batch Processing' }), desc: t('modules.imageWatermark.ui.featureBatchDesc', { defaultValue: 'Apply watermark to multiple images at once' }) },
                { Icon: Clock, title: t('modules.imageWatermark.ui.featureTimestampTitle', { defaultValue: 'Timestamp' }), desc: t('modules.imageWatermark.ui.featureTimestampDesc', { defaultValue: 'Embed date/time with customizable format' }) },
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
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-elevated/50 px-4 py-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border-base bg-bg-base px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <Plus size={14} />
              {t('modules.imageWatermark.ui.addImages', { defaultValue: 'Add Images' })}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />

            <span className="text-xs text-text-muted">
              {t('modules.imageWatermark.ui.imageCount', { count: images.length, defaultValue: '{{count}} images' })}
            </span>

            <div className="flex-1" />

            <button
              onClick={handleExportSingle}
              disabled={isExporting || !selectedImage}
              className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border-base bg-bg-base px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={14} />
              {t('modules.imageWatermark.ui.exportCurrent', { defaultValue: 'Export' })}
            </button>
            <button
              onClick={handleExportBatch}
              disabled={isExporting}
              className="flex cursor-pointer items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={14} />
              {t('modules.imageWatermark.ui.exportAll', { defaultValue: 'Export All' })}
            </button>
            <button
              onClick={clearAll}
              className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-xs text-text-muted transition-colors hover:text-error"
            >
              <X size={14} />
              {t('common.clear', { defaultValue: 'Clear' })}
            </button>
          </div>

          {/* Main content: left preview + right config */}
          <div
            className="relative flex flex-1 overflow-hidden"
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            {/* Drag overlay */}
            {isDragging && (
              <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-primary/10 backdrop-blur-[2px]">
                <div className="rounded-xl border-2 border-dashed border-primary bg-bg-elevated/90 px-8 py-6 text-center shadow-lg">
                  <Upload className="mx-auto mb-2 h-8 w-8 text-primary" />
                  <p className="text-sm font-medium text-text-primary">
                    {t('modules.imageWatermark.ui.dropToAdd', { defaultValue: 'Drop to add images' })}
                  </p>
                </div>
              </div>
            )}

            {/* Left: preview + thumbnails */}
            <div className="flex flex-1 flex-col overflow-hidden">
              <PreviewCanvas
                image={selectedImage}
                config={config}
                totalCount={images.length}
                currentIndex={currentIndex}
                onPrev={goToPrev}
                onNext={goToNext}
              />
              <ThumbnailStrip
                images={images}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onRemove={removeImage}
              />
            </div>

            {/* Right: config panel */}
            <div className="w-80 shrink-0">
              <ConfigPanel config={config} onPatch={patchConfig} />
            </div>
          </div>

          {/* Shortcut hints status bar */}
          <div className="flex shrink-0 items-center gap-1.5 border-t border-border-subtle bg-bg-elevated/50 px-4 py-1.5 text-[11px] text-text-disabled">
            <Keyboard size={11} />
            <span>
              {t('modules.imageWatermark.ui.previewShortcuts', {
                mod: isMac() ? '⌘' : 'Ctrl',
                defaultValue: '← → Switch · {{mod}}+Wheel Zoom · Drag Pan',
              })}
            </span>
          </div>
        </>
      )}

      {/* Export progress overlay */}
      {exportProgress && exportProgress.done < exportProgress.total && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 w-72 -translate-x-1/2">
          <div className="rounded-xl border border-border-subtle bg-bg-elevated/95 px-4 py-2.5 shadow-lg shadow-black/20 backdrop-blur-sm">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-text-primary">
                {t('modules.imageWatermark.ui.progressLabel', { done: exportProgress.done, total: exportProgress.total, defaultValue: 'Exporting {{done}}/{{total}}' })}
              </span>
              <span className="text-text-disabled">
                {exportProgress.total - exportProgress.done} {t('modules.imageWatermark.ui.progressRemaining', { defaultValue: 'remaining' })}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-border-subtle">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${(exportProgress.done / exportProgress.total) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
