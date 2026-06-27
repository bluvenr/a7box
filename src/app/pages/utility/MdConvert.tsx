/**
 * Markdown Quick Convert Utility Window
 * Floating window that reads clipboard HTML and converts to Markdown.
 * Triggered by global shortcut (Ctrl+Shift+M).
 */
import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { FileDown, Copy, X, ArrowLeftRight, Check, Eye, Code, Maximize2, Minimize2 } from 'lucide-react'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import { applyTaskListPlugin, applyKatexPlugin, applyMermaidPlugin } from '../../../modules/markdown-preview/shared/mdPlugins'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  hr: '---',
})
turndownService.use(gfm)

const mdRenderer = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
  highlight(str: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang }).value}</code></pre>`
      } catch { /* fall through */ }
    }
    return `<pre class="hljs"><code>${mdRenderer.utils.escapeHtml(str)}</code></pre>`
  },
})
applyTaskListPlugin(mdRenderer)
applyKatexPlugin(mdRenderer)
applyMermaidPlugin(mdRenderer)

// Links: click handler manages navigation (no target=_blank to interfere with preventDefault)

const HTML_DETECT_RE = /<(html|head|body|div|p|span|table|form|section|article|nav|header|footer|ul|ol|li|dl|dd|dt|h[1-6]|a|img|br|em|strong|b|i|u|blockquote|pre|code|hr|figure|figcaption|details|summary|script|style|link|meta|input|button|label|select|textarea|svg|video|audio|canvas|iframe)\b/gi
const MD_DETECT_RE = /(^#{1,6}\s|^```|^---$|\[.+?\]\(.+?\)|^\*\s|^\-\s|\|\s.+\s\|)/gm
const HTML_STRUCTURE_RE = /<(html|head|body)\b/i

type Mode = 'html-to-md' | 'md-to-html'

