/**
 * JSON Formatter Toolbar
 */

import { Sparkles, Minimize2, Copy, Trash2, FileDown, History, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
  onFoldAll: () => void
  onUnfoldAll: () => void
  isCompressed: boolean
  isAllFolded: boolean
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
  onFoldAll,
  onUnfoldAll,
  isCompressed,
  isAllFolded,
  hasContent,
  isValid,
}: ToolbarProps) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2 border-b border-border-subtle bg-bg-elevated px-4 py-2">
      {/* Format button */}
      <button
        onClick={onFormat}
        disabled={!hasContent}
        className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Sparkles className="h-4 w-4" />
        <span>{t('common.format')}</span>
      </button>

      {/* Compress button */}
      <button
        onClick={onCompress}
        disabled={!hasContent}
        className="flex items-center gap-1.5 rounded-md bg-bg-hover px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover/80 hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Minimize2 className="h-4 w-4" />
        <span>{t('common.compress')}</span>
      </button>

      {/* Indent selector */}
      <select
        value={indent}
        onChange={(e) => onIndentChange(e.target.value as IndentType)}
        className="rounded-md border border-border-base bg-bg-base px-2 py-1.5 text-xs text-text-secondary focus:border-border-focus focus:outline-none"
      >
        <option value="2spaces">{t('modules.jsonFormatter.ui.indent2Spaces')}</option>
        <option value="4spaces">{t('modules.jsonFormatter.ui.indent4Spaces')}</option>
        <option value="tab">{t('modules.jsonFormatter.ui.indentTab')}</option>
      </select>

      <div className="h-5 w-px bg-border-base" />

      {/* Copy button */}
      <button
        onClick={onCopy}
        disabled={!hasContent || !isValid}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
        title={t('modules.jsonFormatter.ui.copyTooltip')}
      >
        <Copy className="h-4 w-4" />
        <span className="hidden sm:inline">{t('modules.jsonFormatter.ui.copyBtn')}</span>
      </button>

      {/* Export button */}
      <button
        onClick={onExport}
        disabled={!hasContent || !isValid}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
        title={t('modules.jsonFormatter.ui.exportTooltip')}
      >
        <FileDown className="h-4 w-4" />
        <span className="hidden sm:inline">{t('modules.jsonFormatter.ui.exportBtn')}</span>
      </button>

      {/* History button */}
      <button
        onClick={onHistory}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
        title={t('modules.jsonFormatter.ui.historyTooltip')}
      >
        <History className="h-4 w-4" />
        <span className="hidden sm:inline">{t('modules.jsonFormatter.ui.historyBtn')}</span>
      </button>

      <div className="flex-1" />

      {/* Fold/Unfold toggle — hidden in compress mode */}
      {!isCompressed && hasContent && (
        <button
          onClick={isAllFolded ? onUnfoldAll : onFoldAll}
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
          title={isAllFolded
            ? t('modules.jsonFormatter.ui.unfoldAll', { defaultValue: '全部展开' })
            : t('modules.jsonFormatter.ui.foldAll', { defaultValue: '全部折叠' })}
        >
          {isAllFolded ? <ChevronsUpDown className="h-3.5 w-3.5" /> : <ChevronsDownUp className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">
            {isAllFolded
              ? t('modules.jsonFormatter.ui.unfoldAll', { defaultValue: '展开' })
              : t('modules.jsonFormatter.ui.foldAll', { defaultValue: '折叠' })}
          </span>
        </button>
      )}

      <div className="h-5 w-px bg-border-base" />

      {/* Clear button */}
      <button
        onClick={onClear}
        disabled={!hasContent}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-muted transition-colors hover:bg-bg-hover hover:text-error disabled:opacity-40 disabled:cursor-not-allowed"
        title={t('modules.jsonFormatter.ui.clearTooltip')}
      >
        <Trash2 className="h-4 w-4" />
        <span className="hidden sm:inline">{t('modules.jsonFormatter.ui.clearBtn')}</span>
      </button>
    </div>
  )
}
