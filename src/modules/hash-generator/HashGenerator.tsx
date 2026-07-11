/**
 * Hash Generator Module
 * Generates MD5, SHA-1, SHA-256, SHA-384, SHA-512 from text or files
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Fingerprint, FileText, Upload, Copy, ClipboardCopy, CheckCircle2, X, CaseSensitive, Loader2 } from 'lucide-react'
import { useToast } from '../../components/Toast'
import { usePageActive } from '../../app/layouts/CachedOutlet'
import { isTauri } from '../../shared/utils'

type HashAlgo = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'
type InputMode = 'text' | 'file'

const ALGOS: HashAlgo[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']

/** MD5 from raw bytes (RFC 1321) */
function md5(bytes: Uint8Array): string {
  function rotateLeft(x: number, n: number) { return (x << n) | (x >>> (32 - n)) }
  function addUnsigned(x: number, y: number) {
    const lsw = (x & 0xffff) + (y & 0xffff)
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16)
    return (msw << 16) | (lsw & 0xffff)
  }
  const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21]
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000))

  const len = bytes.length
  const paddedLen = (((len + 8) >>> 6) + 1) * 64
  const padded = new Uint8Array(paddedLen)
  padded.set(bytes)
  padded[len] = 0x80
  const bitLenLow = (len * 8) >>> 0
  const bitLenHigh = Math.floor((len * 8) / 0x100000000) >>> 0
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, bitLenLow, true)
  view.setUint32(padded.length - 4, bitLenHigh, true)

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476

  for (let i = 0; i < padded.length; i += 64) {
    const M = Array.from({ length: 16 }, (_, j) => view.getUint32(i + j * 4, true))
    let A = a0, B = b0, C = c0, D = d0
    for (let j = 0; j < 64; j++) {
      let F: number, g: number
      if (j < 16) { F = (B & C) | (~B & D); g = j }
      else if (j < 32) { F = (D & B) | (~D & C); g = (5 * j + 1) % 16 }
      else if (j < 48) { F = B ^ C ^ D; g = (3 * j + 5) % 16 }
      else { F = C ^ (B | ~D); g = (7 * j) % 16 }
      const temp = D
      D = C; C = B
      B = addUnsigned(B, rotateLeft(addUnsigned(addUnsigned(A, F), addUnsigned(K[j], M[g])), S[j]))
      A = temp
    }
    a0 = addUnsigned(a0, A); b0 = addUnsigned(b0, B); c0 = addUnsigned(c0, C); d0 = addUnsigned(d0, D)
  }

  const hex = (n: number) => Array.from({ length: 4 }, (_, i) => ((n >> (i * 8)) & 0xff).toString(16).padStart(2, '0')).join('')
  return hex(a0) + hex(b0) + hex(c0) + hex(d0)
}

