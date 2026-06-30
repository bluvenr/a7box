/**
 * A7Box Timestamp Converter Module
 * Converts between Unix timestamps and human-readable dates
 */
import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarClock, Copy, Check, RefreshCw } from 'lucide-react'

type ConvertMode = 'ts-to-date' | 'date-to-ts'

function isValidDate(d: Date): boolean {
  return !isNaN(d.getTime())
}

function parseTimestamp(input: string): Date | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed)
    if (trimmed.includes('.')) return new Date(n)
    return Math.abs(n) < 1e12 ? new Date(n * 1000) : new Date(n)
  }
  return null
}

function parseDateString(input: string): Date | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  let normalized = trimmed
  normalized = normalized.replace(/^(\d{4}-\d{2}-\d{2})[\s]+(\d)/, '$1T$2')
  normalized = normalized.replace(/\//g, '-')
  const d = new Date(normalized)
  return isValidDate(d) ? d : null
}

export default function TimestampConverter() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<ConvertMode>('ts-to-date')
  const [tsInput, setTsInput] = useState(() => String(Math.floor(Date.now() / 1000)))
  const [dateInput, setDateInput] = useState(() => new Date().toISOString().slice(0, 19))
  const [copied, setCopied] = useState<string | null>(null)

  const resultDate = useMemo(() => {
    if (mode === 'ts-to-date') return parseTimestamp(tsInput)
    return parseDateString(dateInput)
  }, [mode, tsInput, dateInput])

  const inputInvalid = useMemo(() => {
    if (mode === 'ts-to-date') return tsInput.trim() !== '' && resultDate === null
    return dateInput.trim() !== '' && resultDate === null
  }, [mode, tsInput, dateInput, resultDate])

  const DAY_NAMES = useMemo(() => [
    t('modules.timestampConverter.daySun', { defaultValue: 'Sun' }),
    t('modules.timestampConverter.dayMon', { defaultValue: 'Mon' }),
    t('modules.timestampConverter.dayTue', { defaultValue: 'Tue' }),
    t('modules.timestampConverter.dayWed', { defaultValue: 'Wed' }),
    t('modules.timestampConverter.dayThu', { defaultValue: 'Thu' }),
    t('modules.timestampConverter.dayFri', { defaultValue: 'Fri' }),
    t('modules.timestampConverter.daySat', { defaultValue: 'Sat' }),
  ], [t])

  const formats = useMemo(() => [
    { key: 'iso', label: t('modules.timestampConverter.formatIso', { defaultValue: 'ISO 8601' }), format: (d: Date) => d.toISOString() },
    { key: 'local', label: t('modules.timestampConverter.formatLocal', { defaultValue: 'Local' }), format: (d: Date) => d.toLocaleString() },
    { key: 'date', label: t('modules.timestampConverter.formatDate', { defaultValue: 'Date only' }), format: (d: Date) => d.toLocaleDateString() },
    { key: 'time', label: t('modules.timestampConverter.formatTime', { defaultValue: 'Time only' }), format: (d: Date) => d.toLocaleTimeString() },
    { key: 'rfc2822', label: 'RFC 2822', format: (d: Date) => d.toUTCString() },
    { key: 'unix_sec', label: t('modules.timestampConverter.formatUnixSec', { defaultValue: 'Unix (s)' }), format: (d: Date) => String(Math.floor(d.getTime() / 1000)) },
    { key: 'unix_ms', label: t('modules.timestampConverter.formatUnixMs', { defaultValue: 'Unix (ms)' }), format: (d: Date) => String(d.getTime()) },
    { key: 'day_of_week', label: t('modules.timestampConverter.dayOfWeek', { defaultValue: 'Day of Week' }), format: (d: Date) => DAY_NAMES[d.getDay()] },
  ], [t, DAY_NAMES])

  const copy = useCallback(async (key: string, val: string) => {
    await navigator.clipboard.writeText(val)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }, [])

  const handleNow = () => {
    const d = new Date()
    setTsInput(String(Math.floor(d.getTime() / 1000)))
    setDateInput(d.toISOString().slice(0, 19))
  }

  const inputValue = mode === 'ts-to-date' ? tsInput : dateInput
  const inputPlaceholder = mode === 'ts-to-date'
    ? '1700000000'
    : t('modules.timestampConverter.datePlaceholder', { defaultValue: '2024-01-01 12:00:00' })

  const handleInputChange = (v: string) => {
    if (mode === 'ts-to-date') {
      setTsInput(v)
    } else {
      setDateInput(v)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <CalendarClock size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            {t('modules.timestampConverter.name')}
          </h1>
          <p className="text-sm text-text-secondary">
            {t('modules.timestampConverter.description')}
          </p>
        </div>
      </div>

      {/* Mode: Segmented Control */}
      <div className="mb-5 flex overflow-hidden rounded-md border border-border-subtle w-fit">
        <button
          onClick={() => setMode('ts-to-date')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === 'ts-to-date'
              ? 'bg-primary/10 text-primary'
              : 'text-text-muted hover:bg-bg-hover'
          }`}
        >
          {t('modules.timestampConverter.modeTsToDate', { defaultValue: 'Timestamp to Date' })}
        </button>
        <button
          onClick={() => setMode('date-to-ts')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === 'date-to-ts'
              ? 'bg-primary/10 text-primary'
              : 'text-text-muted hover:bg-bg-hover'
          }`}
        >
          {t('modules.timestampConverter.modeDateToTs', { defaultValue: 'Date to Timestamp' })}
        </button>
      </div>

      {/* Input */}
      <div className="mb-5 rounded-xl border border-border-subtle bg-bg-elevated p-4">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-medium uppercase tracking-wider text-text-muted">
            {mode === 'ts-to-date'
              ? t('modules.timestampConverter.timestamp')
              : t('modules.timestampConverter.dateString')}
          </label>
          <button
            onClick={handleNow}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-text-muted transition hover:bg-bg-hover hover:text-text-primary cursor-pointer"
          >
            <RefreshCw size={11} />
            {t('modules.timestampConverter.now')}
          </button>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder={inputPlaceholder}
            className={`flex-1 rounded-lg border bg-bg-base px-3 py-2 text-sm text-text-primary outline-none transition ${
              inputInvalid ? 'border-error' : 'border-border-base focus:border-primary'
            }`}
          />
          <button
            onClick={() => copy('input', inputValue)}
            className="rounded-lg border border-border-base px-3 py-2 text-text-secondary transition hover:border-primary hover:text-primary cursor-pointer"
          >
            {copied === 'input' ? (
              <Check size={14} className="text-success" />
            ) : (
              <Copy size={14} />
            )}
          </button>
        </div>
        {inputInvalid && (
          <p className="mt-1 text-xs text-error">
            {mode === 'ts-to-date'
              ? t('modules.timestampConverter.invalidTimestamp', { defaultValue: 'Invalid timestamp' })
              : t('modules.timestampConverter.invalidDate', { defaultValue: 'Invalid date' })}
          </p>
        )}

      </div>

      {/* Result summary */}
      {resultDate && isValidDate(resultDate) && (
        <div className="mb-5 rounded-xl border border-border-subtle bg-bg-elevated p-5">
          {mode === 'ts-to-date' ? (
            <p className="text-center text-lg font-semibold text-text-primary">
              {t('modules.timestampConverter.dateSummary', {
                year: resultDate.getFullYear(),
                month: resultDate.getMonth() + 1,
                day: resultDate.getDate(),
                hour: String(resultDate.getHours()).padStart(2, '0'),
                minute: String(resultDate.getMinutes()).padStart(2, '0'),
                second: String(resultDate.getSeconds()).padStart(2, '0'),
                dayOfWeek: DAY_NAMES[resultDate.getDay()],
                defaultValue: '{{year}}/{{month}}/{{day}} {{hour}}:{{minute}}:{{second}} ({{dayOfWeek}})',
              })}
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">{t('modules.timestampConverter.formatUnixSec', { defaultValue: 'Unix (s)' })}</span>
                <code className="rounded bg-bg-base px-3 py-1.5 text-lg font-semibold text-primary">{Math.floor(resultDate.getTime() / 1000)}</code>
                <button onClick={() => copy('result_sec', String(Math.floor(resultDate.getTime() / 1000)))} className="rounded p-1.5 text-text-muted transition hover:text-primary cursor-pointer">
                  {copied === 'result_sec' ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">{t('modules.timestampConverter.formatUnixMs', { defaultValue: 'Unix (ms)' })}</span>
                <code className="rounded bg-bg-base px-3 py-1.5 text-lg font-semibold text-primary">{resultDate.getTime()}</code>
                <button onClick={() => copy('result_ms', String(resultDate.getTime()))} className="rounded p-1.5 text-text-muted transition hover:text-primary cursor-pointer">
                  {copied === 'result_ms' ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Result: All formats table */}
      <div className="rounded-xl border border-border-subtle bg-bg-elevated overflow-hidden">
        <div className="border-b border-border-subtle px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">
            {mode === 'ts-to-date'
              ? t('modules.timestampConverter.allFormats')
              : t('modules.timestampConverter.resultTimestamp', { defaultValue: 'Result Timestamp' })}
          </h3>
        </div>
        <div className="divide-y divide-border-subtle">
          {formats.map((fmt) => {
            const val = resultDate ? fmt.format(resultDate) : '—'
            return (
              <div key={fmt.key} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium text-text-secondary">{fmt.label}</span>
                <div className="flex items-center gap-2">
                  <code className="rounded bg-bg-base px-3 py-1 text-sm text-primary">
                    {val}
                  </code>
                  <button
                    onClick={() => copy(fmt.key, val)}
                    disabled={!resultDate}
                    className={`rounded p-1.5 transition cursor-pointer ${
                      resultDate ? 'text-text-muted hover:text-primary' : 'text-text-disabled cursor-not-allowed'
                    }`}
                  >
                    {copied === fmt.key ? (
                      <Check size={12} className="text-success" />
                    ) : (
                      <Copy size={12} />
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
