/**
 * Timer Module - Main Page
 * Two tabs: Countdown and Stopwatch.
 * Runs a 100ms tick to keep the display updated.
 */
import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Timer as TimerIcon, Bell } from 'lucide-react'
import { useTimerStore } from './timerStore'
import type { CountdownTimer } from './types'
import CountdownTab from './CountdownTab'
import StopwatchTab from './StopwatchTab'
import { isTauri } from '../../shared/utils'

/** Reusable AudioContext singleton — avoids creating a new context per beep */
let sharedAudioCtx: AudioContext | null = null
function getAudioCtx(): AudioContext | null {
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioContext()
    }
    return sharedAudioCtx
  } catch {
    return null
  }
}

export default function TimerPage() {
  const { t } = useTranslation()
  const activeTab = useTimerStore((s) => s.activeTab)
  const setActiveTab = useTimerStore((s) => s.setActiveTab)
  const tick = useTimerStore((s) => s.tick)
  const countdowns = useTimerStore((s) => s.countdowns)
  const swRunning = useTimerStore((s) => s.stopwatch.running)

  // Running count for badge (also used for tick condition)
  const runningCount = countdowns.filter((c) => c.status === 'running').length
  const needsTick = runningCount > 0 || swRunning

  const setCdWidgetPinned = useTimerStore((s) => s.setCdWidgetPinned)
  const setSwWidgetPinned = useTimerStore((s) => s.setSwWidgetPinned)
  const removeCdItemPinned = useTimerStore((s) => s.removeCdItemPinned)

  // On mount: sync pinned state with actual window existence + restore pinned cards
  useEffect(() => {
    if (!isTauri()) return
    import('@tauri-apps/api/window').then(({ getAllWindows }) => {
      getAllWindows().then((wins) => {
        const labels = wins.map((w) => w.label)
        // Always trust actual window existence — no auto-open for aggregate widgets
        setSwWidgetPinned(labels.includes('sw-widget'))
        setCdWidgetPinned(labels.includes('cd-widget'))
      }).catch(() => {})
    }).catch(() => {})

    // Restore pinned countdown cards on startup
    const restoreCards = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const state = useTimerStore.getState()
        const idsToRestore = new Set<string>()

        // From cdAutoSpawn: all running/paused timers should have cards
        if (state.cdAutoSpawn) {
          state.countdowns
            .filter((c) => c.status === 'running' || c.status === 'paused')
            .forEach((c) => idsToRestore.add(c.id))
        }

        // From cdItemPinned: individual pinned timers
        state.cdItemPinned.forEach((id) => {
          // Only restore if timer still exists and is active
          const timer = state.countdowns.find((c) => c.id === id)
          if (timer && (timer.status === 'running' || timer.status === 'paused' || timer.status === 'completed')) {
            idsToRestore.add(id)
          }
        })

        // Spawn cards for all collected IDs
        let i = 0
        for (const id of idsToRestore) {
          await invoke('show_cd_item_widget', { timerId: id, index: i })
          i++
        }
      } catch { /* ignore */ }
    }

    // Delay slightly to avoid race with window initialization
    const restoreTimer = setTimeout(restoreCards, 300)
    return () => clearTimeout(restoreTimer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Listen for widget events + track widget state
  useEffect(() => {
    if (!isTauri()) return
    let closeUnlisten: (() => void) | null = null
    let reqUnlisten: (() => void) | null = null
    let swClosedUnlisten: (() => void) | null = null
    let cdClosedUnlisten: (() => void) | null = null
    let cdReqUnlisten: (() => void) | null = null
    let swStartUnlisten: (() => void) | null = null
    let swPauseUnlisten: (() => void) | null = null
    let swResetUnlisten: (() => void) | null = null
    let swLapUnlisten: (() => void) | null = null
    let cdMutUnlisten: (() => void) | null = null
    let cdItemClosedUnlisten: (() => void) | null = null

    import('@tauri-apps/api/event').then(({ listen, emitTo }) => {
      // Widget requests current stopwatch state (sent on widget mount)
      listen('sw-state-request', () => {
        const sw = useTimerStore.getState().stopwatch
        emitTo('sw-widget', 'sw-state-update', {
          running: sw.running,
          elapsed: sw.elapsed,
          startedAt: sw.startedAt,
        }).catch(() => {})
      }).then((fn) => { reqUnlisten = fn })

      // Track widget window lifecycle — sync store state
      listen('tauri://destroyed', async (e) => {
        const label = (e as any).payload?.label ?? ''
        if (label === 'sw-widget') setSwWidgetPinned(false)
        if (label === 'cd-widget') setCdWidgetPinned(false)
        // cd-item-* destroyed: remove from pinned list
        if (label.startsWith('cd-item-')) {
          const shortId = label.replace('cd-item-', '')
          const state = useTimerStore.getState()
          const matchingId = state.cdItemPinned.find((id) => id.startsWith(shortId))
          if (matchingId) removeCdItemPinned(matchingId)
        }
      }).then((fn) => { closeUnlisten = fn })

      // Widget closed via its own close button (explicit, reliable)
      listen('sw-widget-closed', () => { setSwWidgetPinned(false) }).then((fn) => { swClosedUnlisten = fn })
      listen('cd-widget-closed', () => { setCdWidgetPinned(false) }).then((fn) => { cdClosedUnlisten = fn })

      // Individual countdown card closed (top-right × button)
      listen<{ id: string }>('cd-item-closed', (e) => {
        removeCdItemPinned(e.payload.id)
      }).then((fn) => { cdItemClosedUnlisten = fn })

      // Countdown widget requests current state (sent on widget mount)
      listen('cd-state-request', () => {
        import('@tauri-apps/api/event').then(({ emit }) => {
          const cds = useTimerStore.getState().countdowns
          const payload = cds.map((c) => ({
            id: c.id, title: c.title, totalDuration: c.totalDuration,
            endsAt: c.endsAt, remainingMs: c.remainingMs, status: c.status, createdAt: c.createdAt,
          }))
          // Broadcast to all windows (cd-widget + cd-item-* cards)
          emit('cd-state-update', payload).catch(() => {})
        }).catch(() => {})
      }).then((fn) => { cdReqUnlisten = fn })

      // ── Stopwatch widget controls ──
      // Note: swStart/swPause/swReset already emit state to widget internally via emitSwState
      listen('sw-control-start', () => { useTimerStore.getState().swStart() }).then((fn) => { swStartUnlisten = fn })
      listen('sw-control-pause', () => { useTimerStore.getState().swPause() }).then((fn) => { swPauseUnlisten = fn })
      listen('sw-control-reset', () => { useTimerStore.getState().swReset() }).then((fn) => { swResetUnlisten = fn })
      listen('sw-control-lap', () => { useTimerStore.getState().swLap() }).then((fn) => { swLapUnlisten = fn })

      // ── Countdown widget mutation sync (widget→main) ──
      listen<CountdownTimer[]>('cd-mutation-sync', (e) => {
        useTimerStore.setState({ countdowns: e.payload })
      }).then((fn) => { cdMutUnlisten = fn })
    }).catch(() => {})

    return () => {
      closeUnlisten?.()
      reqUnlisten?.()
      swClosedUnlisten?.()
      cdClosedUnlisten?.()
      cdReqUnlisten?.()
      swStartUnlisten?.()
      swPauseUnlisten?.()
      swResetUnlisten?.()
      swLapUnlisten?.()
      cdMutUnlisten?.()
      cdItemClosedUnlisten?.()
    }
  }, [setCdWidgetPinned, setSwWidgetPinned, removeCdItemPinned])

  // 100ms tick for smooth display updates (stops when nothing is running)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!needsTick) return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [needsTick])

  // Tick store to mark completed timers + play sound
  const lastTickRef = useRef(0)
  useEffect(() => {
    // Only tick every ~1s to avoid excessive re-renders
    if (now - lastTickRef.current < 1000) return
    lastTickRef.current = now
    const completed = tick()
    // Play notification sound for newly completed timers
    if (completed.length > 0) {
      playNotificationSound()
    }
  }, [now, tick])

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <div className="shrink-0 px-6 pt-6">
        <div className="flex items-center justify-between pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <TimerIcon size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-text-primary">
                  {t('modules.timer.name')}
                </h1>
                {runningCount > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                    <Bell size={9} />
                    {runningCount} {t('modules.timer.ui.running')}
                  </span>
                )}
              </div>
              <p className="text-sm text-text-secondary">{t('modules.timer.description')}</p>
            </div>
          </div>
        </div>

        {/* ── Tab switcher ── */}
        <div className="flex items-center gap-0.5 border-b border-border-subtle">
          {(['countdown', 'stopwatch'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors cursor-pointer mb-[-1px] border-b-2 ${
                activeTab === tab
                  ? 'border-primary text-text-primary'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
            >
              {t(`modules.timer.ui.tab.${tab}`)}
              {tab === 'countdown' && runningCount > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                  activeTab === tab ? 'bg-primary/15 text-primary' : 'bg-bg-hover text-text-muted'
                }`}>
                  {runningCount}
                </span>
              )}
              {tab === 'stopwatch' && swRunning && (
                <span className={`h-2 w-2 rounded-full animate-pulse ${
                  activeTab === tab ? 'bg-primary' : 'bg-primary/60'
                }`} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-hidden px-6 py-4">
        {activeTab === 'countdown' ? (
          <CountdownTab now={now} />
        ) : (
          <StopwatchTab now={now} />
        )}
      </div>
    </div>
  )
}

/** Play a short notification sound using Web Audio API (reuses a shared context) */
function playNotificationSound() {
  const ctx = getAudioCtx()
  if (!ctx) return
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 800
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.5)
    // Second beep
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.frequency.value = 1000
    osc2.type = 'sine'
    gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.2)
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.7)
    osc2.start(ctx.currentTime + 0.2)
    osc2.stop(ctx.currentTime + 0.7)
  } catch {
    // Web Audio not available, silently fail
  }
}
