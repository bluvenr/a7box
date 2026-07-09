/**
 * Reminder Module Type Definitions
 */

/** Repeat configuration */
export interface RepeatConfig {
  type: 'daily' | 'weekly' | 'monthly' | 'custom'
  /** Weekly: selected weekdays [0-6], 0=Sunday */
  weekdays?: number[]
  /** Monthly: days of month [1-31] */
  monthDays?: number[]
  /** @deprecated use monthDays instead. Migrated on load. */
  monthDay?: number
  /** Custom interval value */
  interval?: number
  /** Custom interval unit */
  intervalUnit?: 'minute' | 'hour' | 'day'
  /** Optional end date (timestamp ms), null = never ends */
  endDate?: number | null
}

/** Reminder status */
export type ReminderStatus = 'pending' | 'completed' | 'snoozed'

/** Reminder item */
export interface Reminder {
  id: string
  title: string
  note?: string
  triggerAt: number           // trigger timestamp (ms)
  repeat: RepeatConfig | null
  status: ReminderStatus
  snoozeUntil?: number        // snooze target timestamp (only when snoozed)
  createdAt: number
  updatedAt: number
}

/** Form data for creating/editing reminders */
export interface ReminderFormData {
  title: string
  note: string
  triggerAt: number
  repeat: RepeatConfig | null
}
