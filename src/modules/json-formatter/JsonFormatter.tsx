/**
 * JSON Formatter Main Component
 */

import { useState, useCallback, useMemo, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { useJsonFormat } from './hooks/useJsonFormat'
import { Toolbar } from './components/Toolbar'
import { StatusBar } from './components/StatusBar'
import {
  HistoryPanel,
  loadHistory,
  addHistory,
  clearHistory,
  type HistoryItem,
} from './components/HistoryPanel'

// Lazy load Monaco Editor
const Editor = lazy(() =>
  import('@monaco-editor/react').then((mod) => ({ default: mod.default }))
)

// Editor loading skeleton
function EditorSkeleton() {
  const { t } = useTranslation()
  return (
    <div className="flex h-full items-center justify-center bg-[#1e1e1e]">
      <div className="animate-pulse text-text-muted text-sm">{t('modules.jsonFormatter.ui.loadingEditor')}</div>
    </div>
  )
}

export default function JsonFormatter() {
  const { t } = useTranslation()
  const {
    input,
    setInput,
    indent,
    setIndent,
    lastError,
    errorPosition,
    format,
    compress,
    validate,
    getStats,
  } = useJsonFormat()

  const [showHistory, setShowHistory] = useState(false)
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>(() => loadHistory())
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Show toast notification
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2000)
  }, [])

  // Handle editor content change
  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      const text = value ?? ''
      setInput(text)
      if (text.trim()) {
        validate(text)
      }
    },
    [setInput, validate]
  )

  // Format handler
  const handleFormat = useCallback(() => {
    const result = format()
    if (result.success) {
      const items = addHistory({ input, action: 'format' })
      setHistoryItems(items)
      showToast(t('modules.jsonFormatter.ui.toastFormatted'))
    } else {
      showToast(result.error ?? t('modules.jsonFormatter.ui.toastFormatFailed'), 'error')
    }
  }, [format, input, showToast])

  // Compress handler
  const handleCompress = useCallback(() => {
    const result = compress()
    if (result.success) {
      const items = addHistory({ input, action: 'compress' })
      setHistoryItems(items)
      showToast(t('modules.jsonFormatter.ui.toastCompressed'))
    } else {
      showToast(result.error ?? t('modules.jsonFormatter.ui.toastCompressFailed'), 'error')
    }
  }, [compress, input, showToast])

  // Copy handler
  const handleCopy = useCallback(async () => {
    if (input) {
      await navigator.clipboard.writeText(input)
      showToast(t('modules.jsonFormatter.ui.toastCopied'))
    }
  }, [input, showToast])

  // Export handler
  const handleExport = useCallback(() => {
    if (!input) return
    const blob = new Blob([input], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `formatted-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast(t('modules.jsonFormatter.ui.toastExported'))
  }, [input, showToast])

  // Clear handler
  const handleClear = useCallback(() => {
    setInput('')
    showToast(t('modules.jsonFormatter.ui.toastCleared'))
  }, [setInput, showToast])

  // History restore handler
  const handleHistoryRestore = useCallback(
    (item: HistoryItem) => {
      setInput(item.input)
      setShowHistory(false)
      showToast(t('modules.jsonFormatter.ui.toastRestored'))
    },
    [setInput, showToast]
  )

  // History clear handler
  const handleHistoryClear = useCallback(() => {
    clearHistory()
    setHistoryItems([])
  }, [])

  // Statistics
  const stats = useMemo(() => getStats(), [input, getStats])
  // Derive isValid from state instead of calling validate() during render (causes infinite loop)
  const isValid = !!input.trim() && lastError === null

  return (
    <div className="relative flex h-full flex-col">
      {/* Toolbar */}
      <Toolbar
        indent={indent}
        onIndentChange={setIndent}
        onFormat={handleFormat}
        onCompress={handleCompress}
        onCopy={handleCopy}
        onClear={handleClear}
        onExport={handleExport}
        onHistory={() => setShowHistory(!showHistory)}
        hasContent={!!input}
        isValid={isValid}
      />

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={<EditorSkeleton />}>
          <Editor
            height="100%"
            defaultLanguage="json"
            value={input}
            onChange={handleEditorChange}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: indent === 'tab' ? 4 : indent === '4spaces' ? 4 : 2,
              wordWrap: 'on',
              padding: { top: 16 },
              renderLineHighlight: 'line',
              bracketPairColorization: { enabled: true },
              guides: {
                bracketPairs: true,
                indentation: true,
              },
            }}
          />
        </Suspense>
      </div>

      {/* Status bar */}
      <StatusBar stats={stats} error={lastError} errorPosition={errorPosition} />

      {/* History panel */}
      {showHistory && (
        <HistoryPanel
          items={historyItems}
          onRestore={handleHistoryRestore}
          onClear={handleHistoryClear}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <div
          className={`absolute bottom-12 left-1/2 -translate-x-1/2 rounded-lg px-4 py-2 text-sm font-medium shadow-lg transition-all ${
            toast.type === 'success'
              ? 'bg-success text-white'
              : 'bg-error text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
