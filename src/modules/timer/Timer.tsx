/**
 * Timer Module - Main Page
 * Two tabs: Countdown and Stopwatch.
 * Runs a 100ms tick to keep the display updated.
 */
import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Timer as TimerIcon, Bell } from 'lucide-react'
import { useTimerStore } from './timerStore'
import CountdownTab from './CountdownTab'
import StopwatchTab from './StopwatchTab'

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
