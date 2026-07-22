/**
 * JSON Formatter Main Component
 * Monaco-based JSON editor with format, compress, validate, history, and drag-drop import.
 */

import { useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, FileJson } from 'lucide-react'
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
import { useSettingsStore } from '../../core'
import { useConfirm } from '../../components/Dialog'
import { useShortcutStore } from '../../core/shortcuts'
import { usePageActive } from '../../app/layouts/CachedOutlet'
import { formatShortcut, formatPlainShortcuts, isTauri } from '../../shared/utils'

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
  const confirm = useConfirm()
  const pageActive = usePageActive()
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
    debouncedValidate,
    getStats,
  } = useJsonFormat()

  const [showHistory, setShowHistory] = useState(false)
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>(() => loadHistory())
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Monaco editor ref for fold/unfold commands and direct content access
  const editorRef = useRef<any>(null)

  const handleEditorMount = useCallback((editor: unknown) => {
    editorRef.current = editor
    // Set initial content (e.g. from clipboard quick-trigger) without using controlled `value` prop
    if (input) {
      (editor as any).setValue(input)
    }
  }, [input])

  /** Read current editor content (always fresh, no stale state) */
  const getEditorContent = useCallback((): string => {
    return editorRef.current?.getValue() ?? ''
  }, [])

  /** Push content to editor (only for programmatic changes, preserves folding) */
  const pushToEditor = useCallback((text: string) => {
    editorRef.current?.setValue(text)
  }, [])

  const handleFoldAll = useCallback(() => {
    // Use getAction().run() — bypasses context precondition checks that may fail after editing
    editorRef.current?.getAction?.('editor.foldAll')?.run()
    setIsAllFolded(true)
  }, [])

  const handleUnfoldAll = useCallback(() => {
    editorRef.current?.getAction?.('editor.unfoldAll')?.run()
    setIsAllFolded(false)
  }, [])

  const [isAllFolded, setIsAllFolded] = useState(false)

  // Theme: resolve 'system' for Monaco
  const appTheme = useSettingsStore((s) => s.theme)
  const monacoTheme = useMemo(() => {
    if (appTheme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'vs-dark' : 'vs'
    }
    return appTheme === 'dark' ? 'vs-dark' : 'vs'
  }, [appTheme])

  // Read shortcut keys for display
  const floatingShortcut = useShortcutStore((s) => {
    const sc = s.shortcuts.find((c) => c.action === 'clipboard-to-json')
    return sc?.enabled ? sc?.keys : null
  })

  // Show toast notification
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2000)
  }, [])

  // Handle editor content change (debounced validation only, no state sync)
  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      const text = value ?? ''
      setInput(text) // for stats/error tracking only — not fed back to editor
      if (text.trim()) {
        debouncedValidate(text)
      } else {
        // Clear error when empty
        validate('')
      }
    },
    [setInput, debouncedValidate, validate]
  )

  // Format handler — reads from hook state, pushes result to editor
  const handleFormat = useCallback(() => {
    const currentInput = getEditorContent()
    const result = format(currentInput)
    if (result.success) {
      pushToEditor(result.output!)
      setInput(result.output!) // sync state for stats
      const items = addHistory({ input: currentInput, action: 'format' })
      setHistoryItems(items)
      showToast(t('modules.jsonFormatter.ui.toastFormatted'))
    } else {
      showToast(result.error ?? t('modules.jsonFormatter.ui.toastFormatFailed'), 'error')
    }
  }, [format, getEditorContent, pushToEditor, setInput, showToast, t])

  // Compress handler
  const handleCompress = useCallback(() => {
    const currentInput = getEditorContent()
    const result = compress(currentInput)
    if (result.success) {
      pushToEditor(result.output!)
      setInput(result.output!) // sync state for stats
      const items = addHistory({ input: currentInput, action: 'compress' })
      setHistoryItems(items)
      showToast(t('modules.jsonFormatter.ui.toastCompressed'))
    } else {
      showToast(result.error ?? t('modules.jsonFormatter.ui.toastCompressFailed'), 'error')
    }
  }, [compress, getEditorContent, pushToEditor, setInput, showToast, t])

  // Copy handler — copies current editor content (valid or not)
  const handleCopy = useCallback(async () => {
    const content = getEditorContent()
    if (content) {
      await navigator.clipboard.writeText(content)
      showToast(t('modules.jsonFormatter.ui.toastCopied'))
    }
  }, [getEditorContent, showToast, t])

  // Export handler — Tauri save dialog + browser fallback
  const handleExport = useCallback(async () => {
    const content = getEditorContent()
    if (!content) return
    const filename = `formatted-${Date.now()}.json`

    // Tauri: native save dialog
    if (isTauri()) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { writeTextFile } = await import('@tauri-apps/plugin-fs')
        const filePath = await save({
          defaultPath: filename,
          filters: [{ name: 'JSON File', extensions: ['json'] }],
        })
        if (filePath) {
          await writeTextFile(filePath, content)
          showToast(t('modules.jsonFormatter.ui.toastExported'))
        }
        return
      } catch { /* fallback to browser */ }
    }

    // Browser fallback
    const blob = new Blob([content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    showToast(t('modules.jsonFormatter.ui.toastExported'))
  }, [getEditorContent, showToast, t])

  // Clear handler — with confirmation dialog
  const handleClear = useCallback(async () => {
    const content = getEditorContent()
    if (!content) return
    const ok = await confirm({
      title: t('modules.jsonFormatter.ui.clearConfirmTitle', { defaultValue: 'Clear content' }),
      message: t('modules.jsonFormatter.ui.clearConfirmMsg', { defaultValue: 'This will clear all content in the editor. This cannot be undone.' }),
      confirmText: t('common.confirm', { defaultValue: 'Confirm' }),
      cancelText: t('common.cancel', { defaultValue: 'Cancel' }),
      danger: true,
    })
    if (ok) {
      pushToEditor('')
      setInput('')
      showToast(t('modules.jsonFormatter.ui.toastCleared'))
    }
  }, [getEditorContent, confirm, pushToEditor, setInput, showToast, t])

  // History restore handler
  const handleHistoryRestore = useCallback(
    (item: HistoryItem) => {
      pushToEditor(item.input)
      setInput(item.input)
      validate(item.input)
      setShowHistory(false)
      showToast(t('modules.jsonFormatter.ui.toastRestored'))
    },
    [pushToEditor, setInput, validate, showToast, t]
  )

  // History clear handler
  const handleHistoryClear = useCallback(() => {
    clearHistory()
    setHistoryItems([])
  }, [])

  // Keyboard shortcuts: Alt+F format, Alt+M compress (minimize)
  useEffect(() => {
    if (!pageActive) return
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        // Use e.code as fallback: on macOS Option+letter produces special chars in e.key
        if (e.key === 'f' || e.key === 'F' || e.code === 'KeyF') {
          e.preventDefault()
          handleFormat()
        } else if (e.key === 'm' || e.key === 'M' || e.code === 'KeyM') {
          e.preventDefault()
          handleCompress()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleFormat, handleCompress, pageActive])

  // ─── Drag-and-drop .json file import ──────────────────────────────────────

  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounterRef = useRef(0)

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
    if (file && (file.name.endsWith('.json') || file.type === 'application/json')) {
      const text = await file.text()
      pushToEditor(text)
      setInput(text)
      validate(text)
      showToast(t('modules.jsonFormatter.ui.toastFileImported', { defaultValue: 'File imported' }))
    }
  }, [pushToEditor, setInput, validate, showToast, t])

  // Tauri native file drop
  useEffect(() => {
    if (!pageActive || !isTauri()) return
    let unlistenFn: (() => void) | undefined
    let cleanedUp = false

    ;(async () => {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview')
        const { readTextFile } = await import('@tauri-apps/plugin-fs')
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
            if (/\.json$/i.test(filePath)) {
              try {
                const text = await readTextFile(filePath)
                pushToEditor(text)
                setInput(text)
                validate(text)
                showToast(t('modules.jsonFormatter.ui.toastFileImported', { defaultValue: 'File imported' }))
              } catch { /* file read error */ }
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
  }, [pushToEditor, setInput, validate, showToast, t, pageActive])

  // Statistics
  const stats = useMemo(() => getStats(), [input, getStats])
  const isValid = !!input.trim() && lastError === null

  return (
    <div
      className="relative flex h-full flex-col"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-elevated px-4 py-2">
        <FileJson className="h-4 w-4 text-text-muted" />
        <span className="text-sm font-medium text-text-primary">{t('modules.jsonFormatter.name')}</span>
      </div>

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
        onFoldAll={handleFoldAll}
        onUnfoldAll={handleUnfoldAll}
        isCompressed={!input.includes('\n')}
        isAllFolded={isAllFolded}
        hasContent={!!input}
        isValid={isValid}
      />

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={<EditorSkeleton />}>
          <Editor
            height="100%"
            defaultLanguage="json"
            onChange={handleEditorChange}
            onMount={handleEditorMount}
            theme={monacoTheme}
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
              folding: true,
              showFoldingControls: 'always',
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
      <StatusBar stats={stats} error={lastError} errorPosition={errorPosition}>
        {/* Drag hint */}
        <span className="flex items-center gap-1 text-text-disabled">
          <span>
            {t('modules.jsonFormatter.ui.dragHint', {
              defaultValue: 'Drop .json to import',
            })}
          </span>
        </span>
        {/* In-window shortcut hints */}
        <span className="ml-auto flex items-center gap-1 text-text-disabled">
          <Keyboard size={11} />
          <span>
            {formatPlainShortcuts(t('modules.jsonFormatter.ui.inWindowShortcuts', {
              defaultValue: 'Alt+F Format · Alt+M Compress',
            }))}
          </span>
        </span>
        {/* Floating window shortcut hint */}
        {floatingShortcut && (
          <span className="flex items-center gap-1 text-text-disabled pl-2 border-l border-border-subtle">
            <span>
              {t('modules.jsonFormatter.ui.floatingShortcutHint', {
                keys: formatShortcut(floatingShortcut),
                defaultValue: `Press ${formatShortcut(floatingShortcut)} to quick format after copying JSON`,
              })}
            </span>
          </span>
        )}
      </StatusBar>

      {/* History panel */}
      {showHistory && (
        <HistoryPanel
          items={historyItems}
          onRestore={handleHistoryRestore}
          onClear={handleHistoryClear}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Drag overlay */}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-primary/60 bg-primary/5">
          <div className="rounded-lg bg-bg-elevated px-6 py-4 text-sm font-medium text-primary shadow-lg">
            {t('modules.jsonFormatter.ui.dropHint', { defaultValue: 'Drop .json file here' })}
          </div>
        </div>
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
