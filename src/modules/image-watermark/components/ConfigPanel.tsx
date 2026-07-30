/**
 * ConfigPanel — Right-side watermark configuration panel
 * Contains type tabs, layout mode switch, type-specific params, and output settings.
 */

import { useTranslation } from 'react-i18next'
import { Type, Image, Clock } from 'lucide-react'
import type { WatermarkConfig, WatermarkType, LayoutMode, GridPosition, OutputFormat } from '../types'
import { TextConfig } from './TextConfig'
import { ImageConfig } from './ImageConfig'
import { TimestampConfig } from './TimestampConfig'
import { PositionGrid } from './PositionGrid'

interface ConfigPanelProps {
  config: WatermarkConfig
  onPatch: (patch: Partial<WatermarkConfig>) => void
}

const TYPE_TABS: { id: WatermarkType; icon: typeof Type; labelKey: string; defaultLabel: string }[] = [
  { id: 'text', icon: Type, labelKey: 'modules.imageWatermark.ui.tabText', defaultLabel: 'Text' },
  { id: 'image', icon: Image, labelKey: 'modules.imageWatermark.ui.tabImage', defaultLabel: 'Image' },
  { id: 'timestamp', icon: Clock, labelKey: 'modules.imageWatermark.ui.tabTimestamp', defaultLabel: 'Timestamp' },
]

const OUTPUT_FORMATS: { value: OutputFormat; label: string }[] = [
  { value: 'original', label: 'Original' },
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
]

