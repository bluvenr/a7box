/**
 * Code Minify/Beautify Main Component
 * Monaco Editor + js-beautify + regex minification + drag-drop + history + shortcuts
 */

import { useState, useCallback, useEffect, useRef, lazy, Suspense, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Minimize2, Maximize2, Copy, Trash2, Download, History, ClipboardPaste, FileUp,
  ArrowLeftRight, Keyboard,
} from 'lucide-react'
import {
  minifyCode, beautifyCode, detectLanguage, detectLanguageFromExt,
  getFileExtension, calcSavings,
  type Language, type IndentType,
} from './utils/minifier'
import { StatusBar } from './components/StatusBar'
import {
  HistoryPanel, loadHistory, addHistoryItem, clearAllHistory,
  type HistoryItem,
} from './components/HistoryPanel'
import { useSettingsStore } from '../../core'
import { useShortcutStore } from '../../core/shortcuts'
import { useConfirm } from '../../components/Dialog'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** Format Tauri key string to human-readable display */
function formatShortcut(keys: string): string {
  return keys
    .replace(/CommandOrControl/gi, 'Ctrl')
    .replace(/Command/gi, '\u2318')
    .replace(/Control/gi, 'Ctrl')
    .replace(/Shift/gi, 'Shift')
    .replace(/Alt/gi, 'Alt')
    .replace(/\+/g, ' + ')
}

// Lazy load Monaco Editor
const Editor = lazy(() =>
  import('@monaco-editor/react').then((mod) => ({ default: mod.default }))
)

const LANGUAGES: { value: Language; label: string; monacoLang: string }[] = [
  { value: 'javascript', label: 'JavaScript', monacoLang: 'javascript' },
  { value: 'typescript', label: 'TypeScript', monacoLang: 'typescript' },
  { value: 'css', label: 'CSS', monacoLang: 'css' },
  { value: 'html', label: 'HTML', monacoLang: 'html' },
  { value: 'json', label: 'JSON', monacoLang: 'json' },
]

function EditorSkeleton() {
  const { t } = useTranslation()
  return (
    <div className="flex h-full items-center justify-center bg-[#1e1e1e]">
      <div className="animate-pulse text-text-muted text-sm">
        {t('modules.codeMinify.ui.loadingEditor', { defaultValue: 'Loading editor...' })}
      </div>
    </div>
  )
}

