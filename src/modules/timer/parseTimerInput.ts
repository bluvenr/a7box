/**
 * Timer Input Parser
 *
 * Supported formats:
 *   5m / 5min / 5分钟 / 5分          → 5 minutes
 *   1h30m / 1h 30m / 1小时30分       → 1 hour 30 minutes
 *   90s / 90秒                       → 90 seconds
 *   1:30:00                          → 1 hour 30 minutes
 *   30:00                            → 30 minutes
 *   300                              → 300 seconds (pure number = seconds)
 *   5m 泡面 / 5分 泡面               → 5 minutes, title "泡面"
 */
import type { ParsedTimerInput } from './types'

/**
 * Parse a timer input string into duration + title.
 * Returns { valid: false } if no duration could be extracted.
 */
export function parseTimerInput(raw: string): ParsedTimerInput {
  const input = raw.trim()
  if (!input) return { duration: 0, title: '', valid: false }

  // ── Try HH:MM:SS or MM:SS format ──────────────────────────────────────
  const colonMatch = input.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?\s*(.*)$/)
  if (colonMatch) {
    const [, hOrM, mOrS, maybeS, rest] = colonMatch
    let totalMs: number
    if (maybeS !== undefined) {
      // H:M:S
      totalMs = (parseInt(hOrM) * 3600 + parseInt(mOrS) * 60 + parseInt(maybeS)) * 1000
    } else {
      // M:S
      totalMs = (parseInt(hOrM) * 60 + parseInt(mOrS)) * 1000
    }
    if (totalMs > 0) {
      return { duration: totalMs, title: rest.trim(), valid: true }
    }
  }

  // ── Try compound duration: "1h 30m", "1小时30分", "2h 5m 30s" ───────────
  const compoundMs = parseCompoundDuration(input)
  if (compoundMs > 0) {
    // Extract title: everything after the last duration token
    const title = extractTitleAfterDuration(input)
    return { duration: compoundMs, title, valid: true }
  }

  // ── Try single unit: "5m", "5分钟", "90s", "90秒", "2h", "2小时" ───────
  const singleMatch = input.match(
    /^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|小时|m|min|mins|minutes?|分|分钟|s|sec|secs|seconds?|秒)(?:\s+(.+))?$/i
  )
  if (singleMatch) {
    const value = parseFloat(singleMatch[1])
    const unit = singleMatch[2].toLowerCase()
    const title = singleMatch[3]?.trim() ?? ''
    const ms = unitToMs(value, unit)
    if (ms > 0) return { duration: ms, title, valid: true }
  }

  // ── Try pure number (seconds) ─────────────────────────────────────────
  const pureNumMatch = input.match(/^(\d+(?:\.\d+)?)\s*(.*)$/)
  if (pureNumMatch) {
    const secs = parseFloat(pureNumMatch[1])
    const title = pureNumMatch[2]?.trim() ?? ''
    if (secs > 0) return { duration: secs * 1000, title, valid: true }
  }

  return { duration: 0, title: input, valid: false }
}

/** Parse compound duration like "1h30m", "1小时 30分 15秒" */
function parseCompoundDuration(input: string): number {
  const unitTokens = input.match(
    /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|小时|m|min|mins|minutes?|分|分钟|s|sec|secs|seconds?|秒)/gi
  )
  if (!unitTokens || unitTokens.length < 1) return 0

  let total = 0
  for (const token of unitTokens) {
    const m = token.match(/(\d+(?:\.\d+)?)\s*(.+)/)
    if (!m) continue
    const value = parseFloat(m[1])
    const unit = m[2].trim().toLowerCase()
    const ms = unitToMs(value, unit)
    if (ms <= 0) return 0 // invalid unit
    total += ms
  }
  return total
}

/** Extract title text that appears after all duration tokens */
function extractTitleAfterDuration(input: string): string {
  // Remove all duration tokens from the string, whatever remains is the title
  let stripped = input.replace(
    /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|小时|m|min|mins|minutes?|分|分钟|s|sec|secs|seconds?|秒)/gi,
    ''
  )
  // Also remove leading/trailing separators and spaces
  stripped = stripped.replace(/^[\s,;:、\-–—]+|[\s,;:、\-–—]+$/g, '').trim()
  return stripped
}

/** Convert a numeric value with unit string to milliseconds */
function unitToMs(value: number, unit: string): number {
  const u = unit.toLowerCase()
  if (['h', 'hr', 'hrs', 'hour', 'hours', '小时'].includes(u)) {
    return Math.round(value * 3600000)
  }
  if (['m', 'min', 'mins', 'minute', 'minutes', '分', '分钟'].includes(u)) {
    return Math.round(value * 60000)
  }
  if (['s', 'sec', 'secs', 'second', 'seconds', '秒'].includes(u)) {
    return Math.round(value * 1000)
  }
  return 0
}
