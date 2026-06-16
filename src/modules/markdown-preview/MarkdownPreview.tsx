/**
 * Markdown Preview Main Component
 * Split-pane editor with live HTML preview
 */

import { useState, useCallback, useMemo } from 'react'
import { Eye, EyeOff, Copy, Download, Trash2, FileText } from 'lucide-react'
import { useMarkdown } from './hooks/useMarkdown'

export default function MarkdownPreview() {
  const { content, setContent, html, downloadHtml, copyHtml, clear } = useMarkdown()
  const [showPreview, setShowPreview] = useState(true)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2000)
  }, [])

  const handleCopy = async () => {
    await copyHtml()
    showToast('HTML copied to clipboard')
  }

  const handleDownload = () => {
    downloadHtml()
    showToast('HTML file downloaded')
  }

  const handleClear = () => {
    clear()
    showToast('Cleared')
  }

  // Word count stats
  const stats = useMemo(() => {
    const words = content.trim().split(/\s+/).filter(Boolean).length
    const chars = content.length
    const lines = content.split('\n').length
    return { words, chars, lines }
  }, [content])

  return (
    <div className="relative flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border-subtle bg-bg-elevated px-4 py-2">
        <FileText className="h-4 w-4 text-text-muted" />
        <span className="text-sm font-medium text-text-primary">Markdown Preview</span>

        <div className="mx-2 h-5 w-px bg-border-base" />

        {/* Toggle preview */}
        <button
          onClick={() => setShowPreview(!showPreview)}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
            showPreview
              ? 'bg-primary/10 text-primary'
              : 'text-text-muted hover:bg-bg-hover hover:text-text-secondary'
          }`}
        >
          {showPreview ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          Preview
        </button>

        {/* Copy HTML */}
        <button
          onClick={handleCopy}
          disabled={!content}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
          title="Copy rendered HTML"
        >
          <Copy className="h-4 w-4" />
        </button>

        {/* Download HTML */}
        <button
          onClick={handleDownload}
          disabled={!content}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
          title="Download as HTML"
        >
          <Download className="h-4 w-4" />
        </button>

        <div className="flex-1" />

        {/* Clear */}
        <button
          onClick={handleClear}
          disabled={!content}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-muted transition-colors hover:bg-bg-hover hover:text-error disabled:opacity-40 disabled:cursor-not-allowed"
          title="Clear"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Split pane */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor */}
        <div className={`flex-1 overflow-hidden ${showPreview ? 'border-r border-border-subtle' : ''}`}>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type your markdown here..."
            className="h-full w-full resize-none bg-bg-base p-4 font-mono text-sm text-text-primary outline-none placeholder:text-text-disabled"
            spellCheck={false}
          />
        </div>

        {/* Preview */}
        {showPreview && (
          <div className="flex-1 overflow-y-auto p-6">
            <div
              className="markdown-preview prose prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 border-t border-border-subtle bg-bg-elevated px-4 py-1.5 text-xs text-text-muted">
        <span>Lines: <span className="text-text-secondary">{stats.lines}</span></span>
        <span>Words: <span className="text-text-secondary">{stats.words}</span></span>
        <span>Chars: <span className="text-text-secondary">{stats.chars}</span></span>
      </div>

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
