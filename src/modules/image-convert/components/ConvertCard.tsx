/**
 * Image Convert — Individual conversion result card
 */
import { useTranslation } from 'react-i18next'
import { X, Download, ZoomIn } from 'lucide-react'
import { formatBytes, getOriginalFormat, FORMATS, type ConvertResult } from '../utils'

interface Props {
  item: ConvertResult
  onRemove: (id: string) => void
  onDownload: (item: ConvertResult) => void
  onPreview: (item: ConvertResult) => void
}

export function ConvertCard({ item, onRemove, onDownload, onPreview }: Props) {
  const { t } = useTranslation()
  return (
    <div
      className={`group rounded-lg border border-border-subtle bg-bg-elevated overflow-hidden transition-colors ${
        item.status === 'done' ? 'cursor-pointer hover:border-primary/40' : ''
      }`}
      onClick={() => { if (item.status === 'done') onPreview(item) }}
    >
      {/* Thumbnail */}
      <div className="relative h-32 overflow-hidden bg-bg-base">
        <img
          src={item.originalUrl}
          alt={item.originalFile.name}
          className={`h-full w-full object-cover transition-transform duration-200 ${item.status === 'done' ? 'group-hover:scale-105' : ''}`}
        />
        {item.status === 'done' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
            <ZoomIn className="h-5 w-5 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100" />
          </div>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(item.id) }}
          className="absolute right-1 top-1 cursor-pointer rounded-full bg-black/60 p-1 text-white/80 opacity-0 transition-opacity hover:!opacity-100 hover:text-white group-hover:opacity-70"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="truncate text-xs font-medium text-text-primary" title={item.originalFile.name}>
          {item.originalFile.name}
        </p>

        {item.status === 'converting' && (
          <p className="mt-1 text-xs text-text-muted animate-pulse">{t('modules.imageConvert.ui.statusConverting')}</p>
        )}

        {item.status === 'done' && item.convertedSize !== null && (
          <div className="mt-2 flex items-center justify-between">
            <div className="text-xs">
              <span className="text-text-muted">{formatBytes(item.originalFile.size)}</span>
              <span className="mx-1 text-text-disabled">→</span>
              <span className="text-text-primary font-medium">{formatBytes(item.convertedSize)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="rounded bg-bg-hover px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                {getOriginalFormat(item.originalFile)}
              </span>
              <span className="text-[10px] text-text-disabled">→</span>
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {FORMATS.find(f => f.value === item.outputFormat)?.label}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onDownload(item) }}
                className="cursor-pointer rounded-md bg-bg-hover p-1.5 text-text-secondary hover:text-text-primary"
                title={t('common.download', { defaultValue: 'Download' })}
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {item.status === 'error' && (
          <p className="mt-1 text-xs text-error">{item.error ?? t('modules.imageConvert.ui.convertFailed')}</p>
        )}
      </div>
    </div>
  )
}
