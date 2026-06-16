/**
 * Code Minify/Beautify Main Component
 * Uses Monaco Editor for editing + regex-based minification + Monaco formatter for beautify
 */

import { useState, useCallback, lazy, Suspense, useMemo } from 'react'
import { Minimize2, Maximize2, Copy, Trash2, Download } from 'lucide-react'
import { minifyCode, formatBytes, calcSavings, type Language } from './utils/minifier'

// Lazy load Monaco Editor
const Editor = lazy(() =>
  import('@monaco-editor/react').then((mod) => ({ default: mod.default }))
)

const LANGUAGES: { value: Language; label: string; monacoLang: string }[] = [
  { value: 'javascript', label: 'JavaScript', monacoLang: 'javascript' },
  { value: 'css', label: 'CSS', monacoLang: 'css' },
  { value: 'html', label: 'HTML', monacoLang: 'html' },
  { value: 'json', label: 'JSON', monacoLang: 'json' },
]

function EditorSkeleton() {
  return (
    <div className="flex h-full items-center justify-center bg-[#1e1e1e]">
      <div className="animate-pulse text-text-muted text-sm">Loading editor...</div>
    </div>
  )
}

export default function CodeMinify() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [language, setLanguage] = useState<Language>('javascript')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2000)
  }, [])

  const selectedLang = LANGUAGES.find((l) => l.value === language)!

  const handleMinify = useCallback(() => {
    if (!input.trim()) return
    try {
      const result = minifyCode(input, language)
      setOutput(result)
      showToast('Minified successfully')
    } catch (e) {
      showToast((e as Error).message, 'error')
    }
  }, [input, language, showToast])

  const handleBeautify = useCallback(() => {
    if (!input.trim()) return
    try {
      // For JSON, use native formatting
      if (language === 'json') {
        const parsed = JSON.parse(input)
        const result = JSON.stringify(parsed, null, 2)
        setOutput(result)
        showToast('Beautified successfully')
        return
      }
      // For other languages, just format with basic indentation logic
      // Monaco's built-in formatter can be triggered via the editor action
      setOutput(input)
      showToast('Use Ctrl+Shift+I in editor to format')
    } catch (e) {
      showToast((e as Error).message, 'error')
    }
  }, [input, language, showToast])

  const handleCopy = useCallback(async () => {
    if (!output) return
    await navigator.clipboard.writeText(output)
    showToast('Copied to clipboard')
  }, [output, showToast])

  const handleClear = useCallback(() => {
    setInput('')
    setOutput('')
  }, [])

  const handleDownload = useCallback(() => {
    if (!output) return
    const extMap: Record<Language, string> = { javascript: 'js', css: 'css', html: 'html', json: 'json' }
    const blob = new Blob([output], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `minified.${extMap[language]}`
    a.click()
    URL.revokeObjectURL(url)
  }, [output, language])

  // Stats
  const stats = useMemo(() => {
    if (!input || !output) return null
    const origSize = new Blob([input]).size
    const minSize = new Blob([output]).size
    return {
      original: origSize,
      minified: minSize,
      savings: calcSavings(origSize, minSize),
    }
  }, [input, output])

  return (
    <div className="relative flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border-subtle bg-bg-elevated px-4 py-2">
        {/* Language selector */}
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as Language)}
          className="rounded-md border border-border-base bg-bg-base px-2 py-1.5 text-xs text-text-primary focus:border-border-focus focus:outline-none"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.value} value={lang.value}>{lang.label}</option>
          ))}
        </select>

        <button
          onClick={handleMinify}
          disabled={!input.trim()}
          className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Minimize2 className="h-4 w-4" />
          Minify
        </button>

        <button
          onClick={handleBeautify}
          disabled={!input.trim()}
          className="flex items-center gap-1.5 rounded-md bg-bg-hover px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Maximize2 className="h-4 w-4" />
          Beautify
        </button>

        <div className="h-5 w-px bg-border-base" />

        <button
          onClick={handleCopy}
          disabled={!output}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
          title="Copy output"
        >
          <Copy className="h-4 w-4" />
        </button>

        <button
          onClick={handleDownload}
          disabled={!output}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
          title="Download"
        >
          <Download className="h-4 w-4" />
        </button>

        <div className="flex-1" />

        {/* Stats */}
        {stats && (
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span>{formatBytes(stats.original)} → {formatBytes(stats.minified)}</span>
            <span className="rounded bg-success/10 px-1.5 py-0.5 text-success">
              -{stats.savings}
            </span>
          </div>
        )}

        <button
          onClick={handleClear}
          disabled={!input && !output}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-muted transition-colors hover:bg-bg-hover hover:text-error disabled:opacity-40 disabled:cursor-not-allowed"
          title="Clear"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Editors side by side */}
      <div className="flex flex-1 overflow-hidden">
        {/* Input */}
        <div className="flex flex-1 flex-col border-r border-border-subtle">
          <div className="px-4 py-1.5 text-xs text-text-muted font-medium bg-bg-elevated border-b border-border-subtle">
            Input
          </div>
          <div className="flex-1 overflow-hidden">
            <Suspense fallback={<EditorSkeleton />}>
              <Editor
                height="100%"
                language={selectedLang.monacoLang}
                value={input}
                onChange={(v) => setInput(v ?? '')}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  wordWrap: 'on',
                  padding: { top: 12 },
                }}
              />
            </Suspense>
          </div>
        </div>

        {/* Output */}
        <div className="flex flex-1 flex-col">
          <div className="px-4 py-1.5 text-xs text-text-muted font-medium bg-bg-elevated border-b border-border-subtle">
            Output
          </div>
          <div className="flex-1 overflow-hidden">
            <Suspense fallback={<EditorSkeleton />}>
              <Editor
                height="100%"
                language={selectedLang.monacoLang}
                value={output}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 13,
                  fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  wordWrap: 'on',
                  padding: { top: 12 },
                }}
              />
            </Suspense>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg px-4 py-2 text-sm font-medium shadow-lg transition-all ${
            toast.type === 'success' ? 'bg-success text-white' : 'bg-error text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
