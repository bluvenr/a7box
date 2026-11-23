/**
 * PDF Toolkit — Image → PDF panel
 * Drop multiple images, reorder them, and combine into a single PDF via pdf-lib.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, X, Shield, Layers, RefreshCw, ZoomIn, ArrowUp, ArrowDown, FileText, Loader2 } from 'lucide-react'
import { useToast } from '../../../components/Toast'
import { useConfirm } from '../../../components/Dialog'
import { usePageActive } from '../../../app/layouts/CachedOutlet'
import { useNativeFileDrop } from '../useNativePdfDrop'
import { imagesToPdf } from '../pdfEngine'
import { saveBlob } from '../save'
import { type ImageItem, type PageSize, PAGE_SIZES, formatBytes, baseName } from '../utils'

export default function ToPdfPanel() {
  const { t } = useTranslation()
  const pageActive = usePageActive()
  const toast = useToast()
  const confirm = useConfirm()

  const [items, setItems] = useState<ImageItem[]>([])
  const [pageSize, setPageSize] = useState<PageSize>('fit')
  const [margin, setMargin] = useState(0)
  const [busy, setBusy] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const itemsRef = useRef<ImageItem[]>([])
  itemsRef.current = items
  const busyRef = useRef(false)

  useEffect(() => {
    return () => { itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url)) }
  }, [])

  const addFiles = useCallback((files: File[]) => {
    const newItems: ImageItem[] = files.map((file) => ({
      id: crypto.randomUUID(), file, url: URL.createObjectURL(file),
    }))
    setItems((prev) => [...prev, ...newItems])
  }, [])

  const { isDragging, dragHandlers } = useNativeFileDrop({ kind: 'image', onFiles: addFiles, active: pageActive })

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length) addFiles(files)
    e.target.value = ''
  }, [addFiles])

  const move = useCallback((id: string, dir: -1 | 1) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === id)
      const target = idx + dir
      if (idx < 0 || target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id)
      if (item) URL.revokeObjectURL(item.url)
      return prev.filter((i) => i.id !== id)
    })
  }, [])

  const buildPdf = useCallback(async () => {
    if (busyRef.current || itemsRef.current.length === 0) return
    busyRef.current = true
    setBusy(true)
    try {
      const bytes = await imagesToPdf(itemsRef.current.map((i) => i.file), { pageSize, margin })
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const name = `${baseName(itemsRef.current[0].file.name)}${itemsRef.current.length > 1 ? '_combined' : ''}.pdf`
      const ok = await saveBlob(blob, name)
      if (ok) toast(t('modules.pdfToolkit.ui.toastDownloaded', { defaultValue: 'Saved successfully' }))
    } catch (e) {
      toast((e as Error).message || t('modules.pdfToolkit.ui.errorInvalidPdf', { defaultValue: 'Failed to open PDF — the file may be corrupted' }), 'error')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [pageSize, margin, toast, t])

  const clearAll = useCallback(async () => {
    const ok = await confirm({
      title: t('common.clearConfirmTitle', { defaultValue: 'Clear content' }),
      message: t('common.clearConfirmMsg', { defaultValue: 'This will clear all content.' }),
      confirmText: t('common.confirm', { defaultValue: 'Confirm' }),
      cancelText: t('common.cancel', { defaultValue: 'Cancel' }),
      danger: true,
    })
    if (!ok) return
    itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url))
    setItems([])
  }, [confirm, t])

  return (
    <div className="relative">
      {/* Drop zone */}
      <div
        className={`mb-4 flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-bg-elevated/30 p-8 transition-colors ${isDragging ? 'border-primary bg-primary/5' : 'border-border-subtle hover:border-border-base hover:bg-bg-elevated/50'}`}
        {...dragHandlers}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="mb-3 h-10 w-10 text-text-disabled" />
        <p className="text-sm text-text-secondary">{t('modules.pdfToolkit.ui.dropImages', { defaultValue: 'Drop images here or click to upload' })}</p>
        <p className="mt-1 text-xs text-text-muted">{t('modules.pdfToolkit.ui.dropImagesHint', { defaultValue: 'Combine PNG, JPEG, WebP and more into a single PDF — 100% local' })}</p>
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
      </div>

      {/* Controls */}
      {items.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-border-subtle bg-bg-elevated/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary">{t('modules.pdfToolkit.ui.pageSizeLabel', { defaultValue: 'Page size' })}</label>
            <select value={pageSize} onChange={(e) => setPageSize(e.target.value as PageSize)} className="cursor-pointer rounded border border-border-base bg-bg-base px-2 py-1 text-xs text-text-primary focus:border-border-focus focus:outline-none">
              {PAGE_SIZES.map((p) => <option key={p.value} value={p.value}>{t(p.labelKey, { defaultValue: p.value })}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary">{t('modules.pdfToolkit.ui.marginLabel', { defaultValue: 'Margin' })}</label>
            <input type="number" min="0" max="200" value={margin} onChange={(e) => setMargin(Math.max(0, parseInt(e.target.value) || 0))} className="w-16 rounded border border-border-base bg-bg-base px-2 py-1 text-xs text-text-primary focus:border-border-focus focus:outline-none" />
            <span className="text-xs text-text-muted">pt</span>
          </div>
          <span className="text-[11px] text-text-muted">{t('modules.pdfToolkit.ui.statsCount', { defaultValue: '{{count}} images', count: items.length })}</span>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <button onClick={buildPdf} disabled={busy} className="flex cursor-pointer items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              {t('modules.pdfToolkit.ui.downloadBtn', { defaultValue: 'Create PDF' })}
            </button>
            <button onClick={clearAll} className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-text-muted hover:text-error">
              <X className="h-3.5 w-3.5" /> {t('common.clear', { defaultValue: 'Clear' })}
            </button>
          </div>
        </div>
      )}

      {/* Landing features */}
      {items.length === 0 && (
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

      {/* Image list (reorderable) */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {items.map((item, idx) => (
            <div key={item.id} className="group overflow-hidden rounded-lg border border-border-subtle bg-bg-elevated transition-colors hover:border-primary/40">
              <div className="relative flex h-40 items-center justify-center overflow-hidden bg-bg-base">
                <img src={item.url} alt={item.file.name} className="max-h-full max-w-full object-contain" draggable={false} />
                <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{idx + 1}</span>
                <button
                  onClick={() => removeItem(item.id)}
                  className="absolute right-1 top-1 cursor-pointer rounded-full bg-black/60 p-1 text-white/80 opacity-0 transition-opacity hover:!opacity-100 hover:text-white group-hover:opacity-70"
                  title={t('common.delete', { defaultValue: 'Delete' })}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-center justify-between gap-1 p-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-text-primary" title={item.file.name}>{item.file.name}</p>
                  <p className="truncate text-[10px] text-text-muted">{formatBytes(item.file.size)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button onClick={() => move(item.id, -1)} disabled={idx === 0} className="cursor-pointer rounded-md bg-bg-hover p-1.5 text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30" title={t('modules.pdfToolkit.ui.moveUp', { defaultValue: 'Move up' })}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => move(item.id, 1)} disabled={idx === items.length - 1} className="cursor-pointer rounded-md bg-bg-hover p-1.5 text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30" title={t('modules.pdfToolkit.ui.moveDown', { defaultValue: 'Move down' })}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}