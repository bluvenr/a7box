/**
 * A7Box Usage History
 * Tracks recently used modules in localStorage for home page and command palette
 */

const STORAGE_KEY = 'a7box-usage-history'
const MAX_HISTORY = 20

interface UsageRecord {
  moduleId: string
  timestamp: number
}

/** Load history from localStorage */
function loadHistory(): UsageRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/** Save history to localStorage */
function saveHistory(records: UsageRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_HISTORY)))
}

/** Record a module usage event */
export function recordUsage(moduleId: string) {
  const history = loadHistory().filter((r) => r.moduleId !== moduleId)
  history.unshift({ moduleId, timestamp: Date.now() })
  saveHistory(history)
}

/** Get recently used module IDs, most recent first */
export function getRecentModuleIds(limit = 5): string[] {
  return loadHistory()
    .slice(0, limit)
    .map((r) => r.moduleId)
}

/** Get all usage records */
export function getAllHistory(): UsageRecord[] {
  return loadHistory()
}