export default function MdConvert() {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<Mode>('html-to-md')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(true)
  const [outputFullscreen, setOutputFullscreen] = useState(false)

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
          setError(t('mdQuick.clipboardEmpty', { defaultValue: '剪贴板为空' }))
          return
        }
        setInput(trimmed)
        // Auto-detect mode: score-based heuristic
        const htmlMatches = trimmed.match(HTML_DETECT_RE) || []
        const mdMatches = trimmed.match(MD_DETECT_RE) || []
        const hasHtmlStructure = HTML_STRUCTURE_RE.test(trimmed)
        // HTML structure tags → definitely HTML
        // More HTML tags than MD patterns → HTML
        // Otherwise → Markdown
        if (hasHtmlStructure || (htmlMatches.length > 3 && htmlMatches.length > mdMatches.length)) {
          setMode('html-to-md')
        } else {
          setMode('md-to-html')
        }
        setError(null)
      } catch {
        setError(t('mdQuick.clipboardError', { defaultValue: '无法读取剪贴板' }))
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closeWindow = useCallback(async () => {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('close_utility_window', { label: 'md-convert' })
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
    } catch { /* ignore in non-Tauri env */ }
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
    if (!input) return ''
    try {
      if (mode === 'html-to-md') {
        return turndownService.turndown(input)
      }
      return mdRenderer.render(input)
    } catch (e) {
      return `Error: ${(e as Error).message}`
    }
  }, [input, mode])

  // ─── Mermaid rendering ─────────────────────────────────────────────
  const outputRef = useRef<HTMLDivElement>(null)
  const mermaidInit = useRef(false)
  useEffect(() => {
    if (!output || mode !== 'md-to-html' || !showPreview) return
    const el = outputRef.current
    if (!el) return
    const diagrams = el.querySelectorAll<HTMLElement>('.mermaid')
    if (diagrams.length === 0) return
    let cancelled = false
    import('mermaid').then(async (m) => {
      if (cancelled) return
      // Wait one frame to ensure DOM is painted before mermaid processes it
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      if (cancelled) return
      // Initialize once
      if (!mermaidInit.current) {
        m.default.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' })
        mermaidInit.current = true
      }
      // Reset: restore original source text, clear data-processed
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
      } catch { /* mermaid render error — fallback shows raw text */ }
    })
    return () => { cancelled = true }
  }, [output, mode, showPreview])

  // ─── Link click handler: open absolute URLs externally, ignore relative ──
  const handlePreviewClick = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest('a') as HTMLAnchorElement | null
    if (!anchor) return
    const href = anchor.getAttribute('href') ?? ''
    // Only allow absolute http(s) links
    if (!/^https?:\/\//i.test(href)) {
      e.preventDefault()
      return
    }
    e.preventDefault()
    if (isTauri()) {
      try {
        const { open: shellOpen } = await import('@tauri-apps/plugin-shell')
        await shellOpen(href)
      } catch { /* ignore */ }
    } else {
      window.open(href, '_blank', 'noopener,noreferrer')
    }
  }, [])

  // Build complete HTML document for download (MD→HTML mode)
  const buildHtmlDocument = (bodyHtml: string): string => {
    return `<!DOCTYPE html>
<html lang="">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Converted Document</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 2em auto; padding: 0 1em; line-height: 1.7; color: #1a1a1a; }
    pre, code { background: #f5f5f5; border-radius: 4px; font-family: 'Cascadia Code', 'Fira Code', monospace; }
    pre { padding: 1em; overflow-x: auto; border: 1px solid #e0e0e0; }
    code { padding: 0.2em 0.4em; }
    blockquote { border-left: 4px solid #3b82f6; padding-left: 1em; margin: 1em 0; color: #666; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #e0e0e0; padding: 0.5em 1em; }
    th { background: #f5f5f5; }
    img { max-width: 100%; }
    a { color: #3b82f6; }
    .task-list-item { list-style: none; margin-left: -1.5em; }
    .task-checkbox { margin-right: 0.4em; }
    .katex-block { margin: 1em 0; overflow-x: auto; }
    @media (prefers-color-scheme: dark) {
      body { background: #0f0f0f; color: #e0e0e0; }
      pre, code { background: #1a1a1a; border-color: #333; }
      blockquote { border-left-color: #60a5fa; color: #999; }
      th { background: #1a1a1a; }
      th, td { border-color: #333; }
      a { color: #60a5fa; }
    }
    .mermaid { display: flex; justify-content: center; margin: 1em 0; overflow-x: auto; }
    .mermaid svg { max-width: 100%; height: auto; }
  </style>
</head>
<body>
${bodyHtml}
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: true, theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default' });
</script>
</body>
</html>`
  }

  const handleCopy = async () => {
    if (!output) return
    await navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = async () => {
    if (!output) return
    const ext = mode === 'html-to-md' ? 'md' : 'html'
    const mime = mode === 'html-to-md' ? 'text/markdown' : 'text/html'
    const filename = `convert-${Date.now()}.${ext}`
    // For MD→HTML, wrap in complete document
    const fileContent = mode === 'md-to-html' ? buildHtmlDocument(output) : output

    if (isTauri()) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { writeTextFile } = await import('@tauri-apps/plugin-fs')
        const filePath = await save({
          defaultPath: filename,
          filters: [{ name: ext === 'md' ? 'Markdown' : 'HTML', extensions: [ext] }],
        })
        if (!filePath) return
        await writeTextFile(filePath, fileContent)
      } catch { /* ignore */ }
    } else {
      const blob = new Blob([fileContent], { type: `${mime}; charset=utf-8` })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setShowPreview(next === 'md-to-html')
  }

  const lines = input.split('\n').length
  const chars = input.length

  // Output labels (i18n)
  const inputLabel = mode === 'html-to-md'
    ? t('mdQuick.inputLabelHtml', { defaultValue: 'HTML 输入' })
    : t('mdQuick.inputLabelMd', { defaultValue: 'Markdown 输入' })
  const outputLabel = mode === 'html-to-md'
    ? t('mdQuick.outputLabelMd', { defaultValue: 'Markdown 输出' })
    : t('mdQuick.outputLabelHtml', { defaultValue: 'HTML 输出' })

  return (
    <div className="flex h-screen flex-col bg-bg-elevated">
      {/* Title bar — draggable */}
      <div
        className="flex shrink-0 cursor-pointer items-center justify-between px-4 pt-3 pb-2"
        data-tauri-drag-region
        onDoubleClick={toggleMaximize}
      >
        <div className="pointer-events-none flex items-center gap-2" data-tauri-drag-region>
          <ArrowLeftRight size={14} className="text-primary" />
          <span className="text-sm font-medium text-text-primary">
            {t('mdQuick.title', { defaultValue: '快速格式转换' })}
          </span>
        </div>
        <button
          onClick={closeWindow}
          className="pointer-events-auto rounded p-1 text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
        >
          <X size={14} />
        </button>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-2 px-4 pb-2">
        <div className="flex overflow-hidden rounded-md border border-border-subtle">
          <button
            onClick={() => switchMode('html-to-md')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors ${
              mode === 'html-to-md'
                ? 'bg-accent/10 text-accent'
                : 'text-text-muted hover:bg-bg-hover'
            }`}
          >
            {t('mdQuick.htmlToMd', { defaultValue: 'HTML 转 MD' })}
          </button>
          <button
            onClick={() => switchMode('md-to-html')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors ${
              mode === 'md-to-html'
                ? 'bg-primary/10 text-primary'
                : 'text-text-muted hover:bg-bg-hover'
            }`}
          >
            {t('mdQuick.mdToHtml', { defaultValue: 'MD 转 HTML' })}
          </button>
        </div>
        <span className="text-[11px] text-text-muted">
          {lines} {t('mdQuick.lines', { defaultValue: '行' })} · {chars} {t('mdQuick.chars', { defaultValue: '字符' })}
        </span>
      </div>

      {/* Split panes */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Input — hidden in output fullscreen mode */}
        {!outputFullscreen && (
          <>
            <div className="flex min-h-0 flex-col" style={{ flex: '0 0 40%' }}>
              <div className="shrink-0 border-b border-border-subtle px-4 py-1 text-[11px] font-medium uppercase tracking-wider text-text-muted">
                {inputLabel}
              </div>
              <textarea
                value={input}
                onChange={(e) => { setInput(e.target.value); setError(null) }}
                className="min-h-0 flex-1 resize-none bg-bg-base px-4 py-2 font-mono text-sm text-text-primary outline-none placeholder:text-text-disabled"
                placeholder={mode === 'html-to-md'
                  ? t('mdQuick.inputPlaceholderHtml', { defaultValue: '粘贴 HTML 内容...' })
                  : t('mdQuick.inputPlaceholderMd', { defaultValue: '输入 Markdown...' })}
                spellCheck={false}
              />
            </div>
            <div className="shrink-0 border-y border-border-subtle bg-bg-elevated" />
          </>
        )}

        {/* Output — takes remaining 60% */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-4 py-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
              {outputLabel}
            </span>
            <div className="flex items-center gap-1">
              {/* Preview toggle for MD→HTML mode */}
              {mode === 'md-to-html' && (
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition ${
                    showPreview
                      ? 'bg-primary/10 text-primary'
                      : 'text-text-muted hover:bg-bg-hover hover:text-text-secondary'
                  }`}
                >
                  {showPreview ? <Eye size={11} /> : <Code size={11} />}
                  {showPreview
                    ? t('mdQuick.preview', { defaultValue: '预览' })
                    : t('mdQuick.source', { defaultValue: '源码' })}
                </button>
              )}
              {output && (
                <>
                  <button
                    onClick={() => setOutputFullscreen(!outputFullscreen)}
                    className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition ${
                      outputFullscreen
                        ? 'bg-primary/10 text-primary'
                        : 'text-text-muted hover:bg-bg-hover hover:text-text-secondary'
                    }`}
                    title={outputFullscreen
                      ? t('mdQuick.exitFullscreen', { defaultValue: '还原分栏' })
                      : t('mdQuick.fullscreen', { defaultValue: '输出最大化' })}
                  >
                    {outputFullscreen ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
                    {outputFullscreen
                      ? t('mdQuick.exitFullscreen', { defaultValue: '还原' })
                      : t('mdQuick.fullscreen', { defaultValue: '最大化' })}
                  </button>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-text-muted transition hover:bg-bg-hover hover:text-primary"
                  >
                    {copied ? <Check size={11} className="text-success" /> : <Copy size={11} />}
                    {copied
                      ? t('common.copied')
                      : t('mdQuick.copy', { defaultValue: '复制' })}
                  </button>
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-text-muted transition hover:bg-bg-hover hover:text-primary"
                  >
                    <FileDown size={11} />
                    {t('mdQuick.download', { defaultValue: '下载' })}
                  </button>
                </>
              )}
            </div>
          </div>
          {/* Output content */}
          <div className="min-h-0 flex-1 overflow-y-auto bg-bg-base">
            {error ? (
              <div className="flex h-full items-center justify-center px-4">
                <p className="text-xs text-text-muted">{error}</p>
              </div>
            ) : !output ? (
              <div className="flex h-full items-center justify-center px-4">
                <span className="text-xs text-text-disabled">
                  {t('mdQuick.outputEmpty', { defaultValue: '转换结果将显示在这里' })}
                </span>
              </div>
            ) : mode === 'md-to-html' && showPreview ? (
              /* Rendered HTML preview */
              <div
                ref={outputRef}
                className="markdown-preview prose prose-invert max-w-none px-4 py-3 text-sm"
                dangerouslySetInnerHTML={{ __html: output }}
                onClick={handlePreviewClick}
              />
            ) : (
              /* Raw text output (HTML→MD always raw, MD→HTML source mode) */
              <pre className="whitespace-pre-wrap px-4 py-3 font-mono text-sm text-text-primary leading-relaxed">
                {output}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
