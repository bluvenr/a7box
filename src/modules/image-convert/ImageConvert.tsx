/**
 * Image Convert Main Component
 * Converts images between formats using Canvas API
 */

import { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Image, Upload, Download, X } from 'lucide-react'

type OutputFormat = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/bmp'

const FORMATS: { value: OutputFormat; label: string; ext: string }[] = [
  { value: 'image/png', label: 'PNG', ext: 'png' },
  { value: 'image/jpeg', label: 'JPEG', ext: 'jpg' },
  { value: 'image/webp', label: 'WebP', ext: 'webp' },
  { value: 'image/bmp', label: 'BMP', ext: 'bmp' },
]

interface ConvertResult {
  id: string
  originalFile: File
  originalUrl: string
  convertedUrl: string | null
  convertedSize: number | null
  outputFormat: OutputFormat
  status: 'pending' | 'done' | 'error'
  error?: string
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB']
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

  // JPEG/BMP don't support transparency - fill white background
  if (format === 'image/jpeg' || format === 'image/bmp') {
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
  const [results, setResults] = useState<ConvertResult[]>([])
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('image/png')
  const [quality, setQuality] = useState(92)
  const [isDragging, setIsDragging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2000) }

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (!imageFiles.length) return

    const newItems: ConvertResult[] = imageFiles.map((file) => ({
      id: crypto.randomUUID(),
      originalFile: file,
      originalUrl: URL.createObjectURL(file),
      convertedUrl: null,
      convertedSize: null,
      outputFormat,
      status: 'pending' as const,
    }))

    setResults((prev) => [...prev, ...newItems])

    for (const item of newItems) {
      try {
        const { blob, url } = await convertImage(item.originalFile, outputFormat, quality / 100)
        setResults((prev) => prev.map((p) => p.id === item.id
          ? { ...p, convertedUrl: url, convertedSize: blob.size, status: 'done' }
          : p
        ))
      } catch (e) {
        setResults((prev) => prev.map((p) => p.id === item.id
          ? { ...p, status: 'error', error: (e as Error).message }
          : p
        ))
      }
    }

    showToast(t('modules.imageConvert.ui.toastConverted', { count: newItems.length, format: FORMATS.find(f => f.value === outputFormat)?.label }))
  }, [outputFormat, quality, showToast])

  const removeItem = (id: string) => {
    setResults((prev) => {
      const item = prev.find((i) => i.id === id)
      if (item?.originalUrl) URL.revokeObjectURL(item.originalUrl)
      if (item?.convertedUrl) URL.revokeObjectURL(item.convertedUrl)
      return prev.filter((i) => i.id !== id)
    })
  }

  const downloadItem = (item: ConvertResult) => {
    if (!item.convertedUrl) return
    const ext = FORMATS.find((f) => f.value === item.outputFormat)?.ext ?? 'png'
    const a = document.createElement('a')
    a.href = item.convertedUrl
    a.download = `converted-${Date.now()}.${ext}`
    a.click()
  }

  const clearAll = () => {
    results.forEach((r) => {
      if (r.originalUrl) URL.revokeObjectURL(r.originalUrl)
      if (r.convertedUrl) URL.revokeObjectURL(r.convertedUrl)
    })
    setResults([])
  }

  const doneItems = results.filter((r) => r.status === 'done')

  return (
    <div className="relative flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-elevated px-4 py-2">
        <Image className="h-4 w-4 text-text-muted" />
        <span className="text-sm font-medium text-text-primary">{t('modules.imageConvert.name')}</span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 border-b border-border-subtle bg-bg-elevated/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-secondary">{t('modules.imageConvert.ui.outputLabel')}</label>
          <select
            value={outputFormat}
            onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
            className="rounded border border-border-base bg-bg-base px-2 py-1 text-xs text-text-primary focus:border-border-focus focus:outline-none"
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
        <div className="flex-1" />
        {doneItems.length > 0 && (
          <button onClick={clearAll} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted hover:text-error">
            <X className="h-3.5 w-3.5" /> {t('modules.imageConvert.ui.clearAllBtn')}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Upload zone */}
        <div
          className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${isDragging ? 'border-primary bg-primary/5' : 'border-border-subtle hover:border-border-base'}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer.files) }}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mb-3 h-10 w-10 text-text-disabled" />
          <p className="text-sm text-text-secondary">{t('modules.imageConvert.ui.dropText')}</p>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} />
        </div>

        {/* Results grid */}
        {results.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((item) => (
              <div key={item.id} className="rounded-lg border border-border-subtle bg-bg-elevated overflow-hidden">
                <div className="relative h-28 bg-bg-base">
                  <img src={item.originalUrl} alt="" className="h-full w-full object-cover" />
                  <button onClick={() => removeItem(item.id)} className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white/80 hover:text-white">
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="p-3">
                  <p className="truncate text-xs font-medium text-text-primary">{item.originalFile.name}</p>
                  {item.status === 'done' && item.convertedSize !== null && (
                    <div className="mt-2 flex items-center justify-between">
                      <div className="text-xs">
                        <span className="text-text-muted">{formatBytes(item.originalFile.size)}</span>
                        <span className="mx-1 text-text-disabled">→</span>
                        <span className="font-medium text-text-primary">{formatBytes(item.convertedSize)}</span>
                      </div>
                      <button onClick={() => downloadItem(item)} className="rounded-md bg-bg-hover p-1.5 text-text-secondary hover:text-text-primary" title={t('common.download')}>
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  {item.status === 'error' && <p className="mt-1 text-xs text-error">{item.error}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-success px-4 py-2 text-sm font-medium text-white shadow-lg">{toast}</div>}
    </div>
  )
}
