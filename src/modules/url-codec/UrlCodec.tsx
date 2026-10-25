/**
 * URL Codec — Encode / Decode / Parse URLs
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Copy, ArrowLeftRight, X, Search, CheckCircle2 } from 'lucide-react'
import { usePageActive } from '../../app/layouts/CachedOutlet'
import { isTauri } from '../../shared/utils'

type Mode = 'encode' | 'decode'
type EncodeType = 'component' | 'full'

interface ParsedUrl {
  protocol: string
  host: string
  pathname: string
  hash: string
  params: { key: string; value: string }[]
}

function parseUrl(raw: string): ParsedUrl | null {
  try {
    const url = new URL(raw)
    const params: { key: string; value: string }[] = []
    url.searchParams.forEach((value, key) => params.push({ key, value }))
    return {
      protocol: url.protocol,
      host: url.host,
      pathname: url.pathname,
      hash: url.hash,
      params,
    }
  } catch {
    return null
  }
}

function encode(text: string, type: EncodeType): string {
  return type === 'component' ? encodeURIComponent(text) : encodeURI(text)
}

function decode(text: string, type: EncodeType): string {
  return type === 'component' ? decodeURIComponent(text) : decodeURI(text)
}

export default function UrlCodec() {
  const { t } = useTranslation()
  const pageActive = usePageActive()
  const [mode, setMode] = useState<Mode>('encode')
  const [encodeType, setEncodeType] = useState<EncodeType>('component')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [parseInput, setParseInput] = useState('')
  const [parsed, setParsed] = useState<ParsedUrl | null>(null)
  const [parseError, setParseError] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Cleanup
  useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current) }, [])

  const process = useCallback((text: string, m: Mode, type: EncodeType) => {
    if (!text.trim()) { setOutput(''); setError(''); return }
    try {
      const result = m === 'encode' ? encode(text, type) : decode(text, type)
      setOutput(result)
      setError('')
    } catch (e) {
      setOutput('')
      setError(m === 'decode' ? t('modules.urlCodec.ui.decodeError') : (e as Error).message)
    }
  }, [t])

  const handleInputChange = useCallback((value: string) => {
    setInput(value)
    process(value, mode, encodeType)
  }, [mode, encodeType, process])

  const handleModeChange = useCallback((newMode: Mode) => {
    setMode(newMode)
    process(input, newMode, encodeType)
  }, [input, encodeType, process])

  const handleTypeChange = useCallback((newType: EncodeType) => {
    setEncodeType(newType)
    process(input, mode, newType)
  }, [input, mode, process])

  const handleSwap = useCallback(() => {
    setInput(output)
    setOutput(input)
    const newMode = mode === 'encode' ? 'decode' : 'encode'
    setMode(newMode)
    process(output, newMode, encodeType)
  }, [input, output, mode, encodeType, process])

  const handleCopy = useCallback(async () => {
    if (!output) return
    if (isTauri()) {
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
      await writeText(output)
    } else {
      await navigator.clipboard.writeText(output)
    }
    setCopied(true)
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
  }, [output])

  const handleClear = useCallback(() => {
    setInput('')
    setOutput('')
    setError('')
    inputRef.current?.focus()
  }, [])

  const handleParse = useCallback((value: string) => {
    setParseInput(value)
    if (!value.trim()) { setParsed(null); setParseError(''); return }
    const result = parseUrl(value)
    if (result) { setParsed(result); setParseError('') }
    else { setParsed(null); setParseError(t('modules.urlCodec.ui.parseError')) }
  }, [t])

  const handleCopyParam = useCallback(async (text: string) => {
    if (isTauri()) {
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
      await writeText(text)
    } else {
      await navigator.clipboard.writeText(text)
    }
  }, [])

  // Paste shortcut (Ctrl+V into textarea is native; Alt+E/D for encode/decode)
  useEffect(() => {
    if (!pageActive) return
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey) return
      if (e.key === 'e' || e.key === 'E') { e.preventDefault(); handleModeChange('encode') }
      if (e.key === 'd' || e.key === 'D') { e.preventDefault(); handleModeChange('decode') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pageActive, handleModeChange])

  return (
    <div className="relative flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border-subtle bg-bg-elevated px-4 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Link size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">{t('modules.urlCodec.name')}</h1>
          <p className="text-sm text-text-secondary">{t('modules.urlCodec.description')}</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Codec section */}
        <div className="mb-6">
          {/* Controls */}
          <div className="mb-3 flex flex-wrap items-center gap-3">
            {/* Mode toggle */}
            <div className="flex rounded-lg border border-border-subtle overflow-hidden">
              <button
                onClick={() => handleModeChange('encode')}
                className={`cursor-pointer px-3 py-1.5 text-xs font-medium transition-colors ${mode === 'encode' ? 'bg-primary text-white' : 'bg-bg-elevated text-text-secondary hover:bg-bg-hover'}`}
              >
                {t('modules.urlCodec.ui.encode')}
              </button>
              <button
                onClick={() => handleModeChange('decode')}
                className={`cursor-pointer px-3 py-1.5 text-xs font-medium transition-colors ${mode === 'decode' ? 'bg-primary text-white' : 'bg-bg-elevated text-text-secondary hover:bg-bg-hover'}`}
              >
                {t('modules.urlCodec.ui.decode')}
              </button>
            </div>

            {/* Encode type */}
            <div className="flex rounded-lg border border-border-subtle overflow-hidden">
              <button
                onClick={() => handleTypeChange('component')}
                className={`cursor-pointer px-3 py-1.5 text-xs transition-colors ${encodeType === 'component' ? 'bg-bg-hover text-text-primary font-medium' : 'bg-bg-elevated text-text-muted hover:bg-bg-hover'}`}
              >
                {t('modules.urlCodec.ui.typeComponent')}
              </button>
              <button
                onClick={() => handleTypeChange('full')}
                className={`cursor-pointer px-3 py-1.5 text-xs transition-colors ${encodeType === 'full' ? 'bg-bg-hover text-text-primary font-medium' : 'bg-bg-elevated text-text-muted hover:bg-bg-hover'}`}
              >
                {t('modules.urlCodec.ui.typeFull')}
              </button>
            </div>

            <div className="flex-1" />

            {/* Swap + Clear */}
            <button onClick={handleSwap} disabled={!output} className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-text-muted hover:text-text-primary hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed" title={t('modules.urlCodec.ui.swap')}>
              <ArrowLeftRight size={13} />
            </button>
            <button onClick={handleClear} disabled={!input && !output} className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-text-muted hover:text-error hover:bg-error/5 disabled:opacity-30 disabled:cursor-not-allowed">
              <X size={13} />
            </button>
          </div>

          {/* Input */}
          <div className="relative mb-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder={mode === 'encode' ? t('modules.urlCodec.ui.inputPlaceholderEncode') : t('modules.urlCodec.ui.inputPlaceholderDecode')}
              className="h-32 w-full resize-none rounded-lg border border-border-subtle bg-bg-base px-3 py-2.5 text-sm text-text-primary placeholder:text-text-disabled focus:border-border-focus focus:outline-none font-mono"
              spellCheck={false}
            />
          </div>

          {/* Error */}
          {error && (
            <p className="mb-2 text-xs text-error">{error}</p>
          )}

          {/* Output */}
          <div className="relative">
            <textarea
              value={output}
              readOnly
              placeholder={t('modules.urlCodec.ui.outputPlaceholder')}
              className="h-32 w-full resize-none rounded-lg border border-border-subtle bg-bg-elevated/50 px-3 py-2.5 text-sm text-text-primary placeholder:text-text-disabled font-mono"
              spellCheck={false}
            />
            {output && (
              <button
                onClick={handleCopy}
                className="absolute right-2 top-2 cursor-pointer rounded-md bg-bg-elevated/80 p-1.5 text-text-muted hover:text-text-primary backdrop-blur-sm border border-border-subtle"
                title={t('common.copy')}
              >
                {copied ? <CheckCircle2 size={14} className="text-green-500" /> : <Copy size={14} />}
              </button>
            )}
          </div>
        </div>

        {/* URL Parser section */}
        <div className="rounded-lg border border-border-subtle bg-bg-elevated/30 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-text-primary">
            <Search size={14} className="text-text-muted" />
            {t('modules.urlCodec.ui.parserTitle')}
          </h3>
          <input
            value={parseInput}
            onChange={(e) => handleParse(e.target.value)}
            placeholder={t('modules.urlCodec.ui.parserPlaceholder')}
            className="mb-3 w-full rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:border-border-focus focus:outline-none font-mono"
            spellCheck={false}
          />
          {parseError && <p className="mb-2 text-xs text-error">{parseError}</p>}
          {parsed && (
            <div className="space-y-2 text-xs">
              <ParsedRow label="Protocol" value={parsed.protocol} onCopy={handleCopyParam} />
              <ParsedRow label="Host" value={parsed.host} onCopy={handleCopyParam} />
              <ParsedRow label="Path" value={parsed.pathname} onCopy={handleCopyParam} />
              {parsed.hash && <ParsedRow label="Hash" value={parsed.hash} onCopy={handleCopyParam} />}
              {parsed.params.length > 0 && (
                <div className="mt-3 border-t border-border-subtle pt-3">
                  <p className="mb-2 font-medium text-text-secondary">{t('modules.urlCodec.ui.queryParams')} ({parsed.params.length})</p>
                  <div className="space-y-1">
                    {parsed.params.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 rounded bg-bg-base px-2 py-1.5 font-mono">
                        <span className="shrink-0 font-medium text-primary">{p.key}</span>
                        <span className="text-text-disabled">=</span>
                        <span className="flex-1 truncate text-text-secondary" title={p.value}>{p.value}</span>
                        <button
                          onClick={() => handleCopyParam(p.value)}
                          className="shrink-0 cursor-pointer rounded p-0.5 text-text-disabled hover:text-text-primary"
                          title={t('common.copy')}
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ParsedRow({ label, value, onCopy }: { label: string; value: string; onCopy: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 rounded bg-bg-base px-2 py-1.5 font-mono">
      <span className="w-16 shrink-0 font-medium text-text-muted">{label}</span>
      <span className="flex-1 truncate text-text-primary" title={value}>{value}</span>
      <button
        onClick={() => onCopy(value)}
        className="shrink-0 cursor-pointer rounded p-0.5 text-text-disabled hover:text-text-primary"
      >
        <Copy size={12} />
      </button>
    </div>
  )
}
