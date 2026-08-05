/**
 * Clipboard Manager — Search bar (shared by popup and main page).
 */
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'
import { useClipboardSearch } from '../hooks/useClipboardSearch'

export function SearchBar({ autoFocus = false }: { autoFocus?: boolean }) {
  const { t } = useTranslation()
  const { query, update } = useClipboardSearch()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  return (
    <div className="flex items-center gap-2 rounded-md border border-border-base bg-bg-overlay px-2.5 py-1.5 focus-within:border-border-focus transition-colors">
      <Search size={12} className="shrink-0 text-text-disabled" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => update(e.target.value)}
        placeholder={t('modules.clipboardManager.searchPlaceholder', {
          defaultValue: 'Search clipboard history…',
        })}
        className="min-w-0 flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-disabled outline-none"
      />
      {query && (
        <button
          onClick={() => update('')}
          className="shrink-0 rounded p-0.5 text-text-muted hover:text-text-primary cursor-pointer"
        >
          <X size={11} />
        </button>
      )}
    </div>
  )
}
