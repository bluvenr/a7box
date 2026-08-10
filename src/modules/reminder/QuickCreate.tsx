/**
 * QuickCreate - Quick reminder creation popup (utility window)
 * Triggered by global shortcut Ctrl+Shift+R
 * Supports natural language parsing + always-visible manual time picker
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../core/i18n'
import { Zap, Edit3, X, Plus, Check, Clock, FileText } from 'lucide-react'
import { useReminderStore, normalizeRepeatTrigger } from './reminderStore'
import { parseQuickInput, type ParsedResult } from './parseQuickInput'
import type { RepeatConfig } from './types'

function toDateTimeLocal(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function closeWindow() {
  const internals = (window as any).__TAURI_INTERNALS__
  if (internals?.invoke) {
    internals.invoke('close_utility_window', { label: 'reminder-quick' }).catch(() => {})
  }
  window.close()
}

export default function QuickCreate() {
  const { t } = useTranslation()
  const addReminder = useReminderStore((s) => s.addReminder)

  const [input, setInput] = useState('')
  const [triggerAt, setTriggerAt] = useState(() => toDateTimeLocal(Date.now() + 3600000))
  const [repeatType, setRepeatType] = useState<RepeatConfig['type'] | 'none'>('none')
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [monthDays, setMonthDays] = useState<number[]>([new Date().getDate()])
  const [datetimeError, setDatetimeError] = useState(false)
  const [pastTimeError, setPastTimeError] = useState(false)
  const [customInterval, setCustomInterval] = useState(1)
  const [customIntervalUnit, setCustomIntervalUnit] = useState<'minute' | 'hour' | 'day'>('hour')

  // Advance notice (heads-up N minutes before triggerAt) — same presets as ReminderForm
  const ADVANCE_PRESETS = [5, 15, 30, 60]
  const [advanceMode, setAdvanceMode] = useState<'none' | 'preset' | 'custom'>('none')
  const [advancePreset, setAdvancePreset] = useState(15)
  const [advanceCustom, setAdvanceCustom] = useState(10)

  const [created, setCreated] = useState(false)
  const [createdInfo, setCreatedInfo] = useState<{ title: string; triggerAt: number; note?: string; repeat?: RepeatConfig | null; advanceMinutes?: number } | null>(null)
  const [note, setNote] = useState('')

  // Live clock
  const [now, setNow] = useState(() => new Date())
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    clockRef.current = setInterval(() => setNow(new Date()), 1000)
    return () => { if (clockRef.current) clearInterval(clockRef.current) }
  }, [])

  const lang = i18n.language
  const parsed: ParsedResult | null = useMemo(() => parseQuickInput(input, lang), [input, lang])

  // The effective trigger time shown in preview / success screen:
  // for repeat reminders, normalize to the nearest future occurrence matching the rule
  const manualRepeat: RepeatConfig | null = repeatType === 'none' ? null : {
    type: repeatType,
    ...(repeatType === 'weekly' ? { weekdays: weekdays.length ? weekdays : [new Date(triggerAt).getDay()] } : {}),
    ...(repeatType === 'monthly' ? { monthDays: monthDays.length ? monthDays : [new Date(triggerAt).getDate()] } : {}),
    ...(repeatType === 'custom' ? { interval: Math.max(1, Math.min(999, customInterval)), intervalUnit: customIntervalUnit } : {}),
  }
  const manualRepeatKey = JSON.stringify(manualRepeat)
  const effectiveTriggerAt = useMemo(() => {
    const ts = new Date(triggerAt).getTime()
    if (isNaN(ts)) return ts
    const repeat = JSON.parse(manualRepeatKey) as RepeatConfig | null
    return repeat ? normalizeRepeatTrigger(repeat, ts) : ts
  }, [triggerAt, manualRepeatKey])

  // Serialize repeat config for stable dependency comparison
  const parsedRepeatKey = parsed?.confident ? JSON.stringify(parsed.repeat) : ''

  // Auto-sync datetime picker from parsed result when confident
  useEffect(() => {
    if (parsed?.confident) {
      setTriggerAt(toDateTimeLocal(parsed.triggerAt))
      setRepeatType(parsed.repeat?.type ?? 'none')
      setWeekdays(parsed.repeat?.weekdays ?? [])
      setMonthDays(parsed.repeat?.monthDays ?? [new Date(parsed.triggerAt).getDate()])
      setDatetimeError(false)
    }
  }, [parsed?.triggerAt, parsed?.confident, parsedRepeatKey])

  // The title for the reminder: parsed title if confident, otherwise raw input
  const reminderTitle = parsed?.confident ? parsed.title : input.trim()

  // Get localized weekday label
  const getWeekdayLabel = (date: Date): string => {
    const weekdaysArr = t('modules.reminder.ui.weekdays', { returnObjects: true }) as unknown as string[]
    return weekdaysArr[date.getDay()] ?? ''
  }

  // Format date with weekday
  const formatDateWithWeekday = (date: Date, withSeconds = false): string => {
    const dateStr = date.toLocaleDateString(lang, { month: 'numeric', day: 'numeric' })
    const weekday = getWeekdayLabel(date)
    const timeOptions: Intl.DateTimeFormatOptions = withSeconds
      ? { hour: '2-digit', minute: '2-digit', second: '2-digit' }
      : { hour: '2-digit', minute: '2-digit' }
    const timeStr = date.toLocaleTimeString(lang, timeOptions)
    return `${dateStr} ${weekday} ${timeStr}`
  }

  // Quick time preset: directly set the datetime picker
  const applyTimePreset = (offsetMs?: number, tomorrow9am?: boolean) => {
    let ts: number
    if (tomorrow9am) {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      d.setHours(9, 0, 0, 0)
      ts = d.getTime()
    } else {
      ts = Date.now() + (offsetMs ?? 0)
    }
    setTriggerAt(toDateTimeLocal(ts))
    setDatetimeError(false)
    setPastTimeError(false)
  }

  // ESC to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeWindow()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // Signal Rust to show the window
  useEffect(() => {
    ;(async () => {
      try {
        const { emit } = await import('@tauri-apps/api/event')
        await emit('util-window-ready', 'reminder-quick')
      } catch { /* ignore */ }
    })()
    setTimeout(() => {
      const el = document.getElementById('quick-input')
      if (el) el.focus()
    }, 100)
  }, [])

  const handleCreate = async () => {
    if (!reminderTitle) return
    const ts = new Date(triggerAt).getTime()
    if (isNaN(ts)) {
      setDatetimeError(true)
      return
    }
    // Past time is only invalid for one-shot reminders; repeat reminders
    // are normalized to the next matching occurrence inside the store.
    if (ts < Date.now() - 60000 && !manualRepeat) {
      setPastTimeError(true)
      return
    }
    const advanceMinutes =
      advanceMode === 'none' ? undefined
      : advanceMode === 'preset' ? advancePreset
      : Math.max(1, Math.min(1440, Math.round(advanceCustom) || 1))
    addReminder({
      title: reminderTitle,
      note: note.trim(),
      triggerAt: ts,
      advanceMinutes,
      repeat: manualRepeat,
    })
    try {
      const { emit } = await import('@tauri-apps/api/event')
      await emit('reminder-created')
    } catch { /* ignore */ }
    setCreatedInfo({ title: reminderTitle, triggerAt: effectiveTriggerAt, note: note.trim() || undefined, repeat: manualRepeat, advanceMinutes })
    setCreated(true)
    setTimeout(() => closeWindow(), 1000)
  }

  const minDateTime = toDateTimeLocal(Date.now())

  if (created && createdInfo) {
    const triggerDate = new Date(createdInfo.triggerAt)
    const repeatLabel = createdInfo.repeat
      ? createdInfo.repeat.type === 'daily' ? t('modules.reminder.ui.repeatDaily')
        : createdInfo.repeat.type === 'weekly' ? t('modules.reminder.ui.repeatWeekly')
        : createdInfo.repeat.type === 'monthly' ? t('modules.reminder.ui.repeatMonthly')
        : t('modules.reminder.ui.repeatCustomShort')
      : null
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-bg-base">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success"
          style={{ animation: 'dialogScaleIn 0.3s ease-out' }}
        >
          <Check size={24} />
        </div>
        <p
          className="mt-3 text-sm font-medium text-text-primary"
          style={{ animation: 'dialogFadeIn 0.4s ease-out 0.1s both' }}
        >
          {t('modules.reminder.ui.quickCreated')}
        </p>
        <p
          className="mt-1 max-w-[280px] truncate text-xs text-text-secondary"
          style={{ animation: 'dialogFadeIn 0.4s ease-out 0.15s both' }}
        >
          {createdInfo.title}
        </p>
        <p
          className="mt-0.5 text-xs text-info"
          style={{ animation: 'dialogFadeIn 0.4s ease-out 0.2s both' }}
        >
          {formatDateWithWeekday(triggerDate)}
        </p>
        {repeatLabel && (
          <span
            className="mt-1.5 inline-flex items-center gap-0.5 rounded bg-info/10 px-1.5 py-0.5 text-[9px] text-info"
            style={{ animation: 'dialogFadeIn 0.4s ease-out 0.25s both' }}
          >
            {repeatLabel}
          </span>
        )}
        {!!createdInfo.advanceMinutes && (
          <span
            className="mt-1.5 inline-flex items-center gap-0.5 rounded bg-warning/10 px-1.5 py-0.5 text-[9px] text-warning"
            style={{ animation: 'dialogFadeIn 0.4s ease-out 0.3s both' }}
          >
            {t('modules.reminder.ui.detail.advanceNotice', { n: createdInfo.advanceMinutes })}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-bg-base">
      {/* Header (draggable — pointer-events-none on children lets clicks pass through to the drag region) */}
      <div
        className="flex items-center justify-between px-4 pt-3 pb-2"
        data-tauri-drag-region
      >
        <div className="flex flex-1 items-center gap-2 pointer-events-none">
          <Zap size={14} className="text-primary" />
          <span className="text-sm font-medium text-text-primary">{t('modules.reminder.ui.quickCreate')}</span>
        </div>
        {/* Live clock with date + weekday */}
        <div className="flex items-center gap-1 mr-2 text-[10px] text-text-muted tabular-nums pointer-events-none">
          <Clock size={10} />
          <span>{formatDateWithWeekday(now, true)}</span>
        </div>
        <button
          onClick={() => closeWindow()}
          className="rounded p-1 text-text-muted hover:text-text-primary hover:bg-bg-hover cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>

      {/* Scrollable content area — keeps header & bottom buttons visible */}
      <div className="flex-1 overflow-y-auto min-h-0">

      {/* Input */}
      <div className="px-4">
        <input
          id="quick-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('modules.reminder.ui.quickPlaceholder')}
          maxLength={100}
          className="w-full rounded-md border border-border-base bg-bg-overlay px-3 py-2.5 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-border-focus transition-colors"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleCreate()
            }
          }}
        />
      </div>

      {/* Input hint when empty */}
      {!input && (
        <div className="px-4 mt-2">
          <p className="text-[10px] text-text-disabled">{t('modules.reminder.ui.quickHint')}</p>
        </div>
      )}

      {/* Parsed info badge (when confident) */}
      {parsed?.confident && (
        <div className="px-4 mt-2">
          <div className="flex items-center gap-2 rounded-md bg-success/5 border border-success/20 px-3 py-1.5">
            <Check size={11} className="text-success shrink-0" />
            <span className="text-xs text-text-primary font-medium truncate">{parsed.title}</span>
            <span className="text-[10px] text-info shrink-0">{formatDateWithWeekday(new Date(effectiveTriggerAt))}</span>
            {parsed.repeat && (
              <span className="inline-flex items-center gap-0.5 rounded bg-info/10 px-1 py-0.5 text-[9px] text-info shrink-0">
                {parsed.repeat.type === 'daily' ? t('modules.reminder.ui.repeatDaily')
                  : parsed.repeat.type === 'weekly' ? t('modules.reminder.ui.repeatWeekly')
                  : parsed.repeat.type === 'monthly' ? `${t('modules.reminder.ui.repeatMonthly')} ${(parsed.repeat.monthDays ?? (parsed.repeat.monthDay ? [parsed.repeat.monthDay] : [1])).join(t('modules.reminder.ui.weekdaySep'))}`
                  : t('modules.reminder.ui.repeatCustomShort')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Parse failed hint (informational only, no mode switch) */}
      {parsed && !parsed.confident && input.trim() && (
        <div className="px-4 mt-1">
          <p className="flex items-center gap-1.5 text-[10px] text-warning">
            <Edit3 size={10} />
            {t('modules.reminder.ui.parseFailedHint')}
          </p>
        </div>
      )}

      {/* ── When: time presets + datetime + repeat ── */}
      <div className="px-4 mt-3 pt-3 border-t border-border-subtle">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-text-muted shrink-0">{t('modules.reminder.ui.quickPresets')}:</span>
          {[
            { label: t('modules.reminder.ui.in5min'), offsetMs: 5 * 60000 },
            { label: t('modules.reminder.ui.in30min'), offsetMs: 30 * 60000 },
            { label: t('modules.reminder.ui.in1hour'), offsetMs: 60 * 60000 },
            { label: t('modules.reminder.ui.tomorrow9am'), tomorrow9am: true },
          ].map((preset) => (
            <button
              key={preset.label}
              onClick={() => applyTimePreset(preset.offsetMs, preset.tomorrow9am)}
              className="rounded-md border border-border-base bg-bg-overlay px-2 py-1 text-[10px] text-text-muted hover:text-text-primary hover:bg-bg-hover hover:border-border-focus transition-colors cursor-pointer"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Datetime picker + Repeat selector (always visible) */}
      <div className="px-4 mt-2">
        <div className="flex items-center gap-2">
          <input
            type="datetime-local"
            value={triggerAt}
            min={minDateTime}
            onChange={(e) => { setTriggerAt(e.target.value); setDatetimeError(false); setPastTimeError(false) }}
            className={`flex-1 rounded-md border bg-bg-overlay px-2 py-1.5 text-xs text-text-primary outline-none focus:border-border-focus transition-colors ${
              datetimeError ? 'border-error' : 'border-border-base'
            }`}
          />
          <select
            value={repeatType}
            onChange={(e) => {
              const newType = e.target.value as RepeatConfig['type'] | 'none'
              setRepeatType(newType)
              if (newType === 'weekly' && weekdays.length === 0) {
                setWeekdays([new Date(triggerAt).getDay()])
              }
              if (newType === 'monthly') {
                setMonthDays([new Date(triggerAt).getDate()])
              }
            }}
            className="rounded-md border border-border-base bg-bg-overlay px-2 py-1.5 text-xs text-text-primary outline-none focus:border-border-focus"
          >
            <option value="none">{t('modules.reminder.ui.noRepeat')}</option>
            <option value="daily">{t('modules.reminder.ui.repeatDaily')}</option>
            <option value="weekly">{t('modules.reminder.ui.repeatWeekly')}</option>
            <option value="monthly">{t('modules.reminder.ui.repeatMonthly')}</option>
            <option value="custom">{t('modules.reminder.ui.repeatCustomShort')}</option>
          </select>
        </div>
        {/* Weekly: weekday selector */}
        {repeatType === 'weekly' && (
          <div className="flex gap-1 flex-wrap mt-2">
            {(t('modules.reminder.ui.weekdays', { returnObjects: true }) as unknown as string[]).map((label: string, i: number) => (
              <button
                key={i}
                onClick={() => {
                  setWeekdays((prev) =>
                    prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i]
                  )
                }}
                className={`rounded-md px-2.5 py-1 text-[10px] transition-colors cursor-pointer ${
                  weekdays.includes(i)
                    ? 'bg-primary text-white'
                    : 'bg-bg-overlay text-text-muted hover:bg-bg-hover'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {/* Monthly: day-of-month grid selector (1-31 toggle buttons) */}
        {repeatType === 'monthly' && (
          <div className="mt-2">
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <button
                  key={day}
                  onClick={() => {
                    setMonthDays((prev) =>
                      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
                    )
                  }}
                  className={`rounded text-[10px] py-1 transition-colors cursor-pointer ${
                    monthDays.includes(day)
                      ? 'bg-primary text-white'
                      : 'bg-bg-overlay text-text-muted hover:bg-bg-hover'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* Custom: interval + unit selector */}
        {repeatType === 'custom' && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] text-text-muted">{t('modules.reminder.ui.every')}</span>
            <input
              type="number"
              min={1}
              max={999}
              value={customInterval}
              onChange={(e) => {
                const v = parseInt(e.target.value)
                if (isNaN(v) || v < 1) setCustomInterval(1)
                else if (v > 999) setCustomInterval(999)
                else setCustomInterval(v)
              }}
              className="w-16 rounded-md border border-border-base bg-bg-overlay px-2 py-1.5 text-xs text-text-primary outline-none focus:border-border-focus"
            />
            <select
              value={customIntervalUnit}
              onChange={(e) => setCustomIntervalUnit(e.target.value as 'minute' | 'hour' | 'day')}
              className="rounded-md border border-border-base bg-bg-overlay px-2 py-1.5 text-xs text-text-primary outline-none focus:border-border-focus"
            >
              <option value="minute">{t('modules.reminder.ui.minutes')}</option>
              <option value="hour">{t('modules.reminder.ui.hours')}</option>
              <option value="day">{t('modules.reminder.ui.days')}</option>
            </select>
          </div>
        )}
        {datetimeError && (
          <p className="text-[10px] text-error mt-1">{t('modules.reminder.ui.form.invalidDate')}</p>
        )}
        {pastTimeError && (
          <p className="text-[10px] text-error mt-1">{t('modules.reminder.ui.form.pastTimeError')}</p>
        )}

        {/* Advance notice: heads-up N minutes before the trigger time */}
        <div className="flex items-center gap-1 flex-wrap mt-2">
          <span className="text-[10px] text-text-muted shrink-0">
            {t('modules.reminder.ui.form.labelAdvance')}:
          </span>
          <button
            onClick={() => setAdvanceMode('none')}
            className={`rounded-md px-2 py-1 text-[10px] transition-colors cursor-pointer ${
              advanceMode === 'none'
                ? 'bg-primary text-white'
                : 'bg-bg-overlay text-text-muted hover:bg-bg-hover'
            }`}
          >
            {t('modules.reminder.ui.form.advanceNone')}
          </button>
          {ADVANCE_PRESETS.map((min) => (
            <button
              key={min}
              onClick={() => { setAdvanceMode('preset'); setAdvancePreset(min) }}
              className={`rounded-md px-2 py-1 text-[10px] transition-colors cursor-pointer ${
                advanceMode === 'preset' && advancePreset === min
                  ? 'bg-primary text-white'
                  : 'bg-bg-overlay text-text-muted hover:bg-bg-hover'
              }`}
            >
              {t('modules.reminder.ui.form.advanceMinutesN', { n: min })}
            </button>
          ))}
          <button
            onClick={() => setAdvanceMode('custom')}
            className={`rounded-md px-2 py-1 text-[10px] transition-colors cursor-pointer ${
              advanceMode === 'custom'
                ? 'bg-primary text-white'
                : 'bg-bg-overlay text-text-muted hover:bg-bg-hover'
            }`}
          >
            {t('modules.reminder.ui.form.advanceCustom')}
          </button>
          {advanceMode === 'custom' && (
            <span className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={1440}
                value={advanceCustom}
                onChange={(e) => {
                  const v = parseInt(e.target.value)
                  setAdvanceCustom(isNaN(v) ? 1 : Math.max(1, Math.min(1440, v)))
                }}
                className="w-14 rounded-md border border-border-base bg-bg-overlay px-1.5 py-1 text-[10px] text-text-primary outline-none focus:border-border-focus"
              />
              <span className="text-[10px] text-text-muted">{t('modules.reminder.ui.minutes')}</span>
            </span>
          )}
        </div>
      </div>

      {/* Note field */}
      <div className="px-4 mt-3 pt-3 border-t border-border-subtle">
        <div className="flex items-center gap-2 rounded-md border border-border-base bg-bg-overlay px-3 py-2">
          <FileText size={12} className="text-text-muted shrink-0" />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('modules.reminder.ui.notePlaceholder')}
            maxLength={500}
            className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-disabled outline-none"
          />
        </div>
      </div>

      </div>

      {/* Bottom buttons */}
      <div className="flex items-center justify-end gap-2 px-4 pb-4 pt-2 shrink-0">
        <button
          onClick={() => closeWindow()}
          className="rounded-md px-3 py-1.5 text-xs text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={handleCreate}
          disabled={!reminderTitle}
          className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <Plus size={12} />
          {t('modules.reminder.ui.create')}
        </button>
      </div>
    </div>
  )
}
