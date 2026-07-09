/**
 * NotificationToast - Always-on-top notification toast window
 *
 * Shows due reminders as stacked cards. Each card is independent with its own
 * action buttons (view / done / snooze / dismiss).
 *
 * New cards appear on top of existing ones. When a card is completed/closed,
 * cards below shift down. The window dynamically resizes to fit the content.
 *
 * Communicates with main window via Tauri events:
 * - Listens: notification-toast-data (reminder data from main window)
 * - Emits:   notification-toast-ready (mounted and ready to receive)
 *            notification-toast-action (user clicked an action button)
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, CheckCircle, Clock, Eye, X } from 'lucide-react'

export interface ToastReminderData {
  id: string
  title: string
  note?: string
  triggerAt: number
  status: string
  isOverdue: boolean
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function closeWindow() {
  const internals = (window as any).__TAURI_INTERNALS__
  if (internals?.invoke) {
    internals.invoke('close_utility_window', { label: 'notification-toast' }).catch(() => {})
  }
  window.close()
}

/** Play a pleasant two-tone notification sound (E6 → B5) using Web Audio API. */
async function playNotificationSound() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext
    const ctx = new AudioContext()

    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    // First tone (E6, higher)
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(1318.51, ctx.currentTime) // E6
    gain1.gain.setValueAtTime(0, ctx.currentTime)
    gain1.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.02)
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc1.start(ctx.currentTime)
    osc1.stop(ctx.currentTime + 0.3)

    // Second tone (B5, lower, delayed 0.15s)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(987.77, ctx.currentTime + 0.15) // B5
    gain2.gain.setValueAtTime(0, ctx.currentTime + 0.15)
    gain2.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.17)
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc2.start(ctx.currentTime + 0.15)
    osc2.stop(ctx.currentTime + 0.5)

    setTimeout(() => ctx.close(), 1000)
  } catch { /* ignore audio errors */ }
}

// ─── Individual Toast Card ─────────────────────────────────────────────────────

interface ToastCardProps {
  reminder: ToastReminderData
  onRemove: (id: string, dismissed: boolean) => void
  t: (k: string, options?: any) => any
}

