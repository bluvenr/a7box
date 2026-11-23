/**
 * PDF Toolkit — Reusable page thumbnail card
 * Presentational: renders a page image with a title/subtitle footer and an
 * optional action slot (download / remove / rotate / reorder buttons).
 */

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, X, Loader2 } from 'lucide-react'

interface Props {
  url: string | null
  title: string
  subtitle?: string
  status?: 'pending' | 'rendering' | 'done' | 'error'
  error?: string
  /** Visual CSS rotation (degrees) for page-manager preview */
  rotation?: number
  /** Custom action buttons rendered in the footer */
  actions?: ReactNode
  onDownload?: () => void
  onRemove?: () => void
  onPreview?: () => void
}

export function PageThumb({
  url, title, subtitle, status, error, rotation, actions, onDownload, onRemove, onPreview,
}: Props) {
  const { t } = useTranslation()
  return (
    <div className="group overflow-hidden rounded-lg border border-border-subtle bg-bg-elevated transition-colors hover:border-primary/40">
      <div
        className={`relative flex h-40 items-center justify-center overflow-hidden bg-bg-base ${onPreview ? 'cursor-pointer' : ''}`}
        onClick={onPreview}
      >
        {url ? (
          <img
            src={url}
            alt={title}
            className="max-h-full max-w-full object-contain transition-transform duration-200"
            style={rotation ? { transform: `rotate(${rotation}deg)` } : undefined}
            draggable={false}
          />
        ) : (
          <Loader2 className="h-5 w-5 animate-spin text-text-disabled" />
        )}
        {status === 'rendering' && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-base/40">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}
        {onRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            className="absolute right-1 top-1 cursor-pointer rounded-full bg-black/60 p-1 text-white/80 opacity-0 transition-opacity hover:!opacity-100 hover:text-white group-hover:opacity-70"
            title={t('common.delete', { defaultValue: 'Delete' })}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-1 p-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-text-primary" title={title}>{title}</p>
          {subtitle && <p className="truncate text-[10px] text-text-muted">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {actions}
          {onDownload && (
            <button
              onClick={(e) => { e.stopPropagation(); onDownload() }}
              className="cursor-pointer rounded-md bg-bg-hover p-1.5 text-text-secondary hover:text-text-primary"
              title={t('common.download', { defaultValue: 'Download' })}
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {status === 'error' && error && (
        <p className="px-2 pb-2 text-[10px] text-error">{error}</p>
      )}
    </div>
  )
}