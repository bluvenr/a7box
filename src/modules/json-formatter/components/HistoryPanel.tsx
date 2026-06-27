/**
 * JSON Formatter History Panel
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, Trash2, X, RotateCcw } from 'lucide-react'

export interface HistoryItem {
  id: string
  input: string
  timestamp: number
  action: 'format' | 'compress'
}

interface HistoryPanelProps {
  items: HistoryItem[]
  onRestore: (item: HistoryItem) => void
  onClear: () => void
  onClose: () => void
}

function truncate(str: string, maxLen = 60): string {
  if (str.length <= maxLen) return str
  return str.substring(0, maxLen) + '...'
}

export function HistoryPanel({ items, onRestore, onClear, onClose }: HistoryPanelProps) {
  const { t } = useTranslation()
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  /** Format time using i18n keys */
  function formatTime(timestamp: number): string {
    const diff = Date.now() - timestamp
    const minutes = Math.floor(diff / 60000)

    if (minutes < 1) return t('modules.jsonFormatter.ui.timeJustNow', { defaultValue: 'Just now' })
    if (minutes < 60) return t('modules.jsonFormatter.ui.timeMinutesAgo', { m: minutes, defaultValue: `${minutes}m ago` })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('modules.jsonFormatter.ui.timeHoursAgo', { h: hours, defaultValue: `${hours}h ago` })
    return new Date(timestamp).toLocaleDateString()
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-bg-base/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-text-muted" />
          <span className="text-sm font-medium text-text-primary">{t('modules.jsonFormatter.ui.historyTitle')}</span>
          <span className="rounded-full bg-bg-hover px-2 py-0.5 text-xs text-text-muted">
            {items.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              onClick={onClear}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted transition-colors hover:text-error"
            >
              <Trash2 className="h-3 w-3" />
              {t('modules.jsonFormatter.ui.historyClear')}
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted">
            <Clock className="mb-2 h-8 w-8 opacity-30" />
            <p className="text-sm">{t('modules.jsonFormatter.ui.historyEmpty')}</p>
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className={`group mb-1 rounded-lg border p-3 transition-colors ${
                hoveredId === item.id
                  ? 'border-border-base bg-bg-elevated'
                  : 'border-transparent hover:border-border-base hover:bg-bg-elevated'
              }`}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        item.action === 'format'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-info/10 text-info'
                      }`}
                    >
                      {item.action === 'format' ? t('modules.jsonFormatter.ui.historyActionFormat') : t('modules.jsonFormatter.ui.historyActionCompress')}
                    </span>
                    <span className="text-xs text-text-muted">{formatTime(item.timestamp)}</span>
                  </div>
                  <p className="mt-1.5 font-mono text-xs text-text-secondary leading-relaxed">
                    {truncate(item.input)}
                  </p>
                </div>
                {/* Restore button — always rendered, visible on hover (desktop) or always on touch */}
                <button
                  onClick={() => onRestore(item)}
                  className={`ml-2 flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs text-primary transition-colors hover:bg-primary/20 ${
                    hoveredId === item.id ? 'opacity-100' : 'opacity-0 md:group-hover:opacity-100'
                  }`}
                >
                  <RotateCcw className="h-3 w-3" />
                  {t('common.restore')}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// Local storage management
const HISTORY_KEY = 'a7box-json-history'
const MAX_HISTORY = 50

export function loadHistory(): HistoryItem[] {
  try {
    const saved = localStorage.getItem(HISTORY_KEY)
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

export function saveHistory(items: HistoryItem[]): void {
  const trimmed = items.slice(0, MAX_HISTORY)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed))
}

export function addHistory(item: Omit<HistoryItem, 'id' | 'timestamp'>): HistoryItem[] {
  const newItem: HistoryItem = {
    ...item,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  }
  const items = loadHistory()
  items.unshift(newItem)
  const trimmed = items.slice(0, MAX_HISTORY)
  saveHistory(trimmed)
  return trimmed
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY)
}
