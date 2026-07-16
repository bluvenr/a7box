/**
 * Notification Bridge
 * Cross-platform reminder notification system.
 *
 * Desktop approach (Windows/Linux/macOS):
 * - Frontend setInterval checks for due reminders every 30s
 * - When a reminder is due, show an always-on-top toast window with action buttons
 * - Toast window: view / done / snooze / dismiss buttons + sound
 * - Non-Tauri fallback: in-app banner with done / snooze buttons
 */
import { create } from 'zustand'
import { useReminderStore, calcNextTrigger } from './reminderStore'
import type { Reminder } from './types'
import { isTauri } from '../../shared/utils'

// ─── In-App Banner Store ───────────────────────────────────────────────────────

export interface BannerEntry {
  reminder: Reminder
  id: string
}

interface ReminderBannerState {
  queue: BannerEntry[]
  current: BannerEntry | null
  /** Push a reminder into the banner queue and auto-show if empty */
  push: (reminder: Reminder) => void
  /** Dismiss current and show next from queue */
  dismissCurrent: () => void
  /** Remove a specific entry from the queue */
  removeEntry: (id: string) => void
}

export const useReminderBannerStore = create<ReminderBannerState>((set, get) => ({
  queue: [],
  current: null,

  push: (reminder) => {
    const id = `${reminder.id}-${Date.now()}`
    const entry: BannerEntry = { reminder, id }
    const { queue, current } = get()
    // Avoid duplicate banner for same reminder id
    if (current?.reminder.id === reminder.id) return
    if (queue.some((e) => e.reminder.id === reminder.id)) return

    if (!current) {
      set({ current: entry, queue })
    } else {
      set({ queue: [...queue, entry] })
    }
  },

  dismissCurrent: () => {
    const { queue } = get()
    const next = queue.length > 0 ? queue[0] : null
    set({ current: next, queue: queue.slice(1) })
  },

  removeEntry: (id) => {
    set((s) => ({ queue: s.queue.filter((e) => e.id !== id) }))
  },
}))

/** Type for the in-app notification callback (set by React component) */
type OnReminderDueCallback = (reminder: Reminder) => void
let onReminderDue: OnReminderDueCallback | null = null

/** Track which reminders we've already fired this session to avoid duplicates */
const firedSet = new Set<string>()

let checkTimer: ReturnType<typeof setInterval> | null = null

/** Bring the main window to front.
 *  Always calls show() + setFocus() regardless of current visibility state,
 *  plus uses the setAlwaysOnTop toggle trick to overcome Windows'
 *  foreground-window restrictions when the window is behind other apps. */
async function bringWindowToFront() {
  if (!isTauri()) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    const isMinimized = await win.isMinimized()
    if (isMinimized) {
      await win.unminimize()
    }
    // Always show + setFocus — even if already visible, this brings it to front
    await win.show()
    await win.setFocus()
    // Windows trick: briefly toggle always-on-top to force window to foreground.
    // Overcomes SetForegroundWindow restrictions when the window is behind other apps.
    try {
      await win.setAlwaysOnTop(true)
      await win.setAlwaysOnTop(false)
    } catch { /* not critical if it fails on some platforms */ }
  } catch { /* ignore */ }
}

// ─── Toast Window Communication ───────────────────────────────────────────────

/** Data shape sent to the toast window (only UI-needed fields) */
interface ToastReminderData {
  id: string
  title: string
  note?: string
  triggerAt: number
  status: string
  isOverdue: boolean
}

/** Reminders queued to send to toast window before it was ready */
const pendingToastReminders: Reminder[] = []

/** Serialize a reminder for the toast window (only UI-needed fields) */
function serializeForToast(reminder: Reminder): ToastReminderData {
  return {
    id: reminder.id,
    title: reminder.title,
    note: reminder.note,
    triggerAt: reminder.triggerAt,
    status: reminder.status,
    isOverdue: reminder.triggerAt < Date.now(),
  }
}

/** Show reminders in the notification toast window.
 *  Returns true if Toast handled the notification, false if caller should fall back to Banner.
 *  Sends ALL provided reminders — the toast window deduplicates by ID, so already-present
 *  reminders are silently ignored. This ensures previously-fired but unhandled reminders
 *  are re-shown when a new reminder fires. */
