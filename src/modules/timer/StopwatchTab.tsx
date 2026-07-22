/**
 * StopwatchTab - Stopwatch with lap tracking
 * Displays elapsed time, lap records with fastest/slowest indicators.
 */
import { useMemo, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, Pause, RotateCcw, Flag, Copy, Check, Timer } from 'lucide-react'
import { useTimerStore } from './timerStore'
import { useToast } from '../../components/Toast'
import { formatStopwatch, formatLapTime } from './utils'
import type { StopwatchLap } from './types'

interface Props {
  now: number
}

/** Find fastest and slowest lap indices (only when 3+ laps) */
function findExtremes(laps: StopwatchLap[]): { fastest: number | null; slowest: number | null } {
  if (laps.length < 3) return { fastest: null, slowest: null }
  let minIdx = 0, maxIdx = 0
  for (let i = 1; i < laps.length; i++) {
    if (laps[i].lapTime < laps[minIdx].lapTime) minIdx = i
    if (laps[i].lapTime > laps[maxIdx].lapTime) maxIdx = i
  }
  return { fastest: laps[minIdx].index, slowest: laps[maxIdx].index }
}

export default function StopwatchTab({ now }: Props) {
  const { t } = useTranslation()
  const showToast = useToast()
  const stopwatch = useTimerStore((s) => s.stopwatch)
  const swStart = useTimerStore((s) => s.swStart)
  const swPause = useTimerStore((s) => s.swPause)
  const swReset = useTimerStore((s) => s.swReset)
  const swLap = useTimerStore((s) => s.swLap)

  const [copied, setCopied] = useState(false)

  // Calculate current elapsed
  const elapsed = useMemo(() => {
    if (!stopwatch.running || !stopwatch.startedAt) return stopwatch.elapsed
    return stopwatch.elapsed + (now - stopwatch.startedAt)
  }, [stopwatch.elapsed, stopwatch.startedAt, stopwatch.running, now])

  const { fastest, slowest } = useMemo(() => findExtremes(stopwatch.laps), [stopwatch.laps])

  const isRunning = stopwatch.running
  const hasStarted = elapsed > 0

  // Current lap time (time since last lap or since start)
  const currentLapTime = useMemo(() => {
    const lastLapTotal = stopwatch.laps.length > 0
      ? stopwatch.laps[stopwatch.laps.length - 1].totalTime
      : 0
    return elapsed - lastLapTotal
  }, [elapsed, stopwatch.laps])

  // Copy all laps to clipboard
  const handleCopyAll = useCallback(async () => {
    if (stopwatch.laps.length === 0) return
    const lines = stopwatch.laps.map((lap) => {
      const idx = `#${String(lap.index).padStart(2, ' ')}`
      const lapStr = formatLapTime(lap.lapTime)
      const totalStr = formatLapTime(lap.totalTime)
      let badge = ''
      if (lap.index === fastest) badge = ' 🐇'
      if (lap.index === slowest) badge = ' 🐢'
      return `${idx}  ${lapStr}  +${totalStr}${badge}`
    })
    const text = lines.join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      showToast(t('modules.timer.ui.copied'))
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast(t('modules.timer.ui.copyFailed'))
    }
  }, [stopwatch.laps, fastest, slowest, showToast, t])

  // Copy single lap
  const handleCopyLap = useCallback(async (lap: StopwatchLap) => {
    const text = `#${lap.index}  ${formatLapTime(lap.lapTime)}  +${formatLapTime(lap.totalTime)}`
    try {
      await navigator.clipboard.writeText(text)
      showToast(t('modules.timer.ui.copied'))
    } catch { /* ignore */ }
  }, [showToast, t])

  return (
    <div className="flex flex-col h-full">
      {/* ── Time display ── */}
      <div className="shrink-0 flex flex-col items-center justify-center py-8">
        <div className="font-mono text-5xl font-bold tabular-nums text-text-primary tracking-tight">
          {formatStopwatch(elapsed)}
        </div>

        {/* Current lap preview (when running and has laps) */}
        {isRunning && stopwatch.laps.length > 0 && (
          <div className="mt-2 text-xs text-text-muted tabular-nums">
            {t('modules.timer.ui.currentLap')}: {formatLapTime(currentLapTime)}
          </div>
        )}
      </div>

      {/* ── Controls ── */}
      <div className="shrink-0 flex items-center justify-center gap-3 pb-6">
        {/* Reset */}
        <button
          onClick={swReset}
          disabled={!hasStarted}
          className="flex items-center justify-center h-11 w-11 rounded-full border border-border-base text-text-muted hover:text-text-primary hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          title={t('modules.timer.ui.reset')}
        >
          <RotateCcw size={18} />
        </button>

        {/* Start/Pause */}
        <button
          onClick={isRunning ? swPause : swStart}
          className={`flex items-center justify-center h-14 w-14 rounded-full font-medium transition-colors cursor-pointer ${
            isRunning
              ? 'bg-warning/15 text-warning hover:bg-warning/25 border border-warning/30'
              : 'bg-primary/15 text-primary hover:bg-primary/25 border border-primary/30'
          }`}
          title={isRunning ? t('modules.timer.ui.pause') : t('modules.timer.ui.start')}
        >
          {isRunning ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}
        </button>

        {/* Lap */}
        <button
          onClick={swLap}
          disabled={!isRunning}
          className="flex items-center justify-center h-11 w-11 rounded-full border border-border-base text-text-muted hover:text-text-primary hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          title={t('modules.timer.ui.lap')}
        >
          <Flag size={18} />
        </button>
      </div>

      {/* ── Lap list ── */}
      {stopwatch.laps.length > 0 && (
        <div className="flex-1 min-h-0 border-t border-border-subtle">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-4 text-[10px] font-medium text-text-muted uppercase tracking-wider">
              <span className="w-8">#</span>
              <span className="flex-1">{t('modules.timer.ui.lapTime')}</span>
              <span className="flex-1 text-right">{t('modules.timer.ui.totalTime')}</span>
            </div>
            <button
              onClick={handleCopyAll}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors cursor-pointer"
            >
              {copied ? <Check size={10} className="text-success" /> : <Copy size={10} />}
              {t('modules.timer.ui.copyAll')}
            </button>
          </div>

          {/* Laps (newest first) */}
          <div className="overflow-y-auto max-h-[calc(100%-36px)]" style={{ scrollbarGutter: 'stable' }}>
            {[...stopwatch.laps].reverse().map((lap) => {
              const isFastest = lap.index === fastest
              const isSlowest = lap.index === slowest
              return (
                <button
                  key={lap.index}
                  onClick={() => handleCopyLap(lap)}
                  className={`
                    flex items-center gap-4 w-full px-4 py-2 text-xs tabular-nums
                    hover:bg-bg-hover transition-colors cursor-pointer border-b border-border-subtle/50
                    ${isFastest ? 'bg-success/[0.04]' : isSlowest ? 'bg-error/[0.04]' : ''}
                  `}
                  title={t('modules.timer.ui.clickToCopy')}
                >
                  <span className="w-8 text-text-muted font-medium">
                    #{lap.index}
                  </span>
                  <span className={`flex-1 font-mono ${isFastest ? 'text-success' : isSlowest ? 'text-error' : 'text-text-primary'}`}>
                    {formatLapTime(lap.lapTime)}
                  </span>
                  <span className="flex-1 text-right font-mono text-text-muted">
                    +{formatLapTime(lap.totalTime)}
                  </span>
                  {isFastest && (
                    <span className="text-[10px]" title={t('modules.timer.ui.fastest')}>🐇</span>
                  )}
                  {isSlowest && (
                    <span className="text-[10px]" title={t('modules.timer.ui.slowest')}>🐢</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {stopwatch.laps.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-text-disabled text-xs">
          <div className="flex items-center gap-1.5">
            <Timer size={12} />
            <span>{hasStarted ? t('modules.timer.ui.lapHint') : t('modules.timer.ui.stopwatchEmpty')}</span>
          </div>
        </div>
      )}
    </div>
  )
}
