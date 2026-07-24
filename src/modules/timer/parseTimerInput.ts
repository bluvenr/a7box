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
 *   半小时 / 半小时后吃药             → 30 minutes, title "吃药"
 *   一刻钟                           → 15 minutes
 *   1.5小时                          → 1 hour 30 minutes
 *
 * IMPORTANT: Unit alternations in regexes are ordered longest-first so that
 * e.g. "minutes" matches before "min" before "m", and "分钟" before "分".
 */
import type { ParsedTimerInput } from './types'

/**
 * Unit pattern — longest-first alternation to ensure greedy matching.
 * Used in both compound and single-unit regexes.
 */
const UNIT_PAT = 'hours?|hour|hrs|hr|h|小时|minutes?|minute|mins|min|m|分钟|分|seconds?|second|secs|sec|s|秒'

/** Chinese noise words stripped from extracted titles (applied iteratively) */
const TITLE_NOISE_RE = /^(之?后|以后|然后|提醒|倒计时|闹钟|计时|记得|一下|帮我?|给我?|我)/g

/** Chinese reminder prefixes stripped before parsing (applied iteratively) */
const PREFIX_NOISE_RE = /^(提醒我?|帮我?|给我?|请帮我?|设定?个?|定个?)/g

/** Chinese single-digit numeral mapping */
const CN_DIGIT: Record<string, number> = {
  '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
  '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
}

/**
 * Parse a timer input string into duration + title.
 * Returns { valid: false } if no duration could be extracted.
 */
export function parseTimerInput(raw: string): ParsedTimerInput {
  // Pre-process: iteratively strip Chinese reminder prefixes ("提醒我", "帮我定个", etc.)
  let input = raw.trim()
  let prev = ''
  while (prev !== input) {
    prev = input
    input = input.replace(PREFIX_NOISE_RE, '').trim()
  }
  if (!input) return { duration: 0, title: '', valid: false }

  // ── Pre-parse: Chinese special expressions ──────────────────────────────
  const chineseResult = parseChineseSpecial(input)
  if (chineseResult) return chineseResult

  // ── Try HH:MM:SS or MM:SS format ──────────────────────────────────────
  const colonMatch = input.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?\s*(.*)$/)
  if (colonMatch) {
    const [, hOrM, mOrS, maybeS, rest] = colonMatch
    let totalMs: number
    if (maybeS !== undefined) {
      totalMs = (parseInt(hOrM) * 3600 + parseInt(mOrS) * 60 + parseInt(maybeS)) * 1000
    } else {
      totalMs = (parseInt(hOrM) * 60 + parseInt(mOrS)) * 1000
    }
    if (totalMs > 0) {
      return { duration: totalMs, title: cleanTitle(rest), valid: true }
    }
  }

  // ── Try compound duration: "1h 30m", "1小时30分", "2h 5m 30s" ───────────
  const compoundMs = parseCompoundDuration(input)
  if (compoundMs > 0) {
    const title = extractTitleAfterDuration(input)
    return { duration: compoundMs, title, valid: true }
  }

  // ── Try single unit: "5m", "5分钟", "90s", "90秒", "2h", "2小时" ───────
  const singleRe = new RegExp(
    `^(\\d+(?:\\.\\d+)?)\\s*(${UNIT_PAT})(?:\\s+(.+))?$`, 'i'
  )
  const singleMatch = input.match(singleRe)
  if (singleMatch) {
    const value = parseFloat(singleMatch[1])
    const unit = singleMatch[2].toLowerCase()
    const title = cleanTitle(singleMatch[3] ?? '')
    const ms = unitToMs(value, unit)
    if (ms > 0) return { duration: ms, title, valid: true }
  }

  // ── Try pure number (seconds) ─────────────────────────────────────────
  const pureNumMatch = input.match(/^(\d+(?:\.\d+)?)\s*(.*)$/)
  if (pureNumMatch) {
    const secs = parseFloat(pureNumMatch[1])
    const title = cleanTitle(pureNumMatch[2] ?? '')
    if (secs > 0) return { duration: secs * 1000, title, valid: true }
  }

  return { duration: 0, title: input, valid: false }
}

