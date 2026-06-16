/**
 * Markdown Preview Hook
 * Handles markdown parsing and HTML rendering
 */

import { useState, useCallback, useMemo } from 'react'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'

// Configure markdown-it with highlight.js
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

// Open links in new tab
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const origLinkOpen = md.renderer.rules.link_open
md.renderer.rules.link_open = function (tokens: any[], idx: number, options: any, env: any, self: any) {
  const token = tokens[idx]
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noopener noreferrer')
  if (origLinkOpen) {
    return origLinkOpen(tokens, idx, options, env, self)
  }
  return self.renderToken(tokens, idx, options)
}

const DEFAULT_CONTENT = `# Welcome to Markdown Preview

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

export function useMarkdown(initialContent?: string) {
  const [content, setContent] = useState(initialContent ?? DEFAULT_CONTENT)

  /** Render markdown to HTML */
  const render = useCallback((text?: string): string => {
    const source = text ?? content
    return md.render(source)
  }, [content])

  /** Get rendered HTML */
  const html = useMemo(() => render(), [content, render])

  /** Export as standalone HTML file */
  const exportHtml = useCallback((): string => {
    const body = render()
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Markdown Export</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      line-height: 1.6;
      color: #333;
    }
    pre { background: #f6f8fa; padding: 1rem; border-radius: 6px; overflow-x: auto; }
    code { font-family: 'Fira Code', Consolas, monospace; font-size: 0.9em; }
    blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 1rem; color: #666; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f6f8fa; }
    img { max-width: 100%; }
    a { color: #0366d6; }
  </style>
</head>
<body>${body}</body>
</html>`
  }, [render])

  /** Download as HTML file */
  const downloadHtml = useCallback(() => {
    const htmlContent = exportHtml()
    const blob = new Blob([htmlContent], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `markdown-${Date.now()}.html`
    a.click()
    URL.revokeObjectURL(url)
  }, [exportHtml])

  /** Copy rendered HTML to clipboard */
  const copyHtml = useCallback(async () => {
    const body = render()
    await navigator.clipboard.writeText(body)
  }, [render])

  /** Clear content */
  const clear = useCallback(() => {
    setContent('')
  }, [])

  return {
    content,
    setContent,
    html,
    render,
    exportHtml,
    downloadHtml,
    copyHtml,
    clear,
  }
}
