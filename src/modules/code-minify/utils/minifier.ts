/**
 * Code minification utilities
 * Simple regex-based minifier for JS, CSS, HTML, JSON
 */

export type Language = 'javascript' | 'css' | 'html' | 'json'

/** Minify JavaScript by removing comments, extra whitespace and newlines */
function minifyJS(code: string): string {
  let result = code
  // Remove single-line comments (but not URLs with //)
  result = result.replace(/(?<!:)\/\/.*$/gm, '')
  // Remove multi-line comments
  result = result.replace(/\/\*[\s\S]*?\*\//g, '')
  // Collapse whitespace
  result = result.replace(/\s+/g, ' ')
  // Remove spaces around operators
  result = result.replace(/\s*([{}();,=:+\-*/<>!&|?])\s*/g, '$1')
  // Remove trailing semicolons before closing braces
  result = result.replace(/;}/g, '}')
  return result.trim()
}

/** Minify CSS by removing comments, extra whitespace */
function minifyCSS(code: string): string {
  let result = code
  // Remove comments
  result = result.replace(/\/\*[\s\S]*?\*\//g, '')
  // Remove newlines and collapse whitespace
  result = result.replace(/\s+/g, ' ')
  // Remove spaces around special characters
  result = result.replace(/\s*([{}:;,>])\s*/g, '$1')
  // Remove last semicolon before closing brace
  result = result.replace(/;}/g, '}')
  // Remove trailing whitespace
  result = result.replace(/\s*$/g, '')
  return result.trim()
}

/** Minify HTML by removing comments, extra whitespace */
function minifyHTML(code: string): string {
  let result = code
  // Remove HTML comments
  result = result.replace(/<!--[\s\S]*?-->/g, '')
  // Collapse whitespace between tags
  result = result.replace(/>\s+</g, '><')
  // Collapse multiple spaces to single space
  result = result.replace(/\s{2,}/g, ' ')
  // Remove leading/trailing whitespace on each line
  result = result.replace(/^\s+|\s+$/gm, '')
  return result.trim()
}

/** Minify JSON by parsing and re-stringifying */
function minifyJSON(code: string): string {
  try {
    return JSON.stringify(JSON.parse(code))
  } catch (e) {
    throw new Error(`Invalid JSON: ${(e as Error).message}`)
  }
}

/** Main minify function */
export function minifyCode(code: string, language: Language): string {
  switch (language) {
    case 'javascript': return minifyJS(code)
    case 'css': return minifyCSS(code)
    case 'html': return minifyHTML(code)
    case 'json': return minifyJSON(code)
    default: return code
  }
}

/** Format bytes to human readable */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

/** Calculate savings percentage */
export function calcSavings(original: number, minified: number): string {
  if (original === 0) return '0%'
  const pct = ((1 - minified / original) * 100).toFixed(1)
  return `${pct}%`
}
