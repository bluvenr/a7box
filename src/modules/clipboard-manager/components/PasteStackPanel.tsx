/**
 * Clipboard Manager — Paste Stack queue panel.
 * Queue multiple entries, reorder, then paste sequentially.
 */
import { useTranslation } from 'react-i18next'
import { ChevronUp, ChevronDown, X, Play, Trash2 } from 'lucide-react'
import { usePasteStack } from '../hooks/usePasteStack'

export function PasteStackPanel({
  onClose,
  onStatus,
}: {
  onClose?: () => void
  /** Surface run results (degraded paste etc.) via the host window's status line */
  onStatus?: (msg: string) => void
}) {
  const { t } = useTranslation()
  const { entries, ids, running, remove, move, clear, run } = usePasteStack()

  const handleRun = async () => {
    const result = await run()
    if (result.startsWith('copied:') && onStatus) {
      // Key injection unavailable: Rust only copied the first entry
      const reason = result.split(':')[1] || ''
      onStatus(
        t('modules.clipboardManager.pasteDegraded', {
          defaultValue: 'Auto-paste unavailable ({{reason}}) — copied instead',
          reason,
        })
      )
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium text-text-primary">
          {t('modules.clipboardManager.pasteStack', { defaultValue: 'Paste Stack' })}
          <span className="ml-1.5 text-text-disabled">({ids.length})</span>
        </span>
        <div className="flex items-center gap-0.5">
          {ids.length > 0 && (
            <button
              onClick={clear}
              title={t('modules.clipboardManager.clearStack', { defaultValue: 'Clear queue' })}
              className="rounded p-1 text-text-muted hover:text-error hover:bg-bg-hover cursor-pointer"
            >
              <Trash2 size={12} />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="rounded p-1 text-text-muted hover:text-text-primary hover:bg-bg-hover cursor-pointer"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {ids.length === 0 ? (
          <p className="px-2 py-6 text-center text-[10px] text-text-disabled">
            {t('modules.clipboardManager.stackEmpty', {
              defaultValue: 'Add entries from the list, then paste them sequentially.',
            })}
          </p>
        ) : (
          ids.map((id, i) => {
            const entry = entries.find((e) => e.id === id)
            return (
              <div
                key={id}
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-bg-hover/50"
              >
                <span className="w-4 shrink-0 text-right font-mono text-[9px] text-text-disabled">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-text-primary">
                  {entry ? entry.preview || `[${entry.clipType}]` : '…'}
                </span>
                <button
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                  className="rounded p-0.5 text-text-muted hover:text-text-primary disabled:opacity-30 cursor-pointer"
                >
                  <ChevronUp size={11} />
                </button>
                <button
                  disabled={i === ids.length - 1}
                  onClick={() => move(i, i + 1)}
                  className="rounded p-0.5 text-text-muted hover:text-text-primary disabled:opacity-30 cursor-pointer"
                >
                  <ChevronDown size={11} />
                </button>
                <button
                  onClick={() => remove(id)}
                  className="rounded p-0.5 text-text-muted hover:text-error cursor-pointer"
                >
                  <X size={11} />
                </button>
              </div>
            )
          })
        )}
      </div>

      <div className="border-t border-border-subtle p-2">
        <button
          disabled={ids.length === 0 || running}
          onClick={() => void handleRun()}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <Play size={12} />
          {running
            ? t('modules.clipboardManager.stackRunning', { defaultValue: 'Pasting…' })
            : t('modules.clipboardManager.startStack', { defaultValue: 'Start pasting' })}
        </button>
      </div>
    </div>
  )
}