async function showNotificationToast(reminders: Reminder[]): Promise<boolean> {
  if (!isTauri() || reminders.length === 0) return false
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const { emit } = await import('@tauri-apps/api/event')

    // Create or show the toast window; returns true if new window was created
    const invokePromise = invoke<boolean>('show_notification_toast')
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('invoke show_notification_toast timed out after 8s')), 8000)
    )
    const isNewWindow = await Promise.race([invokePromise, timeoutPromise])

    if (isNewWindow) {
      // New window: queue all reminders, will be sent when toast signals ready
      reminders.forEach((r) => pendingToastReminders.push(r))
    } else {
      // Existing window: send all reminders immediately (listener is already active)
      for (const r of reminders) {
        await emit('notification-toast-data', serializeForToast(r))
      }
    }
    return true
  } catch (e) {
    console.error('[NotificationBridge] showNotificationToast error:', e)
    return false
  }
}

/**
 * Set up listeners for notification toast window events.
 * Call from MainLayout on app init.
 */
export async function setupToastListeners(): Promise<() => void> {
  if (!isTauri()) return () => {}

  try {
    const { listen, emit } = await import('@tauri-apps/api/event')

    // Toast window is ready to receive data (newly mounted)
    const unlistenReady = await listen('notification-toast-ready', () => {
      // Send all pending reminders
      pendingToastReminders.forEach((r) => {
        emit('notification-toast-data', serializeForToast(r)).catch(() => {})
      })
      pendingToastReminders.length = 0
    })

    // User clicked an action button in the toast
    const unlistenAction = await listen<{ action: string; reminderId: string }>(
      'notification-toast-action',
      async (event) => {
        const { action, reminderId } = event.payload
        if (action === 'done') {
          handleMarkDone(reminderId)
        } else if (action === 'snooze') {
          handleSnooze(reminderId)
        } else if (action === 'view') {
          // Bring main window to front, then navigate to reminder page
          await bringWindowToFront()
          emit('notification-reminder-clicked', { reminderId }).catch(() => {})
        }
        // 'dismiss' — no action needed on main window side
      }
    )

    return () => {
      unlistenReady()
      unlistenAction()
    }
  } catch (e) {
    console.error('[NotificationBridge] setupToastListeners error:', e)
    return () => {}
  }
}

/** Register a callback to be invoked when a reminder becomes due */
export function setOnReminderDue(cb: OnReminderDueCallback) {
  onReminderDue = cb
}

/** Check all pending reminders and fire notifications for due ones */
async function checkDueReminders() {
  const store = useReminderStore.getState()
  const bannerStore = useReminderBannerStore.getState()
  const now = Date.now()

  const newDue: Reminder[] = []

  // ── Auto-advance repeat reminders whose occurrence was already fired ──────
  // When a repeat reminder was notified but not completed (user ignored/dismissed),
  // advance triggerAt to the next future occurrence so it fires again.
  for (const reminder of store.reminders) {
    if (reminder.status !== 'pending') continue
    if (!reminder.repeat) continue
    if (!firedSet.has(reminder.id)) continue

    let next = calcNextTrigger(reminder.repeat, reminder.triggerAt)
    let safety = 0
    while (next && next <= now && safety < 10000) {
      next = calcNextTrigger(reminder.repeat, next)
      safety++
    }
    if (next && next > now && (!reminder.repeat.endDate || next <= reminder.repeat.endDate)) {
      store.updateReminder(reminder.id, { triggerAt: next })
      clearFiredEntry(reminder.id)
    } else if (!next || (reminder.repeat.endDate && next > reminder.repeat.endDate)) {
      // No valid next occurrence — auto-complete the repeat reminder
      store.updateStatus(reminder.id, 'completed')
      clearFiredEntry(reminder.id)
    }
  }

  // Check pending reminders
  for (const reminder of store.reminders) {
    if (reminder.status !== 'pending') continue
    if (reminder.triggerAt > now) continue
    if (firedSet.has(reminder.id)) continue

    firedSet.add(reminder.id)
    newDue.push(reminder)
  }

  // Check snoozed reminders
  for (const reminder of store.reminders) {
    if (reminder.status !== 'snoozed') continue
    if (!reminder.snoozeUntil) continue
    if (reminder.snoozeUntil > now) continue
    const fireKey = `${reminder.id}-snooze-${reminder.snoozeUntil}`
    if (firedSet.has(fireKey)) continue

    firedSet.add(fireKey)
    newDue.push(reminder)
  }

  if (newDue.length === 0) return

  if (isTauri()) {
    // Collect ALL overdue reminders (not just newly-fired ones).
    // This ensures previously-fired but unhandled reminders are re-shown
    // alongside new ones. The toast window deduplicates by ID.
    const allOverdue = store.reminders.filter((r) =>
      (r.status === 'pending' && r.triggerAt <= now) ||
      (r.status === 'snoozed' && r.snoozeUntil && r.snoozeUntil <= now)
    )

    const toastShown = await showNotificationToast(allOverdue)
    if (!toastShown) {
      newDue.forEach((r) => bannerStore.push(r))
    }
  } else {
    newDue.forEach((r) => bannerStore.push(r))
  }

  newDue.forEach((r) => {
    if (onReminderDue) onReminderDue(r)
  })
}

