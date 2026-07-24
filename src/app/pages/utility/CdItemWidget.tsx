/**
 * CdItemWidget — Individual countdown card floating window
 * Each running/paused countdown gets its own card window.
 * Displays: ring progress, title, remaining time, hover action buttons.
 * Click card → navigate main window to countdown tab.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Check, Pause, Play, Plus, RotateCcw, Trash2, X,
} from 'lucide-react'
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

/** Emit current countdowns to main window after local mutations */
function syncToMain() {
  import('@tauri-apps/api/event').then(({ emitTo }) => {
    const cds = useTimerStore.getState().countdowns
    emitTo('main', 'cd-mutation-sync', cds.map((c) => ({
      id: c.id, title: c.title, totalDuration: c.totalDuration,
      endsAt: c.endsAt, remainingMs: c.remainingMs, status: c.status, createdAt: c.createdAt,
    }))).catch(() => {})
  }).catch(() => {})
}

function CdItemWidget() {
  const { t } = useTranslation()
  const [timerId] = useState(() => new URLSearchParams(window.location.search).get('id') ?? '')

  // ── Transparent background for rounded corners ──
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

  // ── Store ──
  const countdowns = useTimerStore((s) => s.countdowns)
  const pauseCountdown = useTimerStore((s) => s.pauseCountdown)
  const resumeCountdown = useTimerStore((s) => s.resumeCountdown)
  const resetCountdown = useTimerStore((s) => s.resetCountdown)
  const removeCountdown = useTimerStore((s) => s.removeCountdown)
  const addTime = useTimerStore((s) => s.addTime)

  // ── Cross-window state sync ──
  useEffect(() => {
    let unlisten: (() => void) | null = null

    import('@tauri-apps/api/event').then(({ listen, emit }) => {
      // Listen for broadcasts (from main window emitCdState + cd-state-request response)
      listen<CountdownTimer[]>('cd-state-update', (e) => {
        useTimerStore.setState({ countdowns: e.payload })
      }).then((fn) => { unlisten = fn })

      // Request initial state from main window
      emit('cd-state-request').catch(() => {})
    }).catch(() => {})

    return () => { unlisten?.() }
  }, [])

  // ── Derived state ──
  const timer = countdowns.find((c) => c.id === timerId)
  const [now, setNow] = useState(Date.now())

  // Tick only when this timer is running
  useEffect(() => {
    if (!timer || timer.status !== 'running') return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [timer?.status])

  // Auto-close when timer is removed from store
  useEffect(() => {
    if (countdowns.length > 0 && !countdowns.find((c) => c.id === timerId)) {
      const id = setTimeout(async () => {
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window')
          await getCurrentWindow().close()
        } catch { /* ignore */ }
      }, 500)
      return () => clearTimeout(id)
    }
  }, [countdowns, timerId])

  // ── Actions ──
  // Cached window module for fast synchronous access
  const winModuleRef = useRef<any>(null)
  useEffect(() => {
    import('@tauri-apps/api/window').then((m) => { winModuleRef.current = m }).catch(() => {})
  }, [])

  const handleDoubleClick = useCallback(async () => {
    try {
      const { emitTo } = await import('@tauri-apps/api/event')
      await emitTo('main', 'timer-widget-navigate', { tab: 'countdown' })
    } catch { /* ignore */ }
  }, [])

  const handleClose = useCallback(async () => {
    try {
      const { emitTo } = await import('@tauri-apps/api/event')
      await emitTo('main', 'cd-item-closed', { id: timerId })
    } catch { /* ignore */ }
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().close()
    } catch { /* ignore */ }
  }, [timerId])

  /** Movement-threshold drag: only starts dragging after mouse moves >5px.
   *  This allows dblclick to work (two quick clicks with no movement). */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    const startX = e.clientX
    const startY = e.clientY
    let dragging = false

    const onMove = async (ev: MouseEvent) => {
      if (dragging) return
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        dragging = true
        try {
          const mod = winModuleRef.current
          if (mod) {
            await mod.getCurrentWindow().startDragging()
          } else {
            const { getCurrentWindow } = await import('@tauri-apps/api/window')
            await getCurrentWindow().startDragging()
          }
        } catch { /* ignore */ }
      }
    }

    const cleanup = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', cleanup)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', cleanup)
  }, [])

  // ── Render: timer not found (brief flash before auto-close) ──
  if (!timer) {
    return (
      <div className="h-screen flex items-center justify-center text-text-disabled text-xs">
        {t('modules.timer.ui.dismiss', 'Dismissed')}
      </div>
    )
  }

  // ── Timer state ──
  const remaining = getRemaining(timer, now)
  const progress = getProgress(timer, now)
  const isCompleted = timer.status === 'completed'
  const isRunning = timer.status === 'running'
  const isPaused = timer.status === 'paused'

  // SVG ring: 36px diameter
  const size = 36
  const radius = 15
  const circumference = 2 * Math.PI * radius
  const offset = circumference - progress * circumference
  const colorClass = getProgressColor(timer, now)

  const stop = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <div
      className="h-screen w-screen cursor-default select-none"
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      <div className="group relative h-full w-full rounded-xl border border-border-base bg-bg-elevated shadow-lg overflow-hidden">
        {/* ── Close button (top-right, hover) ── */}
        <button
          onClick={handleClose}
          className="absolute top-1 right-1 z-20 h-5 w-5 rounded-full flex items-center justify-center text-text-disabled hover:text-error hover:bg-error/15 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer active:scale-90"
          title={t('common.close')}
        >
          <X size={10} />
        </button>
        <div className="relative flex items-center gap-2.5 h-full px-3">
          {/* ── Ring progress ── */}
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

          {/* ── Info ── */}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-text-primary truncate leading-tight">
              {timer.title || '—'}
            </div>
            <div className={`font-mono text-sm font-bold tabular-nums leading-tight ${
              isCompleted ? 'text-success' : 'text-text-primary'
            }`}>
              {isCompleted ? '00:00' : formatCompact(remaining)}
            </div>
          </div>

          {/* ── Hover action buttons (only for active timers) ── */}
          {!isCompleted && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-bg-overlay/90 backdrop-blur-sm rounded-md px-0.5 py-0.5 shadow-sm">
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
        </div>
      </div>
    </div>
  )
}

export default CdItemWidget
