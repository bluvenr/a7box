/**
 * JSON Formatter Toolbar
 */

import { Sparkles, Minimize2, Copy, Trash2, FileDown, History } from 'lucide-react'
import type { IndentType } from '../hooks/useJsonFormat'

interface ToolbarProps {
  indent: IndentType
  onIndentChange: (indent: IndentType) => void
  onFormat: () => void
  onCompress: () => void
  onCopy: () => void
  onClear: () => void
  onExport: () => void
  onHistory: () => void
  hasContent: boolean
  isValid: boolean
}

export function Toolbar({
  indent,
  onIndentChange,
  onFormat,
  onCompress,
  onCopy,
  onClear,
  onExport,
  onHistory,
  hasContent,
  isValid,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-b border-border-subtle bg-bg-elevated px-4 py-2">
      {/* Format button */}
      <button
        onClick={onFormat}
        disabled={!hasContent}
        className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Sparkles className="h-4 w-4" />
        <span>Format</span>
      </button>

      {/* Compress button */}
      <button
        onClick={onCompress}
        disabled={!hasContent}
        className="flex items-center gap-1.5 rounded-md bg-bg-hover px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover/80 hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Minimize2 className="h-4 w-4" />
        <span>Compress</span>
      </button>

      {/* Indent selector */}
      <select
        value={indent}
        onChange={(e) => onIndentChange(e.target.value as IndentType)}
        className="rounded-md border border-border-base bg-bg-base px-2 py-1.5 text-xs text-text-secondary focus:border-border-focus focus:outline-none"
      >
        <option value="2spaces">2 Spaces</option>
        <option value="4spaces">4 Spaces</option>
        <option value="tab">Tab</option>
      </select>

      <div className="h-5 w-px bg-border-base" />

      {/* Copy button */}
      <button
        onClick={onCopy}
        disabled={!hasContent || !isValid}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
        title="Copy to clipboard"
      >
        <Copy className="h-4 w-4" />
      </button>

      {/* Export button */}
      <button
        onClick={onExport}
        disabled={!hasContent || !isValid}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
        title="Export as file"
      >
        <FileDown className="h-4 w-4" />
      </button>

      {/* History button */}
      <button
        onClick={onHistory}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
        title="History"
      >
        <History className="h-4 w-4" />
      </button>

      <div className="flex-1" />

      {/* Clear button */}
      <button
        onClick={onClear}
        disabled={!hasContent}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-muted transition-colors hover:bg-bg-hover hover:text-error disabled:opacity-40 disabled:cursor-not-allowed"
        title="Clear"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}
