/**
 * Code Quick Minify/Beautify Utility Window
 * Floating window that reads clipboard code and minifies or beautifies it.
 * Triggered by global shortcut (Ctrl+Shift+K).
 */
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Copy, X, Minimize2, Maximize2, Check, AlertCircle, Code2 } from 'lucide-react'
import hljs from 'highlight.js'
import {
  minifyCode, beautifyCode, detectLanguage,
  type Language, type IndentType,
} from '../../../modules/code-minify/utils/minifier'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'css', label: 'CSS' },
  { value: 'html', label: 'HTML' },
  { value: 'json', label: 'JSON' },
]

export default function CodeQuick() {
  const { t } = useTranslation()

  const [input, setInput] = useState('')
  const [language, setLanguage] = useState<Language>('javascript')
  const [mode, setMode] = useState<'minify' | 'beautify'>('minify')
  const [indent, setIndent] = useState<IndentType>('2spaces')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Read clipboard on mount
  useEffect(() => {
    (async () => {
      try {
        let clipText = ''
        if (isTauri()) {
          const { invoke } = await import('@tauri-apps/api/core')
          clipText = await invoke<string>('get_clipboard_text')
        } else {
          clipText = await navigator.clipboard.readText()
        }
        const trimmed = clipText.trim()
        if (!trimmed) {
          setError(t('codeQuick.clipboardEmpty', { defaultValue: 'Clipboard is empty' }))
          return
        }
        setInput(trimmed)
        const detected = detectLanguage(trimmed)
        if (detected) {
          setLanguage(detected)
          setError(null)
        } else {
          setError(t('codeQuick.unsupportedLang', { defaultValue: 'Unable to detect code language' }))
        }
      } catch {
        setError(t('codeQuick.clipboardError', { defaultValue: 'Failed to read clipboard' }))
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close window
  const closeWindow = useCallback(async () => {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('close_utility_window', { label: 'code-quick' })
      } catch { /* ignore */ }
    }
  }, [])

  // Double-click title bar to maximize/restore
  const toggleMaximize = useCallback(async () => {
    try {
      const win = getCurrentWindow()
      if (await win.isMaximized()) {
        await win.unmaximize()
      } else {
        await win.maximize()
      }
    } catch { /* ignore */ }
  }, [])

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeWindow()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [closeWindow])

  // Compute output
  const output = useMemo(() => {
    if (!input || error) return ''
    try {
      if (mode === 'minify') {
        return minifyCode(input, language)
      }
      return beautifyCode(input, language, indent)
    } catch (e) {
      return ''
    }
  }, [input, language, mode, indent, error])

  // Stats
  const stats = useMemo(() => {
    if (!input || error || !output) return null
    return {
      inputLen: input.length,
      outputLen: output.length,
      outputLines: output.split('\n').length,
      savings: input.length > 0
        ? ((1 - output.length / input.length) * 100).toFixed(1)
        : '0',
    }
  }, [input, output, error])

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    if (!output) return
    try {
      if (isTauri()) {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('write_clipboard_text', { text: output })
      } else {
        await navigator.clipboard.writeText(output)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }, [output])

  // Compute highlighted output
  const highlightedHtml = useMemo(() => {
    if (!output) return ''
    try {
      return hljs.highlight(output, { language }).value
    } catch {
      return output.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }
  }, [output, language])

  return (
    <div className="flex h-screen flex-col bg-bg-elevated text-text-primary select-none">
      {/* Header (draggable) */}
      <div
        className="flex cursor-pointer items-center justify-between px-4 py-2.5 border-b border-border-subtle"
        data-tauri-drag-region
        onDoubleClick={toggleMaximize}
      >
        <div className="pointer-events-none flex items-center gap-2" data-tauri-drag-region>
          <Code2 className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            {t('codeQuick.title', { defaultValue: 'Code Quick' })}
          </span>
        </div>
        <button
          onClick={closeWindow}
          className="pointer-events-auto rounded p-1 text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {error ? (
          /* Error state */
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
            <AlertCircle className="h-10 w-10 text-error/60" />
            <p className="text-sm text-text-secondary text-center">{error}</p>
            <p className="text-xs text-text-muted">
              {t('codeQuick.errorHint', { defaultValue: 'Copy some code to clipboard and press the shortcut again' })}
            </p>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border-subtle flex-wrap">
              {/* Language selector */}
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="rounded-md border border-border-base bg-bg-base px-2 py-1 text-xs text-text-secondary focus:border-border-focus focus:outline-none"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>

              {/* Mode toggle */}
              <div className="flex overflow-hidden rounded-md border border-border-subtle">
                <button
                  onClick={() => setMode('minify')}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors ${
                    mode === 'minify'
                      ? 'bg-primary/10 text-primary'
                      : 'text-text-muted hover:bg-bg-hover'
                  }`}
                >
                  <Minimize2 className="h-3 w-3" />
                  {t('codeQuick.minify', { defaultValue: 'Minify' })}
                </button>
                <button
                  onClick={() => setMode('beautify')}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors ${
                    mode === 'beautify'
                      ? 'bg-primary/10 text-primary'
                      : 'text-text-muted hover:bg-bg-hover'
                  }`}
                >
                  <Maximize2 className="h-3 w-3" />
                  {t('codeQuick.beautify', { defaultValue: 'Beautify' })}
                </button>
              </div>

              {/* Indent (only for beautify) */}
              {mode === 'beautify' && (
                <select
                  value={indent}
                  onChange={(e) => setIndent(e.target.value as IndentType)}
                  className="rounded-md border border-border-base bg-bg-base px-2 py-1 text-xs text-text-secondary focus:border-border-focus focus:outline-none"
                >
                  <option value="2spaces">2 Spaces</option>
                  <option value="4spaces">4 Spaces</option>
                  <option value="tab">Tab</option>
                </select>
              )}

              {/* Stats */}
              {stats && (
                <span className="text-[11px] text-text-muted">
                  {mode === 'minify'
                    ? `${stats.outputLen} ${t('codeQuick.chars', { defaultValue: 'chars' })} (${stats.savings}%)`
                    : `${stats.outputLines} ${t('codeQuick.lines', { defaultValue: 'lines' })}`
                  }
                </span>
              )}

              <div className="flex-1" />

              {/* Copy button */}
              <button
                onClick={handleCopy}
                disabled={!output}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  copied
                    ? 'bg-success/10 text-success'
                    : 'bg-bg-hover text-text-secondary hover:text-text-primary'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {copied ? (
                  <><Check className="h-3.5 w-3.5" /> {t('codeQuick.copied', { defaultValue: 'Copied' })}</>
                ) : (
                  <><Copy className="h-3.5 w-3.5" /> {t('codeQuick.copy', { defaultValue: 'Copy' })}</>
                )}
              </button>
            </div>

            {/* Output */}
            <div className="flex-1 overflow-auto p-4 select-text">
              <pre
                className="hljs whitespace-pre-wrap text-sm leading-relaxed break-all"
                style={{ fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace', background: 'transparent' }}
                dangerouslySetInnerHTML={{ __html: highlightedHtml }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
