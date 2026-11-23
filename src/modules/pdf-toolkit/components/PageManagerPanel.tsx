/**
 * PDF Toolkit — Page Manager panel
 * Drop a PDF, render page thumbnails, then reorder / rotate / delete pages and
 * export a rebuilt PDF via pdf-lib.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, Download, X, AlertCircle, RotateCw, RotateCcw, ArrowLeft, ArrowRight, FileText, Loader2 } from 'lucide-react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useToast } from '../../../components/Toast'
import { useConfirm } from '../../../components/Dialog'
import { usePageActive } from '../../../app/layouts/CachedOutlet'
import { useNativeFileDrop } from '../useNativePdfDrop'
import { loadPdf, renderPageToBlob, applyPageOps, type PageOp } from '../pdfEngine'
import { saveBlob } from '../save'
import { type ManagedPage, formatBytes, baseName } from '../utils'
import { PageThumb } from './PageThumb'

const THUMB_SCALE = 0.6

export default function PageManagerPanel() {
  const { t } = useTranslation()
  const pageActive = usePageActive()
  const toast = useToast()
  const confirm = useConfirm()

  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pages, setPages] = useState<ManagedPage[]>([])
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ total: number; done: number } | null>(null)

  const pdfRef = useRef<PDFDocumentProxy | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pagesRef = useRef<ManagedPage[]>([])
  pagesRef.current = pages
  const busyRef = useRef(false)

  useEffect(() => {
    return () => {
      pagesRef.current.forEach((p) => { if (p.url) URL.revokeObjectURL(p.url) })
      pdfRef.current?.destroy()
      pdfRef.current = null
    }
  }, [])

  const renderThumbs = useCallback(async (pdf: PDFDocumentProxy) => {
    const skeleton: ManagedPage[] = Array.from({ length: pdf.numPages }, (_, i) => ({
      id: `${i}-${crypto.randomUUID()}`, originalIndex: i, rotation: 0, url: null, status: 'rendering',
    }))
    setPages(skeleton)
    setProgress({ total: skeleton.length, done: 0 })
    for (let i = 0; i < skeleton.length; i++) {
      const item = skeleton[i]
      try {
        const blob = await renderPageToBlob(pdf, item.originalIndex + 1, THUMB_SCALE, 'image/png', 1)
        const url = URL.createObjectURL(blob)
        setPages((prev) => prev.map((p) => p.id === item.id ? { ...p, url, status: 'done' } : p))
      } catch {
        setPages((prev) => prev.map((p) => p.id === item.id ? { ...p, status: 'error' } : p))
      }
      setProgress({ total: skeleton.length, done: i + 1 })
    }
    setTimeout(() => setProgress(null), 1000)
  }, [])

  const loadFile = useCallback(async (file: File) => {
    pagesRef.current.forEach((p) => { if (p.url) URL.revokeObjectURL(p.url) })
    pdfRef.current?.destroy()
    pdfRef.current = null
    setPages([])
    setLoadError('')
    setPdfFile(file)
    try {
      const pdf = await loadPdf(file)
      pdfRef.current = pdf
      await renderThumbs(pdf)
    } catch (e) {
      const err = e as { name?: string }
      setPdfFile(null)
      setLoadError(err?.name === 'PasswordException'
        ? t('modules.pdfToolkit.ui.errorEncrypted', { defaultValue: 'This PDF is password-protected and cannot be opened' })
        : t('modules.pdfToolkit.ui.errorInvalidPdf', { defaultValue: 'Failed to open PDF — the file may be corrupted' }))
    }
  }, [renderThumbs, t])

  const { isDragging, dragHandlers } = useNativeFileDrop({ kind: 'pdf', onFiles: (f) => loadFile(f[0]), active: pageActive })

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) loadFile(f)
    e.target.value = ''
  }, [loadFile])

  const rotate = useCallback((id: string, dir: -1 | 1) => {
    setPages((prev) => prev.map((p) => p.id === id ? { ...p, rotation: p.rotation + dir * 90 } : p))
  }, [])

  const removePage = useCallback((id: string) => {
    setPages((prev) => {
      const item = prev.find((p) => p.id === id)
      if (item?.url) URL.revokeObjectURL(item.url)
      return prev.filter((p) => p.id !== id)
    })
  }, [])

  const move = useCallback((id: string, dir: -1 | 1) => {
    setPages((prev) => {
      const idx = prev.findIndex((p) => p.id === id)
      const target = idx + dir
      if (idx < 0 || target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }, [])

  const apply = useCallback(async () => {
    if (busyRef.current || !pdfFile || pagesRef.current.length === 0) return
    busyRef.current = true
    setBusy(true)
    try {
      const ops: PageOp[] = pagesRef.current.map((p) => ({ from: p.originalIndex, rotation: p.rotation }))
      const bytes = await applyPageOps(pdfFile, ops)
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const ok = await saveBlob(blob, `${baseName(pdfFile.name)}_edited.pdf`)
      if (ok) toast(t('modules.pdfToolkit.ui.toastApplied', { defaultValue: 'Saved {{count}} pages', count: ops.length }))
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [pdfFile, toast, t])

  const clearAll = useCallback(async () => {
    const ok = await confirm({
      title: t('common.clearConfirmTitle', { defaultValue: 'Clear content' }),
      message: t('common.clearConfirmMsg', { defaultValue: 'This will clear all content.' }),
      confirmText: t('common.confirm', { defaultValue: 'Confirm' }),
      cancelText: t('common.cancel', { defaultValue: 'Cancel' }),
      danger: true,
    })
    if (!ok) return
    pagesRef.current.forEach((p) => { if (p.url) URL.revokeObjectURL(p.url) })
    pdfRef.current?.destroy()
    pdfRef.current = null
    setPages([])
    setPdfFile(null)
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
          <p className="mt-1 text-xs text-text-muted">{t('modules.pdfToolkit.ui.pagesHint', { defaultValue: 'Reorder, rotate or delete pages, then export a new PDF — 100% local' })}</p>
          <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFileChange} />
        </div>
      )}

      {loadError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-xs text-error">
          <AlertCircle className="h-4 w-4 shrink-0" /> {loadError}
        </div>
      )}

      {/* File info + action bar */}
      {pdfFile && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border-subtle bg-bg-elevated/50 px-4 py-2.5">
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-xs font-medium text-text-primary" title={pdfFile.name}>{pdfFile.name}</span>
          <span className="shrink-0 text-[11px] text-text-muted">{t('modules.pdfToolkit.ui.statsPages', { defaultValue: '{{count}} pages', count: pages.length })} · {formatBytes(pdfFile.size)}</span>
          <div className="flex-1" />
          <button onClick={() => fileInputRef.current?.click()} className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary">
            {t('modules.pdfToolkit.ui.changeFile', { defaultValue: 'Change file' })}
          </button>
          <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFileChange} />
          <button onClick={apply} disabled={busy || pages.length === 0} className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {t('modules.pdfToolkit.ui.applyBtn', { defaultValue: 'Apply & download' })}
          </button>
          <button onClick={clearAll} className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-text-muted hover:text-error">
            <X className="h-3.5 w-3.5" /> {t('common.clear', { defaultValue: 'Clear' })}
          </button>
        </div>
      )}

      {/* Page grid */}
      {pages.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {pages.map((page, idx) => (
            <PageThumb
              key={page.id}
              url={page.url}
              title={t('modules.pdfToolkit.ui.pageLabel', { defaultValue: 'Page {{num}}', num: idx + 1 })}
              subtitle={page.rotation % 360 !== 0 ? `${((page.rotation % 360) + 360) % 360}°` : undefined}
              status={page.status === 'done' ? 'done' : page.status === 'error' ? 'error' : 'rendering'}
              rotation={page.rotation}
              onRemove={() => removePage(page.id)}
              actions={
                <>
                  <button onClick={() => move(page.id, -1)} disabled={idx === 0} className="cursor-pointer rounded-md bg-bg-hover p-1.5 text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30" title={t('modules.pdfToolkit.ui.moveUp', { defaultValue: 'Move up' })}>
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => move(page.id, 1)} disabled={idx === pages.length - 1} className="cursor-pointer rounded-md bg-bg-hover p-1.5 text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30" title={t('modules.pdfToolkit.ui.moveDown', { defaultValue: 'Move down' })}>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => rotate(page.id, -1)} className="cursor-pointer rounded-md bg-bg-hover p-1.5 text-text-secondary hover:text-text-primary" title={t('modules.pdfToolkit.ui.rotateCcw', { defaultValue: 'Rotate left' })}>
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => rotate(page.id, 1)} className="cursor-pointer rounded-md bg-bg-hover p-1.5 text-text-secondary hover:text-text-primary" title={t('modules.pdfToolkit.ui.rotateCw', { defaultValue: 'Rotate right' })}>
                    <RotateCw className="h-3.5 w-3.5" />
                  </button>
                </>
              }
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
    </div>
  )
}