/** Parse compound duration like "1h30m", "1小时 30分 15秒" */
function parseCompoundDuration(input: string): number {
  const compoundRe = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNIT_PAT})`, 'gi')
  const unitTokens = input.match(compoundRe)
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
  const stripRe = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNIT_PAT})`, 'gi')
  let stripped = input.replace(stripRe, '')
  // Also remove leading/trailing separators and spaces
  stripped = stripped.replace(/^[\s,;:、\-–—]+|[\s,;:、\-–—]+$/g, '').trim()
  return cleanTitle(stripped)
}

/** Strip common Chinese noise words from extracted title (loops until stable) */
function cleanTitle(raw: string): string {
  let t = raw.trim()
  // Iteratively remove noise words (handles "后提醒" → strip "后" → strip "提醒")
  let prev = ''
  while (prev !== t) {
    prev = t
    t = t.replace(TITLE_NOISE_RE, '').trim()
  }
  // Remove trailing separators
  t = t.replace(/[\s,;:、\-–—]+$/g, '').trim()
  return t
}

/** Convert a single Chinese number word to its numeric value (supports 0-99) */
function parseChineseNumber(s: string): number {
  const d = CN_DIGIT[s]
  if (d !== undefined) return d

  // 十 alone = 10
  if (s === '十') return 10

  const digits = '零一二两三四五六七八九'

  // 十X → 11-19 (e.g. 十一 = 11, 十九 = 19)
  if (s.length === 2 && s[0] === '十' && digits.includes(s[1])) {
    return 10 + (CN_DIGIT[s[1]] ?? 0)
  }

  // X十 or X十Y (e.g. 三十 = 30, 三十五 = 35)
  const m = s.match(/^([一二两三四五六七八九])十([零一二两三四五六七八九])?$/)
  if (m) {
    const tens = CN_DIGIT[m[1]] * 10
    const ones = m[2] ? (CN_DIGIT[m[2]] ?? 0) : 0
    return tens + ones
  }

  return NaN
}

/** Replace Chinese number words in text with Arabic digit strings */
function normalizeChineseNumbers(input: string): string {
  return input.replace(/[零一二两三四五六七八九十]+/g, (match) => {
    const val = parseChineseNumber(match)
    return isNaN(val) ? match : String(val)
  })
}

/** Handle Chinese special time expressions: 半小时, 一刻钟, etc. */
function parseChineseSpecial(input: string): ParsedTimerInput | null {
  // Pre-convert Chinese numbers to Arabic digits
  let normalized = normalizeChineseNumbers(input)

  // 半小时 / 半个小时 → 30 minutes
  const halfHourMatch = normalized.match(/^半(?:个)?小时\s*(.*)$/)
  if (halfHourMatch) {
    return { duration: 1800000, title: cleanTitle(halfHourMatch[1]), valid: true }
  }

  // 一刻钟 / 一刻 → 15 minutes
  const quarterMatch = normalized.match(/^1(?:刻钟|刻)\s*(.*)$/)
  if (quarterMatch) {
    return { duration: 900000, title: cleanTitle(quarterMatch[1]), valid: true }
  }

  // X个半小时 → X*60 + 30 minutes (e.g. 1个半小时 → 90min, 2个半小时 → 150min)
  const halfPlusMatch = normalized.match(/^(\d+)个半小时\s*(.*)$/)
  if (halfPlusMatch) {
    const hours = parseInt(halfPlusMatch[1])
    const ms = (hours * 3600 + 1800) * 1000
    return { duration: ms, title: cleanTitle(halfPlusMatch[2]), valid: true }
  }

  // If normalization changed the string and it now contains digits, let the main parser try
  if (normalized !== input && /\d/.test(normalized)) {
    // Re-run main parser with normalized input (skip this function to avoid infinite loop)
    return parseTimerInputNormalized(normalized)
  }

  return null
}

/** Run parser on already-normalized input (skip Chinese special step) */
function parseTimerInputNormalized(input: string): ParsedTimerInput | null {
  // Try compound
  const compoundMs = parseCompoundDuration(input)
  if (compoundMs > 0) {
    const title = extractTitleAfterDuration(input)
    return { duration: compoundMs, title, valid: true }
  }

  // Try single unit
  const singleRe = new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*(${UNIT_PAT})(?:\\s+(.+))?$`, 'i')
  const singleMatch = input.match(singleRe)
  if (singleMatch) {
    const value = parseFloat(singleMatch[1])
    const unit = singleMatch[2].toLowerCase()
    const title = cleanTitle(singleMatch[3] ?? '')
    const ms = unitToMs(value, unit)
    if (ms > 0) return { duration: ms, title, valid: true }
  }

  return null
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
