/**
 * Natural Language Time Parser for Quick Reminder Creation
 * Supports Chinese (zh-CN) and English (en-US) basic patterns.
 * Returns parsed time + title + repeat config, or null if unparseable.
 */
import type { RepeatConfig } from './types'

export interface ParsedResult {
  title: string
  triggerAt: number
  repeat: RepeatConfig | null
  /** Whether the time was confidently parsed */
  confident: boolean
}

type TimeResult =
  | { hour: number; minute: number }
  | { relativeTimestamp: number }
  | null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Extractor<T> = (...args: any[]) => T

const ZH_TIME_PATTERNS: [RegExp, Extractor<TimeResult>][] = [
  [/(下午|晚上)(\d{1,2})[点时:：](\d{1,2})[分]?/, (_, _period: string, h: string, m: string) => {
    const hour = parseInt(h) + 12
    return { hour: hour > 23 ? hour - 12 : hour, minute: parseInt(m) }
  }],
  [/(下午|晚上)(\d{1,2})点半/, (_, _period: string, h: string) => {
    const hour = parseInt(h) + 12
    return { hour: hour > 23 ? hour - 12 : hour, minute: 30 }
  }],
  [/(下午|晚上)(\d{1,2})[点时]/, (_, _period: string, h: string) => {
    const hour = parseInt(h) + 12
    return { hour: hour > 23 ? hour - 12 : hour, minute: 0 }
  }],
  [/(上午|早上|早晨)(\d{1,2})[点时:：](\d{1,2})[分]?/, (_, _period: string, h: string, m: string) => ({
    hour: parseInt(h), minute: parseInt(m),
  })],
  [/(上午|早上|早晨)(\d{1,2})点半/, (_, _period: string, h: string) => ({
    hour: parseInt(h), minute: 30,
  })],
  [/(上午|早上|早晨)(\d{1,2})[点时]/, (_, _period: string, h: string) => ({
    hour: parseInt(h), minute: 0,
  })],
  [/(\d{1,2})[点时:：](\d{1,2})[分]?/, (_, h: string, m: string) => ({
    hour: parseInt(h), minute: parseInt(m),
  })],
  [/(?<!\d)(\d{1,2})[点时](?![\d分半])/, (_, h: string) => ({
    hour: parseInt(h), minute: 0,
  })],
  [/(\d{1,2})点半/, (_, h: string) => ({
    hour: parseInt(h), minute: 30,
  })],
  [/(\d+)分钟后/, (_, m: string) => {
    const now = new Date()
    now.setMinutes(now.getMinutes() + parseInt(m))
    return { relativeTimestamp: now.getTime() }
  }],
  [/半小时后/, () => {
    const now = new Date()
    now.setMinutes(now.getMinutes() + 30)
    return { relativeTimestamp: now.getTime() }
  }],
  [/(\d+)小时后/, (_, h: string) => {
    const now = new Date()
    now.setHours(now.getHours() + parseInt(h))
    return { relativeTimestamp: now.getTime() }
  }],
]

const EN_TIME_PATTERNS: [RegExp, Extractor<TimeResult>][] = [
  [/(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)/i, (_, h: string, m: string, period: string) => {
    let hour = parseInt(h)
    if (period.toLowerCase() === 'pm' && hour < 12) hour += 12
    if (period.toLowerCase() === 'am' && hour === 12) hour = 0
    return { hour, minute: parseInt(m) }
  }],
  [/(?:at\s+)?(\d{1,2})\s*(am|pm)/i, (_, h: string, period: string) => {
    let hour = parseInt(h)
    if (period.toLowerCase() === 'pm' && hour < 12) hour += 12
    if (period.toLowerCase() === 'am' && hour === 12) hour = 0
    return { hour, minute: 0 }
  }],
  [/(?:at\s+)?(\d{1,2}):(\d{2})/, (_, h: string, m: string) => ({
    hour: parseInt(h), minute: parseInt(m),
  })],
  [/in\s+(\d+)\s+minutes?/i, (_, m: string) => {
    const now = new Date()
    now.setMinutes(now.getMinutes() + parseInt(m))
    return { relativeTimestamp: now.getTime() }
  }],
  [/in\s+(\d+)\s+hours?/i, (_, h: string) => {
    const now = new Date()
    now.setHours(now.getHours() + parseInt(h))
    return { relativeTimestamp: now.getTime() }
  }],
  [/in\s+half\s+an?\s+hour/i, () => {
    const now = new Date()
    now.setMinutes(now.getMinutes() + 30)
    return { relativeTimestamp: now.getTime() }
  }],
]

