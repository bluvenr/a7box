/**
 * Clipboard Manager — Formatting helpers
 */

type TFunc = (key: string, options?: Record<string, unknown>) => string

/** Human-readable byte size. */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** idx
  return `${value >= 100 || idx === 0 ? Math.round(value) : value.toFixed(1)} ${units[idx]}`
}

/** Absolute date-time label, e.g. "2024/06/01 14:30". */
export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Relative "x ago" label for history entries. */
export function formatTimeAgo(ts: number, t: TFunc): string {
  const diff = Math.max(0, Date.now() - ts)
  const minutes = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)

  if (minutes < 1) {
    return t('modules.clipboardManager.time.justNow', { defaultValue: 'Just now' })
  }
  if (hours < 1) {
    return t('modules.clipboardManager.time.minutesAgo', {
      m: minutes,
      defaultValue: '{{m}} min ago',
    })
  }
  if (days < 1) {
    return t('modules.clipboardManager.time.hoursAgo', {
      h: hours,
      defaultValue: '{{h}} h ago',
    })
  }
  if (days < 7) {
    return t('modules.clipboardManager.time.daysAgo', {
      d: days,
      defaultValue: '{{d}} d ago',
    })
  }
  return formatDateTime(ts)
}

/** Group key for the popup list: pinned / today / yesterday / earlier. */
export type TimeGroupKey = 'pinned' | 'today' | 'yesterday' | 'earlier'

export function timeGroupKey(ts: number, isPinned: boolean): TimeGroupKey {
  if (isPinned) return 'pinned'
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (ts >= startOfToday) return 'today'
  if (ts >= startOfToday - 86_400_000) return 'yesterday'
  return 'earlier'
}
