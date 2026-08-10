/**
 * ReminderForm - Create/edit reminder form (inside Drawer)
 * Grouped layout: basic info, time settings, repeat rules.
 *
 * The form does NOT render its own submit button.
 * Instead, it calls `onDataChange` whenever any field changes,
 * so the parent (Drawer) can read the latest data and call `onValidate + save`.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { ReminderFormData, RepeatConfig } from './types'

interface Props {
  initial?: ReminderFormData
  onDataChange: (data: ReminderFormData) => void
}

/** Convert timestamp to date string (YYYY-MM-DD) */
function toDateStr(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Convert timestamp to time string (HH:MM) */
function toTimeStr(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Combine date + time strings to timestamp */
function combineDateTime(dateStr: string, timeStr: string): number {
  return new Date(`${dateStr}T${timeStr}`).getTime()
}

/** Get today's date string for min validation */
function todayDateStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function ReminderForm({ initial, onDataChange }: Props) {
  const { t } = useTranslation()
  const defaultTs = initial?.triggerAt ?? Date.now() + 3600000
  const [title, setTitle] = useState(initial?.title ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [dateStr, setDateStr] = useState(() => toDateStr(defaultTs))
  const [timeStr, setTimeStr] = useState(() => toTimeStr(defaultTs))
  const [hasRepeat, setHasRepeat] = useState(!!initial?.repeat)
  const [repeatType, setRepeatType] = useState<RepeatConfig['type']>(
    initial?.repeat?.type ?? 'daily'
  )
  const [weekdays, setWeekdays] = useState<number[]>(initial?.repeat?.weekdays ?? [])
  const [monthDays, setMonthDays] = useState<number[]>(initial?.repeat?.monthDays ?? (initial?.repeat?.monthDay ? [initial.repeat.monthDay] : [new Date().getDate()]))
  const [interval, setInterval] = useState(initial?.repeat?.interval ?? 1)
  const [intervalUnit, setIntervalUnit] = useState<'minute' | 'hour' | 'day'>(
    initial?.repeat?.intervalUnit ?? 'hour'
  )

  // Advance notice (heads-up N minutes before triggerAt)
  const ADVANCE_PRESETS = [5, 15, 30, 60]
  const [advanceMode, setAdvanceMode] = useState<'none' | 'preset' | 'custom'>(() => {
    const v = initial?.advanceMinutes
    if (!v) return 'none'
    return ADVANCE_PRESETS.includes(v) ? 'preset' : 'custom'
  })
  const [advancePreset, setAdvancePreset] = useState<number>(
    ADVANCE_PRESETS.includes(initial?.advanceMinutes ?? 0) ? (initial!.advanceMinutes as number) : 15
  )
  const [advanceCustom, setAdvanceCustom] = useState<number>(
    initial?.advanceMinutes && !ADVANCE_PRESETS.includes(initial.advanceMinutes)
      ? initial.advanceMinutes
      : 10
  )

  // Validation state
  const [titleError, setTitleError] = useState(false)
  const [pastTimeError, setPastTimeError] = useState(false)
  const [invalidDateError, setInvalidDateError] = useState(false)
  const [weekdaysError, setWeekdaysError] = useState(false)

  useEffect(() => {
    const el = document.getElementById('reminder-title-input')
    if (el) el.focus()
  }, [])

  const checkPastTime = useCallback((d: string, tm: string) => {
    if (!d || !tm) return false // incomplete input, not a past-time issue
    const ts = combineDateTime(d, tm)
    if (isNaN(ts)) return false  // invalid date handled separately
    return ts < Date.now() - 60000 // 1min tolerance
  }, [])

  /** Build the current form data snapshot */
  const buildData = useCallback((): ReminderFormData => {
    let repeat: RepeatConfig | null = null
    if (hasRepeat) {
      repeat = { type: repeatType }
      if (repeatType === 'weekly') repeat.weekdays = weekdays.length ? weekdays : [new Date(dateStr + 'T' + timeStr).getDay()]
      if (repeatType === 'monthly') repeat.monthDays = monthDays.length ? monthDays : [new Date(dateStr + 'T' + timeStr).getDate()]
      if (repeatType === 'custom') {
        repeat.interval = Math.max(1, Math.min(999, interval))
        repeat.intervalUnit = intervalUnit
      }
      // Preserve endDate — the form UI doesn't manage it, but silently
      // dropping it on edit would turn the reminder into a never-ending one.
      if (initial?.repeat?.endDate) repeat.endDate = initial.repeat.endDate
    }
    const triggerAt = combineDateTime(dateStr, timeStr)
    const advanceMinutes =
      advanceMode === 'none' ? undefined
      : advanceMode === 'preset' ? advancePreset
      : Math.max(1, Math.min(1440, Math.round(advanceCustom) || 1))
    return {
      title: title.trim(),
      note: note.trim(),
      triggerAt: isNaN(triggerAt) ? Date.now() + 3600000 : triggerAt, // fallback if invalid
      advanceMinutes,
      repeat,
    }
  }, [title, note, dateStr, timeStr, hasRepeat, repeatType, weekdays, monthDays, interval, intervalUnit, advanceMode, advancePreset, advanceCustom])

  // Notify parent of data changes on every input
  useEffect(() => {
    onDataChange(buildData())
  }, [buildData, onDataChange])

  const handleSubmit = () => {
    let valid = true

    // Title: required
    if (!title.trim()) {
      setTitleError(true)
      valid = false
    }

    // Date/time: must produce a valid timestamp
    const ts = combineDateTime(dateStr, timeStr)
    if (!dateStr || !timeStr || isNaN(ts)) {
      setInvalidDateError(true)
      valid = false
    } else if (!hasRepeat && checkPastTime(dateStr, timeStr)) {
      // Past time is only an error for one-shot reminders.
      // Repeat reminders normalize to the next matching occurrence on save.
      setPastTimeError(true)
      valid = false
    }

    // Weekly repeat: at least one weekday selected
    if (hasRepeat && repeatType === 'weekly' && weekdays.length === 0) {
      setWeekdaysError(true)
      valid = false
    }

    return valid
  }

  // Expose validate via ref pattern: set once, always calls latest handleSubmit
  const validateRef = useRef(handleSubmit)
  validateRef.current = handleSubmit

  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = containerRef.current
    if (el) {
      ;(el as any).__validate = () => validateRef.current()
    }
  }, [])

  const toggleWeekday = (day: number) => {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  const handleDateChange = (val: string) => {
    setDateStr(val)
    setPastTimeError(false)
    setInvalidDateError(false)
    const ts = combineDateTime(val, timeStr)
    if (!val || isNaN(ts)) {
      setInvalidDateError(true)
    } else if (!hasRepeat && checkPastTime(val, timeStr)) {
      setPastTimeError(true)
    }
  }

  const handleTimeChange = (val: string) => {
    setTimeStr(val)
    setPastTimeError(false)
    setInvalidDateError(false)
    const ts = combineDateTime(dateStr, val)
    if (!val || isNaN(ts)) {
      setInvalidDateError(true)
    } else if (!hasRepeat && checkPastTime(dateStr, val)) {
      setPastTimeError(true)
    }
  }

  const today = todayDateStr()
  // In edit mode, allow the original date even if it's in the past
  const minDate = initial ? toDateStr(initial.triggerAt) : today

  return (
    <div ref={containerRef} data-form-container className="space-y-5">
      {/* ── Basic Info ── */}
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-muted">
            {t('modules.reminder.ui.form.labelTitle')}
          </label>
          <input
            id="reminder-title-input"
            type="text"
            value={title}
            onChange={(e) => { setTitle(e.target.value); setTitleError(false) }}
            placeholder={t('modules.reminder.ui.titlePlaceholder')}
            maxLength={100}
            className={`w-full rounded-lg border bg-bg-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none transition-colors ${
              titleError ? 'border-error' : 'border-border-base focus:border-border-focus'
            }`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                // Trigger external submit
                const drawer = (containerRef.current as any)?.closest('[data-drawer-root]')
                drawer?.querySelector('[data-submit-btn]')?.click()
              }
            }}
          />
          {titleError && (
            <p className="mt-1 text-[11px] text-error">{t('modules.reminder.ui.form.titleRequired')}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-muted">
            {t('modules.reminder.ui.form.labelNote')}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('modules.reminder.ui.notePlaceholder')}
            maxLength={500}
            rows={3}
            className="w-full rounded-lg border border-border-base bg-bg-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-border-focus transition-colors resize-none"
          />
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="border-t border-border-subtle" />

      {/* ── Time Settings ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
            {t('modules.reminder.ui.triggerTime')}
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="mb-1 block text-[10px] text-text-disabled">
              {t('modules.reminder.ui.form.labelDate')}
            </label>
            <input
              type="date"
              value={dateStr}
              min={minDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className={`w-full rounded-lg border bg-bg-overlay px-2.5 py-2 text-sm text-text-primary outline-none transition-colors ${
                pastTimeError || invalidDateError ? 'border-error' : 'border-border-base focus:border-border-focus'
              }`}
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] text-text-disabled">
              {t('modules.reminder.ui.form.labelTime')}
            </label>
            <input
              type="time"
              value={timeStr}
              onChange={(e) => handleTimeChange(e.target.value)}
              className={`w-full rounded-lg border bg-bg-overlay px-2.5 py-2 text-sm text-text-primary outline-none transition-colors ${
                pastTimeError || invalidDateError ? 'border-error' : 'border-border-base focus:border-border-focus'
              }`}
            />
          </div>
        </div>

        {invalidDateError && (
          <p className="text-[11px] text-error">{t('modules.reminder.ui.form.invalidDate')}</p>
        )}
        {pastTimeError && (
          <p className="text-[11px] text-error">{t('modules.reminder.ui.form.pastTimeError')}</p>
        )}

        {/* Advance notice: heads-up N minutes before the trigger time */}
        <div>
          <label className="mb-1 block text-[10px] text-text-disabled">
            {t('modules.reminder.ui.form.labelAdvance', { defaultValue: 'Advance notice' })}
          </label>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setAdvanceMode('none')}
              className={`rounded-md px-2.5 py-1 text-[10px] transition-colors cursor-pointer ${
                advanceMode === 'none'
                  ? 'bg-primary text-white'
                  : 'bg-bg-overlay text-text-muted hover:bg-bg-hover'
              }`}
            >
              {t('modules.reminder.ui.form.advanceNone', { defaultValue: 'None' })}
            </button>
            {ADVANCE_PRESETS.map((min) => (
              <button
                key={min}
                type="button"
                onClick={() => { setAdvanceMode('preset'); setAdvancePreset(min) }}
                className={`rounded-md px-2.5 py-1 text-[10px] transition-colors cursor-pointer ${
                  advanceMode === 'preset' && advancePreset === min
                    ? 'bg-primary text-white'
                    : 'bg-bg-overlay text-text-muted hover:bg-bg-hover'
                }`}
              >
                {t('modules.reminder.ui.form.advanceMinutesN', { defaultValue: '{{n}} min before', n: min })}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAdvanceMode('custom')}
              className={`rounded-md px-2.5 py-1 text-[10px] transition-colors cursor-pointer ${
                advanceMode === 'custom'
                  ? 'bg-primary text-white'
                  : 'bg-bg-overlay text-text-muted hover:bg-bg-hover'
              }`}
            >
              {t('modules.reminder.ui.form.advanceCustom', { defaultValue: 'Custom' })}
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
                  className="w-16 rounded-lg border border-border-base bg-bg-overlay px-2 py-1 text-xs text-text-primary outline-none focus:border-border-focus"
                />
                <span className="text-[10px] text-text-muted">{t('modules.reminder.ui.minutes')}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="border-t border-border-subtle" />

      {/* ── Repeat Rules ── */}
      <div className="space-y-3">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <button
            type="button"
            role="switch"
            aria-checked={hasRepeat}
            onClick={() => setHasRepeat(!hasRepeat)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              hasRepeat ? 'bg-primary' : 'bg-border-base'
            }`}
          >
            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
              hasRepeat ? 'translate-x-4' : 'translate-x-0'
            }`} />
          </button>
          <span className="text-xs font-medium text-text-secondary">{t('modules.reminder.ui.repeat')}</span>
        </label>

        {hasRepeat && (
          <div className="space-y-3 pl-1">
            <select
              value={repeatType}
              onChange={(e) => setRepeatType(e.target.value as RepeatConfig['type'])}
              className="w-full rounded-lg border border-border-base bg-bg-overlay px-2.5 py-2 text-xs text-text-primary outline-none focus:border-border-focus"
            >
              <option value="daily">{t('modules.reminder.ui.repeatDaily')}</option>
              <option value="weekly">{t('modules.reminder.ui.repeatWeekly')}</option>
              <option value="monthly">{t('modules.reminder.ui.repeatMonthly')}</option>
              <option value="custom">{t('modules.reminder.ui.repeatCustomShort')}</option>
            </select>

            {repeatType === 'weekly' && (
              <div>
                <div className="flex gap-1 flex-wrap">
                  {(t('modules.reminder.ui.weekdays', { returnObjects: true }) as string[]).map((label: string, i: number) => (
                    <button
                      key={i}
                      onClick={() => { toggleWeekday(i); setWeekdaysError(false) }}
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
                {weekdaysError && (
                  <p className="mt-1 text-[11px] text-error">{t('modules.reminder.ui.form.weekdaysRequired')}</p>
                )}
              </div>
            )}

            {repeatType === 'monthly' && (
              <div>
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

            {repeatType === 'custom' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">{t('modules.reminder.ui.every')}</span>
                <input
                  type="number"
                  min={1}
                  value={interval}
                  onChange={(e) => {
                    const v = parseInt(e.target.value)
                    if (isNaN(v) || v < 1) setInterval(1)
                    else if (v > 999) setInterval(999)
                    else setInterval(v)
                  }}
                  className="w-16 rounded-lg border border-border-base bg-bg-overlay px-2 py-1.5 text-xs text-text-primary outline-none focus:border-border-focus"
                />
                <select
                  value={intervalUnit}
                  onChange={(e) => setIntervalUnit(e.target.value as 'minute' | 'hour' | 'day')}
                  className="rounded-lg border border-border-base bg-bg-overlay px-2 py-1.5 text-xs text-text-primary outline-none focus:border-border-focus"
                >
                  <option value="minute">{t('modules.reminder.ui.minutes')}</option>
                  <option value="hour">{t('modules.reminder.ui.hours')}</option>
                  <option value="day">{t('modules.reminder.ui.days')}</option>
                </select>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
