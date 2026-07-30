/**
 * ImageConfig — Image/Logo watermark parameter form
 */

import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, X } from 'lucide-react'
import type { ImageWatermarkConfig } from '../types'

interface ImageConfigProps {
  config: ImageWatermarkConfig
  onChange: (patch: Partial<ImageWatermarkConfig>) => void
}

export function ImageConfig({ config, onChange }: ImageConfigProps) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    e.target.value = ''

    // Revoke old URL
    if (config.logoUrl) URL.revokeObjectURL(config.logoUrl)
    if (config.logoBitmap) config.logoBitmap.close()

    const url = URL.createObjectURL(file)
    const bitmap = await createImageBitmap(file)
    onChange({ logoUrl: url, logoBitmap: bitmap })
  }

  const removeLogo = () => {
    if (config.logoUrl) URL.revokeObjectURL(config.logoUrl)
    if (config.logoBitmap) config.logoBitmap.close()
    onChange({ logoUrl: null, logoBitmap: null })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Logo upload */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-text-secondary">
          {t('modules.imageWatermark.ui.logoImage', { defaultValue: 'Logo Image' })}
        </label>
        {config.logoUrl ? (
          <div className="flex items-center gap-3 rounded-md border border-border-subtle bg-bg-base p-2">
            <img
              src={config.logoUrl}
              alt="logo"
              className="h-10 w-10 rounded object-contain bg-[repeating-conic-gradient(#80808020_0%_25%,transparent_0%_50%)] bg-[length:8px_8px]"
            />
            <span className="flex-1 truncate text-xs text-text-muted">
              {t('modules.imageWatermark.ui.logoLoaded', { defaultValue: 'Logo loaded' })}
            </span>
            <button
              onClick={removeLogo}
              className="cursor-pointer rounded p-1 text-text-muted hover:bg-bg-hover hover:text-error"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border-base bg-bg-base px-3 py-2.5 text-xs text-text-muted transition-colors hover:border-border-focus hover:text-text-secondary"
          >
            <Upload size={14} />
            {t('modules.imageWatermark.ui.uploadLogo', { defaultValue: 'Upload Logo (PNG/SVG)' })}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
      </div>

      {/* Scale */}
      <div className="flex items-center gap-2">
        <label className="w-16 shrink-0 text-xs text-text-secondary">
          {t('modules.imageWatermark.ui.scale', { defaultValue: 'Scale' })}
        </label>
        <input
          type="range" min="1" max="100" value={config.scale}
          onChange={(e) => onChange({ scale: parseInt(e.target.value) })}
          className="flex-1"
        />
        <span className="w-10 text-right text-xs text-text-muted">{config.scale}%</span>
      </div>

      {/* Opacity */}
      <div className="flex items-center gap-2">
        <label className="w-16 shrink-0 text-xs text-text-secondary">
          {t('modules.imageWatermark.ui.opacity', { defaultValue: 'Opacity' })}
        </label>
        <input
          type="range" min="5" max="100" value={config.opacity}
          onChange={(e) => onChange({ opacity: parseInt(e.target.value) })}
          className="flex-1"
        />
        <span className="w-10 text-right text-xs text-text-muted">{config.opacity}%</span>
      </div>

      {/* Rotation */}
      <div className="flex items-center gap-2">
        <label className="w-16 shrink-0 text-xs text-text-secondary">
          {t('modules.imageWatermark.ui.rotation', { defaultValue: 'Rotation' })}
        </label>
        <input
          type="range" min="-180" max="180" value={config.rotation}
          onChange={(e) => onChange({ rotation: parseInt(e.target.value) })}
          className="flex-1"
        />
        <span className="w-10 text-right text-xs text-text-muted">{config.rotation}°</span>
      </div>
    </div>
  )
}