/** Compute hash using Web Crypto API (SHA family) */
async function computeHash(data: ArrayBuffer, algo: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(algo, data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Compute all hashes from raw bytes */
async function hashAll(bytes: Uint8Array): Promise<Record<HashAlgo, string>> {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const [sha1, sha256, sha384, sha512] = await Promise.all([
    computeHash(buf, 'SHA-1'),
    computeHash(buf, 'SHA-256'),
    computeHash(buf, 'SHA-384'),
    computeHash(buf, 'SHA-512'),
  ])
  return { 'MD5': md5(bytes), 'SHA-1': sha1, 'SHA-256': sha256, 'SHA-384': sha384, 'SHA-512': sha512 }
}

export default function HashGenerator() {
  const { t } = useTranslation()
  const toast = useToast()
  const pageActive = usePageActive()
  const [mode, setMode] = useState<InputMode>('text')
  const [inputText, setInputText] = useState('')
  const [fileName, setFileName] = useState('')
  const [hashes, setHashes] = useState<Record<HashAlgo, string> | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [uppercase, setUppercase] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragCounterRef = useRef(0)
  const modeRef = useRef(mode)
  modeRef.current = mode

  // ── Tauri native drag-drop ──
  useEffect(() => {
    if (!pageActive || !isTauri()) return
    let unlistenFn: (() => void) | undefined
    let cleanedUp = false
    ;(async () => {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview')
        if (cleanedUp) return
        unlistenFn = await getCurrentWebview().onDragDropEvent((event) => {
          if (cleanedUp) return
          if (event.payload.type === 'over') {
            if (modeRef.current === 'file') setIsDragging(true)
          } else if (event.payload.type === 'drop') {
            setIsDragging(false)
            const paths = event.payload.paths
            if (paths.length > 0) {
              setMode('file')
              handleFileByPathRef.current(paths[0])
            }
          } else if (event.payload.type === 'leave') {
            setIsDragging(false)
          }
        })
        // If cleanup ran while we were awaiting, unlisten now
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
  }, [pageActive])

  const handleFileByPath = useCallback(async (path: string) => {
    try {
      const { readFile } = await import('@tauri-apps/plugin-fs')
      const data = await readFile(path)
      const name = path.split(/[/\\]/).pop() || path
      setFileName(name)
      setLoading(true)
      const result = await hashAll(data)
      setHashes(result)
      toast(t('modules.hashGenerator.ui.toastGeneratedForFile', { name }))
    } catch (e) {
      toast(`Error: ${(e as Error).message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [toast, t])

  const handleFileByPathRef = useRef(handleFileByPath)
  handleFileByPathRef.current = handleFileByPath

  const handleGenerate = useCallback(async () => {
    if (mode === 'text' && !inputText) return
    try {
      setLoading(true)
      const bytes = new TextEncoder().encode(inputText)
      const result = await hashAll(bytes)
      setHashes(result)
      toast(t('modules.hashGenerator.ui.toastGenerated'))
    } catch (e) {
      toast(`Error: ${(e as Error).message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [mode, inputText, toast, t])

  const handleFileUpload = useCallback(async (file: File) => {
    setFileName(file.name)
    try {
      setLoading(true)
      const buf = await file.arrayBuffer()
      const bytes = new Uint8Array(buf)
      const result = await hashAll(bytes)
      setHashes(result)
      toast(t('modules.hashGenerator.ui.toastGeneratedForFile', { name: file.name }))
    } catch (e) {
      toast(`Error: ${(e as Error).message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [toast, t])

  const handleCopy = useCallback(async (algo: string, value: string) => {
    try {
      const text = uppercase ? value.toUpperCase() : value
      if (isTauri()) {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('set_clipboard_text', { text })
      } else {
        await navigator.clipboard.writeText(text)
      }
      setCopied(algo)
      setTimeout(() => setCopied(null), 1500)
    } catch { /* clipboard error */ }
  }, [uppercase])

  const handleCopyAll = useCallback(async () => {
    if (!hashes) return
    try {
      const text = ALGOS.map((a) => `${a}: ${uppercase ? hashes[a].toUpperCase() : hashes[a]}`).join('\n')
      if (isTauri()) {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('set_clipboard_text', { text })
      } else {
        await navigator.clipboard.writeText(text)
      }
      setCopied('__all__')
      setTimeout(() => setCopied(null), 1500)
      toast(t('common.copied'))
    } catch { /* clipboard error */ }
  }, [hashes, uppercase, toast, t])

  const handleClear = useCallback(() => {
    setInputText('')
    setFileName('')
    setHashes(null)
  }, [])

  const switchMode = useCallback((newMode: InputMode) => {
    setMode(newMode)
    setHashes(null)
    setFileName('')
  }, [])

  // ── HTML5 drag-drop fallback ──
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current <= 0) {
      setIsDragging(false)
      dragCounterRef.current = 0
    }
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    setIsDragging(true)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounterRef.current = 0
    // Skip in Tauri — native onDragDropEvent already handles it
    if (isTauri()) return
    const files = e.dataTransfer.files
    if (files.length > 0) handleFileUpload(files[0])
  }, [handleFileUpload])

  const fmt = (v: string) => uppercase ? v.toUpperCase() : v

  return (
    <div className="relative flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-elevated px-4 py-2">
        <Fingerprint className="h-4 w-4 text-text-muted" />
        <span className="text-sm font-medium text-text-primary">{t('modules.hashGenerator.name')}</span>
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-elevated/50 px-4 py-2">
        <button
          onClick={() => switchMode('text')}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${mode === 'text' ? 'bg-primary/10 text-primary' : 'text-text-muted hover:text-text-secondary'}`}
        >
          <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {t('common.text')}</span>
        </button>
        <button
          onClick={() => switchMode('file')}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${mode === 'file' ? 'bg-primary/10 text-primary' : 'text-text-muted hover:text-text-secondary'}`}
        >
          <span className="flex items-center gap-1"><Upload className="h-3.5 w-3.5" /> {t('common.file')}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Input */}
        {mode === 'text' ? (
          <div className="mb-6">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={t('modules.hashGenerator.ui.textPlaceholder')}
              rows={6}
              className="w-full resize-none rounded-lg border border-border-base bg-bg-elevated p-4 font-mono text-sm text-text-primary placeholder:text-text-disabled focus:border-border-focus focus:outline-none"
            />
            <button
              onClick={handleGenerate}
              disabled={!inputText || loading}
              className="mt-3 flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {loading ? t('modules.hashGenerator.ui.computing') : t('modules.hashGenerator.ui.generateBtn')}
            </button>
          </div>
        ) : (
          <div
            className={`mb-6 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 ${
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-border-subtle hover:border-border-base'
            }`}
            onClick={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.onchange = (e) => {
                const f = (e.target as HTMLInputElement).files?.[0]
                if (f) handleFileUpload(f)
              }
              input.click()
            }}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {loading ? (
              <Loader2 className="mb-3 h-10 w-10 animate-spin text-primary" />
            ) : (
              <Upload className="mb-3 h-10 w-10 text-text-disabled" />
            )}
            <p className="text-sm text-text-secondary">
              {loading ? t('modules.hashGenerator.ui.computing') : t('common.dropFileOrClick')}
            </p>
            {fileName && <p className="mt-2 text-xs text-primary">{fileName}</p>}
          </div>
        )}

        {/* Results */}
        {hashes && (
          <div>
            {/* Result actions bar */}
            <div className="mb-3 flex items-center gap-2">
              <button
                onClick={() => setUppercase((v) => !v)}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${uppercase ? 'bg-primary/10 text-primary' : 'text-text-muted hover:text-text-secondary'}`}
                title={t('modules.hashGenerator.ui.uppercase')}
              >
                <CaseSensitive className="h-3.5 w-3.5" />
                {t('modules.hashGenerator.ui.uppercase')}
              </button>
              <button
                onClick={handleCopyAll}
                className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-text-muted transition-colors hover:text-text-secondary cursor-pointer"
              >
                {copied === '__all__'
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                  : <ClipboardCopy className="h-3.5 w-3.5" />}
                {t('modules.hashGenerator.ui.copyAll')}
              </button>
              <button
                onClick={handleClear}
                className="ml-auto flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-text-muted transition-colors hover:text-red-400 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                {t('modules.hashGenerator.ui.clear')}
              </button>
            </div>
            {/* Hash rows */}
            <div className="space-y-3">
            {ALGOS.map((algo) => (
              <div key={algo} className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-elevated p-3">
                <span className="w-16 shrink-0 text-xs font-medium text-text-muted">{algo}</span>
                <code className="flex-1 break-all font-mono text-sm text-text-primary select-all">{fmt(hashes[algo])}</code>
                <button
                  onClick={() => handleCopy(algo, hashes[algo])}
                  className="shrink-0 rounded p-1.5 text-text-muted hover:bg-bg-hover hover:text-text-primary cursor-pointer"
                  title={t('modules.hashGenerator.ui.copy')}
                >
                  {copied === algo ? (
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
