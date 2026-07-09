/**
 * Reminder Store
 * Zustand store with localStorage persistence for managing reminders
 */
import { create } from 'zustand'
import type { Reminder, ReminderStatus, ReminderFormData, RepeatConfig } from './types'

const STORAGE_KEY = 'a7box-reminders'

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

  // Lifecycle
  loadFromStorage: () => void
}

function loadReminders(): Reminder[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const reminders = JSON.parse(stored) as Reminder[]
    // Migrate deprecated single monthDay → monthDays array
    let migrated = false
    for (const r of reminders) {
      if (r.repeat?.monthDay !== undefined && !r.repeat.monthDays) {
        r.repeat.monthDays = [r.repeat.monthDay]
        delete r.repeat.monthDay
        migrated = true
      }
    }
    if (migrated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders))
    }
    return reminders
  } catch {
    return []
  }
}

function saveReminders(reminders: Reminder[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders))
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

export const useReminderStore = create<ReminderState>((set, get) => ({
  reminders: loadReminders(),

  addReminder: (data) => {
    const now = Date.now()
    const reminder: Reminder = {
      id: crypto.randomUUID(),
      title: data.title.slice(0, 100),
      note: data.note ? data.note.slice(0, 500) : undefined,
      triggerAt: data.triggerAt,
      repeat: data.repeat,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }
    set((s) => {
      const next = [...s.reminders, reminder]
      saveReminders(next)
      return { reminders: next }
    })
    return reminder
  },

  updateReminder: (id, data) => {
    set((s) => {
      const next = s.reminders.map((r) =>
        r.id === id
          ? {
              ...r,
              ...data,
              title: data.title !== undefined ? data.title.slice(0, 100) : r.title,
              note: data.note !== undefined ? data.note?.slice(0, 500) : r.note,
              updatedAt: Date.now(),
            }
          : r
      )
      saveReminders(next)
      return { reminders: next }
    })
  },

  deleteReminder: (id) => {
    set((s) => {
      const next = s.reminders.filter((r) => r.id !== id)
      saveReminders(next)
      return { reminders: next }
    })
  },

  updateStatus: (id, status, snoozeUntil) => {
    set((s) => {
      const next = s.reminders.map((r) => {
        if (r.id !== id) return r
        const updated: Reminder = { ...r, status, updatedAt: Date.now() }
        if (status === 'snoozed' && snoozeUntil) {
          updated.snoozeUntil = snoozeUntil
        } else {
          updated.snoozeUntil = undefined
        }
        return updated
      })
      saveReminders(next)
      return { reminders: next }
    })
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

  loadFromStorage: () => {
    set({ reminders: loadReminders() })
  },
}))
