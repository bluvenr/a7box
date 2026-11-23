/**
 * PDF Toolkit — Merge / Split panel
 * Merge: combine ordered PDFs into one. Split: one PDF into many by page groups.
 */

import { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, Download, X, AlertCircle, ArrowUp, ArrowDown, FileText, Loader2, Combine, Scissors } from 'lucide-react'
import { useToast } from '../../../components/Toast'
import { useConfirm } from '../../../components/Dialog'
import { usePageActive } from '../../../app/layouts/CachedOutlet'
import { useNativeFileDrop } from '../useNativePdfDrop'
import { getPdfInfo, mergePdfs, splitPdf } from '../pdfEngine'
import { saveBlob, saveMany } from '../save'
import { type PdfItem, formatBytes, baseName, parsePageGroups, chunkPages } from '../utils'

type Mode = 'merge' | 'split'
type SplitStrategy = 'range' | 'each' | 'everyN'

export default function MergeSplitPanel() {
  const { t } = useTranslation()
  const pageActive = usePageActive()
  const toast = useToast()
  const confirm = useConfirm()

  const [mode, setMode] = useState<Mode>('merge')
  const [items, setItems] = useState<PdfItem[]>([])
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  // split controls
  const [strategy, setStrategy] = useState<SplitStrategy>('range')
  const [rangeText, setRangeText] = useState('')
  const [everyN, setEveryN] = useState(2)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const itemsRef = useRef<PdfItem[]>([])
  itemsRef.current = items
  const busyRef = useRef(false)

  const addFiles = useCallback(async (files: File[]) => {
    setLoadError('')
    const loaded: PdfItem[] = []
    for (const file of files) {
      try {
        const info = await getPdfInfo(file)
        loaded.push({ id: crypto.randomUUID(), file, pageCount: info.pageCount })
      } catch (e) {
        const err = e as { name?: string }
        setLoadError(err?.name === 'PasswordException'
          ? t('modules.pdfToolkit.ui.errorEncrypted', { defaultValue: 'This PDF is password-protected and cannot be opened' })
          : t('modules.pdfToolkit.ui.errorInvalidPdf', { defaultValue: 'Failed to open PDF — the file may be corrupted' }))
      }
    }
    if (loaded.length) {
      // split accepts a single PDF; merge appends
      setItems((prev) => mode === 'split' ? loaded.slice(0, 1) : [...prev, ...loaded])
    }
  }, [mode, t])

  const { isDragging, dragHandlers } = useNativeFileDrop({ kind: 'pdf', onFiles: (f) => addFiles(f), active: pageActive })

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length) addFiles(files)
    e.target.value = ''
  }, [addFiles])

  const switchMode = useCallback((m: Mode) => {
    setMode(m)
    setItems([])
    setLoadError('')
  }, [])

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
    setItems((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const doMerge = useCallback(async () => {
    if (busyRef.current || itemsRef.current.length < 2) return
    busyRef.current = true
    setBusy(true)
    try {
      const bytes = await mergePdfs(itemsRef.current.map((i) => i.file))
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const ok = await saveBlob(blob, `${baseName(itemsRef.current[0].file.name)}_merged.pdf`)
      if (ok) toast(t('modules.pdfToolkit.ui.toastMerged', { defaultValue: 'Merged {{count}} PDFs', count: itemsRef.current.length }))
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [toast, t])

  const doSplit = useCallback(async () => {
    const item = itemsRef.current[0]
    if (busyRef.current || !item || !item.pageCount) return
    const max = item.pageCount
    let groups: number[][] = []
    if (strategy === 'range') groups = parsePageGroups(rangeText, max)
    else if (strategy === 'each') groups = chunkPages(max, 1)
    else groups = chunkPages(max, everyN)
    if (groups.length === 0) {
      toast(t('modules.pdfToolkit.ui.errorRange', { defaultValue: 'Invalid page range' }), 'error')
      return
    }
    busyRef.current = true
    setBusy(true)
    try {
      const parts = await splitPdf(item.file, groups)
      const base = baseName(item.file.name)
      const blobs = parts.map((bytes, i) => ({
        blob: new Blob([bytes], { type: 'application/pdf' }),
        name: `${base}_part${i + 1}.pdf`,
      }))
      const ok = await saveMany(blobs)
      if (ok) toast(t('modules.pdfToolkit.ui.toastSplit', { defaultValue: 'Split into {{count}} PDFs', count: blobs.length }))
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [strategy, rangeText, everyN, toast, t])

  const clearAll = useCallback(async () => {
    const ok = await confirm({
      title: t('common.clearConfirmTitle', { defaultValue: 'Clear content' }),
      message: t('common.clearConfirmMsg', { defaultValue: 'This will clear all content.' }),
      confirmText: t('common.confirm', { defaultValue: 'Confirm' }),
      cancelText: t('common.cancel', { defaultValue: 'Cancel' }),
      danger: true,
    })
    if (!ok) return
    setItems([])
    setLoadError('')
  }, [confirm, t])

  const canAct = mode === 'merge' ? items.length >= 2 : items.length === 1

  return (
    <div className="relative">
      {/* Sub-mode switch */}
      <div className="mb-4 inline-flex rounded-lg border border-border-subtle bg-bg-elevated/50 p-1">
        {([['merge', Combine, t('modules.pdfToolkit.ui.mergeMode', { defaultValue: 'Merge' })], ['split', Scissors, t('modules.pdfToolkit.ui.splitMode', { defaultValue: 'Split' })]] as const).map(([m, Icon, label]) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={`flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${mode === m ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-bg-hover'}`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Drop zone */}
      <div
        className={`mb-4 flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-bg-elevated/30 p-8 transition-colors ${isDragging ? 'border-primary bg-primary/5' : 'border-border-subtle hover:border-border-base hover:bg-bg-elevated/50'}`}
        {...dragHandlers}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="mb-3 h-10 w-10 text-text-disabled" />
        <p className="text-sm text-text-secondary">{t('modules.pdfToolkit.ui.dropPdf', { defaultValue: 'Drop a PDF here or click to upload' })}</p>
        <p className="mt-1 text-xs text-text-muted">
          {mode === 'merge'
            ? t('modules.pdfToolkit.ui.mergeHint', { defaultValue: 'Drop multiple PDFs and reorder them to merge into one' })
            : t('modules.pdfToolkit.ui.splitHint', { defaultValue: 'Drop one PDF and split it into multiple files by page' })}
        </p>
        <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" multiple={mode === 'merge'} className="hidden" onChange={handleFileChange} />
      </div>

      {loadError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-xs text-error">
          <AlertCircle className="h-4 w-4 shrink-0" /> {loadError}
        </div>
      )}

      {/* Split controls */}
      {mode === 'split' && items.length === 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-border-subtle bg-bg-elevated/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary">{t('modules.pdfToolkit.ui.splitByLabel', { defaultValue: 'Split by' })}</label>
            <select value={strategy} onChange={(e) => setStrategy(e.target.value as SplitStrategy)} className="cursor-pointer rounded border border-border-base bg-bg-base px-2 py-1 text-xs text-text-primary focus:border-border-focus focus:outline-none">
              <option value="range">{t('modules.pdfToolkit.ui.splitByRange', { defaultValue: 'Custom ranges' })}</option>
              <option value="each">{t('modules.pdfToolkit.ui.splitEachPage', { defaultValue: 'Every page' })}</option>
              <option value="everyN">{t('modules.pdfToolkit.ui.splitEveryN', { defaultValue: 'Every N pages' })}</option>
            </select>
          </div>
          {strategy === 'range' && (
            <input value={rangeText} onChange={(e) => setRangeText(e.target.value)} placeholder="1-3,4-6" className="w-32 rounded border border-border-base bg-bg-base px-2 py-1 text-xs text-text-primary focus:border-border-focus focus:outline-none" />
          )}
          {strategy === 'everyN' && (
            <div className="flex items-center gap-2">
              <input type="number" min="1" max={items[0].pageCount ?? 1} value={everyN} onChange={(e) => setEveryN(Math.max(1, parseInt(e.target.value) || 1))} className="w-16 rounded border border-border-base bg-bg-base px-2 py-1 text-xs text-text-primary focus:border-border-focus focus:outline-none" />
              <span className="text-xs text-text-muted">{t('modules.pdfToolkit.ui.pagesUnit', { defaultValue: 'pages / file' })}</span>
            </div>
          )}
        </div>
      )}

      {/* Action bar */}
      {items.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border-subtle bg-bg-elevated/50 px-4 py-2.5">
          <span className="text-[11px] text-text-muted">{t('modules.pdfToolkit.ui.statsCount', { defaultValue: '{{count}} images', count: items.length })}</span>
          <div className="flex-1" />
          <button onClick={mode === 'merge' ? doMerge : doSplit} disabled={!canAct || busy} className="flex cursor-pointer items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {mode === 'merge'
              ? t('modules.pdfToolkit.ui.mergeBtn', { defaultValue: 'Merge & download' })
              : t('modules.pdfToolkit.ui.splitBtn', { defaultValue: 'Split & download' })}
          </button>
          <button onClick={clearAll} className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-text-muted hover:text-error">
            <X className="h-3.5 w-3.5" /> {t('common.clear', { defaultValue: 'Clear' })}
          </button>
        </div>
      )}

      {/* PDF list */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={item.id} className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-elevated px-4 py-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-bg-hover text-[11px] font-medium text-text-secondary">{idx + 1}</span>
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate text-xs font-medium text-text-primary" title={item.file.name}>{item.file.name}</span>
              <span className="shrink-0 text-[11px] text-text-muted">
                {item.pageCount !== null ? t('modules.pdfToolkit.ui.statsPages', { defaultValue: '{{count}} pages', count: item.pageCount }) : '…'} · {formatBytes(item.file.size)}
              </span>
              <div className="flex-1" />
              {mode === 'merge' && (
                <div className="flex shrink-0 items-center gap-0.5">
                  <button onClick={() => move(item.id, -1)} disabled={idx === 0} className="cursor-pointer rounded-md bg-bg-hover p-1.5 text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30" title={t('modules.pdfToolkit.ui.moveUp', { defaultValue: 'Move up' })}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => move(item.id, 1)} disabled={idx === items.length - 1} className="cursor-pointer rounded-md bg-bg-hover p-1.5 text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30" title={t('modules.pdfToolkit.ui.moveDown', { defaultValue: 'Move down' })}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <button onClick={() => removeItem(item.id)} className="shrink-0 cursor-pointer rounded-md p-1.5 text-text-muted hover:text-error" title={t('common.delete', { defaultValue: 'Delete' })}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}