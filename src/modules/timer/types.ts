/**
 * Timer Module Type Definitions
 */

/** Countdown status */
export type CountdownStatus = 'running' | 'paused' | 'completed'

/** Single countdown timer */
export interface CountdownTimer {
  id: string
  title: string
  /** Total duration in ms (for progress calc and reset) */
  totalDuration: number
  /** Absolute end timestamp when running (0 when paused/completed) */
  endsAt: number
  /** Remaining ms when paused (0 when running, ignored when completed) */
  remainingMs: number
  status: CountdownStatus
  createdAt: number
}

/** Stopwatch lap entry */
export interface StopwatchLap {
  index: number
  /** Lap duration in ms */
  lapTime: number
  /** Cumulative elapsed in ms */
  totalTime: number
}

/** Stopwatch state */
export interface StopwatchState {
  /** Whether running */
  running: boolean
  /** Accumulated elapsed in ms (excludes current run segment) */
  elapsed: number
  /** Timestamp when current run segment started */
  startedAt: number | null
  /** Lap entries */
  laps: StopwatchLap[]
}

/** Snapshot of the previous stopwatch session (kept on reset) */
export interface StopwatchSession {
  /** Final total elapsed in ms */
  elapsed: number
  /** Lap entries recorded in that session */
  laps: StopwatchLap[]
  /** Timestamp when the session was reset */
  endedAt: number
}

/** Recent countdown entry (for one-click restart) */
export interface TimerRecent {
  /** Duration in ms */
  duration: number
  /** Title (may be empty for auto-named) */
  title: string
  /** Last used timestamp */
  lastUsedAt: number
  /** Usage count for sorting */
  count: number
}

/** Parsed timer input result */
export interface ParsedTimerInput {
  /** Duration in ms */
  duration: number
  /** Extracted title (may be empty) */
  title: string
  /** Whether parsing was successful */
  valid: boolean
}