const ZH_DATE_PATTERNS: [RegExp, Extractor<Date | null>][] = [
  [/明天/, () => {
    const d = new Date(); d.setDate(d.getDate() + 1); return d
  }],
  [/后天/, () => {
    const d = new Date(); d.setDate(d.getDate() + 2); return d
  }],
  [/下(周|星期)([一二三四五六日天])/, (_, _w: string, dayStr: string) => {
    const dayMap: Record<string, number> = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 }
    const targetDay = dayMap[dayStr]
    const now = new Date()
    const currentDay = now.getDay()
    let daysUntil = (targetDay - currentDay + 7) % 7
    if (daysUntil === 0) daysUntil = 7
    daysUntil += 7
    now.setDate(now.getDate() + daysUntil)
    return now
  }],
  [/这(周|星期)([一二三四五六日天])/, (_, _w: string, dayStr: string) => {
    const dayMap: Record<string, number> = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 }
    const targetDay = dayMap[dayStr]
    const now = new Date()
    const currentDay = now.getDay()
    let daysUntil = (targetDay - currentDay + 7) % 7
    if (daysUntil === 0) daysUntil = 7
    now.setDate(now.getDate() + daysUntil)
    return now
  }],
  [/今天/, () => new Date()],
  [/(\d{1,2})月(\d{1,2})[日号]/, (_, m: string, d: string) => {
    const now = new Date()
    now.setMonth(parseInt(m) - 1, parseInt(d))
    return now
  }],
  [/(\d{1,2})[日号]/, (_, d: string) => {
    const now = new Date(); now.setDate(parseInt(d)); return now
  }],
]

const EN_DATE_PATTERNS: [RegExp, Extractor<Date | null>][] = [
  [/\btomorrow\b/i, () => {
    const d = new Date(); d.setDate(d.getDate() + 1); return d
  }],
  [/\btoday\b/i, () => new Date()],
  [/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, (_, dayStr: string) => {
    const dayMap: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }
    const targetDay = dayMap[dayStr.toLowerCase()]
    const now = new Date()
    const currentDay = now.getDay()
    let daysUntil = (targetDay - currentDay + 7) % 7
    if (daysUntil === 0) daysUntil = 7
    daysUntil += 7
    now.setDate(now.getDate() + daysUntil)
    return now
  }],
  [/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, (_, dayStr: string) => {
    const dayMap: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }
    const targetDay = dayMap[dayStr.toLowerCase()]
    const now = new Date()
    const currentDay = now.getDay()
    let daysUntil = (targetDay - currentDay + 7) % 7
    if (daysUntil === 0) daysUntil = 7
    now.setDate(now.getDate() + daysUntil)
    return now
  }],
]

const ZH_REPEAT_PATTERNS: [RegExp, RepeatConfig][] = [
  [/每天|每日/, { type: 'daily' }],
  // Match "每周", "每周五", "每星期三五", "每周一到周五" — includes weekday chars so they get cleaned from title
  [/每(周|星期)([一二三四五六日天]+([到至](周|星期)?[一二三四五六日天])?)?/, { type: 'weekly' }],
  [/每月/, { type: 'monthly' }],
]

const EN_WEEKDAY_RE = '(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)'

