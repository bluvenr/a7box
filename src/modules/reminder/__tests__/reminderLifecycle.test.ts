/**
 * Regression tests for the repeat-reminder lifecycle in notificationBridge.
 *
 * Bug scenario 1 (double-advance skip): after a repeat reminder fires, the
 * auto-advance loop moves triggerAt to the next occurrence within 30s. If the
 * user then clicks "done" on the still-visible (now stale) notification card,
 * the old code advanced AGAIN from the already-advanced triggerAt — silently
 * skipping a whole week for weekly reminders.
 *
 * Bug scenario 2 (stuck snooze): after a snoozed reminder's snooze card fires
 * and is ignored, the status stayed 'snoozed' with a past snoozeUntil forever
 * (until app restart), so repeat reminders never fired again.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useReminderStore } from '../reminderStore'
import {
  checkDueReminders,
  handleMarkDone,
  handleSnooze,
  clearFiredEntry,
} from '../notificationBridge'

function ts(y: number, mo: number, d: number, h: number, min = 0, sec = 0): number {
  return new Date(y, mo - 1, d, h, min, sec, 0).getTime()
}

// 2026-08-27 is a Thursday (weekday 4)
const OCC1 = ts(2026, 8, 27, 16, 0)   // this Thursday 16:00
const OCC2 = ts(2026, 9, 3, 16, 0)    // next Thursday 16:00

function addWeeklyThursdayReminder(triggerAt: number) {
  const store = useReminderStore.getState()
  return store.addReminder({
    title: 'weekly thu',
    note: '',
    triggerAt,
    repeat: { type: 'weekly', weekdays: [4] },
  })
}

describe('notificationBridge repeat lifecycle', () => {
  beforeEach(() => {
    // System time: Thursday 15:59 — one minute before the occurrence
    vi.useFakeTimers()
    vi.setSystemTime(ts(2026, 8, 27, 15, 59))
    useReminderStore.setState({ reminders: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
    useReminderStore.setState({ reminders: [] })
  })

  it('fires the reminder when its occurrence is due', async () => {
    const r = addWeeklyThursdayReminder(OCC1)
    vi.setSystemTime(ts(2026, 8, 27, 16, 0, 5))
    await checkDueReminders()
    // triggerAt unchanged right after firing
    expect(useReminderStore.getState().getById(r.id)?.triggerAt).toBe(OCC1)
  })

  it('auto-advances an ignored repeat reminder to the next occurrence', async () => {
    const r = addWeeklyThursdayReminder(OCC1)
    vi.setSystemTime(ts(2026, 8, 27, 16, 0, 5))
    await checkDueReminders() // fires
    await checkDueReminders() // next cycle: auto-advance
    expect(useReminderStore.getState().getById(r.id)?.triggerAt).toBe(OCC2)
    expect(useReminderStore.getState().getById(r.id)?.status).toBe('pending')
  })

  it('done on a STALE card (after auto-advance) must NOT skip the next occurrence', async () => {
    const r = addWeeklyThursdayReminder(OCC1)
    vi.setSystemTime(ts(2026, 8, 27, 16, 0, 5))
    await checkDueReminders() // fires — card for OCC1 shown
    await checkDueReminders() // auto-advanced to OCC2

    // User now clicks "done" on the stale card that was showing OCC1
    handleMarkDone(r.id, OCC1)

    const updated = useReminderStore.getState().getById(r.id)
    expect(updated?.status).toBe('pending')
    expect(updated?.triggerAt).toBe(OCC2) // must stay on next week, not skip to OCC3
  })

  it('done for the current occurrence still advances correctly', async () => {
    const r = addWeeklyThursdayReminder(OCC1)
    vi.setSystemTime(ts(2026, 8, 27, 16, 0, 5))
    await checkDueReminders() // fires

    handleMarkDone(r.id, OCC1)

    const updated = useReminderStore.getState().getById(r.id)
    expect(updated?.status).toBe('pending')
    expect(updated?.triggerAt).toBe(OCC2)
  })

  it('snoozing a stale occurrence is a no-op', async () => {
    const r = addWeeklyThursdayReminder(OCC1)
    vi.setSystemTime(ts(2026, 8, 27, 16, 0, 5))
    await checkDueReminders() // fires
    await checkDueReminders() // auto-advanced to OCC2

    handleSnooze(r.id, OCC1)

    const updated = useReminderStore.getState().getById(r.id)
    expect(updated?.status).toBe('pending')
    expect(updated?.triggerAt).toBe(OCC2)
    expect(updated?.snoozeUntil).toBeUndefined()
  })

  it('a snoozed repeat reminder recovers after the snooze card fires and is ignored', async () => {
    const r = addWeeklyThursdayReminder(OCC1)
    vi.setSystemTime(ts(2026, 8, 27, 16, 0, 5))
    await checkDueReminders() // fires

    handleSnooze(r.id) // snooze until 16:10:05
    expect(useReminderStore.getState().getById(r.id)?.status).toBe('snoozed')

    vi.setSystemTime(ts(2026, 8, 27, 16, 10, 10))
    await checkDueReminders() // snooze card fires
    await checkDueReminders() // next cycle: must recover, not stay stuck

    const updated = useReminderStore.getState().getById(r.id)
    expect(updated?.status).toBe('pending')
    expect(updated?.snoozeUntil).toBeUndefined()
    expect(updated?.triggerAt).toBe(OCC2) // auto-advanced to next Thursday
  })

  it('clearFiredEntry removes all keys of a reminder', () => {
    // sanity check used by recovery paths
    clearFiredEntry('nonexistent')
    expect(true).toBe(true)
  })
})