function ToastCard({ reminder, onRemove, t }: ToastCardProps) {
  const [confirming, setConfirming] = useState<'done' | 'snooze' | null>(null)

  const handleAction = async (action: 'done' | 'snooze' | 'view' | 'dismiss') => {
    if (action === 'dismiss') {
      onRemove(reminder.id, true)
      return
    }

    // Emit action event to main window
    if (isTauri()) {
      try {
        const { emit } = await import('@tauri-apps/api/event')
        await emit('notification-toast-action', { action, reminderId: reminder.id })
      } catch {
        return // Don't remove card — emit failed
      }
    }

    if (action === 'done' || action === 'snooze') {
      setConfirming(action)
      setTimeout(() => onRemove(reminder.id, false), 600)
    } else {
      // view — remove immediately
      onRemove(reminder.id, false)
    }
  }

  // Calculate relative time
  const now = Date.now()
  const diffMs = now - reminder.triggerAt
  const diffMin = Math.floor(diffMs / 60000)
  const isOverdue = reminder.isOverdue || diffMs > 0

  let timeText: string
  if (diffMin <= 0) {
    timeText = t('modules.reminder.ui.toast.dueNow')
  } else if (diffMin < 60) {
    timeText = t('modules.reminder.ui.toast.overdue', { min: diffMin })
  } else {
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) {
      timeText = t('modules.reminder.ui.toast.overdueHours', { hr: diffHr })
    } else {
      timeText = new Date(reminder.triggerAt).toLocaleString()
    }
  }

  const triggerTimeStr = new Date(reminder.triggerAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="relative flex w-full overflow-hidden rounded-2xl border border-border-base bg-bg-elevated shadow-2xl animate-[toastSlideIn_0.3s_ease-out] pointer-events-auto">
      {/* Confirmation overlay */}
      {confirming && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg-elevated/95 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            {confirming === 'done' ? (
              <CheckCircle className="text-success" size={20} />
            ) : (
              <Clock className="text-warning" size={20} />
            )}
            <span className="text-sm font-medium text-text-primary">
              {confirming === 'done'
                ? t('modules.reminder.ui.markedDone')
                : t('modules.reminder.ui.snoozedMsg')}
            </span>
          </div>
        </div>
      )}

      {/* Left color bar */}
      <div className={`w-1 shrink-0 ${isOverdue ? 'bg-error' : 'bg-primary'}`} />

      {/* Content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header row (draggable — pointer-events-none on children lets clicks reach the drag region) */}
        <div className="flex items-start justify-between gap-2 px-3 pt-2.5 pb-1" data-tauri-drag-region>
          <div className="flex items-center gap-2 min-w-0 pointer-events-none">
            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
              isOverdue ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'
            }`}>
              <Bell size={12} />
            </div>
            <h3 className="text-sm font-semibold text-text-primary truncate">
              {reminder.title}
            </h3>
          </div>
          <button
            onClick={() => handleAction('dismiss')}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-bg-hover hover:text-text-secondary transition-colors cursor-pointer"
            title={t('modules.reminder.ui.toast.dismiss')}
          >
            <X size={12} />
          </button>
        </div>

        {/* Time + note */}
        <div className="px-3 pb-1.5 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <Clock size={10} />
            <span>{triggerTimeStr}</span>
            {isOverdue && (
              <span className="text-error font-medium">· {timeText}</span>
            )}
          </div>
          {reminder.note && (
            <p className="mt-0.5 text-xs text-text-secondary line-clamp-1">
              {reminder.note}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 px-3 pb-2.5 pt-0.5">
          <button
            onClick={() => handleAction('view')}
            className="flex items-center gap-0.5 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer"
          >
            <Eye size={10} />
            {t('modules.reminder.ui.toast.view')}
          </button>
          <button
            onClick={() => handleAction('done')}
            className="flex items-center gap-0.5 rounded-md bg-success/10 px-2 py-1 text-[10px] font-medium text-success hover:bg-success/20 transition-colors cursor-pointer"
          >
            <CheckCircle size={10} />
            {t('modules.reminder.ui.toast.done')}
          </button>
          <button
            onClick={() => handleAction('snooze')}
            className="flex items-center gap-0.5 rounded-md bg-warning/10 px-2 py-1 text-[10px] font-medium text-warning hover:bg-warning/20 transition-colors cursor-pointer"
          >
            <Clock size={10} />
            {t('modules.reminder.ui.toast.snooze')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function NotificationToast() {
  const { t } = useTranslation()
  const [reminders, setReminders] = useState<ToastReminderData[]>([])
  const existingIds = useRef<Set<string>>(new Set())
  const dismissedIds = useRef<Set<string>>(new Set())
  const hasReceivedRef = useRef(false)

  // Override background to transparent for rounded corners + shadow
  useEffect(() => {
    const htmlEl = document.documentElement
    const bodyEl = document.body
    const rootEl = document.getElementById('root')
    const prevHtml = htmlEl.style.background
    const prevBody = bodyEl.style.background
    const prevRoot = rootEl?.style.background ?? ''
    htmlEl.style.background = 'transparent'
    bodyEl.style.background = 'transparent'
    if (rootEl) rootEl.style.background = 'transparent'
    return () => {
      htmlEl.style.background = prevHtml
      bodyEl.style.background = prevBody
      if (rootEl) rootEl.style.background = prevRoot
    }
  }, [])

  // Set up data listener FIRST, then signal ready
  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | null = null

    ;(async () => {
      try {
        const { listen, emit } = await import('@tauri-apps/api/event')

        // 1. Register listener for notification data
        unlisten = await listen<ToastReminderData>('notification-toast-data', (event) => {
          const data = event.payload
          // Skip dismissed reminders (user closed this card)
          if (dismissedIds.current.has(data.id)) return
          // Skip duplicates (already showing)
          if (existingIds.current.has(data.id)) return

          existingIds.current.add(data.id)
          hasReceivedRef.current = true
          setReminders((prev) => [...prev, data])
          playNotificationSound().catch(() => {})
        })

        // 2. Signal ready — listener is guaranteed to be active
        await emit('notification-toast-ready', {})
      } catch (e) { console.error('[NotificationToast] Setup error:', e) }
    })()

    return () => { unlisten?.() }
  }, [])

  // Safety timeout: close window if no data received within 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasReceivedRef.current) {
        closeWindow()
      }
    }, 5000)
    return () => clearTimeout(timer)
  }, [])

  // Close window when all reminders are gone
  useEffect(() => {
    if (hasReceivedRef.current && reminders.length === 0) {
      const timer = setTimeout(() => closeWindow(), 200)
      return () => clearTimeout(timer)
    }
  }, [reminders.length])

  // Dynamic window resizing — fit window to number of cards, keep bottom-right aligned
  useEffect(() => {
    if (!isTauri() || reminders.length === 0) return

    const CARD_H = 145
    const GAP = 8
    const count = reminders.length
    const height = count * CARD_H + (count - 1) * GAP

    ;(async () => {
      try {
        const { getCurrentWindow, currentMonitor, LogicalSize, LogicalPosition } = await import('@tauri-apps/api/window')
        const win = getCurrentWindow()
        const monitor = await currentMonitor()
        if (monitor) {
          const scale = monitor.scaleFactor
          const x = (monitor.position.x + monitor.size.width) / scale - 380 - 20
          const y = (monitor.position.y + monitor.size.height) / scale - height - 20
          await win.setSize(new LogicalSize(380, height))
          await win.setPosition(new LogicalPosition(x, y))
        }
      } catch (e) { console.error('[NotificationToast] Resize error:', e) }
    })()
  }, [reminders.length])

  // Remove a reminder (dismissed = true means user clicked X, don't show again)
  const handleRemove = useCallback((id: string, dismissed: boolean) => {
    if (dismissed) dismissedIds.current.add(id)
    existingIds.current.delete(id)
    setReminders((prev) => prev.filter((r) => r.id !== id))
  }, [])

  if (reminders.length === 0) {
    return null
  }

  return (
    <div className="flex h-screen w-screen flex-col justify-end gap-2 p-0 bg-transparent select-none pointer-events-none overflow-hidden">
      {reminders.map((reminder) => (
        <ToastCard
          key={reminder.id}
          reminder={reminder}
          onRemove={handleRemove}
          t={t}
        />
      ))}
    </div>
  )
}
