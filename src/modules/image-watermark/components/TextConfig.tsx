/**
 * TextConfig — Text watermark parameter form
 */

import { useTranslation } from 'react-i18next'
import type { TextWatermarkConfig } from '../types'
import { FONT_FAMILIES } from '../types'

interface TextConfigProps {
  config: TextWatermarkConfig
  onChange: (patch: Partial<TextWatermarkConfig>) => void
}

export function TextConfig({ config, onChange }: TextConfigProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-3">
      {/* Text content */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-text-secondary">
          {t('modules.imageWatermark.ui.textContent', { defaultValue: 'Text Content' })}
        </label>
        <input
          type="text"
          value={config.text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="A7Box"
          className="rounded-md border border-border-base bg-bg-base px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-disabled focus:border-border-focus focus:outline-none"
        />
      </div>

      {/* Font family */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-text-secondary">
          {t('modules.imageWatermark.ui.font', { defaultValue: 'Font' })}
        </label>
        <select
          value={config.fontFamily}
          onChange={(e) => onChange({ fontFamily: e.target.value })}
          className="rounded-md border border-border-base bg-bg-base px-2 py-1.5 text-xs text-text-primary focus:border-border-focus focus:outline-none cursor-pointer"
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {/* Font size */}
      <div className="flex items-center gap-2">
        <label className="w-16 shrink-0 text-xs text-text-secondary">
          {t('modules.imageWatermark.ui.fontSize', { defaultValue: 'Size' })}
        </label>
        <input
          type="range" min="12" max="200" value={config.fontSize}
          onChange={(e) => onChange({ fontSize: parseInt(e.target.value) })}
          className="flex-1"
        />
        <span className="w-10 text-right text-xs text-text-muted">{config.fontSize}px</span>
      </div>

      {/* Color */}
      <div className="flex items-center gap-2">
        <label className="w-16 shrink-0 text-xs text-text-secondary">
          {t('modules.imageWatermark.ui.color', { defaultValue: 'Color' })}
        </label>
        <input
          type="color"
          value={config.color}
          onChange={(e) => onChange({ color: e.target.value })}
          className="h-7 w-9 cursor-pointer rounded border border-border-base bg-bg-base p-0.5"
        />
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
        <span className="w-10 shrink-0 text-right text-xs text-text-muted">{config.opacity}%</span>
      </div>

      {/* Bold + Shadow toggles */}
      <div className="flex items-center gap-4">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-secondary select-none">
          <input
            type="checkbox"
            checked={config.bold}
            onChange={(e) => onChange({ bold: e.target.checked })}
            className="h-3.5 w-3.5 accent-primary"
          />
          {t('modules.imageWatermark.ui.bold', { defaultValue: 'Bold' })}
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-secondary select-none">
          <input
            type="checkbox"
            checked={config.shadow}
            onChange={(e) => onChange({ shadow: e.target.checked })}
            className="h-3.5 w-3.5 accent-primary"
          />
          {t('modules.imageWatermark.ui.shadow', { defaultValue: 'Shadow' })}
        </label>
        {config.shadow && (
          <input
            type="color"
            value={config.shadowColor}
            onChange={(e) => onChange({ shadowColor: e.target.value })}
            className="h-6 w-8 cursor-pointer rounded border border-border-base bg-bg-base p-0.5"
          />
        )}
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
