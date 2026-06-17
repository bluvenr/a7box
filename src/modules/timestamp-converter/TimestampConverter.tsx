/**
 * A7Box Timestamp Converter Module
 * Converts between Unix timestamps and human-readable dates
 */
import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarClock, Copy, ArrowLeftRight, RefreshCw } from 'lucide-react'

const COMMON_FORMATS = [
  { key: 'iso', label: 'ISO 8601', format: (d: Date) => d.toISOString() },
  { key: 'local', label: 'Local', format: (d: Date) => d.toLocaleString() },
  { key: 'date', label: 'Date only', format: (d: Date) => d.toLocaleDateString() },
  { key: 'time', label: 'Time only', format: (d: Date) => d.toLocaleTimeString() },
  { key: 'unix_sec', label: 'Unix (s)', format: (d: Date) => String(Math.floor(d.getTime() / 1000)) },
  { key: 'unix_ms', label: 'Unix (ms)', format: (d: Date) => String(d.getTime()) },
]

function isValidDate(d: Date): boolean {
  return !isNaN(d.getTime())
}

function parseInput(input: string): Date | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  // Pure number = unix timestamp
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed)
    // seconds vs milliseconds
    return n < 1e12 ? new Date(n * 1000) : new Date(n)
  }
  // Date string
  const d = new Date(trimmed)
  return isValidDate(d) ? d : null
}

export default function TimestampConverter() {
  const { t } = useTranslation()
  const [now, setNow] = useState(new Date())
  const [tsInput, setTsInput] = useState(String(Math.floor(now.getTime() / 1000)))
  const [dateInput, setDateInput] = useState(now.toISOString().slice(0, 19))
  const [copied, setCopied] = useState<string | null>(null)

  // Parse timestamp input
  const tsDate = parseInput(tsInput)

  const copy = useCallback(async (key: string, val: string) => {
    await navigator.clipboard.writeText(val)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }, [])

  const handleNow = () => {
    const d = new Date()
    setNow(d)
    setTsInput(String(Math.floor(d.getTime() / 1000)))
    setDateInput(d.toISOString().slice(0, 19))
  }

  const handleTsChange = (v: string) => {
    setTsInput(v)
    const d = parseInput(v)
    if (d) setDateInput(d.toISOString().slice(0, 19))
  }

  const handleDateChange = (v: string) => {
    setDateInput(v)
    const d = parseInput(v)
    if (d) setTsInput(String(Math.floor(d.getTime() / 1000)))
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
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
        <button
          onClick={handleNow}
          className="flex items-center gap-2 rounded-lg bg-bg-hover px-3 py-2 text-sm text-text-secondary transition hover:bg-bg-elevated hover:text-text-primary cursor-pointer"
        >
          <RefreshCw size={14} />
          {t('modules.timestampConverter.now')}
        </button>
      </div>

      {/* Input Grid */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Timestamp Input */}
        <div className="rounded-xl border border-border-subtle bg-bg-elevated p-4">
          <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted">
            {t('modules.timestampConverter.timestamp')}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={tsInput}
              onChange={(e) => handleTsChange(e.target.value)}
              placeholder="1700000000"
              className="flex-1 rounded-lg border border-border-base bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-primary transition"
            />
            <button
              onClick={() => copy('ts', tsInput)}
              className="rounded-lg border border-border-base px-3 py-2 text-text-secondary transition hover:border-primary hover:text-primary cursor-pointer"
            >
              <Copy size={14} />
            </button>
          </div>
        </div>

        {/* Date Input */}
        <div className="rounded-xl border border-border-subtle bg-bg-elevated p-4">
          <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted">
            {t('modules.timestampConverter.dateString')}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={dateInput}
              onChange={(e) => handleDateChange(e.target.value)}
              placeholder="2024-01-01T00:00:00"
              className="flex-1 rounded-lg border border-border-base bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-primary transition"
            />
            <button
              onClick={() => copy('date', dateInput)}
              className="rounded-lg border border-border-base px-3 py-2 text-text-secondary transition hover:border-primary hover:text-primary cursor-pointer"
            >
              <Copy size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Arrow */}
      <div className="mb-4 flex justify-center">
        <ArrowLeftRight size={18} className="text-text-muted" />
      </div>

      {/* All formats table */}
      <div className="rounded-xl border border-border-subtle bg-bg-elevated overflow-hidden">
        <div className="border-b border-border-subtle px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">
            {t('modules.timestampConverter.allFormats')}
          </h3>
        </div>
        <div className="divide-y divide-border-subtle">
          {COMMON_FORMATS.map((fmt) => {
            const val = tsDate ? fmt.format(tsDate) : '—'
            return (
              <div key={fmt.key} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium text-text-secondary">{fmt.label}</span>
                <div className="flex items-center gap-2">
                  <code className="rounded bg-bg-base px-3 py-1 text-sm text-primary">
                    {val}
                  </code>
                  <button
                    onClick={() => copy(fmt.key, val)}
                    className="rounded p-1.5 text-text-muted transition hover:text-primary cursor-pointer"
                  >
                    {copied === fmt.key ? (
                      <span className="text-xs text-green-400">✓</span>
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

      {/* Additional info */}
      {tsDate && isValidDate(tsDate) && (
        <div className="mt-4 rounded-xl border border-border-subtle bg-bg-elevated p-4">
          <h3 className="mb-2 text-sm font-semibold text-text-primary">
            {t('modules.timestampConverter.details')}
          </h3>
          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            <div>
              <span className="text-text-muted">{t('modules.timestampConverter.year')}</span>
              <p className="text-text-primary">{tsDate.getFullYear()}</p>
            </div>
            <div>
              <span className="text-text-muted">{t('modules.timestampConverter.month')}</span>
              <p className="text-text-primary">{tsDate.getMonth() + 1}</p>
            </div>
            <div>
              <span className="text-text-muted">{t('modules.timestampConverter.day')}</span>
              <p className="text-text-primary">{tsDate.getDate()}</p>
            </div>
            <div>
              <span className="text-text-muted">{t('modules.timestampConverter.dayOfWeek')}</span>
              <p className="text-text-primary">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][tsDate.getDay()]}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
