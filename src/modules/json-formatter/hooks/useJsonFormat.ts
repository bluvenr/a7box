/**
 * JSON Format Hook
 * Handles JSON parsing, formatting, compression, and validation.
 * All parse/validate/calculate functions are pure (no side effects).
 */

import { useState, useCallback, useRef, useEffect } from 'react'

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

// ─── Pure functions (no side effects) ───────────────────────────────────────

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

/** Pure validate — returns result without touching state */
export function validateJson(source: string): { valid: boolean; error?: string; position?: { line: number; column: number } } {
  if (!source.trim()) return { valid: false }
  const { error, position } = parseJsonWithError(source)
  if (error) return { valid: false, error, position }
  return { valid: true }
}

/** Calculate JSON statistics — single parse pass */
function calculateStats(input: string): JsonStats {
  const lines = input.split('\n').length
  const size = input.length // character count is sufficient for display

  if (!input.trim()) {
    return { valid: false, size: 0, lines: 1, depth: 0, keys: 0 }
  }

  let data: unknown
  try {
    data = JSON.parse(input)
  } catch {
    return { valid: false, size, lines, depth: 0, keys: 0 }
  }

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
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useJsonFormat(initialIndent: IndentType = '2spaces') {
  const [input, setInput] = useState('')
  const [indent, setIndent] = useState<IndentType>(initialIndent)
  const [lastError, setLastError] = useState<string | null>(null)
  const [errorPosition, setErrorPosition] = useState<{ line: number; column: number } | null>(null)

  // Debounced validation timer
  const validateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Set error state from validation result */
  const applyValidation = useCallback((result: ReturnType<typeof validateJson>) => {
    if (result.valid) {
      setLastError(null)
      setErrorPosition(null)
    } else {
      setLastError(result.error ?? null)
      setErrorPosition(result.position ?? null)
    }
  }, [])

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
      setInput(compressed)
      setLastError(null)
      setErrorPosition(null)
      return { success: true, output: compressed }
    },
    [input]
  )

  /** Validate JSON — updates state */
  const validate = useCallback(
    (jsonStr?: string): { valid: boolean; error?: string; position?: { line: number; column: number } } => {
      const source = jsonStr ?? input
      const result = validateJson(source)
      applyValidation(result)
      return result
    },
    [input, applyValidation]
  )

  /** Debounced validate — for use on every keystroke */
  const debouncedValidate = useCallback(
    (text: string, delay = 300) => {
      if (validateTimer.current) clearTimeout(validateTimer.current)
      validateTimer.current = setTimeout(() => {
        const result = validateJson(text)
        applyValidation(result)
      }, delay)
    },
    [applyValidation]
  )

  // Cleanup timer on unmount
  useEffect(() => () => {
    if (validateTimer.current) clearTimeout(validateTimer.current)
  }, [])

  /** Get JSON statistics — pure, no side effects */
  const getStats = useCallback((): JsonStats => {
    return calculateStats(input)
  }, [input])

  return {
    input,
    setInput,
    indent,
    setIndent,
    lastError,
    errorPosition,
    format,
    compress,
    validate,
    debouncedValidate,
    getStats,
  }
}
