/**
 * Shared markdown-it plugins for Markdown rendering
 * Used by both MarkdownPreview (main page) and MdConvert (floating window)
 */

import type MarkdownIt from 'markdown-it'
import katex from 'katex'

// ─── Task List Checkbox Plugin ──────────────────────────────────────────────

/**
 * Register task-list checkbox rendering: `- [x]` / `- [ ]`
 * Modifies inline children tokens to inject checkbox HTML.
 * @param interactive  If true, checkboxes are enabled (not disabled). Default: false.
 */
export function applyTaskListPlugin(md: MarkdownIt, interactive = false): void {
  md.core.ruler.after('inline', 'task-lists', (state) => {
    const tokens = state.tokens
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'inline') continue
      const children = tokens[i].children
      if (!children || children.length === 0) continue

      // First child must be a text token starting with [x] or [ ]
      const firstChild = children[0]
      if (firstChild.type !== 'text') continue
      const match = /^\[(x| )\]\s*/i.exec(firstChild.content)
      if (!match) continue

      const checked = match[1].toLowerCase() === 'x'

      // Add task-list-item class to parent <li>
      for (let j = i - 1; j >= 0; j--) {
        if (tokens[j].type === 'list_item_open') {
          tokens[j].attrSet('class', 'task-list-item')
          break
        }
      }

      // Create checkbox HTML token
      const cbToken = new (state as any).Token('html_inline', '', 0)
      cbToken.content = `<input type="checkbox" class="task-checkbox" ${checked ? 'checked' : ''} ${interactive ? '' : 'disabled'} /> `

      // Replace matched prefix in first child, inject checkbox before it
      const remaining = firstChild.content.slice(match[0].length)
      if (remaining) {
        firstChild.content = remaining
        children.splice(0, 0, cbToken)
      } else {
        children.splice(0, 1, cbToken)
      }
    }
  })
}

// ─── KaTeX Math Plugin ──────────────────────────────────────────────────────

/**
 * Register KaTeX math rendering:
 * - Inline:  `$E=mc^2$`
 * - Block:   `$$\sum_{i=1}^{n} x_i$$`
 */
export function applyKatexPlugin(md: MarkdownIt): void {
  // Inline math: $...$
  md.inline.ruler.after('escape', 'math_inline', (state, silent) => {
    if (state.src[state.pos] !== '$') return false
    // Avoid $$ (block math handled separately)
    if (state.src[state.pos + 1] === '$') return false

    const start = state.pos + 1
    let end = start
    while (end < state.posMax && state.src[end] !== '$') {
      if (state.src[end] === '\\') end++ // skip escaped $
      end++
    }
    if (end >= state.posMax) return false
    if (start === end) return false // empty

    if (!silent) {
      const token = state.push('math_inline', 'math', 0)
      token.markup = '$'
      token.content = state.src.slice(start, end)
    }

    state.pos = end + 1
    return true
  })

  // Block math: $$...$$
  md.block.ruler.after('blockquote', 'math_block', (state, startLine, endLine, silent) => {
    const startPos = state.bMarks[startLine] + state.tShift[startLine]
    const maxPos = state.eMarks[startLine]
    if (state.src.slice(startPos, startPos + 2) !== '$$') return false
    if (silent) return true

    let nextLine = startLine
    let found = false
    while (nextLine < endLine) {
      nextLine++
      if (nextLine >= endLine) break
      const lineStart = state.bMarks[nextLine] + state.tShift[nextLine]
      const lineEnd = state.eMarks[nextLine]
      const line = state.src.slice(lineStart, lineEnd).trim()
      if (line === '$$') {
        found = true
        break
      }
    }

    if (!found) return false

    const contentStart = state.src.slice(startPos, startPos + 2) === '$$'
      ? startPos + 2
      : startPos
    // Collect content from first line remainder + subsequent lines
    const firstLineContent = state.src.slice(contentStart, maxPos).trim()
    const lines: string[] = []
    if (firstLineContent) lines.push(firstLineContent)
    for (let line = startLine + 1; line < nextLine; line++) {
      const ls = state.bMarks[line] + state.tShift[line]
      const le = state.eMarks[line]
      lines.push(state.src.slice(ls, le))
    }

    const token = state.push('math_block', 'math', 0)
    token.block = true
    token.content = lines.join('\n')
    token.markup = '$$'
    token.map = [startLine, nextLine + 1]

    state.line = nextLine + 1
    return true
  })

  // Render rules
  md.renderer.rules.math_inline = (tokens, idx) => {
    try {
      return katex.renderToString(tokens[idx].content, { throwOnError: false, displayMode: false })
    } catch {
      return `<code class="math-error">${md.utils.escapeHtml(tokens[idx].content)}</code>`
    }
  }

  md.renderer.rules.math_block = (tokens, idx) => {
    try {
      return `<div class="katex-block">${katex.renderToString(tokens[idx].content, { throwOnError: false, displayMode: true })}</div>`
    } catch {
      return `<pre class="math-error">${md.utils.escapeHtml(tokens[idx].content)}</pre>`
    }
  }
}

// ─── Mermaid Diagram Plugin ─────────────────────────────────────────────────

/**
 * Render ```mermaid fenced code blocks as <div class="mermaid">.
 * The React side must call `mermaid.run()` via useEffect to render diagrams.
 */
export function applyMermaidPlugin(md: MarkdownIt): void {
  const origFence = md.renderer.rules.fence
  md.renderer.rules.fence = function (tokens, idx, options, env, self) {
    const token = tokens[idx]
    if (token.info.trim() === 'mermaid') {
      return `<div class="mermaid">${md.utils.escapeHtml(token.content)}</div>`
    }
    if (origFence) return origFence(tokens, idx, options, env, self)
    return self.renderToken(tokens, idx, options)
  }
}
