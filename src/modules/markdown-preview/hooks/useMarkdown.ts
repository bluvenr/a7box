/**
 * Markdown Preview Hook
 * Handles markdown parsing, HTML rendering, persistence, and HTML→MD conversion
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { applyTaskListPlugin, applyKatexPlugin, applyMermaidPlugin } from '../shared/mdPlugins'

// ─── markdown-it (MD → HTML) ────────────────────────────────────────────────

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
  highlight(str: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang }).value}</code></pre>`
      } catch {
        // Fall through
      }
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`
  },
})

// Links: click handler in MarkdownPreview manages navigation (no target=_blank)

// Register shared plugins: task lists + KaTeX + Mermaid
applyTaskListPlugin(md)
applyKatexPlugin(md)
applyMermaidPlugin(md)

// ─── turndown (HTML → MD) ───────────────────────────────────────────────────

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  hr: '---',
})
turndownService.use(gfm)

// ─── Persistence ────────────────────────────────────────────────────────────

const STORAGE_KEY = 'a7box-markdown-content'

function loadPersisted(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v ?? null
  } catch {
    return null
  }
}

function persistContent(text: string) {
  try {
    localStorage.setItem(STORAGE_KEY, text)
  } catch {
    // quota exceeded — ignore
  }
}

// ─── Default content ────────────────────────────────────────────────────────

export const DEFAULT_CONTENT = `# Welcome to Markdown Preview

## Features

- **Bold text** and *italic text*
- ~~Strikethrough~~ support
- [Links](https://github.com) open in new tab

## Code Blocks

\`\`\`javascript
function hello(name) {
  console.log(\`Hello, \${name}!\`)
}
\`\`\`

## Tables

| Feature | Status |
|---------|--------|
| Bold    | ✓      |
| Italic  | ✓      |
| Tables  | ✓      |
| Code    | ✓      |

## Task Lists

- [x] Markdown parsing
- [x] Syntax highlighting
- [ ] Export to PDF (v2)

> Blockquotes look like this.
> They can span multiple lines.
`

// ─── Hook ───────────────────────────────────────────────────────────────────

export type Mode = 'preview' | 'reverse'

export function useMarkdown(initialContent?: string) {
  const [content, setContentRaw] = useState<string>(
    initialContent ?? loadPersisted() ?? DEFAULT_CONTENT,
  )
  const [mode, setMode] = useState<Mode>('preview')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Auto-persist with 500ms debounce
  const setContent = useCallback((text: string) => {
    setContentRaw(text)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persistContent(text), 500)
  }, [])

  // Cleanup timer
  useEffect(() => () => clearTimeout(saveTimer.current), [])

  /** Render markdown to HTML */
  const render = useCallback((text?: string): string => {
    const source = text ?? content
    return md.render(source)
  }, [content])

  /** Get rendered HTML */
  const html = useMemo(() => render(), [content, render])

  /** Convert HTML → Markdown (reverse mode) */
  const htmlToMarkdown = useCallback((htmlInput: string): string => {
    return turndownService.turndown(htmlInput)
  }, [])

  /** Export as standalone HTML file */
  const exportHtml = useCallback((): string => {
    const body = render()
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Markdown Export</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css">
  <style>
    :root { --bg: #fff; --fg: #333; --muted: #666; --border: #ddd; --code-bg: #f6f8fa; --link: #0366d6; }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #1a1a2e; --fg: #e0e0e0; --muted: #999; --border: #444; --code-bg: #2d2d44; --link: #58a6ff; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      line-height: 1.6;
      color: var(--fg);
      background: var(--bg);
    }
    pre { background: var(--code-bg); padding: 1rem; border-radius: 6px; overflow-x: auto; }
    code { font-family: 'Fira Code', Consolas, monospace; font-size: 0.9em; }
    blockquote { border-left: 4px solid var(--border); margin: 0; padding-left: 1rem; color: var(--muted); }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid var(--border); padding: 8px 12px; text-align: left; }
    th { background: var(--code-bg); }
    img { max-width: 100%; }
    a { color: var(--link); }
    .task-list-item { list-style: none; margin-left: -1.5em; }
    .task-checkbox { margin-right: 0.4em; }
    .katex-block { margin: 1em 0; overflow-x: auto; }
    .mermaid { display: flex; justify-content: center; margin: 1em 0; overflow-x: auto; }
    .mermaid svg { max-width: 100%; height: auto; }
  </style>
</head>
<body>${body}
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: true, theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default' });
</script>
</body>
</html>`
  }, [render])

  /** Download as HTML file */
  const downloadHtml = useCallback(async (): Promise<boolean> => {
    const htmlContent = exportHtml()
    const filename = `markdown-${Date.now()}.html`
    // Tauri: show save dialog + write file
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { writeTextFile } = await import('@tauri-apps/plugin-fs')
        const filePath = await save({
          defaultPath: filename,
          filters: [{ name: 'HTML File', extensions: ['html', 'htm'] }],
        })
        if (!filePath) return false
        await writeTextFile(filePath, htmlContent)
        return true
      } catch { /* fallback to browser */ }
    }
    // Browser fallback
    const blob = new Blob([htmlContent], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    return true
  }, [exportHtml])

  /** Download as Markdown source file */
  const downloadMd = useCallback(async (text?: string): Promise<boolean> => {
    const mdText = text ?? content
    const filename = `document-${Date.now()}.md`
    // Tauri: show save dialog + write file
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { writeTextFile } = await import('@tauri-apps/plugin-fs')
        const filePath = await save({
          defaultPath: filename,
          filters: [{ name: 'Markdown File', extensions: ['md', 'markdown'] }],
        })
        if (!filePath) return false
        await writeTextFile(filePath, mdText)
        return true
      } catch { /* fallback to browser */ }
    }
    // Browser fallback
    const blob = new Blob([mdText], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    return true
  }, [content])

  /** Copy rendered HTML as rich text (paste into email/docs preserves formatting) */
  const copyHtml = useCallback(async () => {
    const body = render()
    try {
      // Try rich text first (ClipboardItem API)
      const htmlBlob = new Blob([body], { type: 'text/html' })
      const textBlob = new Blob([body], { type: 'text/plain' })
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob,
        }),
      ])
    } catch {
      // Fallback to plain text HTML
      await navigator.clipboard.writeText(body)
    }
  }, [render])

  /** Import a .md file from disk */
  const importFile = useCallback(async (file: File) => {
    const text = await file.text()
    setContent(text)
  }, [setContent])

  /** Clear content */
  const clear = useCallback(() => {
    setContent('')
  }, [setContent])

  return {
    content,
    setContent,
    html,
    render,
    exportHtml,
    downloadHtml,
    downloadMd,
    copyHtml,
    clear,
    importFile,
    htmlToMarkdown,
    mode,
    setMode,
  }
}