const EN_REPEAT_PATTERNS: [RegExp, RepeatConfig][] = [
  [/\bdaily\b|\bevery\s+day\b/i, { type: 'daily' }],
  // Match "every Friday", "weekly on Friday", "every Mon, Wed, Fri", "weekly", "every week"
  [new RegExp(`\\bevery\\s+${EN_WEEKDAY_RE}s?\\b|\\bweekly\\s+on\\s+${EN_WEEKDAY_RE}s?\\b|\\bweekly\\b|\\bevery\\s+week\\b`, 'i'), { type: 'weekly' }],
  [/\bmonthly\b|\bevery\s+month\b/i, { type: 'monthly' }],
]

/** Parse quick input text into a reminder */
export function parseQuickInput(input: string, lang: string): ParsedResult | null {
  if (!input.trim()) return null

  const isZh = lang.startsWith('zh')
  let title = input.trim()
  let parsedDate: Date | null = null
  let parsedTime: TimeResult = null
  let parsedRepeat: RepeatConfig | null = null

  // Parse repeat
  const repeatPatterns = isZh ? ZH_REPEAT_PATTERNS : EN_REPEAT_PATTERNS
  for (const [pattern, config] of repeatPatterns) {
    if (pattern.test(title)) {
      parsedRepeat = { ...config }
      if (config.type === 'weekly' && isZh) {
        const dayMap: Record<string, number> = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 }
        const days: number[] = []

        // Try range: "每周一到五" or "每周一至周五"
        const rangeMatch = title.match(/每(周|星期)([一二三四五六日天])[到至](周|星期)?([一二三四五六日天])/)
        if (rangeMatch) {
          const start = dayMap[rangeMatch[2]]
          const end = dayMap[rangeMatch[4]]
          if (start !== undefined && end !== undefined) {
            if (start <= end) {
              for (let i = start; i <= end; i++) days.push(i)
            } else {
              // Wrap-around: e.g. Sat to Wed = 6,0,1,2,3
              for (let i = start; i <= 6; i++) days.push(i)
              for (let i = 0; i <= end; i++) days.push(i)
            }
          }
        }

        if (days.length === 0) {
          // Try individual days: "每周五" or "每周三五"
          const weekdayMatch = title.match(/每(周|星期)([一二三四五六日天]+)/)
          if (weekdayMatch) {
            for (const c of weekdayMatch[2]) {
              const d = dayMap[c]
              if (d !== undefined) days.push(d)
            }
          }
        }

        if (days.length > 0) parsedRepeat.weekdays = days
      } else if (config.type === 'weekly' && !isZh) {
        const enDayMap: Record<string, number> = {
          sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2,
          wednesday: 3, wed: 3, thursday: 4, thu: 4, friday: 5, fri: 5,
          saturday: 6, sat: 6,
        }
        const enDays: number[] = []

        // Try range: "Monday to Friday", "Mon-Fri", "Monday through Friday"
        const rangeMatch = title.match(new RegExp(`\\b(${EN_WEEKDAY_RE})s?\\s*(?:to|-|through)\\s*(${EN_WEEKDAY_RE})s?\\b`, 'i'))
        if (rangeMatch) {
          const start = enDayMap[rangeMatch[1].toLowerCase().replace(/s$/, '')]
          const end = enDayMap[rangeMatch[2].toLowerCase().replace(/s$/, '')]
          if (start !== undefined && end !== undefined) {
            if (start <= end) {
              for (let i = start; i <= end; i++) enDays.push(i)
            } else {
              for (let i = start; i <= 6; i++) enDays.push(i)
              for (let i = 0; i <= end; i++) enDays.push(i)
            }
          }
        }

        if (enDays.length === 0) {
          // Find all individual weekday mentions
          const weekdayRegex = new RegExp(`\\b(${EN_WEEKDAY_RE})s?\\b`, 'gi')
          let m
          while ((m = weekdayRegex.exec(title)) !== null) {
            const day = enDayMap[m[1].toLowerCase()]
            if (day !== undefined && !enDays.includes(day)) enDays.push(day)
          }
        }

        if (enDays.length > 0) parsedRepeat.weekdays = enDays

        // Comprehensive removal: handles "every Friday", "every Mon, Wed, Fri", "Monday to Friday", "weekly on Friday"
        const removePattern = new RegExp(
          `\\bevery\\s+(?:${EN_WEEKDAY_RE}s?\\s*(?:,|to|-|through)?\\s*)+` +
          `|\\bweekly\\s+on\\s+(?:${EN_WEEKDAY_RE}s?\\s*(?:,|to|-|through)?\\s*)+` +
          `|\\bweekly\\b` +
          `|\\bevery\\s+week\\b`,
          'i'
        )
        title = title.replace(removePattern, '').trim()
      }
      title = title.replace(pattern, '').trim()
      break
    }
  }

  // Parse date
  const datePatterns = isZh ? ZH_DATE_PATTERNS : EN_DATE_PATTERNS
  for (const [pattern, extractor] of datePatterns) {
    const match = title.match(pattern)
    if (match) {
      parsedDate = extractor(...match)
      title = title.replace(pattern, '').trim()
      break
    }
  }

  // Parse time
  const timePatterns = isZh ? ZH_TIME_PATTERNS : EN_TIME_PATTERNS
  for (const [pattern, extractor] of timePatterns) {
    const match = title.match(pattern)
    if (match) {
      parsedTime = extractor(...match)
      if (!parsedTime) {
        parsedDate = new Date()
      }
      title = title.replace(pattern, '').trim()
      break
    }
  }

  if (!parsedTime && !parsedDate) {
    return { title: input.trim(), triggerAt: 0, repeat: parsedRepeat, confident: false }
  }

  const now = new Date()
  let baseDate = parsedDate ?? now

  if (parsedTime) {
    if ('relativeTimestamp' in parsedTime) {
      // Relative time (e.g. "5 minutes later"): use exact timestamp, no day-rollover logic
      const relativeDate = new Date(parsedTime.relativeTimestamp)
      if (parsedDate) {
        // Has both a date pattern and relative time (rare but handle it)
        baseDate.setFullYear(relativeDate.getFullYear(), relativeDate.getMonth(), relativeDate.getDate())
        baseDate.setHours(relativeDate.getHours(), relativeDate.getMinutes(), 0, 0)
      } else {
        baseDate = relativeDate
      }
    } else {
      baseDate.setHours(parsedTime.hour, parsedTime.minute, 0, 0)
      // Smart PM inference for bare times (1-11h without explicit 上午/下午 prefix):
      // e.g. "3点半" at 2PM → try 15:30 today before rolling to tomorrow
      if (baseDate.getTime() <= now.getTime() && !parsedDate && parsedTime.hour <= 12) {
        const pmDate = new Date(baseDate)
        pmDate.setHours(parsedTime.hour + 12, parsedTime.minute, 0, 0)
        if (pmDate.getTime() > now.getTime()) {
          baseDate = pmDate
        } else {
          baseDate.setDate(baseDate.getDate() + 1)
        }
      } else if (baseDate.getTime() <= now.getTime() && !parsedDate) {
        baseDate.setDate(baseDate.getDate() + 1)
      }
    }
  } else {
    baseDate.setHours(9, 0, 0, 0)
  }

  // Strip colloquial time-context words from title (these imply "later" but are not needed in the reminder title)
  if (isZh) {
    title = title.replace(/[待等]会儿?/g, '').replace(/一会儿|等一下|稍后/g, '')
  }

  title = title.replace(/^[\s,，.。!！?？]+/, '').replace(/[\s,，.。!！?？]+$/, '')
  if (!isZh) {
    title = title.replace(/^at\s+/i, '').replace(/^[\s,，.。!！?？]+/, '').replace(/[\s,，.。!！?？]+$/, '')
  }
  if (!title) title = input.trim()

  if (parsedRepeat?.type === 'monthly') {
    parsedRepeat.monthDays = [baseDate.getDate()]
  }
  if (parsedRepeat?.type === 'weekly' && !parsedRepeat.weekdays?.length) {
    parsedRepeat.weekdays = [baseDate.getDay()]
  }

  return {
    title,
    triggerAt: baseDate.getTime(),
    repeat: parsedRepeat,
    confident: true,
  }
}
