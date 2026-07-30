import { describe, it, expect, vi, afterEach } from 'vitest'
import { calcNextTrigger, normalizeRepeatTrigger } from '../reminderStore'
import type { RepeatConfig } from '../types'

// Helper: create a date at a specific time
function at(year: number, month: number, day: number, hour = 9, min = 0): number {
  return new Date(year, month - 1, day, hour, min, 0, 0).getTime()
}

describe('calcNextTrigger', () => {
  describe('daily', () => {
    it('returns next day same time', () => {
      const repeat: RepeatConfig = { type: 'daily' }
      const after = at(2026, 7, 8, 9, 0)
      const next = calcNextTrigger(repeat, after)
      expect(next).toBe(at(2026, 7, 9, 9, 0))
    })

    it('crosses month boundary', () => {
      const repeat: RepeatConfig = { type: 'daily' }
      const after = at(2026, 7, 31, 9, 0)
      const next = calcNextTrigger(repeat, after)
      expect(next).toBe(at(2026, 8, 1, 9, 0))
    })

    it('crosses year boundary', () => {
      const repeat: RepeatConfig = { type: 'daily' }
      const after = at(2026, 12, 31, 9, 0)
      const next = calcNextTrigger(repeat, after)
      expect(next).toBe(at(2027, 1, 1, 9, 0))
    })
  })

  describe('weekly', () => {
    it('returns null when no weekdays selected', () => {
      const repeat: RepeatConfig = { type: 'weekly', weekdays: [] }
      const after = at(2026, 7, 8, 9, 0)
      expect(calcNextTrigger(repeat, after)).toBeNull()
    })

    it('finds next matching weekday', () => {
      // 2026-07-08 is Wednesday (day=3). Select Friday (day=5).
      const repeat: RepeatConfig = { type: 'weekly', weekdays: [5] }
      const after = at(2026, 7, 8, 9, 0)
      const next = calcNextTrigger(repeat, after)
      // Next Friday is 2026-07-10
      expect(next).toBe(at(2026, 7, 10, 9, 0))
    })

    it('wraps around week boundary', () => {
      // 2026-07-08 is Wednesday (day=3). Select Monday (day=1).
      const repeat: RepeatConfig = { type: 'weekly', weekdays: [1] }
      const after = at(2026, 7, 8, 9, 0)
      const next = calcNextTrigger(repeat, after)
      // Next Monday is 2026-07-13
      expect(next).toBe(at(2026, 7, 13, 9, 0))
    })

    it('picks earliest matching weekday', () => {
      // 2026-07-08 is Wednesday. Select Tue(2) and Thu(4).
      const repeat: RepeatConfig = { type: 'weekly', weekdays: [2, 4] }
      const after = at(2026, 7, 8, 9, 0)
      const next = calcNextTrigger(repeat, after)
      // Next Tue is 2026-07-14, next Thu is 2026-07-09. Thu is sooner.
      expect(next).toBe(at(2026, 7, 9, 9, 0))
    })
  })

  describe('monthly', () => {
    it('returns same month if later day exists', () => {
      // 2026-07-08. Selected days: [15, 25]
      const repeat: RepeatConfig = { type: 'monthly', monthDays: [15, 25] }
      const after = at(2026, 7, 8, 9, 0)
      const next = calcNextTrigger(repeat, after)
      expect(next).toBe(at(2026, 7, 15, 9, 0))
    })

    it('rolls to next month when no remaining days', () => {
      // 2026-07-25. Selected day: [10]
      const repeat: RepeatConfig = { type: 'monthly', monthDays: [10] }
      const after = at(2026, 7, 25, 9, 0)
      const next = calcNextTrigger(repeat, after)
      expect(next).toBe(at(2026, 8, 10, 9, 0))
    })

    it('handles deprecated monthDay field', () => {
      const repeat: RepeatConfig = { type: 'monthly', monthDay: 15 }
      const after = at(2026, 7, 8, 9, 0)
      const next = calcNextTrigger(repeat, after)
      expect(next).toBe(at(2026, 7, 15, 9, 0))
    })

    it('returns null for empty monthDays', () => {
      const repeat: RepeatConfig = { type: 'monthly', monthDays: [] }
      const after = at(2026, 7, 8, 9, 0)
      expect(calcNextTrigger(repeat, after)).toBeNull()
    })

    it('clamps day 31 to month end (Feb)', () => {
      // 2026-01-31. Selected day: [31]. February has 28 days.
      const repeat: RepeatConfig = { type: 'monthly', monthDays: [31] }
      const after = at(2026, 1, 31, 9, 0)
      const next = calcNextTrigger(repeat, after)
      // Should clamp to Feb 28
      expect(next).toBe(at(2026, 2, 28, 9, 0))
    })
  })

  describe('custom interval', () => {
    it('calculates minute interval', () => {
      const repeat: RepeatConfig = { type: 'custom', interval: 30, intervalUnit: 'minute' }
      const after = at(2026, 7, 8, 9, 0)
      const next = calcNextTrigger(repeat, after)
      expect(next).toBe(after + 30 * 60_000)
    })

    it('calculates hour interval', () => {
      const repeat: RepeatConfig = { type: 'custom', interval: 2, intervalUnit: 'hour' }
      const after = at(2026, 7, 8, 9, 0)
      const next = calcNextTrigger(repeat, after)
      expect(next).toBe(after + 2 * 3_600_000)
    })

    it('calculates day interval', () => {
      const repeat: RepeatConfig = { type: 'custom', interval: 7, intervalUnit: 'day' }
      const after = at(2026, 7, 8, 9, 0)
      const next = calcNextTrigger(repeat, after)
      expect(next).toBe(after + 7 * 86_400_000)
    })

    it('returns null when interval or unit missing', () => {
      const repeat: RepeatConfig = { type: 'custom' }
      const after = at(2026, 7, 8, 9, 0)
      expect(calcNextTrigger(repeat, after)).toBeNull()
    })
  })
})

