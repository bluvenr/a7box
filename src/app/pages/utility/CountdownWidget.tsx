/**
 * CountdownWidget - Rectangular floating window for countdown timers
 *
 * Always-on-top desktop widget showing all active countdowns with ring progress.
 * Reads from the same zustand store (localStorage shared across windows).
 *
 * Communicates with main window via Tauri events:
 * - Emits: timer-widget-navigate (request main window to show + switch tab)
 */
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Clock, Check, Pause, Play, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useTimerStore, getRemaining, getProgress } from '../../../modules/timer/timerStore'
import type { CountdownTimer } from '../../../modules/timer/types'

/** Format ms as MM:SS or H:MM:SS */
function formatCompact(ms: number): string {
  const totalSecs = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/** Get progress ring color class based on remaining time */
function getProgressColor(timer: CountdownTimer, now?: number): string {
  if (timer.status === 'completed') return 'text-success'
  const remaining = getRemaining(timer, now)
  if (remaining < 10000) return 'text-error'     // < 10s: red
  if (remaining < 60000) return 'text-warning'   // < 60s: yellow
  return 'text-primary'                          // normal: primary
}

/** Emit current countdowns to main window after local mutations (cross-window sync) */
function syncToMain() {
  import('@tauri-apps/api/event').then(({ emitTo }) => {
    const cds = useTimerStore.getState().countdowns
    emitTo('main', 'cd-mutation-sync', cds.map((c) => ({
      id: c.id, title: c.title, totalDuration: c.totalDuration,
      endsAt: c.endsAt, remainingMs: c.remainingMs, status: c.status, createdAt: c.createdAt,
    }))).catch(() => {})
  }).catch(() => {})
}

/** Single countdown item with ring progress + hover actions */
function CountdownItem({ timer, now, onDismiss }: { timer: CountdownTimer; now: number; onDismiss: (id: string) => void }) {
  const { t } = useTranslation()
  const pauseCountdown = useTimerStore((s) => s.pauseCountdown)
  const resumeCountdown = useTimerStore((s) => s.resumeCountdown)
  const resetCountdown = useTimerStore((s) => s.resetCountdown)
  const removeCountdown = useTimerStore((s) => s.removeCountdown)
  const addTime = useTimerStore((s) => s.addTime)

  const remaining = getRemaining(timer, now)
  const progress = getProgress(timer, now)
  const isCompleted = timer.status === 'completed'
  const isRunning = timer.status === 'running'
  const isPaused = timer.status === 'paused'
  const isUrgent = !isCompleted && remaining < 10000

  // SVG ring: 36px diameter, 3px stroke
  const size = 36
  const radius = 15
  const circumference = 2 * Math.PI * radius
  const offset = circumference - progress * circumference
  const colorClass = getProgressColor(timer, now)

  const stop = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <div className={`group/item relative flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
      isCompleted ? 'animate-pulse bg-success/5' : isUrgent ? 'bg-error/5' : 'hover:bg-bg-hover/50'
    }`}>
      {/* Ring progress */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="currentColor" className="text-border-subtle" strokeWidth="3"
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="currentColor" className={colorClass}
            strokeWidth="3" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.3s linear' }}
          />
        </svg>
        {isCompleted && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Check size={14} className="text-success" />
          </div>
        )}
      </div>

      {/* Info — always full width */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-text-primary truncate">
          {timer.title || '—'}
        </div>
        <div className={`font-mono text-sm font-bold tabular-nums ${
          isCompleted ? 'text-success' : isUrgent ? 'text-error' : 'text-text-primary'
        }`}>
          {isCompleted ? '00:00' : formatCompact(remaining)}
        </div>
      </div>

      {/* ── Hover action buttons — float over right side ── */}
      {!isCompleted && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity bg-bg-elevated/90 backdrop-blur-sm rounded-md px-0.5 py-0.5 shadow-sm">
          {/* Pause / Resume */}
          <button
            onClick={(e) => { stop(e); isRunning ? pauseCountdown(timer.id) : resumeCountdown(timer.id); syncToMain() }}
            className={`h-6 w-6 rounded flex items-center justify-center transition-colors cursor-pointer active:scale-90 ${
              isPaused ? 'text-primary hover:bg-primary/15' : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
            }`}
            title={isPaused ? t('modules.timer.ui.resume') : t('modules.timer.ui.pause')}
          >
            {isPaused ? <Play size={12} /> : <Pause size={12} />}
          </button>
          {/* +1 minute */}
          <button
            onClick={(e) => { stop(e); addTime(timer.id, 60000); syncToMain() }}
            className="h-6 px-1 rounded text-[9px] font-bold text-text-muted hover:text-primary hover:bg-primary/15 flex items-center gap-0.5 transition-colors cursor-pointer active:scale-90"
            title={t('modules.timer.ui.addTime', { n: 1 })}
          >
            <Plus size={9} />1m
          </button>
          {/* Reset */}
          <button
            onClick={(e) => { stop(e); resetCountdown(timer.id); syncToMain() }}
            className="h-6 w-6 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover flex items-center justify-center transition-colors cursor-pointer active:scale-90"
            title={t('modules.timer.ui.reset')}
          >
            <RotateCcw size={11} />
          </button>
          {/* Delete */}
          <button
            onClick={(e) => { stop(e); removeCountdown(timer.id); syncToMain() }}
            className="h-6 w-6 rounded text-text-muted hover:text-error hover:bg-error/15 flex items-center justify-center transition-colors cursor-pointer active:scale-90"
            title={t('modules.timer.ui.delete')}
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}

      {/* ── Completed: dismiss button — float right ── */}
      {isCompleted && (
        <button
          onClick={(e) => { stop(e); onDismiss(timer.id); syncToMain() }}
          className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded hover:bg-error/15 text-success hover:text-error flex items-center justify-center transition-all cursor-pointer active:scale-90 opacity-0 group-hover/item:opacity-100"
          title={t('modules.timer.ui.dismiss')}
        >
          <X size={11} />
        </button>
      )}
    </div>
  )
}

export default function CountdownWidget() {
  const { t } = useTranslation()
  const countdowns = useTimerStore((s) => s.countdowns)
  const removeCountdown = useTimerStore((s) => s.removeCountdown)
  const tick = useTimerStore((s) => s.tick)

  // ── Listen for cd-state-update from main window ──
  useEffect(() => {
    let unlisten: (() => void) | null = null
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<CountdownTimer[]>('cd-state-update', (event) => {
        // Sync countdowns directly into local store instance
        useTimerStore.setState({ countdowns: event.payload })
      }).then((fn) => { unlisten = fn })
    }).catch(() => { /* ignore */ })
    return () => { unlisten?.() }
  }, [])

  // ── Request current state from main window on mount ──
  useEffect(() => {
    const requestState = () => {
      import('@tauri-apps/api/event').then(({ emitTo }) => {
        emitTo('main', 'cd-state-request', {}).catch(() => {})
      }).catch(() => {})
    }
    requestState()
    const retryId = setTimeout(requestState, 500)
    return () => clearTimeout(retryId)
  }, [])

  // ── Auto-clear completed timers after 3 seconds ──
  useEffect(() => {
    const completed = countdowns.filter((c) => c.status === 'completed')
    if (completed.length === 0) return
    const id = setTimeout(() => {
      completed.forEach((c) => removeCountdown(c.id))
      syncToMain()
    }, 3000)
    return () => clearTimeout(id)
  }, [countdowns, removeCountdown])

  // 100ms tick for smooth updates
  const [now, setNow] = useState(Date.now)
  const hasRunning = countdowns.some((c) => c.status === 'running')

  useEffect(() => {
    if (!hasRunning) return
    const id = setInterval(() => {
      setNow(Date.now())
    }, 100)
    return () => clearInterval(id)
  }, [hasRunning])

  // Tick store to mark completed timers (~1s interval)
  useEffect(() => {
    if (!hasRunning) return
    const id = setInterval(() => { tick() }, 1000)
    return () => clearInterval(id)
  }, [hasRunning, tick])

  // Sort: running first (by remaining asc), then paused, then completed
  const sorted = [...countdowns].sort((a, b) => {
    const order = { running: 0, paused: 1, completed: 2 }
    const ao = order[a.status] ?? 2
    const bo = order[b.status] ?? 2
    if (ao !== bo) return ao - bo
    if (a.status === 'running' && b.status === 'running') {
      return getRemaining(a, now) - getRemaining(b, now)
    }
    return 0
  })

  // Close window — emit event first for reliable sync
  const handleClose = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const { emitTo } = await import('@tauri-apps/api/event')
      await emitTo('main', 'cd-widget-closed', {})
    } catch { /* ignore */ }
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('close_utility_window', { label: 'cd-widget' })
    } catch { /* ignore */ }
    window.close()
  }, [])

  // Programmatic drag (more reliable than data-tauri-drag-region)
  const handleDrag = useCallback(async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().startDragging()
    } catch { /* ignore */ }
  }, [])

  // Navigate to main window countdown tab (widget stays open)
  const handleNavigate = useCallback(async () => {
    try {
      const { emitTo } = await import('@tauri-apps/api/event')
      await emitTo('main', 'timer-widget-navigate', { tab: 'countdown' })
    } catch { /* ignore */ }
  }, [])

  return (
    <div
      className="group h-full w-full flex flex-col bg-bg-elevated rounded-lg overflow-hidden select-none"
      onMouseDown={handleDrag}
      onClick={handleNavigate}
    >
      {/* Header bar */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-border-subtle cursor-grab">
        <div className="flex items-center gap-1.5">
          <Clock size={12} className="text-primary" />
          <span className="text-[10px] font-medium text-text-secondary uppercase tracking-wider">
            {t('modules.timer.ui.tab.countdown')}
          </span>
          {countdowns.filter((c) => c.status === 'running').length > 0 && (
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          )}
        </div>
        <button
          onClick={handleClose}
          className="h-5 w-5 rounded-md hover:bg-bg-hover text-text-muted hover:text-text-primary flex items-center justify-center transition-all cursor-pointer active:scale-90 opacity-0 group-hover:opacity-100"
          title={t('common.close')}
        >
          <X size={12} />
        </button>
      </div>

      {/* Countdown list */}
      <div className="flex-1 overflow-y-auto min-h-0 p-1.5 space-y-0.5" style={{ scrollbarGutter: 'stable' }}>
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-disabled gap-2">
            <Clock size={28} />
            <span className="text-[11px]">{t('timerWidget.noActive')}</span>
          </div>
        ) : (
          sorted.map((timer) => (
            <CountdownItem key={timer.id} timer={timer} now={now} onDismiss={removeCountdown} />
          ))
        )}
      </div>
    </div>
  )
}
