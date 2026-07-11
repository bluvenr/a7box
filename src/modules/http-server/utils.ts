/**
 * HTTP Server — Types, constants, and storage helpers
 */

export const GUIDE_KEY = 'a7box-http-guide-seen'
export const HISTORY_KEY = 'a7box-http-history'
export const ACTIVE_KEY = 'a7box-http-active'
export const MAX_HISTORY = 5

export interface HistoryItem { directory: string; port: number; stoppedAt: number }
export interface ActiveEntry { directory: string; port: number }

export function loadHistory(): HistoryItem[] {
  try {
    const items: HistoryItem[] = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
    const seen = new Set<string>()
    return items.filter((item) => {
      if (seen.has(item.directory)) return false
      seen.add(item.directory)
      return true
    })
  } catch { return [] }
}

export function saveHistory(items: HistoryItem[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)))
}

export function loadActive(): ActiveEntry[] {
  try { return JSON.parse(localStorage.getItem(ACTIVE_KEY) || '[]') } catch { return [] }
}

export function saveActive(entries: ActiveEntry[]) {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(entries))
}
