/**
 * CountdownCard - Single countdown timer card
 * Shows remaining time, progress bar, and action buttons on hover.
 * Supports inline title editing and +/- time adjustments.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Pause, Play, RotateCcw, Trash2, Plus, Minus, CheckCircle, Pencil } from 'lucide-react'
import { useTimerStore, getRemaining, getProgress } from './timerStore'
import { formatHMS } from './utils'
import type { CountdownTimer } from './types'

interface Props {
  timer: CountdownTimer
  now: number
}

/** Format remaining ms as MM:SS or H:MM:SS (ceil — never shows 00:00 early) */
const fmtRemaining = (ms: number): string => formatHMS(ms, 'ceil')

/** Format total duration for completed card */
const fmtDuration = (ms: number): string => formatHMS(ms, 'round')

export default function CountdownCard({ timer, now }: Props) {
  const { t } = useTranslation()
  const pauseCountdown = useTimerStore((s) => s.pauseCountdown)
  const resumeCountdown = useTimerStore((s) => s.resumeCountdown)
  const resetCountdown = useTimerStore((s) => s.resetCountdown)
  const removeCountdown = useTimerStore((s) => s.removeCountdown)
  const addTime = useTimerStore((s) => s.addTime)
  const updateTitle = useTimerStore((s) => s.updateTitle)

  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState(timer.title)
  const inputRef = useRef<HTMLInputElement>(null)

  const remaining = getRemaining(timer, now)
  const progress = getProgress(timer)
  const isCompleted = timer.status === 'completed'
  const isPaused = timer.status === 'paused'
  const isRunning = timer.status === 'running'

  // Last 10 seconds warning
  const isWarning = isRunning && remaining <= 10000 && remaining > 0
  // Last 5 seconds critical
  const isCritical = isRunning && remaining <= 5000 && remaining > 0

  // Focus input when editing starts
  useEffect(() => {
    if (editingTitle && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingTitle])

  const commitTitle = useCallback(() => {
    const trimmed = draftTitle.trim()
    if (trimmed && trimmed !== timer.title) {
      updateTitle(timer.id, trimmed)
    } else {
      setDraftTitle(timer.title)
    }
    setEditingTitle(false)
  }, [draftTitle, timer.title, timer.id, updateTitle])

  const handlePauseResume = () => {
    if (isRunning) pauseCountdown(timer.id)
    else if (isPaused) resumeCountdown(timer.id)
  }

  const handleRestart = () => {
    resetCountdown(timer.id)
  }

  // Progress bar color
  const progressColor = isCritical
    ? 'bg-error'
    : isWarning
      ? 'bg-warning'
      : isCompleted
        ? 'bg-success'
        : 'bg-primary'

  return (
    <div
      className={`
        group relative rounded-xl border p-4 transition-all
        ${isCompleted
          ? 'border-success/20 bg-success/[0.03]'
          : isCritical
            ? 'border-error/30 bg-error/[0.03]'
            : isPaused
              ? 'border-border-base bg-bg-elevated/50'
              : 'border-border-base bg-bg-elevated hover:border-border-hover'
        }
      `}
    >
      {/* Top row: title + remaining time */}
      <div className="flex items-center justify-between gap-3 mb-2">
        {/* Title */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {editingTitle ? (
            <input
              ref={inputRef}
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle()
                if (e.key === 'Escape') { setDraftTitle(timer.title); setEditingTitle(false) }
              }}
              maxLength={100}
              className="flex-1 min-w-0 rounded-md border border-border-focus bg-bg-overlay px-2 py-0.5 text-sm font-medium text-text-primary outline-none"
            />
          ) : (
            <button
              onClick={() => { setDraftTitle(timer.title); setEditingTitle(true) }}
              className="flex items-center gap-1.5 min-w-0 text-sm font-medium text-text-primary truncate hover:text-primary transition-colors cursor-pointer group/title"
              title={t('modules.timer.ui.clickToEdit')}
            >
              <span className="truncate">{timer.title}</span>
              <Pencil size={10} className="text-text-disabled opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0" />
            </button>
          )}
        </div>

        {/* Remaining time display */}
        <div className={`shrink-0 tabular-nums font-mono text-lg font-bold ${
          isCompleted ? 'text-success' : isCritical ? 'text-error' : isWarning ? 'text-warning' : 'text-text-primary'
        }`}>
          {isCompleted ? fmtDuration(timer.totalDuration) : fmtRemaining(remaining)}
        </div>
      </div>

      {/* Progress bar */}
      {!isCompleted && (
        <div className="h-1.5 rounded-full bg-bg-hover overflow-hidden mb-3">
          <div
            className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}

      {/* Completed state */}
      {isCompleted && (
        <div className="flex items-center gap-2">
          <CheckCircle size={14} className="text-success" />
          <span className="text-xs text-text-muted">
            {t('modules.timer.ui.completed')}
          </span>
          <div className="flex-1" />
          <button
            onClick={handleRestart}
            className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors cursor-pointer"
          >
            <RotateCcw size={12} />
            {t('modules.timer.ui.restart')}
          </button>
          <button
            onClick={() => removeCountdown(timer.id)}
            className="rounded-md p-1.5 text-text-muted hover:text-error hover:bg-error/10 transition-colors cursor-pointer"
            title={t('modules.timer.ui.delete')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}

      {/* Active/paused action buttons (visible on hover) */}
      {!isCompleted && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Pause/Resume */}
          <button
            onClick={handlePauseResume}
            className={`rounded-md p-1.5 transition-colors cursor-pointer ${
              isPaused
                ? 'text-primary hover:bg-primary/10'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
            }`}
            title={isPaused ? t('modules.timer.ui.resume') : t('modules.timer.ui.pause')}
          >
            {isPaused ? <Play size={14} /> : <Pause size={14} />}
          </button>

          {/* Time adjustments */}
          <button
            onClick={() => addTime(timer.id, 60000)}
            className="flex items-center gap-0.5 rounded-md px-1.5 py-1.5 text-[10px] font-medium text-text-muted hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
            title={t('modules.timer.ui.addTime', { n: 1 })}
          >
            <Plus size={10} />
            1{t('modules.timer.ui.units.mShort')}
          </button>
          <button
            onClick={() => addTime(timer.id, 300000)}
            className="flex items-center gap-0.5 rounded-md px-1.5 py-1.5 text-[10px] font-medium text-text-muted hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
            title={t('modules.timer.ui.addTime', { n: 5 })}
          >
            <Plus size={10} />
            5{t('modules.timer.ui.units.mShort')}
          </button>
          <button
            onClick={() => addTime(timer.id, -60000)}
            className="flex items-center gap-0.5 rounded-md px-1.5 py-1.5 text-[10px] font-medium text-text-muted hover:text-warning hover:bg-warning/10 transition-colors cursor-pointer"
            title={t('modules.timer.ui.subTime', { n: 1 })}
          >
            <Minus size={10} />
            1{t('modules.timer.ui.units.mShort')}
          </button>

          <div className="flex-1" />

          {/* Reset */}
          <button
            onClick={handleRestart}
            className="rounded-md p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
            title={t('modules.timer.ui.reset')}
          >
            <RotateCcw size={14} />
          </button>

          {/* Delete */}
          <button
            onClick={() => removeCountdown(timer.id)}
            className="rounded-md p-1.5 text-text-muted hover:text-error hover:bg-error/10 transition-colors cursor-pointer"
            title={t('modules.timer.ui.delete')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}

      {/* Paused indicator (visible when not hovering, absolute to avoid layout shift) */}
      {isPaused && (
        <div className="absolute bottom-3 left-4 z-0 group-hover:opacity-0 opacity-100 transition-opacity pointer-events-none flex items-center gap-1.5">
          <Pause size={10} className="text-text-disabled" />
          <span className="text-[10px] text-text-disabled">{t('modules.timer.ui.paused')}</span>
        </div>
      )}
    </div>
  )
}