/** Start the periodic check timer (call on app init) */
export function startReminderChecker() {
  if (checkTimer) return
  checkTimer = setInterval(checkDueReminders, 30_000)
  // Also check immediately on start
  checkDueReminders()
}

/** Stop the periodic check timer */
export function stopReminderChecker() {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
}

/** Clear the fired set (e.g., when a reminder is rescheduled) */
export function clearFiredEntry(reminderId: string) {
  for (const key of firedSet) {
    if (key.startsWith(reminderId)) {
      firedSet.delete(key)
    }
  }
}

/** Handle "mark done" action from notification overlay */
export function handleMarkDone(reminderId: string) {
  const store = useReminderStore.getState()
  const reminder = store.getById(reminderId)
  if (!reminder) return

  if (reminder.repeat) {
    // Repeat reminder: calculate next trigger time
    let nextTime = calcNextTrigger(reminder.repeat, reminder.triggerAt)
    // For custom intervals, the next trigger may still be in the past
    // if the reminder was overdue by multiple intervals — loop until future
    let safety = 0
    while (nextTime && nextTime <= Date.now() && safety < 10000) {
      nextTime = calcNextTrigger(reminder.repeat, nextTime)
      safety++
    }
    if (nextTime && nextTime > Date.now() && (!reminder.repeat.endDate || nextTime <= reminder.repeat.endDate)) {
      store.updateReminder(reminderId, { triggerAt: nextTime })
      store.updateStatus(reminderId, 'pending')
      clearFiredEntry(reminderId)
    } else {
      store.updateStatus(reminderId, 'completed')
    }
  } else {
    store.updateStatus(reminderId, 'completed')
  }
}

/** Handle "snooze" action from notification overlay */
export function handleSnooze(reminderId: string) {
  const store = useReminderStore.getState()
  const snoozeUntil = Date.now() + 10 * 60 * 1000 // 10 minutes
  store.updateStatus(reminderId, 'snoozed', snoozeUntil)
  clearFiredEntry(reminderId)
}

/** Reschedule all active reminders on app startup */
export function rescheduleAllReminders() {
  const store = useReminderStore.getState()

  for (const reminder of store.reminders) {
    if (reminder.status === 'completed') continue

    // Reset fired set for active reminders so they can fire again
    if (reminder.status === 'pending' && reminder.triggerAt <= Date.now()) {
      // Overdue pending: clear fired entry so it fires on next check
      clearFiredEntry(reminder.id)
    }

    if (reminder.status === 'snoozed' && reminder.snoozeUntil) {
      if (reminder.snoozeUntil <= Date.now()) {
        // Snooze expired, revert to pending
        store.updateStatus(reminder.id, 'pending')
        clearFiredEntry(reminder.id)
      }
    }
  }
}