// ─── normalizeRepeatTrigger ────────────────────────────────────────────────────

describe('normalizeRepeatTrigger', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('weekly', () => {
    it('snaps a distant matching day to the nearest matching weekday (user scenario)', () => {
      // Today: Thursday 2026-07-30 10:33. Rule: Mon/Wed/Fri.
      // User picked next Monday 08/03 10:25 — but Friday 07/31 is tomorrow!
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 6, 30, 10, 33)) // Thu Jul 30
      const repeat: RepeatConfig = { type: 'weekly', weekdays: [1, 3, 5] }
      const picked = at(2026, 8, 3, 10, 25) // Monday Aug 3
      const result = normalizeRepeatTrigger(repeat, picked)
      // Should snap to Friday Jul 31 10:25 (nearest matching day from today)
      expect(result).toBe(at(2026, 7, 31, 10, 25))
    })

    it('keeps triggerAt when it is a matching day and still in the future', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 6, 30, 9, 0)) // Thu Jul 30 09:00
      const repeat: RepeatConfig = { type: 'weekly', weekdays: [1, 3, 5] }
      const picked = at(2026, 7, 31, 10, 25) // Fri Jul 31 (matches, future)
      expect(normalizeRepeatTrigger(repeat, picked)).toBe(picked)
    })

    it('keeps today when today matches and time has not passed', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 6, 31, 9, 0)) // Fri Jul 31 09:00
      const repeat: RepeatConfig = { type: 'weekly', weekdays: [1, 3, 5] }
      const picked = at(2026, 7, 31, 10, 25) // today Fri, future time
      expect(normalizeRepeatTrigger(repeat, picked)).toBe(picked)
    })

    it('advances to next matching day when today matches but time passed', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 6, 31, 11, 0)) // Fri Jul 31 11:00
      const repeat: RepeatConfig = { type: 'weekly', weekdays: [1, 3, 5] }
      const picked = at(2026, 7, 31, 10, 25) // today Fri, but 10:25 passed
      // Next matching day after Fri is Monday Aug 3
      expect(normalizeRepeatTrigger(repeat, picked)).toBe(at(2026, 8, 3, 10, 25))
    })

    it('returns triggerAt unchanged when weekdays is empty', () => {
      const repeat: RepeatConfig = { type: 'weekly', weekdays: [] }
      const picked = at(2026, 8, 3, 10, 25)
      expect(normalizeRepeatTrigger(repeat, picked)).toBe(picked)
    })
  })

  describe('monthly', () => {
    it('snaps to nearest selected day-of-month', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 6, 30, 10, 33)) // Jul 30
      const repeat: RepeatConfig = { type: 'monthly', monthDays: [5, 15] }
      const picked = at(2026, 9, 15, 9, 0) // Sep 15 (far away)
      // Nearest matching day from Jul 30: Aug 5
      expect(normalizeRepeatTrigger(repeat, picked)).toBe(at(2026, 8, 5, 9, 0))
    })

    it('keeps triggerAt when day matches and time is future', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 6, 30, 8, 0)) // Jul 30 08:00
      const repeat: RepeatConfig = { type: 'monthly', monthDays: [30] }
      const picked = at(2026, 7, 30, 9, 0) // today the 30th, future time
      expect(normalizeRepeatTrigger(repeat, picked)).toBe(picked)
    })
  })

  describe('daily', () => {
    it('keeps future triggerAt unchanged', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 6, 30, 8, 0))
      const repeat: RepeatConfig = { type: 'daily' }
      const picked = at(2026, 7, 30, 9, 0)
      expect(normalizeRepeatTrigger(repeat, picked)).toBe(picked)
    })

    it('rolls past time to today or tomorrow same time', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 6, 30, 11, 0)) // 11:00 now
      const repeat: RepeatConfig = { type: 'daily' }
      const picked = at(2026, 7, 28, 9, 0) // past date, 09:00 (also passed today)
      // 09:00 today already passed → tomorrow 09:00
      expect(normalizeRepeatTrigger(repeat, picked)).toBe(at(2026, 7, 31, 9, 0))
    })
  })

  describe('custom', () => {
    it('keeps future triggerAt unchanged', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 6, 30, 8, 0))
      const repeat: RepeatConfig = { type: 'custom', interval: 2, intervalUnit: 'hour' }
      const picked = at(2026, 7, 30, 10, 0)
      expect(normalizeRepeatTrigger(repeat, picked)).toBe(picked)
    })

    it('advances past triggerAt to now + interval', () => {
      vi.useFakeTimers()
      const nowMs = new Date(2026, 6, 30, 11, 0).getTime()
      vi.setSystemTime(new Date(nowMs))
      const repeat: RepeatConfig = { type: 'custom', interval: 2, intervalUnit: 'hour' }
      const picked = at(2026, 7, 29, 10, 0) // yesterday, long past
      expect(normalizeRepeatTrigger(repeat, picked)).toBe(nowMs + 2 * 3_600_000)
    })
  })
})
