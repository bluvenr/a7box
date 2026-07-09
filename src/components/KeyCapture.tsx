/**
 * KeyCapture Component
 * Captures keyboard shortcut combinations with cross-platform display.
 * Supports conflict detection against other registered shortcuts.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { formatShortcut } from '../shared/utils'

export { formatShortcut }

interface ShortcutEntry {
  action: string
  keys: string
  labelI18n: string
}

interface KeyCaptureProps {
  value: string
  onChange: (keys: string) => void
  onCancel: () => void
  /** All other shortcuts for conflict detection */
  allShortcuts?: ShortcutEntry[]
  /** Current action ID, excluded from conflict check */
  currentAction?: string
}

/** Convert KeyboardEvent to Tauri shortcut format */
function eventToShortcut(e: KeyboardEvent): string | null {
  const hasCtrl = e.ctrlKey || e.metaKey
  const hasShift = e.shiftKey
  const hasAlt = e.altKey

  // Must have at least one modifier + a key
  if (!hasCtrl && !hasShift && !hasAlt) return null
  if (!e.key || ['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null

  const parts: string[] = []
  if (hasCtrl) parts.push('CommandOrControl')
  if (hasShift) parts.push('Shift')
  if (hasAlt) parts.push('Alt')

  const key = e.key.toUpperCase()
  if (key === ' ') parts.push('Space')
  else if (key.startsWith('F') && /^\d+$/.test(key.slice(1))) parts.push(key)
  else if (key.length === 1) parts.push(key)
  else return null

  return parts.join('+')
}

export function KeyCapture({ value, onChange, onCancel, allShortcuts, currentAction }: KeyCaptureProps) {
  const { t } = useTranslation()
  const [capturing, setCapturing] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [conflict, setConflict] = useState<ShortcutEntry | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Find a conflicting shortcut for the given keys (excluding current action)
  const findConflict = useCallback((keys: string): ShortcutEntry | null => {
    if (!allShortcuts) return null
    return allShortcuts.find(s => s.keys === keys && s.action !== currentAction) ?? null
  }, [allShortcuts, currentAction])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (e.key === 'Escape') {
      onCancel()
      setCapturing(false)
      setPreview(null)
      return
    }

    const shortcut = eventToShortcut(e)
    if (shortcut) {
      setPreview(shortcut)
      setConflict(findConflict(shortcut))
    }
  }, [onCancel, findConflict])

  const handleConfirm = useCallback(() => {
    if (preview) {
      onChange(preview)
      setCapturing(false)
      setPreview(null)
      setConflict(null)
    }
  }, [preview, onChange])

  const handleCancelCapture = useCallback(() => {
    setCapturing(false)
    setPreview(null)
    setConflict(null)
    onCancel()
  }, [onCancel])

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    e.preventDefault()
    if (preview) {
      if (!conflict) {
        // No conflict — apply immediately
        onChange(preview)
        setCapturing(false)
        setPreview(null)
      }
      // Conflict — stay in preview mode, user must confirm or cancel
    }
  }, [preview, conflict, onChange])

  useEffect(() => {
    if (capturing) {
      window.addEventListener('keydown', handleKeyDown, true)
      window.addEventListener('keyup', handleKeyUp, true)
      return () => {
        window.removeEventListener('keydown', handleKeyDown, true)
        window.removeEventListener('keyup', handleKeyUp, true)
      }
    }
  }, [capturing, handleKeyDown, handleKeyUp])

  return (
    <div ref={containerRef} className="inline-flex items-center">
      {capturing ? (
        <div className="flex items-center gap-1.5">
          <div className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 ${
            conflict
              ? 'border-warning bg-warning/10'
              : 'border-primary bg-primary/10'
          }`}>
            {conflict ? (
              <AlertTriangle size={12} className="text-warning" />
            ) : (
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            )}
            <span className={`text-xs font-mono ${conflict ? 'text-warning' : 'text-primary'}`}>
              {preview ? formatShortcut(preview) : t('settings.shortcutsCapture', { defaultValue: 'Press shortcut...' })}
            </span>
          </div>
          {preview && (
            <div className="flex items-center gap-1">
              {conflict ? (
                <>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    className="rounded px-1.5 py-0.5 text-[11px] text-warning bg-warning/10 hover:bg-warning/20 cursor-pointer transition"
                  >
                    {t('settings.shortcutsOverride', { defaultValue: 'Override' })}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelCapture}
                    className="rounded px-1.5 py-0.5 text-[11px] text-text-muted hover:text-text-secondary cursor-pointer transition"
                  >
                    {t('common.cancel', { defaultValue: 'Cancel' })}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleCancelCapture}
                  className="rounded px-1.5 py-0.5 text-[11px] text-text-muted hover:text-text-secondary cursor-pointer transition"
                >
                  ESC
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCapturing(true)}
          className="rounded-md border border-border-subtle bg-bg-base px-2.5 py-1 text-xs font-mono text-text-secondary transition hover:border-primary/50 hover:text-primary cursor-pointer"
        >
          {formatShortcut(value)}
        </button>
      )}
      {conflict && capturing && (
        <span className="ml-1.5 text-[11px] text-warning whitespace-nowrap">
          {t('settings.shortcutsConflict', {
            defaultValue: 'Used by {{name}}',
            name: t(conflict.labelI18n),
          })}
        </span>
      )}
    </div>
  )
}
