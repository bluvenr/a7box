/**
 * Base64 Tool Main Component
 * Text encode/decode, file to base64, base64 to file download
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Binary, ArrowLeftRight, Copy, Upload, Download, X, File, Trash2, Keyboard } from 'lucide-react'
import { useConfirm } from '../../components/Dialog'
import { usePageActive } from '../../app/layouts/CachedOutlet'
import { formatPlainShortcuts, isTauri } from '../../shared/utils'
import {
  type ImportedFile,
  encodeText, decodeText, formatBytes,
  detectImageMime, detectFileExt, bytesToBase64, isTextFile,
} from './utils'

export default function Base64Tool() {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [importedFile, setImportedFile] = useState<ImportedFile | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastInputRef = useRef<{ input: string; action: 'encode' | 'decode' } | null>(null)
  const confirm = useConfirm()
  const pageActive = usePageActive()

  // Stable refs for keyboard shortcuts (avoid re-registering listener on every keystroke)
  const encodeRef = useRef<() => void>(() => {})
  const decodeRef = useRef<() => void>(() => {})

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2000)
  }, [])

  // Output staleness detection
  const isOutputStale = output && lastInputRef.current && input !== lastInputRef.current.input

  const handleEncode = useCallback(() => {
    setError('')
    setImportedFile(null)
    try {
      if (!input) { setOutput(''); return }
      const result = encodeText(input)
      setOutput(result)
      lastInputRef.current = { input, action: 'encode' }
    } catch (e) {
      setError((e as Error).message)
    }
  }, [input])

  const handleDecode = useCallback(() => {
    setError('')
    setImportedFile(null)
    try {
      if (!input) { setOutput(''); return }
      const result = decodeText(input)
      setOutput(result)
      lastInputRef.current = { input, action: 'decode' }
    } catch (e) {
      setError(t('modules.base64Tool.ui.invalidBase64', { msg: (e as Error).message }))
    }
  }, [input, t])

  // Keep refs in sync
  encodeRef.current = handleEncode
  decodeRef.current = handleDecode

  const handleSwap = () => {
    setInput(output)
    setOutput('')
    setError('')
    setImportedFile(null)
    lastInputRef.current = null
  }

  const handleClear = useCallback(async () => {
    if (!input && !output && !importedFile) return
    const ok = await confirm({
      title: t('common.clearConfirmTitle', { defaultValue: 'Clear content' }),
      message: t('common.clearConfirmMsg', { defaultValue: 'This will clear all content.' }),
      confirmText: t('common.confirm', { defaultValue: 'Confirm' }),
      cancelText: t('common.cancel', { defaultValue: 'Cancel' }),
      danger: true,
    })
    if (!ok) return
    setInput('')
    setOutput('')
    setError('')
    setImportedFile(null)
    lastInputRef.current = null
  }, [input, output, importedFile, confirm, t])

  const handleCopy = async () => {
    if (!output) return
    await navigator.clipboard.writeText(output)
    showToast(t('common.copiedToClipboard'))
  }

  /** Open file dialog and import as Base64 (Tauri native or browser fallback) */
  const handleOpenFileDialog = useCallback(async () => {
    if (isTauri()) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog')
        const { readFile, readTextFile: tauriReadText } = await import('@tauri-apps/plugin-fs')
        const filePath = await open({ multiple: false })
        if (filePath) {
          const fileName = filePath.split(/[\\/]/).pop() || 'file'
          if (isTextFile(fileName)) {
            // Text file → read as text and auto-encode
            const text = await tauriReadText(filePath)
            setInput(text)
            setError('')
            setImportedFile(null)
            try {
              const result = encodeText(text)
              setOutput(result)
              lastInputRef.current = { input: text, action: 'encode' }
              showToast(`${fileName} → Base64 (${formatBytes(result.length)})`)
            } catch (e) {
              setError((e as Error).message)
              setOutput('')
              lastInputRef.current = null
            }
          } else {
            // Binary file → convert to Base64
            const bytes = await readFile(filePath)
            const base64 = bytesToBase64(bytes)
            const mime = detectImageMime(base64) || 'application/octet-stream'
            setInput('')
            setOutput(base64)
            setImportedFile({ name: fileName, mime })
            lastInputRef.current = null
            showToast(`${fileName} → Base64 (${formatBytes(base64.length)})`)
          }
        }
        return
      } catch { /* fallback to HTML input */ }
    }
    // Browser fallback: trigger hidden file input
    fileInputRef.current?.click()
  }, [showToast])

  /** Import file as Base64 from browser File object (drag-drop or hidden input fallback) */
  const handleFileToBase64 = useCallback(async (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      setInput('')
      setOutput(base64)
      setImportedFile({ name: file.name, mime: file.type || 'application/octet-stream' })
      lastInputRef.current = null
      showToast(`${file.name} → Base64 (${formatBytes(base64.length)})`)
    }
    reader.readAsDataURL(file)
  }, [showToast])

  /** Import text file: read into input and auto-encode to Base64 output */
  const handleTextFileDrop = useCallback(async (file: File) => {
    const text = await file.text()
    setInput(text)
    setError('')
    setImportedFile(null)
    try {
      const result = encodeText(text)
      setOutput(result)
      lastInputRef.current = { input: text, action: 'encode' }
      showToast(`${file.name} → Base64 (${formatBytes(result.length)})`)
    } catch (e) {
      setError((e as Error).message)
      setOutput('')
      lastInputRef.current = null
    }
  }, [showToast])

  /** Smart file import: text files → input, binary files → Base64 output */
  const handleSmartFileDrop = useCallback((file: File) => {
    if (isTextFile(file.name)) {
      handleTextFileDrop(file)
    } else {
      handleFileToBase64(file)
    }
  }, [handleTextFileDrop, handleFileToBase64])

  // Tauri native file drag-and-drop (OS file manager → app)
  useEffect(() => {
    if (!pageActive || !isTauri()) return
    let unlistenFn: (() => void) | undefined
    let cleanedUp = false
    ;(async () => {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview')
        const { readTextFile, readFile } = await import('@tauri-apps/plugin-fs')
        if (cleanedUp) return
        unlistenFn = await getCurrentWebview().onDragDropEvent(async (event) => {
          if (cleanedUp) return
          const ev = event.payload
          if (ev.type === 'enter') {
            setIsDragOver(true)
          } else if (ev.type === 'leave') {
            setIsDragOver(false)
          } else if (ev.type === 'drop') {
            setIsDragOver(false)
            const filePath = ev.paths[0]
            if (!filePath) return
            const fileName = filePath.split(/[\\/]/).pop() || 'file'
            if (isTextFile(fileName)) {
              try {
                const text = await readTextFile(filePath)
                setInput(text)
                setError('')
                setImportedFile(null)
                try {
                  const result = encodeText(text)
                  setOutput(result)
                  lastInputRef.current = { input: text, action: 'encode' }
                  showToast(`${fileName} → Base64 (${formatBytes(result.length)})`)
                } catch (e) {
                  setError((e as Error).message)
                  setOutput('')
                  lastInputRef.current = null
                }
              } catch { /* read error */ }
            } else {
              try {
                const bytes = await readFile(filePath)
                const base64 = bytesToBase64(bytes)
                const mime = detectImageMime(base64) || 'application/octet-stream'
                setInput('')
                setOutput(base64)
                setImportedFile({ name: fileName, mime })
                lastInputRef.current = null
                showToast(`${fileName} → Base64 (${formatBytes(base64.length)})`)
              } catch { /* read error */ }
            }
          }
        })
        if (cleanedUp) { unlistenFn?.(); unlistenFn = undefined }
      } catch { /* Tauri API not available */ }
    })()
    return () => {
      cleanedUp = true
      if (unlistenFn) { unlistenFn(); unlistenFn = undefined }
    }
  }, [showToast, pageActive])

  const handleDownload = useCallback(async () => {
    if (!output) return

    // Determine save mode: decode→text file, encode/file→binary from base64
    const isDecodedText = lastInputRef.current?.action === 'decode'

    try {
      let bytes: Uint8Array
      let defaultFilename: string

      if (isDecodedText) {
        // Output is plain text — save as text file
        bytes = new TextEncoder().encode(output)
        defaultFilename = `decoded-${Date.now()}.txt`
      } else {
        // Output is base64 — decode to binary
        const binary = atob(output)
        bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        // Use original filename with suffix, or generate name with detected extension
        const detectedExt = detectFileExt(bytes) || ''
        if (importedFile) {
          const dot = importedFile.name.lastIndexOf('.')
          const name = dot > 0 ? importedFile.name.substring(0, dot) : importedFile.name
          const ext = dot > 0 ? importedFile.name.substring(dot) : detectedExt
          defaultFilename = `${name}-b64${ext}`
        } else {
          defaultFilename = `decoded-${Date.now()}${detectedExt}`
        }
      }

      if (isTauri()) {
        try {
          const { save } = await import('@tauri-apps/plugin-dialog')
          const { writeFile } = await import('@tauri-apps/plugin-fs')
          const filePath = await save({ defaultPath: defaultFilename })
          if (filePath) {
            await writeFile(filePath, bytes)
            showToast(t('modules.base64Tool.ui.toastDownloaded'))
          }
          return
        } catch { /* fallback to browser */ }
      }

      // Browser fallback
      const blob = new Blob([new Uint8Array(bytes) as BlobPart], { type: isDecodedText ? 'text/plain' : 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = defaultFilename
      a.click()
      URL.revokeObjectURL(url)
      showToast(t('modules.base64Tool.ui.toastDownloaded'))
    } catch {
      showToast(t('modules.base64Tool.ui.toastDecodeFailed'), 'error')
    }
  }, [output, showToast, t, importedFile])

  // Keyboard shortcuts: Alt+E encode, Alt+D decode (only when page active)
  useEffect(() => {
    if (!pageActive) return
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        // Use e.code as fallback: on macOS Option+letter produces special chars in e.key
        if (e.key === 'e' || e.key === 'E' || e.code === 'KeyE') {
          e.preventDefault()
          encodeRef.current()
        } else if (e.key === 'd' || e.key === 'D' || e.code === 'KeyD') {
          e.preventDefault()
          decodeRef.current()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pageActive])

  const imageMime = output ? detectImageMime(output) : null

  return (
    <div
      className="relative flex h-full flex-col"
      onDragEnter={(e) => { e.preventDefault(); if (e.dataTransfer.items?.length > 0) setIsDragOver(true) }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragOver(false)
        const file = e.dataTransfer.files[0]
        if (file) handleSmartFileDrop(file)
      }}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-elevated px-4 py-2">
        <Binary className="h-4 w-4 text-text-muted" />
        <span className="text-sm font-medium text-text-primary">{t('modules.base64Tool.name')}</span>
      </div>

      {/* Action toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-elevated/50 px-4 py-2">
        {/* Primary actions */}
        <button
          onClick={handleEncode}
          disabled={!input}
          className="relative flex items-center gap-1.5 rounded-md bg-bg-hover px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t('common.encode')}
          {isOutputStale && lastInputRef.current?.action === 'encode' && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-warning" />
          )}
        </button>
        <button
          onClick={handleDecode}
          disabled={!input}
          className="relative flex items-center gap-1.5 rounded-md bg-bg-hover px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t('common.decode')}
          {isOutputStale && lastInputRef.current?.action === 'decode' && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-warning" />
          )}
        </button>

        <div className="h-5 w-px bg-border-base" />

        {/* Utility actions */}
        <button
          onClick={handleSwap}
          disabled={!output || !!importedFile}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
          title={t('modules.base64Tool.ui.swapTooltip')}
        >
          <ArrowLeftRight className="h-4 w-4" />
          <span className="hidden sm:inline">{t('modules.base64Tool.ui.swapBtn', { defaultValue: 'Swap' })}</span>
        </button>
        <button
          onClick={handleOpenFileDialog}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          title={t('modules.base64Tool.ui.fileUploadTooltip')}
        >
          <Upload className="h-4 w-4" />
          <span className="hidden sm:inline">{t('modules.base64Tool.ui.importBtn', { defaultValue: 'Import' })}</span>
        </button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleSmartFileDrop(f); e.target.value = '' }} />
        <button
          onClick={handleCopy}
          disabled={!output}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
          title={t('modules.base64Tool.ui.copyTooltip')}
        >
          <Copy className="h-4 w-4" />
          <span className="hidden sm:inline">{t('modules.base64Tool.ui.copyBtn', { defaultValue: 'Copy' })}</span>
        </button>
        <button
          onClick={handleDownload}
          disabled={!output}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
          title={t('modules.base64Tool.ui.downloadTooltip')}
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">{t('modules.base64Tool.ui.downloadBtn', { defaultValue: 'Download' })}</span>
        </button>

        <div className="flex-1" />

        {/* Clear */}
        <button
          onClick={handleClear}
          disabled={!input && !output && !importedFile}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-muted transition-colors hover:bg-bg-hover hover:text-error disabled:opacity-40 disabled:cursor-not-allowed"
          title={t('common.clear', { defaultValue: 'Clear' })}
        >
          <Trash2 className="h-4 w-4" />
          <span className="hidden sm:inline">{t('common.clear', { defaultValue: 'Clear' })}</span>
        </button>
      </div>

      {/* Input/Output */}
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-px overflow-hidden bg-border-subtle">
        <div className="flex min-h-0 flex-col">
          <div className="flex shrink-0 items-center gap-1 border-b border-border-subtle bg-bg-elevated px-3 py-1.5">
            <span className="text-xs font-medium text-text-muted">{t('common.input')}</span>
            {importedFile && (
              <button onClick={() => { setImportedFile(null); setInput(''); setOutput(''); setError('') }} className="ml-1 rounded p-0.5 text-text-disabled hover:text-text-primary" title={t('common.clear')}>
                <X className="h-3 w-3" />
              </button>
            )}
            <span className="ml-auto text-[11px] font-normal text-text-disabled">
              {t('modules.base64Tool.ui.dragHint')}
            </span>
          </div>
          {importedFile ? (
            importedFile.mime.startsWith('image/') ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-bg-base p-4">
                <img src={`data:${imageMime};base64,${output}`} alt={importedFile.name} className="max-h-full max-w-full rounded object-contain" />
                <p className="mt-2 text-xs text-text-muted">{importedFile.name}</p>
                <p className="text-[11px] text-text-disabled">{formatBytes(output.length * 3 / 4)} · {importedFile.mime}</p>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-bg-base p-4">
                <File className="mb-2 h-12 w-12 text-text-disabled" />
                <p className="text-sm font-medium text-text-secondary">{importedFile.name}</p>
                <p className="mt-1 text-[11px] text-text-disabled">{formatBytes(output.length * 3 / 4)} · {importedFile.mime}</p>
                <p className="mt-1 text-xs text-text-muted">→ {formatBytes(output.length)} Base64</p>
              </div>
            )
          ) : (
            <textarea
              value={input}
              onChange={(e) => { setInput(e.target.value); setImportedFile(null) }}
              placeholder={t('modules.base64Tool.ui.inputPlaceholder')}
              className="min-h-0 flex-1 resize-none bg-bg-base p-4 font-mono text-sm text-text-primary placeholder:text-text-disabled focus:outline-none"
            />
          )}
        </div>
        <div className="flex min-h-0 flex-col">
          <label className="shrink-0 border-b border-border-subtle bg-bg-elevated px-3 py-1.5 text-xs font-medium text-text-muted">{t('common.output')}</label>
          <textarea
            value={output}
            readOnly
            placeholder={t('modules.base64Tool.ui.outputPlaceholder')}
            className="min-h-0 flex-1 resize-none bg-bg-base p-4 font-mono text-sm text-text-primary placeholder:text-text-disabled focus:outline-none"
          />
        </div>
      </div>

      {error && <div className="shrink-0 border-t border-error/20 bg-error/5 px-4 py-2 text-xs text-error">{error}</div>}

      {/* Status bar */}
      <div className="flex shrink-0 items-center gap-4 border-t border-border-subtle bg-bg-elevated px-4 py-1.5 text-xs">
        {input.length > 0 && (
          <span className="text-text-muted">
            {t('common.input')}:{' '}
            <span className="text-text-secondary">{input.length} {t('modules.base64Tool.ui.chars')}</span>
          </span>
        )}
        {output.length > 0 && (
          <span className="text-text-muted">
            {t('common.output')}:{' '}
            <span className="text-text-secondary">{output.length} {t('modules.base64Tool.ui.chars')}</span>
            {' · '}{formatBytes(output.length)}
          </span>
        )}
        <div className="flex-1" />
        <span className="flex items-center gap-1 text-text-disabled">
          {t('modules.base64Tool.ui.dragHint')}
        </span>
        <span className="ml-auto flex items-center gap-1 text-text-disabled">
          <Keyboard size={11} />
          <span>
            {formatPlainShortcuts(t('modules.base64Tool.ui.inWindowShortcuts', {
              defaultValue: 'Alt+E Encode · Alt+D Decode',
            }))}
          </span>
        </span>
      </div>

      {/* Drag overlay */}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-primary/60 bg-primary/5">
          <div className="rounded-lg bg-bg-elevated px-6 py-4 text-sm font-medium text-primary shadow-lg">
            {t('modules.base64Tool.ui.dropHint')}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`absolute bottom-10 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-lg ${toast.type === 'error' ? 'bg-error' : 'bg-success'}`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}
