/**
 * Image Compress Main Component
 * Drag & drop image compression with quality slider and format conversion
 */

import { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, Download, X, ImageDown, RotateCcw } from 'lucide-react'
import imageCompression from 'browser-image-compression'

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
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2000)
  }

  /** Compress a single image */
  const compressImage = useCallback(
    async (img: CompressedImage): Promise<CompressedImage> => {
      try {
        const options: Parameters<typeof imageCompression>[1] = {
          maxSizeMB: 10,
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
    [quality, maxWidth, outputFormat]
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

      setImages((prev) => [...prev, ...newImages])

      // Compress each
      const compressed = await Promise.all(
        newImages.map(async (img) => {
          const result = await compressImage({ ...img, status: 'compressing' })
          setImages((prev) => prev.map((p) => (p.id === img.id ? result : p)))
          return result
        })
      )

      const successCount = compressed.filter((c) => c.status === 'done').length
      showToast(t('modules.imageCompress.ui.toastCompressed', { success: successCount, total: compressed.length }))
    },
    [compressImage, showToast]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
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

  const downloadImage = useCallback((img: CompressedImage) => {
    if (!img.compressedUrl || !img.compressedBlob) return
    const ext = outputFormat === 'original'
      ? img.originalFile.name.split('.').pop() ?? 'png'
      : outputFormat
    const a = document.createElement('a')
    a.href = img.compressedUrl
    a.download = `compressed-${Date.now()}.${ext}`
    a.click()
  }, [outputFormat])

  const downloadAll = useCallback(() => {
    images.filter((i) => i.status === 'done').forEach((img) => downloadImage(img))
    showToast(t('modules.imageCompress.ui.toastDownloading'))
  }, [images, downloadImage, showToast])

  const clearAll = useCallback(() => {
    images.forEach((img) => {
      if (img.originalUrl) URL.revokeObjectURL(img.originalUrl)
      if (img.compressedUrl) URL.revokeObjectURL(img.compressedUrl)
    })
    setImages([])
  }, [images])

  const recompressAll = useCallback(async () => {
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
    showToast(t('modules.imageCompress.ui.toastRecompressed'))
  }, [images, compressImage, showToast])

  const doneImages = images.filter((i) => i.status === 'done')
  const totalSaved = doneImages.reduce((acc, img) => acc + (img.originalSize - (img.compressedSize ?? 0)), 0)

  return (
    <div className="relative flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-elevated px-4 py-2">
        <ImageDown className="h-4 w-4 text-text-muted" />
        <span className="text-sm font-medium text-text-primary">{t('modules.imageCompress.name')}</span>
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
            className="rounded border border-border-base bg-bg-base px-2 py-1 text-xs text-text-primary focus:border-border-focus focus:outline-none"
          >
            <option value={9999}>{t('modules.imageCompress.ui.widthOriginal')}</option>
            <option value={3840}>3840px</option>
            <option value={1920}>1920px</option>
            <option value={1280}>1280px</option>
            <option value={800}>800px</option>
            <option value={400}>400px</option>
          </select>
        </div>

        {/* Output format */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-secondary">{t('modules.imageCompress.ui.formatLabel')}</label>
          <select
            value={outputFormat}
            onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
            className="rounded border border-border-base bg-bg-base px-2 py-1 text-xs text-text-primary focus:border-border-focus focus:outline-none"
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
            <span className="text-xs text-text-muted">
              {t('modules.imageCompress.ui.savedLabel')} <span className="text-success">{formatBytes(totalSaved)}</span>
            </span>
            <button onClick={recompressAll} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary" title={t('modules.imageCompress.ui.recompressBtn')}>
              <RotateCcw className="h-3.5 w-3.5" /> {t('modules.imageCompress.ui.recompressBtn')}
            </button>
            <button onClick={downloadAll} className="flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20">
              <Download className="h-3.5 w-3.5" /> {t('modules.imageCompress.ui.downloadAllBtn')}
            </button>
            <button onClick={clearAll} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-muted hover:text-error">
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

        {/* Image grid */}
        {images.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((img) => (
              <ImageCard key={img.id} img={img} onRemove={removeImage} onDownload={downloadImage} />
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg px-4 py-2 text-sm font-medium shadow-lg ${toast.type === 'success' ? 'bg-success text-white' : 'bg-error text-white'}`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}

function ImageCard({
  img,
  onRemove,
  onDownload,
}: {
  img: CompressedImage
  onRemove: (id: string) => void
  onDownload: (img: CompressedImage) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-elevated overflow-hidden">
      {/* Thumbnail */}
      <div className="relative h-32 bg-bg-base">
        <img src={img.originalUrl} alt={img.originalFile.name} className="h-full w-full object-cover" />
        <button
          onClick={() => onRemove(img.id)}
          className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white/80 hover:text-white"
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
                onClick={() => onDownload(img)}
                className="rounded-md bg-bg-hover p-1.5 text-text-secondary hover:text-text-primary"
                title="Download"
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
