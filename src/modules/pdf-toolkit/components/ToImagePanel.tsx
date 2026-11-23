/**
 * PDF Toolkit — PDF → Image panel
 * Drop a PDF, render selected pages to PNG/JPEG/WebP via pdf.js + canvas.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, Download, X, RotateCcw, AlertCircle, Shield, Layers, RefreshCw, ZoomIn, FileText } from 'lucide-react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useToast } from '../../../components/Toast'
import { useConfirm } from '../../../components/Dialog'
import { usePageActive } from '../../../app/layouts/CachedOutlet'
import { useNativeFileDrop } from '../useNativePdfDrop'
import { loadPdf, renderPageToBlob } from '../pdfEngine'
import { saveBlob, saveMany } from '../save'
import {
  type OutputFormat, type RenderedPage, FORMATS, SCALES,
  formatBytes, baseName, parsePageRange,
} from '../utils'
import { PageThumb } from './PageThumb'

export default function ToImagePanel() {
  const { t } = useTranslation()
  const pageActive = usePageActive()
  const toast = useToast()
  const confirm = useConfirm()

  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [results, setResults] = useState<RenderedPage[]>([])
  const [format, setFormat] = useState<OutputFormat>('image/png')
  const [scale, setScale] = useState(2)
  const [rangeMode, setRangeMode] = useState<'all' | 'custom'>('all')
  const [rangeText, setRangeText] = useState('')
  const [quality, setQuality] = useState(92)
  const [loadError, setLoadError] = useState('')
  const [progress, setProgress] = useState<{ total: number; done: number } | null>(null)

  const pdfRef = useRef<PDFDocumentProxy | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastParamsRef = useRef<string | null>(null)
  const busyRef = useRef(false)
  const resultsRef = useRef<RenderedPage[]>([])
  resultsRef.current = results

  const snapshot = JSON.stringify({ format, scale, rangeMode, rangeText, quality })
  const doneItems = results.filter((r) => r.status === 'done')
  const paramsChanged = doneItems.length > 0 && lastParamsRef.current !== null && lastParamsRef.current !== snapshot

  // Cleanup proxy + object URLs on unmount
  useEffect(() => {
    return () => {
      resultsRef.current.forEach((r) => { if (r.url) URL.revokeObjectURL(r.url) })
      pdfRef.current?.destroy()
      pdfRef.current = null
    }
  }, [])

  const renderPages = useCallback(async (pdf: PDFDocumentProxy, pages: number[], fmt: OutputFormat, scl: number, q: number) => {
    if (busyRef.current) return
    busyRef.current = true
    const skeleton: RenderedPage[] = pages.map((n) => ({
      id: `${n}-${crypto.randomUUID()}`, pageNum: n, blob: null, url: null, size: null, status: 'pending',
    }))
    setResults(skeleton)
    setProgress({ total: pages.length, done: 0 })
    let ok = 0
    for (let i = 0; i < skeleton.length; i++) {
      const item = skeleton[i]
      setResults((prev) => prev.map((p) => p.id === item.id ? { ...p, status: 'rendering' } : p))
      try {
        const blob = await renderPageToBlob(pdf, item.pageNum, scl, fmt, q / 100)
        const url = URL.createObjectURL(blob)
        setResults((prev) => prev.map((p) => p.id === item.id ? { ...p, blob, url, size: blob.size, status: 'done' } : p))
        ok++
      } catch (e) {
        setResults((prev) => prev.map((p) => p.id === item.id ? { ...p, status: 'error', error: (e as Error).message } : p))
      }
      setProgress({ total: pages.length, done: i + 1 })
    }
    lastParamsRef.current = JSON.stringify({ format: fmt, scale: scl, rangeMode, rangeText, quality: q })
    busyRef.current = false
    toast(t('modules.pdfToolkit.ui.toastRendered', { defaultValue: 'Rendered {{count}} pages', count: ok }))
    setTimeout(() => setProgress(null), 1200)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, t, rangeMode, rangeText])

  const loadFile = useCallback(async (file: File) => {
    // reset previous
    resultsRef.current.forEach((r) => { if (r.url) URL.revokeObjectURL(r.url) })
    pdfRef.current?.destroy()
    pdfRef.current = null
    setResults([])
    setLoadError('')
    lastParamsRef.current = null
    setPdfFile(file)
    try {
      const pdf = await loadPdf(file)
      pdfRef.current = pdf
      setPageCount(pdf.numPages)
      const pages = Array.from({ length: pdf.numPages }, (_, i) => i + 1)
      await renderPages(pdf, pages, format, scale, quality)
    } catch (e) {
      const err = e as { name?: string; message?: string }
      setPdfFile(null)
      setPageCount(0)
      setLoadError(err?.name === 'PasswordException'
        ? t('modules.pdfToolkit.ui.errorEncrypted', { defaultValue: 'This PDF is password-protected and cannot be opened' })
        : t('modules.pdfToolkit.ui.errorInvalidPdf', { defaultValue: 'Failed to open PDF — the file may be corrupted' }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, scale, quality, renderPages, t])

  const { isDragging, dragHandlers } = useNativeFileDrop({ kind: 'pdf', onFiles: (f) => loadFile(f[0]), active: pageActive })

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) loadFile(f)
    e.target.value = ''
  }, [loadFile])

  const reRender = useCallback(() => {
    const pdf = pdfRef.current
    if (!pdf || busyRef.current) return
    const pages = rangeMode === 'all'
      ? Array.from({ length: pdf.numPages }, (_, i) => i + 1)
      : parsePageRange(rangeText, pdf.numPages)
    if (pages.length === 0) {
      toast(t('modules.pdfToolkit.ui.errorRange', { defaultValue: 'Invalid page range' }), 'error')
      return
    }
    resultsRef.current.forEach((r) => { if (r.url) URL.revokeObjectURL(r.url) })
    renderPages(pdf, pages, format, scale, quality)
  }, [rangeMode, rangeText, format, scale, quality, renderPages, toast, t])

  const removeItem = useCallback((id: string) => {
    setResults((prev) => {
      const item = prev.find((i) => i.id === id)
      if (item?.url) URL.revokeObjectURL(item.url)
      return prev.filter((i) => i.id !== id)
    })
  }, [])

  const ext = FORMATS.find((f) => f.value === format)?.ext ?? 'png'
  const pageName = (n: number) => `${baseName(pdfFile?.name ?? 'page')}_page${n}.${ext}`

  const downloadItem = useCallback(async (item: RenderedPage) => {
    if (!item.blob) return
    const ok = await saveBlob(item.blob, pageName(item.pageNum))
    if (ok) toast(t('modules.pdfToolkit.ui.toastDownloaded', { defaultValue: 'Saved successfully' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, pdfFile, toast, t])

  const downloadAll = useCallback(async () => {
    const items = resultsRef.current.filter((r) => r.status === 'done' && r.blob)
    if (!items.length) return
    const ok = await saveMany(items.map((r) => ({ blob: r.blob!, name: pageName(r.pageNum) })))
    if (ok) toast(t('modules.pdfToolkit.ui.toastDownloaded', { defaultValue: 'Saved successfully' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, pdfFile, toast, t])

  const clearAll = useCallback(async () => {
    const ok = await confirm({
      title: t('common.clearConfirmTitle', { defaultValue: 'Clear content' }),
      message: t('common.clearConfirmMsg', { defaultValue: 'This will clear all content.' }),
      confirmText: t('common.confirm', { defaultValue: 'Confirm' }),
      cancelText: t('common.cancel', { defaultValue: 'Cancel' }),
      danger: true,
    })
    if (!ok) return
    resultsRef.current.forEach((r) => { if (r.url) URL.revokeObjectURL(r.url) })
    pdfRef.current?.destroy()
    pdfRef.current = null
    setResults([])
    setPdfFile(null)
    setPageCount(0)
    lastParamsRef.current = null
  }, [confirm, t])

  return (
    <div className="relative">
      {/* Drop zone */}
      {!pdfFile && (
        <div
          className={`mb-4 flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-bg-elevated/30 p-8 transition-colors ${isDragging ? 'border-primary bg-primary/5' : 'border-border-subtle hover:border-border-base hover:bg-bg-elevated/50'}`}
          {...dragHandlers}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mb-3 h-10 w-10 text-text-disabled" />
          <p className="text-sm text-text-secondary">{t('modules.pdfToolkit.ui.dropPdf', { defaultValue: 'Drop a PDF here or click to upload' })}</p>
          <p className="mt-1 text-xs text-text-muted">{t('modules.pdfToolkit.ui.dropPdfHint', { defaultValue: 'Render PDF pages to PNG, JPEG or WebP images — 100% local' })}</p>
          <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFileChange} />
        </div>
      )}

      {loadError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-xs text-error">
          <AlertCircle className="h-4 w-4 shrink-0" /> {loadError}
        </div>
      )}

      {/* File info + controls */}
      {pdfFile && (
        <>
          <div className="mb-3 flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-elevated/50 px-4 py-2.5">
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate text-xs font-medium text-text-primary" title={pdfFile.name}>{pdfFile.name}</span>
            <span className="shrink-0 text-[11px] text-text-muted">{t('modules.pdfToolkit.ui.statsPages', { defaultValue: '{{count}} pages', count: pageCount })} · {formatBytes(pdfFile.size)}</span>
            <div className="flex-1" />
            <button onClick={() => fileInputRef.current?.click()} className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary">
              {t('modules.pdfToolkit.ui.changeFile', { defaultValue: 'Change file' })}
            </button>
            <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFileChange} />
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-border-subtle bg-bg-elevated/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-secondary">{t('modules.pdfToolkit.ui.outputLabel', { defaultValue: 'Format' })}</label>
              <select value={format} onChange={(e) => setFormat(e.target.value as OutputFormat)} className="cursor-pointer rounded border border-border-base bg-bg-base px-2 py-1 text-xs text-text-primary focus:border-border-focus focus:outline-none">
                {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-secondary">{t('modules.pdfToolkit.ui.scaleLabel', { defaultValue: 'Resolution' })}</label>
              <select value={scale} onChange={(e) => setScale(parseFloat(e.target.value))} className="cursor-pointer rounded border border-border-base bg-bg-base px-2 py-1 text-xs text-text-primary focus:border-border-focus focus:outline-none">
                {SCALES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-secondary">{t('modules.pdfToolkit.ui.rangeLabel', { defaultValue: 'Pages' })}</label>
              <select value={rangeMode} onChange={(e) => setRangeMode(e.target.value as 'all' | 'custom')} className="cursor-pointer rounded border border-border-base bg-bg-base px-2 py-1 text-xs text-text-primary focus:border-border-focus focus:outline-none">
                <option value="all">{t('modules.pdfToolkit.ui.rangeAll', { defaultValue: 'All' })}</option>
                <option value="custom">{t('modules.pdfToolkit.ui.rangeCustom', { defaultValue: 'Custom' })}</option>
              </select>
              {rangeMode === 'custom' && (
                <input value={rangeText} onChange={(e) => setRangeText(e.target.value)} placeholder="1-3,5" className="w-24 rounded border border-border-base bg-bg-base px-2 py-1 text-xs text-text-primary focus:border-border-focus focus:outline-none" />
              )}
            </div>
            {(format === 'image/jpeg' || format === 'image/webp') && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-text-secondary">{t('modules.pdfToolkit.ui.qualityLabel', { defaultValue: 'Quality' })}</label>
                <input type="range" min="10" max="100" value={quality} onChange={(e) => setQuality(parseInt(e.target.value))} className="w-24" />
                <span className="w-8 text-right text-xs text-text-muted">{quality}%</span>
              </div>
            )}
            {paramsChanged && !progress && (
              <button onClick={reRender} className="flex cursor-pointer items-center gap-1 rounded-md bg-yellow-500/10 px-2 py-1 text-xs text-yellow-600 hover:bg-yellow-500/20 dark:text-yellow-400">
                <RotateCcw className="h-3.5 w-3.5" /> {t('modules.pdfToolkit.ui.reconvertBtn', { defaultValue: 'Re-render' })}
              </button>
            )}
            <div className="flex-1" />
            {doneItems.length > 0 && (
              <div className="flex items-center gap-2">
                <button onClick={downloadAll} className="flex cursor-pointer items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20">
                  <Download className="h-3.5 w-3.5" /> {t('modules.pdfToolkit.ui.downloadAllBtn', { defaultValue: 'Download all' })}
                </button>
                <button onClick={clearAll} className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-text-muted hover:text-error">
                  <X className="h-3.5 w-3.5" /> {t('common.clear', { defaultValue: 'Clear' })}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Landing features */}
      {!pdfFile && !loadError && (
        <div className="pointer-events-none mt-12 select-none">
          <div className="grid grid-cols-2 gap-x-8 gap-y-5 lg:grid-cols-4">
            {[
              { Icon: Shield, title: t('modules.pdfToolkit.ui.featureLocalTitle', { defaultValue: 'Fully local' }), desc: t('modules.pdfToolkit.ui.featureLocalDesc', { defaultValue: 'Files never leave your computer — no uploads, zero privacy risk' }) },
              { Icon: Layers, title: t('modules.pdfToolkit.ui.featureBatchTitle', { defaultValue: 'Batch pages' }), desc: t('modules.pdfToolkit.ui.featureBatchDesc', { defaultValue: 'Render all pages or a custom range in one pass' }) },
              { Icon: RefreshCw, title: t('modules.pdfToolkit.ui.featureFormatTitle', { defaultValue: 'Multiple formats' }), desc: t('modules.pdfToolkit.ui.featureFormatDesc', { defaultValue: 'Export to PNG, JPEG or WebP with adjustable resolution' }) },
              { Icon: ZoomIn, title: t('modules.pdfToolkit.ui.featureQualityTitle', { defaultValue: 'Quality control' }), desc: t('modules.pdfToolkit.ui.featureQualityDesc', { defaultValue: 'Tune scale and quality to balance clarity and file size' }) },
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

      {/* Results grid */}
      {results.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {results.map((item) => (
            <PageThumb
              key={item.id}
              url={item.url}
              title={t('modules.pdfToolkit.ui.pageLabel', { defaultValue: 'Page {{num}}', num: item.pageNum })}
              subtitle={item.size !== null ? formatBytes(item.size) : undefined}
              status={item.status}
              error={item.error}
              onDownload={item.status === 'done' ? () => downloadItem(item) : undefined}
              onRemove={() => removeItem(item.id)}
            />
          ))}
        </div>
      )}

      {/* Floating progress */}
      {progress && progress.done < progress.total && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 w-72 -translate-x-1/2">
          <div className="rounded-xl border border-border-subtle bg-bg-elevated/95 p-3 shadow-lg shadow-black/20 backdrop-blur-sm">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-text-secondary">{t('modules.pdfToolkit.ui.progressLabel', { defaultValue: 'Rendering {{done}}/{{total}}', done: progress.done, total: progress.total })}</span>
              <span className="text-text-muted">{progress.total - progress.done} {t('modules.pdfToolkit.ui.progressRemaining', { defaultValue: 'remaining' })}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-bg-hover">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Floating params-changed pill */}
      {paramsChanged && !progress && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
          <button onClick={reRender} className="flex cursor-pointer items-center gap-2.5 rounded-full border border-yellow-500/30 bg-bg-elevated/95 px-4 py-2 shadow-lg shadow-black/20 backdrop-blur-sm transition-colors hover:border-yellow-500/50 hover:bg-bg-elevated">
            <AlertCircle size={14} className="shrink-0 text-yellow-400" />
            <span className="text-xs text-text-secondary">{t('modules.pdfToolkit.ui.paramsChanged', { defaultValue: 'Settings changed — click to re-render' })}</span>
            <RotateCcw size={12} className="text-yellow-500" />
          </button>
        </div>
      )}
    </div>
  )
}