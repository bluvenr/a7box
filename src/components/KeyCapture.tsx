/**
 * KeyCapture Component
 * Captures keyboard shortcut combinations with cross-platform display.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'

interface KeyCaptureProps {
  value: string
  onChange: (keys: string) => void
  onCancel: () => void
}

const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

/** Convert Tauri shortcut format to display format */
export function formatShortcut(keys: string): string {
  return keys
    .replace(/CommandOrControl/g, isMac ? '⌘' : 'Ctrl')
    .replace(/Command/g, '⌘')
    .replace(/Control/g, isMac ? '⌃' : 'Ctrl')
    .replace(/Shift/g, isMac ? '⇧' : 'Shift')
    .replace(/Alt/g, isMac ? '⌥' : 'Alt')
    .replace(/Super/g, isMac ? '⌘' : 'Win')
    .replace(/\+/g, isMac ? '' : '+')
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

export function KeyCapture({ value, onChange, onCancel }: KeyCaptureProps) {
  const { t } = useTranslation()
  const [capturing, setCapturing] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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
    }
  }, [onCancel])

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    e.preventDefault()
    if (preview) {
      onChange(preview)
      setCapturing(false)
      setPreview(null)
    }
  }, [preview, onChange])

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
        <div className="flex items-center gap-1.5 rounded-md border border-primary bg-primary/10 px-2.5 py-1">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          <span className="text-xs font-mono text-primary">
            {preview ? formatShortcut(preview) : t('settings.shortcutsCapture', { defaultValue: 'Press shortcut...' })}
          </span>
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
    </div>
  )
}