export default function CodeMinify() {
  const { t } = useTranslation()
  const confirm = useConfirm()

  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [language, setLanguage] = useState<Language>('javascript')
  const [indent, setIndent] = useState<IndentType>('2spaces')
  const [lastAction, setLastAction] = useState<'compress' | 'beautify' | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // History
  const [showHistory, setShowHistory] = useState(false)
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>(() => loadHistory())

  // Drag state
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounterRef = useRef(0)

  // Output staleness tracking
  const lastInputRef = useRef('')
  const isOutputStale = output && input !== lastInputRef.current

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2000)
  }, [])

  // Theme: resolve 'system' for Monaco
  const appTheme = useSettingsStore((s) => s.theme)
  const monacoTheme = useMemo(() => {
    if (appTheme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'vs-dark' : 'vs'
    }
    return appTheme === 'dark' ? 'vs-dark' : 'vs'
  }, [appTheme])

  const selectedLang = LANGUAGES.find((l) => l.value === language)!

  // Read shortcut keys for display
  const floatingShortcut = useShortcutStore((s) => {
    const sc = s.shortcuts.find((c) => c.action === 'clipboard-to-code-minify')
    return sc?.enabled ? sc?.keys : null
  })

  // ─── Language auto-detection ───────────────────────────────────────────
  const handleInputChange = useCallback((value: string | undefined) => {
    const text = value ?? ''
    const prevInput = input
    setInput(text)

    // Auto-detect language:
    // 1) When input was empty (fresh paste)
    // 2) When content is substantially replaced (length ratio > 3x and min 30 chars)
    const shouldDetect =
      (text && !prevInput) ||
      (text.length >= 30 && prevInput.length > 0 &&
        (text.length / Math.max(prevInput.length, 1) > 3 || prevInput.length / Math.max(text.length, 1) > 3))

    if (shouldDetect) {
      const detected = detectLanguage(text)
      if (detected && detected !== language) {
        setLanguage(detected)
        showToast(t('modules.codeMinify.ui.toastAutoDetected', {
          defaultValue: 'Auto-detected: {{lang}}',
          lang: detected.toUpperCase(),
        }))
      }
    }
  }, [input, language, showToast, t])

  // ─── Minify ────────────────────────────────────────────────────────────
  const handleMinify = useCallback(() => {
    if (!input.trim()) return
    try {
      const result = minifyCode(input, language)
      setOutput(result)
      lastInputRef.current = input
      setLastAction('compress')
      showToast(t('modules.codeMinify.ui.toastMinified', { defaultValue: 'Minified' }))
      const items = addHistoryItem({ input, output: result, action: 'compress', language })
      setHistoryItems(items)
    } catch (e) {
      showToast((e as Error).message, 'error')
    }
  }, [input, language, showToast, t])

  // ─── Beautify ──────────────────────────────────────────────────────────
  const handleBeautify = useCallback(() => {
    if (!input.trim()) return
    try {
      const result = beautifyCode(input, language, indent)
      setOutput(result)
      lastInputRef.current = input
      setLastAction('beautify')
      showToast(t('modules.codeMinify.ui.toastBeautified', { defaultValue: 'Beautified' }))
      const items = addHistoryItem({ input, output: result, action: 'beautify', language })
      setHistoryItems(items)
    } catch (e) {
      showToast((e as Error).message, 'error')
    }
  }, [input, language, indent, showToast, t])

  // ─── Paste from clipboard ──────────────────────────────────────────────
  const handlePaste = useCallback(async () => {
    try {
      let text = ''
      if (isTauri()) {
        const { invoke } = await import('@tauri-apps/api/core')
        text = await invoke<string>('get_clipboard_text')
      } else {
        text = await navigator.clipboard.readText()
      }
      if (!text.trim()) return
      setInput(text)
      const detected = detectLanguage(text)
      if (detected) {
        setLanguage(detected)
        showToast(t('modules.codeMinify.ui.toastPasteImported', {
          defaultValue: 'Pasted ({{lang}})',
          lang: detected.toUpperCase(),
        }))
      } else {
        showToast(t('modules.codeMinify.ui.toastPastedPlain', { defaultValue: 'Pasted' }))
      }
    } catch {
      showToast(t('modules.codeMinify.ui.clipboardError', { defaultValue: 'Failed to read clipboard' }), 'error')
    }
  }, [showToast, t])

  // ─── Copy output ───────────────────────────────────────────────────────
  const handleCopy = useCallback(async () => {
    if (!output) return
    await navigator.clipboard.writeText(output)
    showToast(t('modules.codeMinify.ui.toastCopied', { defaultValue: 'Copied to clipboard' }))
  }, [output, showToast, t])

  // ─── Clear ─────────────────────────────────────────────────────────────
  const handleClear = useCallback(async () => {
    if (!input && !output) return
    const ok = await confirm({
      title: t('modules.codeMinify.ui.clearConfirmTitle', { defaultValue: 'Clear content' }),
      message: t('modules.codeMinify.ui.clearConfirmMsg', { defaultValue: 'This will clear all content. This cannot be undone.' }),
      confirmText: t('common.confirm', { defaultValue: 'Confirm' }),
      cancelText: t('common.cancel', { defaultValue: 'Cancel' }),
      danger: true,
    })
    if (ok) {
      setInput('')
      setOutput('')
      lastInputRef.current = ''
      setLastAction(null)
    }
  }, [input, output, confirm, t])

  // ─── Download ──────────────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    if (!output) return
    const ext = getFileExtension(language)
    const prefix = lastAction === 'beautify' ? 'beautified' : 'minified'
    const filename = `${prefix}-${Date.now()}.${ext}`

    // Tauri: native save dialog + writeTextFile
    if (isTauri()) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { writeTextFile } = await import('@tauri-apps/plugin-fs')
        const filePath = await save({
          defaultPath: filename,
          filters: [{ name: `${ext.toUpperCase()} File`, extensions: [ext] }],
        })
        if (filePath) {
          await writeTextFile(filePath, output)
          showToast(t('modules.codeMinify.ui.toastDownloaded', { defaultValue: 'File saved' }))
        }
        return
      } catch { /* fallback to browser */ }
    }

    // Browser fallback
    const blob = new Blob([output], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    showToast(t('modules.codeMinify.ui.toastDownloaded', { defaultValue: 'File saved' }))
  }, [output, language, lastAction, showToast, t])

  // ─── History ───────────────────────────────────────────────────────────
  const handleHistoryRestore = useCallback((item: HistoryItem) => {
    setInput(item.input)
    setOutput(item.output)
    lastInputRef.current = item.input
    setLanguage(item.language)
    setLastAction(item.action)
    setShowHistory(false)
    showToast(t('modules.codeMinify.ui.toastRestored', { defaultValue: 'History restored' }))
  }, [showToast, t])

  const handleHistoryClear = useCallback(() => {
    clearAllHistory()
    setHistoryItems([])
  }, [])

  // ─── Keyboard shortcuts: Alt+M compress, Alt+B beautify ────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        if (e.key === 'm' || e.key === 'M') {
          e.preventDefault()
          handleMinify()
        } else if (e.key === 'b' || e.key === 'B') {
          e.preventDefault()
          handleBeautify()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleMinify, handleBeautify])

  // ─── Drag-and-drop file import ─────────────────────────────────────────
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragOver(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) setIsDragOver(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      const detectedLang = detectLanguageFromExt(file.name)
      if (detectedLang) {
        const text = await file.text()
        setInput(text)
        setLanguage(detectedLang)
        showToast(t('modules.codeMinify.ui.toastFileImported', { defaultValue: 'File imported' }))
      }
    }
  }, [showToast, t])

  // Tauri native file drop
  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined

    ;(async () => {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview')
        const { readTextFile } = await import('@tauri-apps/plugin-fs')
        unlisten = await getCurrentWebview().onDragDropEvent(async (event) => {
          const ev = event.payload
          if (ev.type === 'enter') {
            setIsDragOver(true)
          } else if (ev.type === 'leave') {
            setIsDragOver(false)
          } else if (ev.type === 'drop') {
            setIsDragOver(false)
            const filePath = ev.paths[0]
            if (!filePath) return
            const detectedLang = detectLanguageFromExt(filePath)
            if (detectedLang) {
              try {
                const text = await readTextFile(filePath)
                setInput(text)
                setLanguage(detectedLang)
                showToast(t('modules.codeMinify.ui.toastFileImported', { defaultValue: 'File imported' }))
              } catch { /* file read error */ }
            }
          }
        })
      } catch { /* Tauri API not available */ }
    })()

    return () => { unlisten?.() }
  }, [showToast, t])

  // ─── Stats ─────────────────────────────────────────────────────────────
  const inputLines = useMemo(() => input ? input.split('\n').length : 0, [input])
  const inputChars = input.length
  const inputSize = input ? new Blob([input]).size : null
  const outputSize = output ? new Blob([output]).size : null
  const savings = useMemo(() => {
    if (inputSize && outputSize && lastAction === 'compress') {
      return calcSavings(inputSize, outputSize)
    }
    return null
  }, [inputSize, outputSize, lastAction])

  return (
    <div
      className="relative flex h-full flex-col"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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

        {/* Indent selector */}
        <select
          value={indent}
          onChange={(e) => setIndent(e.target.value as IndentType)}
          className="rounded-md border border-border-base bg-bg-base px-2 py-1.5 text-xs text-text-secondary focus:border-border-focus focus:outline-none"
        >
          <option value="2spaces">{t('modules.codeMinify.ui.indent2Spaces', { defaultValue: '2 Spaces' })}</option>
          <option value="4spaces">{t('modules.codeMinify.ui.indent4Spaces', { defaultValue: '4 Spaces' })}</option>
          <option value="tab">{t('modules.codeMinify.ui.indentTab', { defaultValue: 'Tab' })}</option>
        </select>

        {/* Minify */}
        <button
          onClick={handleMinify}
          disabled={!input.trim()}
          className="relative flex items-center gap-1.5 rounded-md bg-bg-hover px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Minimize2 className="h-4 w-4" />
          <span>{t('modules.codeMinify.ui.minifyBtn', { defaultValue: 'Minify' })}</span>
          {isOutputStale && lastAction === 'compress' && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-warning" />
          )}
        </button>

        {/* Beautify */}
        <button
          onClick={handleBeautify}
          disabled={!input.trim()}
          className="relative flex items-center gap-1.5 rounded-md bg-bg-hover px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Maximize2 className="h-4 w-4" />
          <span>{t('modules.codeMinify.ui.beautifyBtn', { defaultValue: 'Beautify' })}</span>
          {isOutputStale && lastAction === 'beautify' && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-warning" />
          )}
        </button>

        <div className="h-5 w-px bg-border-base" />

        {/* Swap input/output */}
        <button
          onClick={() => { const tmp = input; setInput(output); setOutput(tmp) }}
          disabled={!output}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
          title={t('modules.codeMinify.ui.swapTooltip', { defaultValue: 'Swap input/output' })}
        >
          <ArrowLeftRight className="h-4 w-4" />
          <span className="hidden sm:inline">{t('modules.codeMinify.ui.swapBtn', { defaultValue: 'Swap' })}</span>
        </button>

        <div className="h-5 w-px bg-border-base" />

        {/* Paste */}
        <button
          onClick={handlePaste}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          title={t('modules.codeMinify.ui.pasteTooltip', { defaultValue: 'Paste from clipboard' })}
        >
          <ClipboardPaste className="h-4 w-4" />
          <span className="hidden sm:inline">{t('modules.codeMinify.ui.pasteBtn', { defaultValue: 'Paste' })}</span>
        </button>

        {/* Copy */}
        <button
          onClick={handleCopy}
          disabled={!output}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
          title={t('modules.codeMinify.ui.copyTooltip', { defaultValue: 'Copy output' })}
        >
          <Copy className="h-4 w-4" />
          <span className="hidden sm:inline">{t('modules.codeMinify.ui.copyBtn', { defaultValue: 'Copy' })}</span>
        </button>

        {/* Download */}
        <button
          onClick={handleDownload}
          disabled={!output}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
          title={t('modules.codeMinify.ui.downloadTooltip', { defaultValue: 'Download' })}
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">{t('modules.codeMinify.ui.downloadBtn', { defaultValue: 'Download' })}</span>
        </button>

        {/* History */}
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          title={t('modules.codeMinify.ui.historyTooltip', { defaultValue: 'History' })}
        >
          <History className="h-4 w-4" />
          <span className="hidden sm:inline">{t('modules.codeMinify.ui.historyBtn', { defaultValue: 'History' })}</span>
        </button>

        <div className="flex-1" />

        {/* Clear */}
        <button
          onClick={handleClear}
          disabled={!input && !output}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-muted transition-colors hover:bg-bg-hover hover:text-error disabled:opacity-40 disabled:cursor-not-allowed"
          title={t('common.clear', { defaultValue: 'Clear' })}
        >
          <Trash2 className="h-4 w-4" />
          <span className="hidden sm:inline">{t('common.clear', { defaultValue: 'Clear' })}</span>
        </button>
      </div>

      {/* Editors side by side */}
      <div className="flex flex-1 overflow-hidden">
        {/* Input */}
        <div className="flex min-h-0 flex-1 flex-col border-r border-border-subtle">
          <div className="flex shrink-0 items-center gap-2 px-4 py-1.5 text-xs text-text-muted font-medium bg-bg-elevated border-b border-border-subtle">
            <FileUp className="h-3.5 w-3.5" />
            {t('modules.codeMinify.ui.inputLabel', { defaultValue: 'Input' })}
            <span className="ml-auto text-[11px] font-normal text-text-disabled">
              {t('modules.codeMinify.ui.dragHint', { defaultValue: 'Drop supported code files' })}
            </span>
          </div>
          <div className="flex-1 overflow-hidden">
            <Suspense fallback={<EditorSkeleton />}>
              <Editor
                height="100%"
                language={selectedLang.monacoLang}
                value={input}
                onChange={handleInputChange}
                theme={monacoTheme}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  wordWrap: 'on',
                  padding: { top: 12 },
                  tabSize: indent === 'tab' ? 4 : indent === '4spaces' ? 4 : 2,
                  folding: true,
                  showFoldingControls: 'always',
                  bracketPairColorization: { enabled: true },
                  guides: { bracketPairs: true, indentation: true },
                }}
              />
            </Suspense>
          </div>
        </div>

        {/* Output */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-1.5 text-xs text-text-muted font-medium bg-bg-elevated border-b border-border-subtle">
            <span>{t('modules.codeMinify.ui.outputLabel', { defaultValue: 'Output' })}</span>
            {output && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <Copy className="h-3 w-3" />
                {t('modules.codeMinify.ui.copyBtn', { defaultValue: 'Copy' })}
              </button>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            <Suspense fallback={<EditorSkeleton />}>
              <Editor
                height="100%"
                language={selectedLang.monacoLang}
                value={output}
                theme={monacoTheme}
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
                  tabSize: indent === 'tab' ? 4 : indent === '4spaces' ? 4 : 2,
                  folding: true,
                  showFoldingControls: 'always',
                }}
              />
            </Suspense>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <StatusBar
        inputLines={inputLines}
        inputChars={inputChars}
        inputSize={inputSize}
        outputSize={outputSize}
        outputLines={output ? output.split('\n').length : 0}
        outputChars={output.length}
        savings={savings}
      >
        {/* Drag hint */}
        <span className="flex items-center gap-1 text-text-disabled">
          {t('modules.codeMinify.ui.dragHint', { defaultValue: 'Drop supported code files' })}
        </span>
        {/* In-window shortcut hints */}
        <span className="ml-auto flex items-center gap-1 text-text-disabled">
          <Keyboard size={11} />
          <span>
            {t('modules.codeMinify.ui.inWindowShortcuts', {
              defaultValue: 'Alt+M Compress · Alt+B Beautify',
            })}
          </span>
        </span>
        {/* Floating window shortcut hint */}
        {floatingShortcut && (
          <span className="flex items-center gap-1 text-text-disabled pl-2 border-l border-border-subtle">
            <span>
              {t('modules.codeMinify.ui.floatingShortcutHint', {
                keys: formatShortcut(floatingShortcut),
                defaultValue: `Press ${formatShortcut(floatingShortcut)} to quick minify after copying`,
              })}
            </span>
          </span>
        )}
      </StatusBar>

      {/* Drag overlay */}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-primary/10 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-primary bg-bg-elevated/90 px-8 py-6">
            <FileUp className="mx-auto mb-2 h-8 w-8 text-primary" />
            <p className="text-sm font-medium text-primary">
              {t('modules.codeMinify.ui.dropHint', { defaultValue: 'Drop file here' })}
            </p>
          </div>
        </div>
      )}

      {/* History panel */}
      {showHistory && (
        <HistoryPanel
          items={historyItems}
          onRestore={handleHistoryRestore}
          onClear={handleHistoryClear}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`absolute bottom-12 left-1/2 -translate-x-1/2 rounded-lg px-4 py-2 text-sm font-medium shadow-lg transition-all ${
            toast.type === 'success' ? 'bg-success text-white' : 'bg-error text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
