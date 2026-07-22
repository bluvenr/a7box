/**
 * Timer Module - Shared formatting utilities
 * Centralised time-format functions used across CountdownCard,
 * CountdownTab, and StopwatchTab.
 */

/**
 * Format milliseconds as MM:SS or H:MM:SS (no sub-second precision).
 * Uses Math.ceil by default so a running countdown never shows "00:00"
 * until it actually reaches zero.
 */
export function formatHMS(ms: number, roundFn: 'ceil' | 'round' = 'ceil'): string {
  const totalSecs = Math.max(0, roundFn === 'ceil' ? Math.ceil(ms / 1000) : Math.round(ms / 1000))
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/**
 * Format a duration in ms to a compact human label (e.g. "5m", "1h30m", "90s").
 * Used for preset badges, recent buttons, and parse-result display.
 */
export function formatDurationLabel(ms: number): string {
  const totalSecs = Math.round(ms / 1000)
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  if (h > 0 && m > 0) return `${h}h${m}m`
  if (h > 0) return `${h}h`
  if (m > 0 && s > 0) return `${m}m${s}s`
  if (m > 0) return `${m}m`
  return `${s}s`
}

/**
 * Format elapsed milliseconds as HH:MM:SS.mmm (stopwatch display).
 */
export function formatStopwatch(ms: number): string {
  const totalMs = Math.max(0, Math.floor(ms))
  const h = Math.floor(totalMs / 3600000)
  const m = Math.floor((totalMs % 3600000) / 60000)
  const s = Math.floor((totalMs % 60000) / 1000)
  const millis = totalMs % 1000
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(millis, 3)}`
}

/**
 * Format a lap/split time as MM:SS.mmm (no hours for laps typically).
 */
export function formatLapTime(ms: number): string {
  const totalMs = Math.max(0, Math.floor(ms))
  const m = Math.floor(totalMs / 60000)
  const s = Math.floor((totalMs % 60000) / 1000)
  const millis = totalMs % 1000
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${pad(m)}:${pad(s)}.${pad(millis, 3)}`
}
