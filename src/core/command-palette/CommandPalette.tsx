/**
 * A7Box Command Palette UI Component (v2 - enhanced)
 */

import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Search, Box, Keyboard } from 'lucide-react'
import { useCommandPalette } from './useCommandPalette'
import type { CommandSearchItem } from '../types'
import type { LucideIcon } from 'lucide-react'

export function CommandPalette() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  const {
    isOpen,
    query,
    results,
    selectedIndex,
    close,
    setQuery,
    moveUp,
    moveDown,
    execute,
  } = useCommandPalette()

  // Category filter state
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  // Auto-focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setActiveCategory(null)
    }
  }, [isOpen])

  // Extract unique module names from results for category filtering
  const moduleNames = useMemo(() => {
    const names = new Set<string>()
    results.forEach((item) => names.add(item.moduleName))
    return Array.from(names)
  }, [results])

  // Filter by active category
  const filteredResults = useMemo(() => {
    if (!activeCategory) return results
    return results.filter((item) => item.moduleName === activeCategory)
  }, [results, activeCategory])

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          moveUp()
          break
        case 'ArrowDown':
          e.preventDefault()
          moveDown()
          break
        case 'Enter':
          e.preventDefault()
          execute({ navigate })
          break
        case 'Escape':
          e.preventDefault()
          close()
          break
        case 'Tab':
          e.preventDefault()
          // Cycle through categories
          if (!query) {
            const idx = activeCategory ? moduleNames.indexOf(activeCategory) : -1
            const nextIdx = (idx + 1) % (moduleNames.length + 1)
            setActiveCategory(nextIdx === moduleNames.length ? null : moduleNames[nextIdx])
          }
          break
      }
    },
    [moveUp, moveDown, execute, close, navigate, query, activeCategory, moduleNames]
  )

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      close()
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh]"
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border-base bg-bg-elevated shadow-2xl"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-border-subtle px-4">
          <Search className="h-5 w-5 text-text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveCategory(null) }}
            placeholder={t('commandPalette.placeholder')}
            className="flex-1 bg-transparent py-4 text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
          <kbd className="rounded bg-bg-hover px-2 py-0.5 text-xs text-text-muted">
            ESC
          </kbd>
        </div>

        {/* Category filter pills (only when no query) */}
        {!query && moduleNames.length > 1 && (
          <div className="flex flex-wrap gap-1.5 border-b border-border-subtle px-4 py-2">
            <button
              onClick={() => setActiveCategory(null)}
              className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                !activeCategory
                  ? 'bg-primary/15 text-primary font-medium'
                  : 'bg-bg-hover text-text-muted hover:text-text-secondary'
              }`}
            >
              {t('commandPalette.allCommands')}
            </button>
            {moduleNames.slice(0, 8).map((name) => (
              <button
                key={name}
                onClick={() => setActiveCategory(name === activeCategory ? null : name)}
                className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                  name === activeCategory
                    ? 'bg-primary/15 text-primary font-medium'
                    : 'bg-bg-hover text-text-muted hover:text-text-secondary'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {/* Results list */}
        <div className="max-h-72 overflow-y-auto p-2">
          {filteredResults.length > 0 ? (
            <>
              <div className="px-2 py-1">
                <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                  {activeCategory || (query ? t('commandPalette.allCommands') : t('commandPalette.recentlyUsed'))}
                </span>
                <span className="ml-2 text-xs text-text-muted">
                  {filteredResults.length}
                </span>
              </div>

              {filteredResults.map((item, index) => (
                <CommandItem
                  key={item.id}
                  item={item}
                  isSelected={index === selectedIndex}
                  onClick={() => execute({ navigate })}
                  onMouseEnter={() => useCommandPalette.setState({ selectedIndex: index })}
                />
              ))}
            </>
          ) : (
            <div className="py-8 text-center">
              <Box className="mx-auto mb-2 h-8 w-8 text-text-muted" />
              <p className="text-sm text-text-muted">
                {t('commandPalette.noResults')}
              </p>
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between border-t border-border-subtle px-4 py-2">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <kbd className="rounded bg-bg-hover px-1.5 py-0.5">↑↓</kbd>
            <span>Navigate</span>
            <kbd className="ml-2 rounded bg-bg-hover px-1.5 py-0.5">↵</kbd>
            <span>{t('commandPalette.pressEnter')}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <Keyboard className="h-3 w-3" />
            <kbd className="rounded bg-bg-hover px-1.5 py-0.5">Ctrl+K</kbd>
          </div>
        </div>
      </div>
    </div>
  )
}

// Command item component
function CommandItem({
  item,
  isSelected,
  onClick,
  onMouseEnter,
}: {
  item: CommandSearchItem
  isSelected: boolean
  onClick: () => void
  onMouseEnter: () => void
}) {
  const Icon = typeof item.icon === 'string' ? Box : (item.icon as LucideIcon) || Box

  return (
    <button
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
        isSelected
          ? 'bg-bg-hover text-text-primary'
          : 'text-text-secondary hover:bg-bg-hover'
      }`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
          isSelected ? 'bg-primary/10 text-primary' : 'bg-bg-base text-text-muted'
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium">{item.label}</p>
        {item.description && (
          <p className="truncate text-xs text-text-muted">{item.description}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs text-text-muted">{item.moduleName}</span>
        {item.shortcut && (
          <kbd className="rounded bg-bg-base px-1.5 py-0.5 text-xs text-text-muted">
            {formatShortcut(item.shortcut)}
          </kbd>
        )}
      </div>
    </button>
  )
}

// Format shortcut for display
function formatShortcut(shortcut: string): string {
  return shortcut
    .replace('CommandOrControl', 'Ctrl')
    .replace('Command', '⌘')
    .replace('Control', 'Ctrl')
    .replace('Shift', '⇧')
    .replace('Alt', 'Alt')
}
