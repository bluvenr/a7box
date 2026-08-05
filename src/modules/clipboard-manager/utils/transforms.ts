/**
 * Clipboard Manager — "Copy as" content transforms (plan 2.6)
 * Pure functions, fully unit-tested.
 */

export type TransformId =
  | 'base64'
  | 'url-encode'
  | 'json-string'
  | 'upper'
  | 'lower'
  | 'title'
  | 'snake'
  | 'kebab'
  | 'camel'
  | 'md-code'
  | 'md-link'

/** Order used by the context menu */
export const TRANSFORM_ORDER: TransformId[] = [
  'base64',
  'url-encode',
  'json-string',
  'upper',
  'lower',
  'title',
  'snake',
  'kebab',
  'camel',
  'md-code',
  'md-link',
]

// ── Encoding ─────────────────────────────────────────────────────────────────

/** Unicode-safe Base64 (works for CJK text). */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function toUrlEncoded(text: string): string {
  return encodeURIComponent(text)
}

export function toJsonString(text: string): string {
  return JSON.stringify(text)
}

// ── Case transforms ──────────────────────────────────────────────────────────

export function toUpperCase(text: string): string {
  return text.toUpperCase()
}

export function toLowerCase(text: string): string {
  return text.toLowerCase()
}

export function toTitleCase(text: string): string {
  return text.replace(/\p{L}+/gu, (word) => {
    const first = [...word][0]
    return first.toUpperCase() + word.slice(first.length)
  })
}

/** Split an identifier into words: handles camelCase, snake_case, kebab-case and spaces. */
export function splitWords(text: string): string[] {
  const matches = text.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+/g)
  return matches ?? []
}

export function toSnakeCase(text: string): string {
  return splitWords(text)
    .map((w) => w.toLowerCase())
    .join('_')
}

export function toKebabCase(text: string): string {
  return splitWords(text)
    .map((w) => w.toLowerCase())
    .join('-')
}

export function toCamelCase(text: string): string {
  const words = splitWords(text).map((w) => w.toLowerCase())
  if (words.length === 0) return ''
  const [first, ...rest] = words
  return first + rest.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

// ── Markdown ─────────────────────────────────────────────────────────────────

export function toMarkdownCode(text: string, lang = ''): string {
  return '```' + lang + '\n' + text + '\n```'
}

/** Build a Markdown link; falls back to the text itself when it is not a URL. */
export function toMarkdownLink(text: string, label?: string): string {
  const trimmed = text.trim()
  if (!/^(https?:\/\/|www\.)\S+$/i.test(trimmed)) return text
  const url = trimmed.startsWith('www.') ? `https://${trimmed}` : trimmed
  return `[${label || trimmed}](${url})`
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

export function applyTransform(id: TransformId, text: string): string {
  switch (id) {
    case 'base64':
      return toBase64(text)
    case 'url-encode':
      return toUrlEncoded(text)
    case 'json-string':
      return toJsonString(text)
    case 'upper':
      return toUpperCase(text)
    case 'lower':
      return toLowerCase(text)
    case 'title':
      return toTitleCase(text)
    case 'snake':
      return toSnakeCase(text)
    case 'kebab':
      return toKebabCase(text)
    case 'camel':
      return toCamelCase(text)
    case 'md-code':
      return toMarkdownCode(text)
    case 'md-link':
      return toMarkdownLink(text)
    default:
      return text
  }
}
