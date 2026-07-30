/**
 * PositionGrid — 9-grid position picker component
 */

import { useTranslation } from 'react-i18next'
import type { GridPosition } from '../types'

const GRID_POSITIONS: GridPosition[] = [
  'top-left', 'top-center', 'top-right',
  'center-left', 'center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right',
]

interface PositionGridProps {
  value: GridPosition
  onChange: (pos: GridPosition) => void
}

export function PositionGrid({ value, onChange }: PositionGridProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-text-secondary">
        {t('modules.imageWatermark.ui.position', { defaultValue: 'Position' })}
      </label>
      <div className="grid w-fit grid-cols-3 gap-1 rounded-lg border border-border-subtle bg-bg-base p-1.5">
        {GRID_POSITIONS.map((pos) => (
          <button
            key={pos}
            onClick={() => onChange(pos)}
            className={`h-6 w-6 cursor-pointer rounded transition-colors ${
              value === pos
                ? 'bg-primary text-white shadow-sm'
                : 'bg-bg-elevated text-text-muted hover:bg-bg-hover hover:text-text-secondary'
            }`}
            title={pos}
          >
            <span className="block h-1.5 w-1.5 mx-auto rounded-full bg-current" />
          </button>
        ))}
      </div>
    </div>
  )
}
