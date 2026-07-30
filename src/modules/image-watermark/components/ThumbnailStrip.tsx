/**
 * ThumbnailStrip — Horizontal scrollable thumbnail bar for batch image navigation
 */

import { X } from 'lucide-react'
import type { WatermarkImage } from '../types'

interface ThumbnailStripProps {
  images: WatermarkImage[]
  selectedId: string | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
}

export function ThumbnailStrip({ images, selectedId, onSelect, onRemove }: ThumbnailStripProps) {
  if (images.length <= 1) return null

  return (
    <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-t border-border-subtle bg-bg-elevated/50 px-3 py-2">
      {images.map((img) => (
        <div
          key={img.id}
          className={`group relative shrink-0 cursor-pointer rounded-md border-2 transition-colors ${
            img.id === selectedId
              ? 'border-primary shadow-sm'
              : 'border-transparent hover:border-border-base'
          }`}
          onClick={() => onSelect(img.id)}
        >
          <img
            src={img.url}
            alt={img.file.name}
            className="h-12 w-12 rounded object-cover"
            draggable={false}
          />
          {/* Remove button */}
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(img.id) }}
            className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-error text-white shadow-sm group-hover:flex"
          >
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  )
}
