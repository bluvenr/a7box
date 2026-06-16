/**
 * JSON Formatter Status Bar
 */

import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import type { JsonStats } from '../hooks/useJsonFormat'

interface StatusBarProps {
  stats: JsonStats
  error?: string | null
  errorPosition?: { line: number; column: number } | null
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function StatusBar({ stats, error, errorPosition }: StatusBarProps) {
  return (
    <div className="flex items-center gap-4 border-t border-border-subtle bg-bg-elevated px-4 py-1.5 text-xs">
      {/* Status indicator */}
      {stats.valid ? (
        <div className="flex items-center gap-1.5 text-success">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Valid JSON</span>
        </div>
      ) : error ? (
        <div className="flex items-center gap-1.5 text-error">
          <XCircle className="h-3.5 w-3.5" />
          <span className="truncate max-w-[300px]" title={error}>
            {error}
          </span>
          {errorPosition && (
            <span className="text-text-muted">
              (Ln {errorPosition.line}, Col {errorPosition.column})
            </span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-text-muted">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Awaiting input</span>
        </div>
      )}

      <div className="flex-1" />

      {/* Statistics */}
      {stats.valid && (
        <>
          <span className="text-text-muted">
            Size: <span className="text-text-secondary">{formatBytes(stats.size)}</span>
          </span>
          <span className="text-text-muted">
            Lines: <span className="text-text-secondary">{stats.lines}</span>
          </span>
          <span className="text-text-muted">
            Depth: <span className="text-text-secondary">{stats.depth}</span>
          </span>
          <span className="text-text-muted">
            Keys: <span className="text-text-secondary">{stats.keys}</span>
          </span>
        </>
      )}
    </div>
  )
}
