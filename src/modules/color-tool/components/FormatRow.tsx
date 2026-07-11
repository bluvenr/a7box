/**
 * Color Tool — FormatRow: editable + copyable color format input
 */
import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface Props {
  label: string
  value: string
  displayValue: string
  onEdit: (v: string) => void
  onBlur: () => void
  onCopy: (text: string, label: string) => void
  copied: string | null
}

export function FormatRow({ label, value, displayValue, onEdit, onBlur, onCopy, copied }: Props) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-text-secondary">{label}</label>
      <div className="flex items-center gap-2">
        <input
          value={focused ? value : displayValue}
          onChange={(e) => onEdit(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); onBlur() }}
          className="flex-1 rounded-md border border-border-base bg-bg-base px-3 py-2 font-mono text-sm text-text-primary focus:border-border-focus focus:outline-none"
        />
        <button onClick={() => onCopy(displayValue, label)} className="rounded p-1.5 text-text-muted hover:bg-bg-hover hover:text-text-primary">
          {copied === label ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
