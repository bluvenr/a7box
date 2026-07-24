/**
 * StopwatchWidget - Circular floating window for stopwatch
 *
 * Always-on-top desktop widget showing stopwatch elapsed time.
 * On hover: overlay appears with Reset / Start-Pause / Lap action buttons.
 *
 * Communicates with main window via Tauri events:
 * - Listens:  sw-state-update (stopwatch state pushed from main window)
 * - Emits:    sw-state-request (request initial state on mount)
 *             sw-control-start / sw-control-pause / sw-control-reset / sw-control-lap
 *             timer-widget-navigate (open main window stopwatch tab)
 */
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Play, Pause, RotateCcw, Flag, ExternalLink } from 'lucide-react'

interface SwState {
  running: boolean
  elapsed: number
  startedAt: number | null
}

/** Format elapsed ms as HH:MM:SS */
function formatHMS(ms: number): string {
  const totalSecs = Math.floor(ms / 1000)
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

/** Format ms portion as 3-digit string */
function formatMs(ms: number): string {
  return String(Math.floor(ms % 1000)).padStart(3, '0')
}

export default function StopwatchWidget() {
  const { t } = useTranslation()
  const [swState, setSwState] = useState<SwState>({ running: false, elapsed: 0, startedAt: null })
  const [now, setNow] = useState(Date.now)
  const [feedback, setFeedback] = useState<string | null>(null)

  // ── Brief feedback toast (auto-clears after 900ms) ──
  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg)
    setTimeout(() => setFeedback(null), 900)
  }, [])

  // ── Transparent background for circular window ──
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

  // ── Listen for stopwatch state updates from main window (via emitTo) ──
  useEffect(() => {
    let unlisten: (() => void) | null = null

    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<SwState>('sw-state-update', (event) => {
        setSwState(event.payload)
      }).then((fn) => { unlisten = fn })
    }).catch(() => { /* ignore */ })

    return () => { unlisten?.() }
  }, [])

  // ── Request current stopwatch state from main window on mount ──
  useEffect(() => {
    const requestState = () => {
      import('@tauri-apps/api/event').then(({ emitTo }) => {
        emitTo('main', 'sw-state-request', {}).catch(() => {})
      }).catch(() => {})
    }
    // Immediate + 500ms retry (handles race if main window listener isn't ready)
    requestState()
    const retryId = setTimeout(requestState, 500)
    return () => clearTimeout(retryId)
  }, [])

  // ── 100ms tick when running ──
  useEffect(() => {
    if (!swState.running) return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [swState.running])

  // ── Elapsed + seconds angle (clamped to ≥0 to avoid -1:-1:-1 flash) ──
  const elapsed = Math.max(0, swState.running && swState.startedAt
    ? swState.elapsed + (now - swState.startedAt)
    : swState.elapsed)
  const secondsAngle = ((elapsed / 1000) % 60) * 6

  // ── SVG dimensions for 88px circle ──
  const svgSize = 88
  const ringRadius = 40
  const dotRadius = 2.5

  // ── Emit control event to main window ──
  const emitControl = useCallback((event: string) => {
    import('@tauri-apps/api/event').then(({ emitTo }) => {
      emitTo('main', event, {}).catch(() => {})
    }).catch(() => {})
  }, [])

  // ── Programmatic drag ──
  const handleDrag = useCallback(async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().startDragging()
    } catch { /* ignore */ }
  }, [])

  // ── Close widget ──
  const handleClose = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      // Notify main window to reset pin state (more reliable than tauri://destroyed)
      const { emitTo } = await import('@tauri-apps/api/event')
      await emitTo('main', 'sw-widget-closed', {})
    } catch { /* ignore */ }
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('close_utility_window', { label: 'sw-widget' })
    } catch { /* ignore */ }
    window.close()
  }, [])

  // ── Open main window to stopwatch tab ──
  const handleOpenMain = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const { emitTo } = await import('@tauri-apps/api/event')
      await emitTo('main', 'timer-widget-navigate', { tab: 'stopwatch' })
    } catch { /* ignore */ }
  }, [])

  // ── Stopwatch actions (optimistic local update + emit to main window) ──
  const onStartPause = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (swState.running) {
      // Optimistic pause: immediately show stopped
      setSwState((s) => ({ ...s, running: false }))
      emitControl('sw-control-pause')
      showFeedback(t('timerWidget.feedback.paused'))
    } else {
      // Optimistic start: immediately show running
      setSwState((s) => ({ ...s, running: true }))
      emitControl('sw-control-start')
      showFeedback(t('timerWidget.feedback.started'))
    }
  }, [swState.running, emitControl, showFeedback, t])

  const onReset = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    // Optimistic reset: immediately clear display
    setSwState({ running: false, elapsed: 0, startedAt: null })
    emitControl('sw-control-reset')
    showFeedback(t('timerWidget.feedback.reset'))
  }, [emitControl, showFeedback, t])

  const onLap = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    emitControl('sw-control-lap')
    showFeedback(t('timerWidget.feedback.lap'))
  }, [emitControl, showFeedback, t])

  return (
    <div className="h-full w-full flex items-center justify-center select-none">
      {/* 88px circular face in 120px window — group controls hover overlay */}
      <div
        className="group relative h-[88px] w-[88px] rounded-full bg-bg-elevated border border-border-subtle shadow-2xl flex items-center justify-center overflow-visible"
        onMouseDown={handleDrag}
      >
        {/* SVG: track ring + rotating second indicator dot */}
        <svg
          className="absolute inset-0 h-full w-full rounded-full pointer-events-none"
          viewBox={`0 0 ${svgSize} ${svgSize}`}
        >
          <circle
            cx={svgSize / 2} cy={svgSize / 2} r={ringRadius}
            fill="none"
            stroke="currentColor"
            className="text-border-subtle"
            strokeWidth="1.5"
          />
          <g
            transform={`rotate(${secondsAngle}, ${svgSize / 2}, ${svgSize / 2})`}
            style={{ transition: swState.running ? 'transform 0.1s linear' : 'none' }}
          >
            <circle
              cx={svgSize / 2}
              cy={svgSize / 2 - ringRadius}
              r={dotRadius}
              fill="currentColor"
              className={swState.running ? 'text-primary' : 'text-text-disabled'}
            />
          </g>
        </svg>

        {/* Content — time centered, ms below */}
        <div className="relative z-[5] h-full w-full pointer-events-none">
          <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 font-mono text-lg font-bold tabular-nums text-text-primary tracking-tight leading-none">
            {formatHMS(elapsed)}
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 top-[52px] font-mono text-[11px] tabular-nums leading-none mt-1">
            <span className={swState.running ? 'text-primary/70' : 'text-text-disabled'}>.{formatMs(elapsed)}</span>
          </div>
        </div>

        {/* ── Hover overlay — buttons centered, feedback floats above ── */}
        <div className="absolute inset-0 rounded-full bg-bg-elevated/50 backdrop-blur-[2px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto z-10">
          {/* Feedback toast — absolute positioned, floats above centered buttons */}
          <div className={`absolute bottom-[calc(50%+18px)] left-0 right-0 text-center text-[8px] font-medium text-primary transition-opacity duration-150 pointer-events-none ${feedback ? 'opacity-100' : 'opacity-0'}`}>
            {feedback ?? '\u00A0'}
          </div>
          {/* Action buttons — horizontal row, vertically centered */}
          <div className="flex flex-row items-center gap-1.5">
          <button
            onClick={onReset}
            className="h-7 w-7 rounded-full bg-bg-overlay border border-border-subtle hover:border-primary/40 hover:bg-primary/15 text-text-secondary hover:text-primary flex items-center justify-center transition-all cursor-pointer active:scale-90 shadow-sm"
            title={t('modules.timer.ui.reset')}
          >
            <RotateCcw size={12} />
          </button>
          <button
            onClick={onStartPause}
            className="h-8 w-8 rounded-full bg-primary text-white hover:bg-primary-hover flex items-center justify-center transition-all cursor-pointer active:scale-90 shadow-md"
            title={swState.running ? t('modules.timer.ui.pause') : t('modules.timer.ui.start')}
          >
            {swState.running ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
          </button>
          <button
            onClick={onLap}
            disabled={!swState.running}
            className="h-7 w-7 rounded-full bg-bg-overlay border border-border-subtle hover:border-primary/40 hover:bg-primary/15 text-text-secondary hover:text-primary flex items-center justify-center transition-all cursor-pointer active:scale-90 shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
            title={t('modules.timer.ui.lap')}
          >
            <Flag size={12} />
          </button>
          </div>
        </div>

        {/* Close button — top-right edge, visible on hover */}
        <button
          onClick={handleClose}
          className="absolute top-1 right-1 z-20 h-5 w-5 rounded-full bg-bg-elevated border border-border-subtle hover:bg-bg-base text-text-muted hover:text-text-primary flex items-center justify-center transition-all cursor-pointer active:scale-90 opacity-0 group-hover:opacity-100"
        >
          <X size={9} />
        </button>

        {/* Open main window — bottom center, visible on hover */}
        <button
          onClick={handleOpenMain}
          className="absolute bottom-1 left-1/2 -translate-x-1/2 z-20 h-5 w-5 rounded-full bg-bg-elevated border border-border-subtle hover:bg-bg-base text-text-muted hover:text-primary flex items-center justify-center transition-all cursor-pointer active:scale-90 opacity-0 group-hover:opacity-100"
        >
          <ExternalLink size={9} />
        </button>
      </div>
    </div>
  )
}
