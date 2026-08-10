/**
 * Reminder Store
 * Zustand store with persist middleware for managing reminders
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Reminder, ReminderStatus, ReminderFormData, RepeatConfig } from './types'

interface ReminderState {
  reminders: Reminder[]

  // CRUD
  addReminder: (data: ReminderFormData) => Reminder
  updateReminder: (id: string, data: Partial<ReminderFormData>) => void
  deleteReminder: (id: string) => void
  updateStatus: (id: string, status: ReminderStatus, snoozeUntil?: number) => void

  // Queries
  getActiveReminders: () => Reminder[]
  getOverdueCount: () => number
  getPendingCount: () => number
  getNextReminder: () => Reminder | null
  getById: (id: string) => Reminder | undefined
}

/** Migrate deprecated single monthDay → monthDays array (in-place) */
function migrateReminders(reminders: Reminder[]): Reminder[] {
  let migrated = false
  for (const r of reminders) {
    if (r.repeat?.monthDay !== undefined && !r.repeat.monthDays) {
      r.repeat.monthDays = [r.repeat.monthDay]
      delete r.repeat.monthDay
      migrated = true
    }
  }
  return migrated ? [...reminders] : reminders
}

/** Calculate next trigger time for a repeat config after a given time */
export function calcNextTrigger(repeat: RepeatConfig, afterTime: number): number | null {
  const date = new Date(afterTime)

  switch (repeat.type) {
    case 'daily': {
      date.setDate(date.getDate() + 1)
      return date.getTime()
    }
    case 'weekly': {
      if (!repeat.weekdays?.length) return null
      const currentDay = date.getDay()
      // Find next matching weekday
      for (let i = 1; i <= 7; i++) {
        const nextDay = (currentDay + i) % 7
        if (repeat.weekdays.includes(nextDay)) {
          date.setDate(date.getDate() + i)
          return date.getTime()
        }
      }
      return null
    }
    case 'monthly': {
      // Support both new monthDays array and deprecated single monthDay
      const days = repeat.monthDays ?? (repeat.monthDay ? [repeat.monthDay] : [date.getDate()])
      if (!days.length) return null
      const sortedDays = [...new Set(days)].sort((a, b) => a - b)
      const hours = date.getHours()
      const minutes = date.getMinutes()
      const afterDay = date.getDate()

      // 1. Check current month for remaining selected days after the trigger day
      const lastDayCurrent = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
      for (const day of sortedDays) {
        const clamped = Math.min(day, lastDayCurrent)
        if (clamped > afterDay) {
          return new Date(date.getFullYear(), date.getMonth(), clamped, hours, minutes, 0, 0).getTime()
        }
      }

      // 2. Check subsequent months (up to 12 months ahead)
      for (let offset = 1; offset <= 12; offset++) {
        const testDate = new Date(date.getFullYear(), date.getMonth() + offset, 1)
        const lastDay = new Date(testDate.getFullYear(), testDate.getMonth() + 1, 0).getDate()
        for (const day of sortedDays) {
          const clamped = Math.min(day, lastDay)
          const result = new Date(testDate.getFullYear(), testDate.getMonth(), clamped, hours, minutes, 0, 0)
          if (result.getTime() > afterTime) {
            return result.getTime()
          }
        }
      }
      return null
    }
    case 'custom': {
      if (!repeat.interval || !repeat.intervalUnit) return null
      const ms = repeat.interval * (
        repeat.intervalUnit === 'minute' ? 60_000 :
        repeat.intervalUnit === 'hour' ? 3_600_000 :
        86_400_000
      )
      return afterTime + ms
    }
  }
  return null
}

/**
 * Normalize triggerAt for a repeat reminder so the first trigger lands on
 * the nearest future occurrence that matches the repeat rule.
 *
 * Without this, a user who picks e.g. "next Monday 10:25" with a Mon/Wed/Fri
 * rule would wait a full week even though Friday (a matching day) is tomorrow.
 *
 * Rules:
 * - weekly: snap to the nearest matching weekday (today if it matches and the
 *   time hasn't passed, otherwise the next matching day), preserving time-of-day.
 * - monthly: snap to the nearest selected day-of-month (same logic).
 * - daily / custom: if the time already passed, roll to the next day.
 */
