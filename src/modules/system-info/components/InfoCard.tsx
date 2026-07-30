/**
 * System Info — Reusable dashboard card with key-value rows
 */
import { useState, useEffect, useRef, type ReactNode } from 'react'
import { Copy, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export interface InfoRow {
  label: string
  value: string
  /** Show progress bar (0–100) */
  progress?: number
  /** Progress bar color class */
  progressColor?: string
}

interface InfoCardProps {
  title: string
  icon: ReactNode
  rows: InfoRow[]
  loading?: boolean
}

export function InfoCard({ title, icon, rows, loading }: InfoCardProps) {
  const { t } = useTranslation()
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear pending timer on unmount to avoid setState after unmount
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(key)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopiedKey(null), 1500)
    } catch { /* clipboard unavailable — ignore */ }
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-elevated p-4 transition-colors hover:border-border-base">
      {/* Card header */}
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      </div>

      {/* Rows */}
      {loading ? (
        <div className="space-y-2.5 py-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="h-3.5 w-20 animate-pulse rounded bg-bg-hover" />
              <div className="h-3.5 w-32 animate-pulse rounded bg-bg-hover" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.label}>
              <div className="group flex items-center justify-between gap-3 rounded-md px-1.5 py-1 transition-colors hover:bg-bg-hover">
                <span className="shrink-0 text-xs text-text-muted">{row.label}</span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-mono text-xs text-text-secondary" title={row.value}>
                    {row.value || t('modules.systemInfo.ui.unavailable', { defaultValue: 'N/A' })}
                  </span>
                  <button
                    onClick={() => row.value && copy(row.label, row.value)}
                    disabled={!row.value}
                    className={`shrink-0 rounded p-0.5 transition-all ${
                      row.value
                        ? 'text-text-muted opacity-0 hover:text-text-primary group-hover:opacity-100 cursor-pointer'
                        : 'invisible'
                    }`}
                    title={t('common.copy')}
                  >
                    {copiedKey === row.label ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                  </button>
                </span>
              </div>
              {/* Progress bar */}
              {row.progress !== undefined && (
                <div className="mx-1.5 mt-1 mb-0.5 h-1.5 overflow-hidden rounded-full bg-bg-hover">
                  <div
                    className={`h-full rounded-full transition-all ${row.progressColor ?? 'bg-primary'}`}
                    style={{ width: `${Math.min(100, Math.max(0, row.progress))}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
