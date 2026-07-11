/**
 * Image Compress — Individual image card with thumbnail and info
 */
import { useTranslation } from 'react-i18next'
import { X, Download, ZoomIn } from 'lucide-react'
import { formatBytes, savingsPercent, type CompressedImage } from '../utils'

interface Props {
  img: CompressedImage
  onRemove: (id: string) => void
  onDownload: (img: CompressedImage) => void
  onPreview: (img: CompressedImage) => void
}

export function ImageCard({ img, onRemove, onDownload, onPreview }: Props) {
  const { t } = useTranslation()
  return (
    <div
      className={`group rounded-lg border border-border-subtle bg-bg-elevated overflow-hidden transition-colors ${
        img.status === 'done' ? 'cursor-pointer hover:border-primary/40' : ''
      }`}
      onClick={() => { if (img.status === 'done') onPreview(img) }}
    >
      {/* Thumbnail */}
      <div className="relative h-32 overflow-hidden bg-bg-base">
        <img
          src={img.originalUrl}
          alt={img.originalFile.name}
          className={`h-full w-full object-cover transition-transform duration-200 ${img.status === 'done' ? 'group-hover:scale-105' : ''}`}
        />
        {img.status === 'done' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
            <ZoomIn className="h-5 w-5 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100" />
          </div>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(img.id) }}
          className="absolute right-1 top-1 cursor-pointer rounded-full bg-black/60 p-1 text-white/80 opacity-0 transition-opacity hover:!opacity-100 hover:text-white group-hover:opacity-70"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="truncate text-xs font-medium text-text-primary" title={img.originalFile.name}>
          {img.originalFile.name}
        </p>

        {img.status === 'compressing' && (
          <p className="mt-1 text-xs text-text-muted animate-pulse">{t('modules.imageCompress.ui.statusCompressing')}</p>
        )}

        {img.status === 'done' && img.compressedSize !== null && (
          <div className="mt-2 flex items-center justify-between">
            <div className="text-xs">
              <span className="text-text-muted">{formatBytes(img.originalSize)}</span>
              <span className="mx-1 text-text-disabled">→</span>
              <span className="text-text-primary font-medium">{formatBytes(img.compressedSize)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">
                -{savingsPercent(img.originalSize, img.compressedSize)}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onDownload(img) }}
                className="cursor-pointer rounded-md bg-bg-hover p-1.5 text-text-secondary hover:text-text-primary"
                title={t('common.download', { defaultValue: 'Download' })}
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {img.status === 'error' && (
          <p className="mt-1 text-xs text-error">{img.error ?? t('modules.imageCompress.ui.compressFailed')}</p>
        )}
      </div>
    </div>
  )
}