export function ConfigPanel({ config, onPatch }: ConfigPanelProps) {
  const { t } = useTranslation()

  const patchText = (patch: Partial<WatermarkConfig['text']>) =>
    onPatch({ text: { ...config.text, ...patch } })
  const patchImage = (patch: Partial<WatermarkConfig['image']>) =>
    onPatch({ image: { ...config.image, ...patch } })
  const patchTimestamp = (patch: Partial<WatermarkConfig['timestamp']>) =>
    onPatch({ timestamp: { ...config.timestamp, ...patch } })
  const patchLayout = (patch: Partial<WatermarkConfig['layout']>) =>
    onPatch({ layout: { ...config.layout, ...patch } })
  const patchOutput = (patch: Partial<WatermarkConfig['output']>) =>
    onPatch({ output: { ...config.output, ...patch } })

  return (
    <div className="flex h-full flex-col overflow-y-auto border-l border-border-subtle bg-bg-elevated/50">
      {/* Type tabs */}
      <div className="flex shrink-0 border-b border-border-subtle">
        {TYPE_TABS.map(({ id, icon: Icon, labelKey, defaultLabel }) => (
          <button
            key={id}
            onClick={() => onPatch({ type: id })}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 px-2 py-2.5 text-xs font-medium transition-colors ${
              config.type === id
                ? 'border-b-2 border-primary text-primary bg-primary/5'
                : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover/50'
            }`}
          >
            <Icon size={14} />
            {t(labelKey, { defaultValue: defaultLabel })}
          </button>
        ))}
      </div>

      {/* Scrollable config area */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Type-specific config */}
        <section className="mb-5">
          {config.type === 'text' && <TextConfig config={config.text} onChange={patchText} />}
          {config.type === 'image' && <ImageConfig config={config.image} onChange={patchImage} />}
          {config.type === 'timestamp' && <TimestampConfig config={config.timestamp} onChange={patchTimestamp} />}
        </section>

        {/* Divider */}
        <div className="mb-4 border-t border-border-subtle" />

        {/* Layout mode */}
        <section className="mb-4">
          <label className="mb-2 block text-xs font-medium text-text-secondary">
            {t('modules.imageWatermark.ui.layoutMode', { defaultValue: 'Layout Mode' })}
          </label>
          <div className="flex rounded-lg border border-border-subtle bg-bg-base p-0.5">
            {(['single', 'tile'] as LayoutMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => patchLayout({ mode })}
                className={`flex-1 cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  config.layout.mode === mode
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {mode === 'single'
                  ? t('modules.imageWatermark.ui.modeSingle', { defaultValue: 'Single' })
                  : t('modules.imageWatermark.ui.modeTile', { defaultValue: 'Tile' })}
              </button>
            ))}
          </div>
        </section>

        {/* Position (single mode) */}
        {config.layout.mode === 'single' && (
          <section className="mb-4">
            <PositionGrid
              value={config.layout.position}
              onChange={(pos: GridPosition) => patchLayout({ position: pos, customX: null, customY: null })}
            />
            {/* Margin */}
            <div className="mt-3 flex items-center gap-2">
              <label className="w-16 shrink-0 text-xs text-text-secondary">
                {t('modules.imageWatermark.ui.margin', { defaultValue: 'Margin' })}
              </label>
              <input
                type="range" min="0" max="200" value={config.layout.margin}
                onChange={(e) => patchLayout({ margin: parseInt(e.target.value) })}
                className="flex-1"
              />
              <span className="w-10 text-right text-xs text-text-muted">{config.layout.margin}px</span>
            </div>
          </section>
        )}

        {/* Tile settings */}
        {config.layout.mode === 'tile' && (
          <section className="mb-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <label className="w-16 shrink-0 text-xs text-text-secondary">
                {t('modules.imageWatermark.ui.gapX', { defaultValue: 'Gap X' })}
              </label>
              <input
                type="range" min="50" max="600" value={config.layout.tileGapX}
                onChange={(e) => patchLayout({ tileGapX: parseInt(e.target.value) })}
                className="flex-1"
              />
              <span className="w-10 text-right text-xs text-text-muted">{config.layout.tileGapX}px</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="w-16 shrink-0 text-xs text-text-secondary">
                {t('modules.imageWatermark.ui.gapY', { defaultValue: 'Gap Y' })}
              </label>
              <input
                type="range" min="50" max="600" value={config.layout.tileGapY}
                onChange={(e) => patchLayout({ tileGapY: parseInt(e.target.value) })}
                className="flex-1"
              />
              <span className="w-10 text-right text-xs text-text-muted">{config.layout.tileGapY}px</span>
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-secondary select-none">
              <input
                type="checkbox"
                checked={config.layout.tileStagger}
                onChange={(e) => patchLayout({ tileStagger: e.target.checked })}
                className="h-3.5 w-3.5 accent-primary"
              />
              {t('modules.imageWatermark.ui.stagger', { defaultValue: 'Stagger rows' })}
            </label>
          </section>
        )}

        {/* Divider */}
        <div className="mb-4 border-t border-border-subtle" />

        {/* Output settings */}
        <section>
          <label className="mb-2 block text-xs font-medium text-text-secondary">
            {t('modules.imageWatermark.ui.outputSettings', { defaultValue: 'Output' })}
          </label>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <label className="w-16 shrink-0 text-xs text-text-secondary">
                {t('modules.imageWatermark.ui.outputFormat', { defaultValue: 'Format' })}
              </label>
              <select
                value={config.output.format}
                onChange={(e) => patchOutput({ format: e.target.value as OutputFormat })}
                className="rounded-md border border-border-base bg-bg-base px-2 py-1 text-xs text-text-primary focus:border-border-focus focus:outline-none cursor-pointer"
              >
                {OUTPUT_FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            {(config.output.format === 'jpeg' || config.output.format === 'webp') && (
              <div className="flex items-center gap-2">
                <label className="w-16 shrink-0 text-xs text-text-secondary">
                  {t('modules.imageWatermark.ui.quality', { defaultValue: 'Quality' })}
                </label>
                <input
                  type="range" min="10" max="100" value={config.output.quality}
                  onChange={(e) => patchOutput({ quality: parseInt(e.target.value) })}
                  className="flex-1"
                />
                <span className="w-10 text-right text-xs text-text-muted">{config.output.quality}%</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="w-16 shrink-0 text-xs text-text-secondary">
                {t('modules.imageWatermark.ui.suffix', { defaultValue: 'Suffix' })}
              </label>
              <input
                type="text"
                value={config.output.suffix}
                onChange={(e) => patchOutput({ suffix: e.target.value })}
                className="w-32 rounded-md border border-border-base bg-bg-base px-2 py-1 text-xs text-text-primary font-mono focus:border-border-focus focus:outline-none"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
