/**
 * TimestampConfig — Timestamp watermark parameter form
 */

import { useTranslation } from 'react-i18next'
import type { TimestampWatermarkConfig } from '../types'
import { TIMESTAMP_FORMATS } from '../types'
import { formatTimestamp } from '../utils/renderWatermark'

interface TimestampConfigProps {
  config: TimestampWatermarkConfig
  onChange: (patch: Partial<TimestampWatermarkConfig>) => void
}

export function TimestampConfig({ config, onChange }: TimestampConfigProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-3">
      {/* Format preset */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-text-secondary">
          {t('modules.imageWatermark.ui.timeFormat', { defaultValue: 'Format' })}
        </label>
        <select
          value={TIMESTAMP_FORMATS.some((f) => f.value === config.format) ? config.format : '__custom__'}
          onChange={(e) => {
            if (e.target.value !== '__custom__') onChange({ format: e.target.value })
          }}
          className="rounded-md border border-border-base bg-bg-base px-2 py-1.5 text-xs text-text-primary focus:border-border-focus focus:outline-none cursor-pointer"
        >
          {TIMESTAMP_FORMATS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
          {!TIMESTAMP_FORMATS.some((f) => f.value === config.format) && (
            <option value="__custom__">{config.format}</option>
          )}
        </select>
      </div>

      {/* Custom format input */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-text-secondary">
          {t('modules.imageWatermark.ui.customFormat', { defaultValue: 'Custom Pattern' })}
        </label>
        <input
          type="text"
          value={config.format}
          onChange={(e) => onChange({ format: e.target.value })}
          className="rounded-md border border-border-base bg-bg-base px-2.5 py-1.5 text-xs text-text-primary font-mono focus:border-border-focus focus:outline-none"
        />
        <span className="text-[10px] text-text-disabled">
          {t('modules.imageWatermark.ui.formatHint', { defaultValue: 'yyyy-MM-dd HH:mm:ss' })}
          {' → '}
          <span className="text-text-muted">{formatTimestamp(config.format)}</span>
        </span>
      </div>

      {/* Font size */}
      <div className="flex items-center gap-2">
        <label className="w-16 shrink-0 text-xs text-text-secondary">
          {t('modules.imageWatermark.ui.fontSize', { defaultValue: 'Size' })}
        </label>
        <input
          type="range" min="12" max="120" value={config.fontSize}
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
    </div>
  )
}
