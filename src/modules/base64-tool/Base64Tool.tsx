/**
 * Base64 Tool Main Component
 * Text encode/decode, file to base64, base64 to file download
 */

import { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Binary, ArrowLeftRight, Copy, Upload, Download, FileText } from 'lucide-react'

type Mode = 'text' | 'file'

function encodeText(text: string): string {
  return btoa(new TextEncoder().encode(text).reduce((s, b) => s + String.fromCharCode(b), ''))
}

function decodeText(base64: string): string {
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export default function Base64Tool() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode>('text')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2000) }

  const handleEncode = useCallback(() => {
    setError('')
    try {
      if (!input) { setOutput(''); return }
      const result = encodeText(input)
      setOutput(result)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [input])

  const handleDecode = useCallback(() => {
    setError('')
    try {
      if (!input) { setOutput(''); return }
      const result = decodeText(input)
      setOutput(result)
    } catch (e) {
      setError(t('modules.base64Tool.ui.invalidBase64', { msg: (e as Error).message }))
    }
  }, [input])

  const handleSwap = () => {
    setInput(output)
    setOutput('')
    setError('')
  }

  const handleCopy = async () => {
    if (!output) return
    await navigator.clipboard.writeText(output)
    showToast(t('common.copiedToClipboard'))
  }

  const handleFileToBase64 = useCallback(async (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      setInput('')
      setOutput(base64)
      showToast(`${file.name} → Base64 (${formatBytes(base64.length)})`)
    }
    reader.readAsDataURL(file)
  }, [showToast])

  const handleDownload = () => {
    if (!output) return
    try {
      const binary = atob(output)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob = new Blob([bytes])
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `decoded-${Date.now()}`
      a.click()
      URL.revokeObjectURL(url)
      showToast(t('modules.base64Tool.ui.toastDownloaded'))
    } catch {
      showToast(t('modules.base64Tool.ui.toastDecodeFailed'))
    }
  }

  const isImageBase64 = (() => {
    try {
      const header = atob(output.substring(0, 20))
      return header.startsWith('\x89PNG') || header.startsWith('GIF') || header.startsWith('RIFF') || header.includes('JFIF') || header.includes('Exif')
    } catch { return false }
  })()

  return (
    <div className="relative flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border-subtle bg-bg-elevated px-4 py-2">
        <Binary className="h-4 w-4 text-text-muted" />
        <span className="text-sm font-medium text-text-primary">{t('modules.base64Tool.name')}</span>
        <div className="mx-2 h-5 w-px bg-border-base" />
        <button onClick={() => setMode('text')} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${mode === 'text' ? 'bg-primary/10 text-primary' : 'text-text-muted hover:text-text-secondary'}`}>
          <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {t('common.text')}</span>
        </button>
        <button onClick={() => setMode('file')} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${mode === 'file' ? 'bg-primary/10 text-primary' : 'text-text-muted hover:text-text-secondary'}`}>
          <span className="flex items-center gap-1"><Upload className="h-3.5 w-3.5" /> {t('common.file')}</span>
        </button>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {mode === 'text' ? (
          <>
            {/* Action buttons */}
            <div className="flex items-center gap-2 border-b border-border-subtle bg-bg-elevated/50 px-4 py-2">
              <button onClick={handleEncode} disabled={!input} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed">
                {t('common.encode')}
              </button>
              <button onClick={handleDecode} disabled={!input} className="rounded-md border border-border-base px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-hover disabled:opacity-40 disabled:cursor-not-allowed">
                {t('common.decode')}
              </button>
              <button onClick={handleSwap} disabled={!output} className="rounded-md border border-border-base p-1.5 text-text-muted hover:bg-bg-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed" title={t('modules.base64Tool.ui.swapTooltip')}>
                <ArrowLeftRight className="h-3.5 w-3.5" />
              </button>
              <div className="flex-1" />
              <button onClick={handleCopy} disabled={!output} className="rounded-md border border-border-base p-1.5 text-text-muted hover:bg-bg-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed" title={t('modules.base64Tool.ui.copyTooltip')}>
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button onClick={handleDownload} disabled={!output} className="rounded-md border border-border-base p-1.5 text-text-muted hover:bg-bg-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed" title={t('modules.base64Tool.ui.downloadTooltip')}>
                <Download className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Input/Output */}
            <div className="grid flex-1 grid-cols-2 gap-px overflow-hidden bg-border-subtle">
              <div className="flex flex-col overflow-hidden">
                <label className="border-b border-border-subtle bg-bg-elevated px-3 py-1.5 text-xs font-medium text-text-muted">{t('common.input')}</label>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={t('modules.base64Tool.ui.inputPlaceholder')}
                  className="flex-1 resize-none bg-bg-base p-4 font-mono text-sm text-text-primary placeholder:text-text-disabled focus:outline-none"
                />
              </div>
              <div className="flex flex-col overflow-hidden">
                <label className="border-b border-border-subtle bg-bg-elevated px-3 py-1.5 text-xs font-medium text-text-muted">{t('common.output')}</label>
                <textarea
                  value={output}
                  readOnly
                  placeholder={t('modules.base64Tool.ui.outputPlaceholder')}
                  className="flex-1 resize-none bg-bg-base p-4 font-mono text-sm text-text-primary placeholder:text-text-disabled focus:outline-none"
                />
              </div>
            </div>

            {error && <div className="border-t border-error/20 bg-error/5 px-4 py-2 text-xs text-error">{error}</div>}
          </>
        ) : (
          /* File mode */
          <div className="flex-1 overflow-y-auto p-6">
            <div
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border-subtle p-12 hover:border-border-base"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileToBase64(f) }}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mb-3 h-10 w-10 text-text-disabled" />
              <p className="text-sm text-text-secondary">{t('common.dropFileOrClick')}</p>
              <p className="mt-1 text-xs text-text-muted">{t('modules.base64Tool.ui.fileDropHint')}</p>
              <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileToBase64(f); e.target.value = '' }} />
            </div>

            {output && (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-medium text-text-muted">{t('modules.base64Tool.ui.outputTitle')}</label>
                  <div className="flex gap-2">
                    <button onClick={handleCopy} className="rounded p-1 text-text-muted hover:text-text-primary"><Copy className="h-3.5 w-3.5" /></button>
                    <button onClick={handleDownload} className="rounded p-1 text-text-muted hover:text-text-primary"><Download className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                {isImageBase64 && (
                  <div className="mb-3 rounded-lg border border-border-subtle p-2">
                    <img src={`data:image/png;base64,${output}`} alt="preview" className="mx-auto max-h-48 rounded" />
                  </div>
                )}
                <textarea
                  value={output}
                  readOnly
                  className="h-48 w-full resize-none rounded-lg border border-border-base bg-bg-base p-3 font-mono text-xs text-text-primary break-all focus:outline-none"
                />
                <p className="mt-1 text-xs text-text-muted">{formatBytes(output.length)} Base64 string</p>
              </div>
            )}
          </div>
        )}
      </div>

      {toast && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-success px-4 py-2 text-sm font-medium text-white shadow-lg">{toast}</div>}
    </div>
  )
}
