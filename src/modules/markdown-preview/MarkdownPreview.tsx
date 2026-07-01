/**
 * Markdown Preview Main Component
 * Split-pane editor with live HTML preview, file import, drag-to-resize, and HTML→MD conversion
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Eye, EyeOff, Copy, Download, Trash2, FileText,
  Upload, Maximize2, Minimize2, FileDown, Keyboard,
} from 'lucide-react'
import { useMarkdown } from './hooks/useMarkdown'
import { useShortcutStore } from '../../core/shortcuts'
import { usePageActive } from '../../app/layouts/CachedOutlet'

/** Format Tauri key string to human-readable display */
function formatShortcut(keys: string): string {
  return keys
    .replace(/CommandOrControl/gi, 'Ctrl')
    .replace(/Command/gi, '⌘')
    .replace(/Control/gi, 'Ctrl')
    .replace(/Shift/gi, 'Shift')
    .replace(/Alt/gi, 'Alt')
    .replace(/\+/g, ' + ')
}

export default function MarkdownPreview() {
  const { t } = useTranslation()
  const {
    content, setContent, html,
    downloadHtml, downloadMd, copyHtml, clear,
    importFile, htmlToMarkdown,
    mode, setMode,
  } = useMarkdown()

  const pageActive = usePageActive()

  const [showPreview, setShowPreview] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [splitRatio, setSplitRatio] = useState(50) // percent for editor

  // Read the shortcut key from store dynamically
  const shortcutKeys = useShortcutStore((s) => {
    const sc = s.shortcuts.find((c) => c.action === 'clipboard-to-md')
    return sc?.enabled ? sc?.keys : null
  })
  const [isDragging, setIsDragging] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const syncingRef = useRef(false)
  const dragCounterRef = useRef(0)

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2000)
  }, [])

  // ─── Toolbar actions ────────────────────────────────────────────────────

  const handleCopy = async () => {
    if (mode === 'reverse') {
      // Copy the generated markdown
      await navigator.clipboard.writeText(reverseMd)
      showToast(t('modules.markdownPreview.ui.toastMdCopied'))
    } else {
      await copyHtml()
      showToast(t('modules.markdownPreview.ui.toastCopied'))
    }
  }

  const handleDownloadHtml = async () => {
    const ok = await downloadHtml()
    if (ok) showToast(t('modules.markdownPreview.ui.toastDownloaded'))
  }

  const handleDownloadMd = async () => {
    // In reverse mode, download the generated markdown (not the HTML input)
    const textToSave = mode === 'reverse' ? reverseMd : content
    const ok = await downloadMd(textToSave)
    if (ok) showToast(t('modules.markdownPreview.ui.toastMdDownloaded'))
  }

  const handleClear = () => {
    clear()
    showToast(t('modules.markdownPreview.ui.toastCleared'))
  }

  const handleFileOpen = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // reset for re-import
    const isHtml = file.name.endsWith('.html') || file.name.endsWith('.htm')
    if (isHtml) {
      const text = await file.text()
      setContent(text)
      setMode('reverse')
      showToast(t('modules.markdownPreview.ui.toastFileImported'))
    } else {
      await importFile(file)
      setMode('preview')
      showToast(t('modules.markdownPreview.ui.toastFileImported'))
    }
  }

  // ─── Drag-and-drop ──────────────────────────────────────────────────────

  const [isDragOver, setIsDragOver] = useState(false)

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
    if (dragCounterRef.current === 0) {
      setIsDragOver(false)
    }
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
    if (file && (file.name.endsWith('.md') || file.name.endsWith('.markdown') || file.type === 'text/markdown')) {
      await importFile(file)
      setMode('preview')
      showToast(t('modules.markdownPreview.ui.toastFileImported'))
    } else if (file && (file.name.endsWith('.html') || file.name.endsWith('.htm'))) {
      const text = await file.text()
      setContent(text)
      setMode('reverse')
      showToast(t('modules.markdownPreview.ui.toastFileImported'))
    }
  }, [importFile, showToast, t, setContent, setMode])

  // ─── Tauri native file drop ────────────────────────────────────────────

  useEffect(() => {
    if (!pageActive || typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return
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
            const isHtml = /\.(html|htm)$/i.test(filePath)
            const isMd = /\.(md|markdown)$/i.test(filePath)
            if (isHtml || isMd) {
              try {
                const text = await readTextFile(filePath)
                setContent(text)
                setMode(isHtml ? 'reverse' : 'preview')
                showToast(t('modules.markdownPreview.ui.toastFileImported'))
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
  }, [setContent, setMode, showToast, t, pageActive])

  // ─── Paste HTML/MD detection + auto-switch ────────────────────────────────

  const HTML_DETECT_RE = /<(html|head|body|div|p|span|table|form|section|article|nav|header|footer|aside|main|figure|ul|ol|li|dl|dt|dd|fieldset|legend|details|summary|dialog|template|slot|iframe|canvas|video|audio|source|picture|map|area|colgroup|col|caption|thead|tbody|tfoot|tr|td|th|select|option|textarea|button|label|input|script|style|link|meta|object|embed|param|svg|math)\b[^>]*\/?>/i
  const MD_DETECT_RE = /^#{1,6}\s|^\*{1,3}[^*]+\*{1,3}|^-\s+\[[ x]\]|^\|.*\|/m

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain')
    if (!text || text.length < 10) return

    const isHtml = HTML_DETECT_RE.test(text)
    const isMd = MD_DETECT_RE.test(text) && !isHtml

    if (mode === 'preview' && isHtml) {
      // Pasted HTML in MD→HTML mode → auto-switch to reverse
      setMode('reverse')
      showToast(t('modules.markdownPreview.ui.toastAutoSwitchToMd'))
    } else if (mode === 'reverse' && isMd) {
      // Pasted Markdown in HTML→MD mode → auto-switch to preview
      setMode('preview')
      showToast(t('modules.markdownPreview.ui.toastAutoSwitchToPreview'))
    }
  }, [mode, setMode, showToast, t])

  // ─── Split pane drag ────────────────────────────────────────────────────

  const handleSplitDragStart = useCallback(() => {
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return
    const onMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pct = ((e.clientX - rect.left) / rect.width) * 100
      setSplitRatio(Math.min(Math.max(pct, 20), 80))
    }
    const onMouseUp = () => setIsDragging(false)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isDragging])

  // ─── Scroll sync ────────────────────────────────────────────────────────

  const handleEditorScroll = useCallback(() => {
    if (syncingRef.current || !editorRef.current || !previewRef.current) return
    syncingRef.current = true
    const editor = editorRef.current
    const preview = previewRef.current
    const ratio = editor.scrollTop / (editor.scrollHeight - editor.clientHeight || 1)
    preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight)
    setTimeout(() => { syncingRef.current = false }, 50)
  }, [])

  const handlePreviewScroll = useCallback(() => {
    if (syncingRef.current || !editorRef.current || !previewRef.current) return
    syncingRef.current = true
    const editor = editorRef.current
    const preview = previewRef.current
    const ratio = preview.scrollTop / (preview.scrollHeight - preview.clientHeight || 1)
    editor.scrollTop = ratio * (editor.scrollHeight - editor.clientHeight)
    setTimeout(() => { syncingRef.current = false }, 50)
  }, [])

  // ─── Task list checkbox interaction ─────────────────────────────────────

  const handlePreviewClick = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement

    // Task list checkbox toggle
    if (target.classList.contains('task-checkbox')) {
      e.preventDefault()
      const lineIdx = parseInt(target.getAttribute('data-line') ?? '0', 10)
      const isChecked = (target as HTMLInputElement).checked
      const lines = content.split('\n')
      const CHECK_RE = /^(\s*- \[)(x| )(\])/i
      for (let i = lineIdx; i >= Math.max(0, lineIdx - 2); i--) {
        if (CHECK_RE.test(lines[i])) {
          lines[i] = lines[i].replace(CHECK_RE, `$1${isChecked ? ' ' : 'x'}$3`)
          setContent(lines.join('\n'))
          break
        }
      }
      return
    }

    // Link click: only open absolute http(s) URLs externally
    const anchor = target.closest('a') as HTMLAnchorElement | null
    if (anchor) {
      const href = anchor.getAttribute('href') ?? ''
      if (!/^https?:\/\//i.test(href)) {
        e.preventDefault()
        return
      }
      e.preventDefault()
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        try {
          const { open: shellOpen } = await import('@tauri-apps/plugin-shell')
          await shellOpen(href)
        } catch { /* ignore */ }
      } else {
        window.open(href, '_blank', 'noopener,noreferrer')
      }
    }
  }, [content, setContent])

  // ─── Mermaid diagram rendering ──────────────────────────────────────────
  const mermaidInit = useRef(false)
  useEffect(() => {
    if (mode !== 'preview' || !showPreview) return
    const el = previewRef.current
    if (!el) return
    const diagrams = el.querySelectorAll<HTMLElement>('.mermaid')
    if (diagrams.length === 0) return
    let cancelled = false
    import('mermaid').then(async (m) => {
      if (cancelled) return
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      if (cancelled) return
      if (!mermaidInit.current) {
        m.default.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' })
        mermaidInit.current = true
      }
      diagrams.forEach((node) => {
        if (node.dataset.raw) {
          node.textContent = node.dataset.raw
          delete node.dataset.processed
        } else {
          node.dataset.raw = node.textContent ?? ''
        }
      })
      try {
        await m.default.run({ nodes: diagrams as unknown as NodeListOf<HTMLElement>, suppressErrors: true })
      } catch { /* fallback shows raw text */ }
    })
    return () => { cancelled = true }
  }, [html, mode, showPreview])

  // ─── Reverse mode: HTML input → MD output ──────────────────────────────

  const reverseMd = useMemo(() => {
    if (mode !== 'reverse') return ''
    return htmlToMarkdown(content)
  }, [mode, content, htmlToMarkdown])

  // ─── Stats ──────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const text = mode === 'reverse' ? reverseMd : content
    // CJK-aware word count: each CJK char counts as one word
    const cjkCount = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []).length
    const nonCjkText = text.replace(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g, ' ')
    const latinWords = nonCjkText.trim().split(/\s+/).filter(Boolean).length
    const words = cjkCount + latinWords
    const chars = text.length
    const lines = text.split('\n').length
    return { words, chars, lines }
  }, [content, mode, reverseMd])

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      className="relative flex h-full flex-col"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,.html,.htm,text/markdown,text/html"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-elevated px-4 py-2">
        <FileText className="h-4 w-4 text-text-muted" />
        <span className="text-sm font-medium text-text-primary">{t('modules.markdownPreview.name')}</span>
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border-subtle bg-bg-elevated/50 px-3 py-1.5">

        {/* Mode toggle: Segmented Control */}
        <div className="flex overflow-hidden rounded-md border border-border-subtle">
          <button
            onClick={() => setMode('preview')}
            className={`px-2.5 py-1 text-xs font-medium transition-colors ${
              mode === 'preview'
                ? 'bg-primary/10 text-primary'
                : 'text-text-muted hover:bg-bg-hover'
            }`}
          >
            {t('modules.markdownPreview.ui.mdToHtml', { defaultValue: 'MD to HTML' })}
          </button>
          <button
            onClick={() => setMode('reverse')}
            className={`px-2.5 py-1 text-xs font-medium transition-colors ${
              mode === 'reverse'
                ? 'bg-primary/10 text-primary'
                : 'text-text-muted hover:bg-bg-hover'
            }`}
          >
            {t('modules.markdownPreview.ui.htmlToMd', { defaultValue: 'HTML to MD' })}
          </button>
        </div>

        {/* Toggle preview pane */}
        <button
          onClick={() => setShowPreview(!showPreview)}
          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
            showPreview
              ? 'bg-primary/10 text-primary'
              : 'text-text-muted hover:bg-bg-hover hover:text-text-secondary'
          }`}
        >
          {showPreview ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {t('modules.markdownPreview.ui.previewToggle')}
        </button>

        <div className="mx-1 h-5 w-px bg-border-base" />

        {/* Open file */}
        <button
          onClick={handleFileOpen}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          title={t('modules.markdownPreview.ui.openFile')}
        >
          <Upload className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t('modules.markdownPreview.ui.openFileBtn')}</span>
        </button>

        {/* Copy (rich text in preview mode, plain text in reverse mode) */}
        <button
          onClick={handleCopy}
          disabled={!content}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
          title={mode === 'reverse' ? t('modules.markdownPreview.ui.copyMdTooltip') : t('modules.markdownPreview.ui.copyTooltip')}
        >
          <Copy className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{mode === 'reverse' ? 'MD' : 'HTML'}</span>
        </button>

        {/* Download HTML */}
        {mode === 'preview' && (
          <button
            onClick={handleDownloadHtml}
            disabled={!content}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
            title={t('modules.markdownPreview.ui.downloadTooltip')}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">HTML</span>
          </button>
        )}

        {/* Download .md */}
        <button
          onClick={handleDownloadMd}
          disabled={mode === 'reverse' ? !reverseMd : !content}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
          title={t('modules.markdownPreview.ui.downloadMdTooltip')}
        >
          <FileDown className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">MD</span>
        </button>

        <div className="flex-1" />

        {/* Fullscreen preview */}
        <button
          onClick={() => setFullscreen(!fullscreen)}
          className={`flex items-center rounded-md p-1.5 transition-colors ${
            fullscreen
              ? 'text-primary'
              : 'text-text-muted hover:bg-bg-hover hover:text-text-secondary'
          }`}
          title={t('modules.markdownPreview.ui.fullscreen')}
        >
          {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>

        {/* Clear */}
        <button
          onClick={handleClear}
          disabled={!content}
          className="flex items-center rounded-md p-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-error disabled:opacity-40 disabled:cursor-not-allowed"
          title={t('common.clear')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Split pane */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* Editor (hidden in fullscreen preview mode) */}
        {!fullscreen && (
          <div
            className={`overflow-hidden ${showPreview ? 'border-r border-border-subtle' : ''}`}
            style={{ width: showPreview ? `${splitRatio}%` : '100%' }}
          >
            <textarea
              ref={editorRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onScroll={handleEditorScroll}
              onPaste={handlePaste}
              placeholder={
                mode === 'reverse'
                  ? t('modules.markdownPreview.ui.reversePlaceholder')
                  : t('modules.markdownPreview.ui.editorPlaceholder')
              }
              className="h-full w-full resize-none bg-bg-base p-4 font-mono text-sm text-text-primary outline-none placeholder:text-text-disabled"
              spellCheck={false}
            />
          </div>
        )}

        {/* Drag handle */}
        {showPreview && !fullscreen && (
          <div
            onMouseDown={handleSplitDragStart}
            className={`w-1 cursor-col-resize bg-transparent transition-colors hover:bg-primary/30 ${
              isDragging ? 'bg-primary/30' : ''
            }`}
          />
        )}

        {/* Preview */}
        {showPreview && (
          <div
            ref={previewRef}
            className="flex-1 overflow-y-auto p-6"
            onScroll={handlePreviewScroll}
          >
            {mode === 'preview' ? (
              <div
                className="markdown-preview prose prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: html }}
                onClick={handlePreviewClick}
              />
            ) : (
              <pre className="h-full w-full whitespace-pre-wrap font-mono text-sm text-text-primary leading-relaxed">
                {reverseMd}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 border-t border-border-subtle bg-bg-elevated px-4 py-1.5 text-xs text-text-muted">
        <span>{t('modules.markdownPreview.ui.statusLines')} <span className="text-text-secondary">{stats.lines}</span></span>
        <span>{t('modules.markdownPreview.ui.statusWords')} <span className="text-text-secondary">{stats.words}</span></span>
        <span>{t('modules.markdownPreview.ui.statusChars')} <span className="text-text-secondary">{stats.chars}</span></span>
        {mode === 'reverse' && (
          <span className="text-primary">{t('modules.markdownPreview.ui.statusReverse')}</span>
        )}
        {/* Shortcut hint — dynamic, reads from store */}
        {shortcutKeys && (
          <span className="ml-auto flex items-center gap-1 text-text-disabled">
            <Keyboard size={11} />
            <span>
              {t('modules.markdownPreview.ui.shortcutHint', {
                keys: formatShortcut(shortcutKeys),
                defaultValue: `Press ${formatShortcut(shortcutKeys)} to quick convert`,
              })}
            </span>
          </span>
        )}
      </div>

      {/* Drag overlay */}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-primary/60 bg-primary/5">
          <div className="rounded-lg bg-bg-elevated px-6 py-4 text-sm font-medium text-primary shadow-lg">
            {t('modules.markdownPreview.ui.dropHint')}
          </div>
        </div>
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
