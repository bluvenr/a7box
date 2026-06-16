/**
 * JSON Format Hook
 * Handles JSON parsing, formatting, compression, and validation
 */

import { useState, useCallback } from 'react'

export interface JsonFormatResult {
  success: boolean
  output?: string
  error?: string
  errorPosition?: { line: number; column: number }
}

export interface JsonStats {
  valid: boolean
  size: number
  lines: number
  depth: number
  keys: number
}

export type IndentType = '2spaces' | '4spaces' | 'tab'

const INDENT_MAP: Record<IndentType, string | number> = {
  '2spaces': 2,
  '4spaces': 4,
  tab: '\t',
}

/** Parse JSON and return error position if invalid */
function parseJsonWithError(input: string): { data?: unknown; error?: string; position?: { line: number; column: number } } {
  try {
    const data = JSON.parse(input)
    return { data }
  } catch (e) {
    const message = (e as Error).message
    const posMatch = message.match(/position (\d+)/)
    if (posMatch) {
      const pos = parseInt(posMatch[1], 10)
      const lines = input.substring(0, pos).split('\n')
      return {
        error: message,
        position: {
          line: lines.length,
          column: lines[lines.length - 1].length + 1,
        },
      }
    }
    return { error: message }
  }
}

/** Calculate JSON statistics */
function calculateStats(input: string, valid: boolean): JsonStats {
  const lines = input.split('\n').length
  const size = new Blob([input]).size

  if (!valid) {
    return { valid: false, size, lines, depth: 0, keys: 0 }
  }

  try {
    const data = JSON.parse(input)
    let depth = 0
    let keys = 0

    function traverse(obj: unknown, currentDepth: number) {
      if (currentDepth > depth) depth = currentDepth
      if (Array.isArray(obj)) {
        obj.forEach((item) => traverse(item, currentDepth + 1))
      } else if (obj && typeof obj === 'object') {
        const entries = Object.entries(obj as Record<string, unknown>)
        keys += entries.length
        entries.forEach(([, v]) => traverse(v, currentDepth + 1))
      }
    }

    traverse(data, 0)
    return { valid: true, size, lines, depth, keys }
  } catch {
    return { valid: false, size, lines, depth: 0, keys: 0 }
  }
}

export function useJsonFormat(initialIndent: IndentType = '2spaces') {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [indent, setIndent] = useState<IndentType>(initialIndent)
  const [lastError, setLastError] = useState<string | null>(null)
  const [errorPosition, setErrorPosition] = useState<{ line: number; column: number } | null>(null)

  /** Format JSON with indentation */
  const format = useCallback(
    (jsonStr?: string): JsonFormatResult => {
      const source = jsonStr ?? input
      if (!source.trim()) {
        setLastError(null)
        setErrorPosition(null)
        return { success: false, error: 'Input is empty' }
      }

      const { data, error, position } = parseJsonWithError(source)
      if (error) {
        setLastError(error)
        setErrorPosition(position ?? null)
        return { success: false, error, errorPosition: position }
      }

      const formatted = JSON.stringify(data, null, INDENT_MAP[indent])
      setOutput(formatted)
      setInput(formatted)
      setLastError(null)
      setErrorPosition(null)
      return { success: true, output: formatted }
    },
    [input, indent]
  )

  /** Compress JSON to single line */
  const compress = useCallback(
    (jsonStr?: string): JsonFormatResult => {
      const source = jsonStr ?? input
      if (!source.trim()) {
        setLastError(null)
        return { success: false, error: 'Input is empty' }
      }

      const { data, error, position } = parseJsonWithError(source)
      if (error) {
        setLastError(error)
        setErrorPosition(position ?? null)
        return { success: false, error, errorPosition: position }
      }

      const compressed = JSON.stringify(data)
      setOutput(compressed)
      setInput(compressed)
      setLastError(null)
      setErrorPosition(null)
      return { success: true, output: compressed }
    },
    [input]
  )

  /** Validate JSON syntax */
  const validate = useCallback(
    (jsonStr?: string): { valid: boolean; error?: string; position?: { line: number; column: number } } => {
      const source = jsonStr ?? input
      if (!source.trim()) {
        setLastError(null)
        setErrorPosition(null)
        return { valid: false }
      }

      const { error, position } = parseJsonWithError(source)
      if (error) {
        setLastError(error)
        setErrorPosition(position ?? null)
        return { valid: false, error, position }
      }

      setLastError(null)
      setErrorPosition(null)
      return { valid: true }
    },
    [input]
  )

  /** Get JSON statistics */
  const getStats = useCallback((): JsonStats => {
    const source = input || output
    const valid = validate().valid
    return calculateStats(source, valid)
  }, [input, output, validate])

  return {
    input,
    setInput,
    output,
    setOutput,
    indent,
    setIndent,
    lastError,
    errorPosition,
    format,
    compress,
    validate,
    getStats,
  }
}
