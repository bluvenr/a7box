/**
 * Hash Generator Main Component
 * Generates MD5, SHA-1, SHA-256, SHA-384, SHA-512 from text or files
 */

import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Fingerprint, FileText, Upload, Copy } from 'lucide-react'

type HashAlgo = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'
type InputMode = 'text' | 'file'

const ALGOS: HashAlgo[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']

/** Simple MD5 implementation (for non-crypto use) */
function md5(input: string): string {
  // Minimal MD5 - based on RFC 1321
  function rotateLeft(x: number, n: number) { return (x << n) | (x >>> (32 - n)) }
  function addUnsigned(x: number, y: number) {
    const lsw = (x & 0xffff) + (y & 0xffff)
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16)
    return (msw << 16) | (lsw & 0xffff)
  }
  const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21]
  const K = Array.from({length:64}, (_,i) => Math.floor(Math.abs(Math.sin(i+1)) * 0x100000000))

  // Convert string to UTF-8 bytes
  const bytes = new TextEncoder().encode(input)
  const len = bytes.length
  const padded = new Uint8Array(((len + 8 >> 6) + 1) * 64)
  padded.set(bytes)
  padded[len] = 0x80
  const bitLen = len * 8
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, bitLen >>> 0, true)
  view.setUint32(padded.length - 4, 0, true)

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476

  for (let i = 0; i < padded.length; i += 64) {
    const M = Array.from({length:16}, (_,j) => view.getUint32(i + j*4, true))
    let A = a0, B = b0, C = c0, D = d0
    for (let j = 0; j < 64; j++) {
      let F: number, g: number
      if (j < 16) { F = (B & C) | (~B & D); g = j }
      else if (j < 32) { F = (D & B) | (~D & C); g = (5*j+1) % 16 }
      else if (j < 48) { F = B ^ C ^ D; g = (3*j+5) % 16 }
      else { F = C ^ (B | ~D); g = (7*j) % 16 }
      const temp = D
      D = C; C = B
      B = addUnsigned(B, rotateLeft(addUnsigned(addUnsigned(A, F), addUnsigned(K[j], M[g])), S[j]))
      A = temp
    }
    a0 = addUnsigned(a0, A); b0 = addUnsigned(b0, B); c0 = addUnsigned(c0, C); d0 = addUnsigned(d0, D)
  }

  const hex = (n: number) => Array.from({length:4}, (_,i) => ((n >> (i*8)) & 0xff).toString(16).padStart(2,'0')).join('')
  return hex(a0) + hex(b0) + hex(c0) + hex(d0)
}

/** Compute hash using Web Crypto API (SHA family) */
async function computeHash(data: ArrayBuffer, algo: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(algo, data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Compute hash for text or file data */
async function hashAll(input: string | ArrayBuffer): Promise<Record<HashAlgo, string>> {
  const buf = typeof input === 'string' ? new TextEncoder().encode(input).buffer : input
  const text = typeof input === 'string' ? input : new TextDecoder().decode(buf)

  const [sha1, sha256, sha384, sha512] = await Promise.all([
    computeHash(buf, 'SHA-1'),
    computeHash(buf, 'SHA-256'),
    computeHash(buf, 'SHA-384'),
    computeHash(buf, 'SHA-512'),
  ])

  return { 'MD5': md5(text), 'SHA-1': sha1, 'SHA-256': sha256, 'SHA-384': sha384, 'SHA-512': sha512 }
}

export default function HashGenerator() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<InputMode>('text')
  const [inputText, setInputText] = useState('')
  const [fileName, setFileName] = useState('')
  const [hashes, setHashes] = useState<Record<HashAlgo, string> | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string } | null>(null)

  const showToast = (message: string) => {
    setToast({ message })
    setTimeout(() => setToast(null), 2000)
  }

  const handleGenerate = useCallback(async () => {
    if (mode === 'text' && !inputText) return
    try {
      if (mode === 'text') {
        const result = await hashAll(inputText)
        setHashes(result)
        showToast(t('modules.hashGenerator.ui.toastGenerated'))
      }
    } catch (e) {
      showToast(`Error: ${(e as Error).message}`)
    }
  }, [mode, inputText, showToast])

  const handleFileUpload = useCallback(async (file: File) => {
    setFileName(file.name)
    try {
      const buf = await file.arrayBuffer()
      const result = await hashAll(buf)
      setHashes(result)
      showToast(t('modules.hashGenerator.ui.toastGeneratedForFile', { name: file.name }))
    } catch (e) {
      showToast(`Error: ${(e as Error).message}`)
    }
  }, [showToast])

  const handleCopy = async (algo: string, value: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(algo)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="relative flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-elevated px-4 py-2">
        <Fingerprint className="h-4 w-4 text-text-muted" />
        <span className="text-sm font-medium text-text-primary">{t('modules.hashGenerator.name')}</span>
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-elevated/50 px-4 py-2">
        <button onClick={() => setMode('text')} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${mode === 'text' ? 'bg-primary/10 text-primary' : 'text-text-muted hover:text-text-secondary'}`}>
          <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {t('common.text')}</span>
        </button>
        <button onClick={() => setMode('file')} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${mode === 'file' ? 'bg-primary/10 text-primary' : 'text-text-muted hover:text-text-secondary'}`}>
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
              disabled={!inputText}
              className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('modules.hashGenerator.ui.generateBtn')}
            </button>
          </div>
        ) : (
          <div
            className="mb-6 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border-subtle p-10 hover:border-border-base"
            onClick={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.onchange = (e) => {
                const f = (e.target as HTMLInputElement).files?.[0]
                if (f) handleFileUpload(f)
              }
              input.click()
            }}
          >
            <Upload className="mb-3 h-10 w-10 text-text-disabled" />
            <p className="text-sm text-text-secondary">{t('common.dropFileOrClick')}</p>
            {fileName && <p className="mt-2 text-xs text-primary">{fileName}</p>}
          </div>
        )}

        {/* Results */}
        {hashes && (
          <div className="space-y-3">
            {ALGOS.map((algo) => (
              <div key={algo} className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-elevated p-3">
                <span className="w-16 shrink-0 text-xs font-medium text-text-muted">{algo}</span>
                <code className="flex-1 truncate font-mono text-sm text-text-primary">{hashes[algo]}</code>
                <button
                  onClick={() => handleCopy(algo, hashes[algo])}
                  className="shrink-0 rounded p-1.5 text-text-muted hover:bg-bg-hover hover:text-text-primary"
                  title="Copy"
                >
                  {copied === algo ? (
                    <span className="text-xs text-success">{t('common.copied')}</span>
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-success px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast.message}
        </div>
      )}
    </div>
  )
}