export function normalizeRepeatTrigger(repeat: RepeatConfig, triggerAt: number): number {
  const now = Date.now()
  const date = new Date(triggerAt)

  switch (repeat.type) {
    case 'weekly': {
      if (!repeat.weekdays?.length) return triggerAt
      // Only keep as-is when it's TODAY (the nearest possible day), the day
      // matches the rule, and the time hasn't passed yet
      const isToday = date.toDateString() === new Date().toDateString()
      if (isToday && repeat.weekdays.includes(date.getDay()) && triggerAt > now) {
        return triggerAt
      }
      // Snap to the nearest matching weekday from today, preserving time-of-day
      const base = new Date()
      base.setHours(date.getHours(), date.getMinutes(), 0, 0)
      if (base.getTime() <= now) base.setDate(base.getDate() + 1)
      for (let i = 0; i < 7; i++) {
        if (repeat.weekdays.includes(base.getDay())) return base.getTime()
        base.setDate(base.getDate() + 1)
      }
      return triggerAt
    }
    case 'monthly': {
      const days = repeat.monthDays ?? (repeat.monthDay ? [repeat.monthDay] : [date.getDate()])
      if (!days.length) return triggerAt
      // Only keep as-is when it's TODAY, the day-of-month matches, and time hasn't passed
      const isToday = date.toDateString() === new Date().toDateString()
      if (isToday && days.includes(date.getDate()) && triggerAt > now) {
        return triggerAt
      }
      // Snap to the nearest selected day-of-month from today, preserving time-of-day
      const base = new Date()
      base.setHours(date.getHours(), date.getMinutes(), 0, 0)
      if (base.getTime() <= now) base.setDate(base.getDate() + 1)
      for (let i = 0; i < 62; i++) {
        if (days.includes(base.getDate())) return base.getTime()
        base.setDate(base.getDate() + 1)
      }
      return triggerAt
    }
    case 'daily': {
      if (triggerAt <= now) {
        // Time already passed — fire tomorrow at the same time
        const base = new Date()
        base.setHours(date.getHours(), date.getMinutes(), 0, 0)
        if (base.getTime() <= now) base.setDate(base.getDate() + 1)
        return base.getTime()
      }
      return triggerAt
    }
    case 'custom': {
      if (triggerAt <= now && repeat.interval && repeat.intervalUnit) {
        // Advance by interval from now (not from the stale past timestamp)
        const ms = repeat.interval * (
          repeat.intervalUnit === 'minute' ? 60_000 :
          repeat.intervalUnit === 'hour' ? 3_600_000 :
          86_400_000
        )
        return now + ms
      }
      return triggerAt
    }
  }
  return triggerAt
}

export const useReminderStore = create<ReminderState>()(
  persist(
    (set, get) => ({
      reminders: [],

      addReminder: (data) => {
        const now = Date.now()
        // For repeat reminders, snap triggerAt to the nearest future occurrence
        // matching the rule (e.g. weekly Mon/Wed/Fri → nearest matching weekday)
        const triggerAt = data.repeat
          ? normalizeRepeatTrigger(data.repeat, data.triggerAt)
          : data.triggerAt
        const reminder: Reminder = {
          id: crypto.randomUUID(),
          title: data.title.slice(0, 100),
          note: data.note ? data.note.slice(0, 500) : undefined,
          triggerAt,
          advanceMinutes: data.advanceMinutes && data.advanceMinutes > 0
            ? Math.min(1440, Math.round(data.advanceMinutes))
            : undefined,
          repeat: data.repeat,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({ reminders: [...s.reminders, reminder] }))
        return reminder
      },

      updateReminder: (id, data) => {
        set((s) => ({
          reminders: s.reminders.map((r) => {
            if (r.id !== id) return r
            const updated = {
              ...r,
              ...data,
              title: data.title !== undefined ? data.title.slice(0, 100) : r.title,
              note: data.note !== undefined ? data.note?.slice(0, 500) : r.note,
              updatedAt: Date.now(),
            }
            // Re-normalize triggerAt only for user-facing edits.
            // Form edits always include `repeat` in the payload (null for one-shot);
            // system-internal advances (notificationBridge) pass only { triggerAt }
            // and must NOT be re-normalized — their value is already the correct
            // next occurrence (normalizing could move it backwards, e.g. re-landing
            // on today after the user marked today's occurrence as done).
            if (updated.repeat && data.repeat !== undefined) {
              updated.triggerAt = normalizeRepeatTrigger(updated.repeat, updated.triggerAt)
            }
            // If editing a snoozed reminder, cancel the snooze — user is rescheduling
            if (r.status === 'snoozed') {
              updated.status = 'pending'
              updated.snoozeUntil = undefined
            }
            return updated
          }),
        }))
      },

      deleteReminder: (id) => {
        set((s) => ({ reminders: s.reminders.filter((r) => r.id !== id) }))
      },

      updateStatus: (id, status, snoozeUntil) => {
        set((s) => ({
          reminders: s.reminders.map((r) => {
            if (r.id !== id) return r
            const updated: Reminder = { ...r, status, updatedAt: Date.now() }
            if (status === 'snoozed' && snoozeUntil) {
              updated.snoozeUntil = snoozeUntil
            } else {
              updated.snoozeUntil = undefined
            }
            return updated
          }),
        }))
      },

      getActiveReminders: () => {
        return get().reminders.filter((r) => r.status !== 'completed')
      },

      getOverdueCount: () => {
        const now = Date.now()
        return get().reminders.filter(
          (r) => r.status === 'pending' && r.triggerAt <= now
        ).length
      },

      getPendingCount: () => {
        return get().reminders.filter((r) => r.status === 'pending').length
      },

      getNextReminder: () => {
        const now = Date.now()
        const pending = get().reminders
          .filter((r) => r.status === 'pending' && r.triggerAt > now)
          .sort((a, b) => a.triggerAt - b.triggerAt)
        return pending[0] ?? null
      },

      getById: (id) => {
        return get().reminders.find((r) => r.id === id)
      },
    }),
    {
      name: 'a7box-reminders',
      version: 1,
      partialize: (state: ReminderState) => ({ reminders: state.reminders }),
      merge: (persistedState: unknown, currentState: ReminderState): ReminderState => {
        const stored = (persistedState as Partial<ReminderState> | undefined)?.reminders
        if (!stored) return currentState
        return {
          ...currentState,
          reminders: migrateReminders(stored as Reminder[]),
        }
      },
    }
  )
)
