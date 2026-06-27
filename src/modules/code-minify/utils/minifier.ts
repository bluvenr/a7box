/**
 * Code minification & beautification utilities
 * Minification: regex-based with string-literal protection
 * Beautification: js-beautify library
 */

import beautify from 'js-beautify'
const { js_beautify, css_beautify, html_beautify } = beautify

export type Language = 'javascript' | 'typescript' | 'css' | 'html' | 'json'
export type IndentType = '2spaces' | '4spaces' | 'tab'

function indentToOptions(indent: IndentType): { indent_size: number; indent_char: string } {
  switch (indent) {
    case '4spaces': return { indent_size: 4, indent_char: ' ' }
    case 'tab': return { indent_size: 1, indent_char: '\t' }
    default: return { indent_size: 2, indent_char: ' ' }
  }
}

function indentSize(indent: IndentType): number {
  return indent === '4spaces' ? 4 : indent === 'tab' ? 4 : 2
}

// ─── Beautify ──────────────────────────────────────────────────────────────

export function beautifyCode(code: string, language: Language, indent: IndentType = '2spaces'): string {
  const opts = indentToOptions(indent)
  switch (language) {
    case 'javascript':
    case 'typescript':
      return js_beautify(code, {
        indent_size: opts.indent_size,
        indent_char: opts.indent_char,
        max_preserve_newlines: 2,
        preserve_newlines: true,
        break_chained_methods: true,
        wrap_line_length: 0,
      })
    case 'css':
      return css_beautify(code, {
        indent_size: opts.indent_size,
        indent_char: opts.indent_char,
        selector_separator_newline: true,
        end_with_newline: true,
      })
    case 'html':
      return html_beautify(code, {
        indent_size: opts.indent_size,
        indent_char: opts.indent_char,
        wrap_line_length: 0,
        preserve_newlines: true,
        max_preserve_newlines: 2,
        unformatted: ['code', 'pre', 'em', 'strong'],
        content_unformatted: ['pre', 'code'],
      })
    case 'json':
      try {
        return JSON.stringify(JSON.parse(code), null, indentSize(indent))
      } catch (e) {
        throw new Error(`Invalid JSON: ${(e as Error).message}`)
      }
    default:
      return code
  }
}

// ─── Minify ────────────────────────────────────────────────────────────────

/**
 * Protect string literals by replacing them with placeholders,
 * apply transform, then restore.
 */
function withStringProtection(code: string, transform: (code: string) => string): string {
  const strings: string[] = []
  const protected_ = code.replace(/(["'`])(?:(?!\1)[^\\]|\\.)*?\1/g, (match) => {
    strings.push(match)
    return `__STR_${strings.length - 1}__`
  })
  let result = transform(protected_)
  result = result.replace(/__STR_(\d+)__/g, (_, idx) => strings[parseInt(idx)] ?? '')
  return result
}

function minifyJS(code: string): string {
  return withStringProtection(code, (c) => {
    let result = c
    result = result.replace(/\/\/.*$/gm, '')
    result = result.replace(/\/\*[\s\S]*?\*\//g, '')
    result = result.replace(/\s+/g, ' ')
    result = result.replace(/\s*([{}();,=:+\-*/<>!&|?])\s*/g, '$1')
    result = result.replace(/;}/g, '}')
    return result.trim()
  })
}

function minifyCSS(code: string): string {
  return withStringProtection(code, (c) => {
    let result = c
    result = result.replace(/\/\*[\s\S]*?\*\//g, '')
    result = result.replace(/\s+/g, ' ')
    result = result.replace(/\s*([{}:;,>])\s*/g, '$1')
    result = result.replace(/;}/g, '}')
    result = result.replace(/\s*$/g, '')
    return result.trim()
  })
}

function minifyHTML(code: string): string {
  let result = code
  // Minify <script> and <style> inner content, then preserve the blocks
  const preservedBlocks: string[] = []
  result = result.replace(/<(script|style)([\s\S]*?)<\/\1>/gi, (match, tag, inner) => {
    // Split tag with attributes from content
    const openTagEnd = inner.indexOf('>')
    if (openTagEnd === -1) return match
    const openTag = inner.slice(0, openTagEnd + 1)
    const content = inner.slice(openTagEnd + 1)
    const closeTag = `</${tag}>`
    let minified = content
    if (tag.toLowerCase() === 'script') {
      minified = minifyJS(content)
    } else if (tag.toLowerCase() === 'style') {
      minified = minifyCSS(content)
    }
    const block = `<${tag}${openTag}${minified}${closeTag}`
    preservedBlocks.push(block)
    return `__BLOCK_${preservedBlocks.length - 1}__`
  })
  result = result.replace(/<!--[\s\S]*?-->/g, '')
  result = result.replace(/>\s+</g, '><')
  result = result.replace(/\s{2,}/g, ' ')
  result = result.replace(/^\s+|\s+$/gm, '')
  result = result.replace(/__BLOCK_(\d+)__/gi, (_, idx) => preservedBlocks[parseInt(idx)] ?? '')
  return result.trim()
}

function minifyJSON(code: string): string {
  try {
    return JSON.stringify(JSON.parse(code))
  } catch (e) {
    throw new Error(`Invalid JSON: ${(e as Error).message}`)
  }
}

export function minifyCode(code: string, language: Language): string {
  switch (language) {
    case 'javascript':
    case 'typescript':
      return minifyJS(code)
    case 'css': return minifyCSS(code)
    case 'html': return minifyHTML(code)
    case 'json': return minifyJSON(code)
    default: return code
  }
}

// ─── Language Detection ────────────────────────────────────────────────────

export function detectLanguage(code: string): Language | null {
  const trimmed = code.trim()
  if (!trimmed) return null

  if (/^[{[]/.test(trimmed)) {
    try {
      JSON.parse(trimmed)
      return 'json'
    } catch { /* not valid JSON */ }
  }

  if (/^<!DOCTYPE\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    return 'html'
  }

  const htmlTagCount = (trimmed.match(/<(div|span|p|a|h[1-6]|ul|ol|li|table|form|input|button|img|br|hr)\b/gi) || []).length
  if (htmlTagCount >= 3) return 'html'

  const cssPatterns = (trimmed.match(/[.#@]?[\w-]+\s*\{[^}]*[\w-]+\s*:/g) || []).length
  if (cssPatterns >= 2) return 'css'

  if (/\b(interface|type\s+\w+\s*=|enum\s+\w+|<[A-Z]\w*>)/.test(trimmed) && /\b(function|const|let|var|return|import)\b/.test(trimmed)) {
    return 'typescript'
  }

  if (/\b(function|const|let|var|return|import|export|class|if|else|for|while)\b/.test(trimmed)) {
    return 'javascript'
  }

  return null
}

// ─── Utilities ─────────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function calcSavings(original: number, minified: number): string {
  if (original === 0) return '0%'
  const pct = ((1 - minified / original) * 100).toFixed(1)
  return `${pct}%`
}

export function getFileExtension(language: Language): string {
  const extMap: Record<Language, string> = {
    javascript: 'js',
    typescript: 'ts',
    css: 'css',
    html: 'html',
    json: 'json',
  }
  return extMap[language]
}

export function detectLanguageFromExt(filename: string): Language | null {
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'mjs': return 'javascript'
    case 'ts':
    case 'tsx':
    case 'mts': return 'typescript'
    case 'css':
    case 'scss':
    case 'less': return 'css'
    case 'html':
    case 'htm':
    case 'xml': return 'html'
    case 'json': return 'json'
    default: return null
  }
}
