/**
 * Color Tool — Contrast check cards (WCAG AA/AAA)
 */
import { hexToRgb, normalizeHex } from '../utils'

export function ContrastCard({ label, color, bgColor, ratio }: { label: string; color: string; bgColor: string; ratio: number }) {
  const passAAA = ratio >= 7
  const passAA = ratio >= 4.5
  const passAALarge = ratio >= 3
  const labelColor = bgColor === '#FFFFFF' ? '#444' : '#ccc'
  const ratioColor = bgColor === '#FFFFFF' ? '#888' : '#999'
  return (
    <div className="rounded-lg p-3" style={{ backgroundColor: bgColor }}>
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 shrink-0 rounded border border-black/10" style={{ backgroundColor: color }} />
        <p className="text-sm font-medium" style={{ color: labelColor }}>{label}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-mono" style={{ color: ratioColor }}>{ratio.toFixed(2)}:1</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${passAAA ? 'bg-green-500/20 text-green-500' : passAA ? 'bg-green-500/15 text-green-400' : passAALarge ? 'bg-yellow-500/20 text-yellow-500' : 'bg-red-500/20 text-red-400'}`}>
          {passAAA ? 'AAA' : passAA ? 'AA' : passAALarge ? 'AA Large' : 'Fail'}
        </span>
      </div>
    </div>
  )
}

export function CustomContrastCard({ fgHex, bgHex, ratio }: { fgHex: string; bgHex: string; ratio: number }) {
  const passAAA = ratio >= 7
  const passAA = ratio >= 4.5
  const passAALarge = ratio >= 3
  const bg = hexToRgb(normalizeHex(bgHex))
  const isDark = bg ? (bg.r * 0.299 + bg.g * 0.587 + bg.b * 0.114) < 128 : false
  const ratioColor = isDark ? '#999' : '#888'
  return (
    <div className="rounded-lg p-3" style={{ backgroundColor: bgHex }}>
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 shrink-0 rounded border border-black/10" style={{ backgroundColor: fgHex }} />
        <p className="text-sm font-medium" style={{ color: fgHex }}>Aa Bb Cc 123</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-mono" style={{ color: ratioColor }}>{ratio.toFixed(2)}:1</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${passAAA ? 'bg-green-500/20 text-green-500' : passAA ? 'bg-green-500/15 text-green-400' : passAALarge ? 'bg-yellow-500/20 text-yellow-500' : 'bg-red-500/20 text-red-400'}`}>
          {passAAA ? 'AAA' : passAA ? 'AA' : passAALarge ? 'AA Large' : 'Fail'}
        </span>
      </div>
    </div>
  )
}
