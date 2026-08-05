import { describe, it, expect } from 'vitest'
import {
  applyTransform,
  splitWords,
  toBase64,
  toCamelCase,
  toJsonString,
  toKebabCase,
  toMarkdownCode,
  toMarkdownLink,
  toSnakeCase,
  toTitleCase,
  toUrlEncoded,
} from '../utils/transforms'

describe('toBase64', () => {
  it('encodes ASCII text', () => {
    expect(toBase64('hello')).toBe('aGVsbG8=')
  })

  it('encodes CJK text (unicode-safe)', () => {
    // "你好" → UTF-8 E4 BD A0 E5 A5 BD
    expect(toBase64('你好')).toBe('5L2g5aW9')
  })

  it('handles empty string', () => {
    expect(toBase64('')).toBe('')
  })
})

describe('toUrlEncoded', () => {
  it('encodes spaces and CJK characters', () => {
    expect(toUrlEncoded('a b')).toBe('a%20b')
    expect(toUrlEncoded('你好')).toBe('%E4%BD%A0%E5%A5%BD')
  })
})

describe('toJsonString', () => {
  it('wraps text as a JSON string with escaping', () => {
    expect(toJsonString('a"b\nc')).toBe('"a\\"b\\nc"')
  })
})

describe('case transforms', () => {
  it('splitWords handles camelCase', () => {
    expect(splitWords('clipboardManager')).toEqual(['clipboard', 'Manager'])
  })

  it('splitWords handles snake_case and kebab-case', () => {
    expect(splitWords('clipboard_manager')).toEqual(['clipboard', 'manager'])
    expect(splitWords('clipboard-manager')).toEqual(['clipboard', 'manager'])
  })

  it('splitWords handles acronym + digits', () => {
    expect(splitWords('HTTPResponse2')).toEqual(['HTTP', 'Response', '2'])
  })

  it('splitWords returns empty array for symbols only', () => {
    expect(splitWords('!!!')).toEqual([])
  })

  it('toSnakeCase', () => {
    expect(toSnakeCase('clipboardManager')).toBe('clipboard_manager')
    expect(toSnakeCase('Hello World')).toBe('hello_world')
  })

  it('toKebabCase', () => {
    expect(toKebabCase('clipboardManager')).toBe('clipboard-manager')
  })

  it('toCamelCase', () => {
    expect(toCamelCase('clipboard-manager')).toBe('clipboardManager')
    expect(toCamelCase('Clipboard Manager')).toBe('clipboardManager')
    expect(toCamelCase('')).toBe('')
  })

  it('toTitleCase', () => {
    expect(toTitleCase('hello world')).toBe('Hello World')
  })
})

describe('markdown transforms', () => {
  it('toMarkdownCode wraps with fences', () => {
    expect(toMarkdownCode('const a = 1', 'ts')).toBe('```ts\nconst a = 1\n```')
  })

  it('toMarkdownLink builds link for URLs', () => {
    expect(toMarkdownLink('https://example.com')).toBe(
      '[https://example.com](https://example.com)'
    )
  })

  it('toMarkdownLink prepends https:// for www URLs', () => {
    expect(toMarkdownLink('www.example.com')).toBe(
      '[www.example.com](https://www.example.com)'
    )
  })

  it('toMarkdownLink returns original text for non-URLs', () => {
    expect(toMarkdownLink('just text')).toBe('just text')
  })
})

describe('applyTransform dispatcher', () => {
  it('dispatches each transform id', () => {
    expect(applyTransform('upper', 'abc')).toBe('ABC')
    expect(applyTransform('lower', 'ABC')).toBe('abc')
    expect(applyTransform('base64', 'hi')).toBe(toBase64('hi'))
    expect(applyTransform('url-encode', 'a b')).toBe(toUrlEncoded('a b'))
    expect(applyTransform('json-string', 'x')).toBe(toJsonString('x'))
    expect(applyTransform('snake', 'aB c')).toBe(toSnakeCase('aB c'))
    expect(applyTransform('kebab', 'aB c')).toBe(toKebabCase('aB c'))
    expect(applyTransform('camel', 'a b')).toBe(toCamelCase('a b'))
    expect(applyTransform('title', 'a b')).toBe(toTitleCase('a b'))
    expect(applyTransform('md-code', 'x')).toBe(toMarkdownCode('x'))
    expect(applyTransform('md-link', 'https://a.io')).toBe(toMarkdownLink('https://a.io'))
  })
})
