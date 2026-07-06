/**
 * Palette - Spotlight-style Quick Search Window
 * Standalone Tauri utility window for fast module/command navigation.
 * Triggered by global shortcut (Ctrl+Shift+A).
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Box, ArrowRight } from 'lucide-react'
import { allModules } from '../../../modules'
import { useModuleRegistry } from '../../../core/registry'
import { formatShortcut, getAllHistory } from '../../../shared/utils'
import { useShortcutStore } from '../../../core/shortcuts/shortcutStore'
import { CommandSearchEngine } from '../../../core/command-palette/SearchEngine'
import type { CommandSearchItem } from '../../../core/types'
import type { LucideIcon } from 'lucide-react'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

// Shared search engine instance
const engine = new CommandSearchEngine({ threshold: 0.35, limit: 30 })

export default function Palette() {
  const { t, i18n } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const registerAll = useModuleRegistry((s) => s.registerAll)
  const enabledIds = useModuleRegistry((s) => s.enabledModuleIds)
  const userShortcuts = useShortcutStore((s) => s.shortcuts)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CommandSearchItem[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [ready, setReady] = useState(false)

  // Override html/body/#root background to transparent so CSS rounded corners show
  useEffect(() => {
    const htmlEl = document.documentElement
    const bodyEl = document.body
    const rootEl = document.getElementById('root')
    const prevHtml = htmlEl.style.background
    const prevBody = bodyEl.style.background
    const prevRoot = rootEl?.style.background ?? ''
    htmlEl.style.background = 'transparent'
    bodyEl.style.background = 'transparent'
    if (rootEl) rootEl.style.background = 'transparent'
    return () => {
      htmlEl.style.background = prevHtml
      bodyEl.style.background = prevBody
      if (rootEl) rootEl.style.background = prevRoot
    }
  }, [])

  // Register all modules on mount (palette window has its own React instance)
  useEffect(() => {
    registerAll(allModules)
  }, [registerAll])

  // Build command list once modules are registered
  useEffect(() => {
    if (enabledIds.size === 0) return

    const modules = useModuleRegistry.getState().getAllModules().filter((m) => enabledIds.has(m.meta.id))

    // Build usage map
    const usageMap: Record<string, number> = {}
    for (const record of getAllHistory()) {
      usageMap[record.moduleId] = record.timestamp
    }

    // Build moduleId → user-customized keys map from shortcut store
    const shortcutByModule = new Map<string, string>()
    for (const sc of userShortcuts) {
      if (sc.moduleId && sc.enabled) {
        shortcutByModule.set(sc.moduleId, sc.keys)
      }
    }

    // Resolve i18n names and build command list
    const commands: CommandSearchItem[] = []
    for (const mod of modules) {
      const modName = (mod.meta.nameI18n ? t(mod.meta.nameI18n) : mod.meta.name) || mod.meta.name
      const modIcon = mod.meta.icon
      // Use user-customized shortcut if available, otherwise fall back to hardcoded
      const modShortcut = shortcutByModule.get(mod.meta.id)

      for (const cmd of mod.commands) {
        if (cmd.when && !cmd.when()) continue
        const label = (cmd.labelI18n ? t(cmd.labelI18n) : cmd.label) || cmd.label
        const desc = cmd.descriptionI18n ? t(cmd.descriptionI18n) : cmd.description

        commands.push({
          id: `${mod.meta.id}:${cmd.id}`,
          moduleId: mod.meta.id,
          moduleName: modName,
          moduleIcon: modIcon,
          label,
          description: desc,
          icon: cmd.icon,
          shortcut: modShortcut ?? cmd.shortcut,
          tags: mod.meta.tags,
          lastUsedAt: usageMap[`${mod.meta.id}:${cmd.id}`],
          run: cmd.run,
        })
      }
    }

    engine.setItems(commands)
    setResults(engine.search(''))
    setSelectedIdx(0)
    setReady(true)

    // Auto-focus input
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [enabledIds, userShortcuts, t, i18n.language])

  // Search on query change
  useEffect(() => {
    if (!ready) return
    const r = engine.search(query)
    setResults(r)
    setSelectedIdx(0)
  }, [query, ready])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.children[selectedIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  // Close the palette window
  const closeWindow = useCallback(async () => {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('close_utility_window', { label: 'utility-palette' })
      } catch { /* ignore */ }
    }
  }, [])

  // Execute selected command
  const executeSelected = useCallback(async () => {
    const cmd = results[selectedIdx]
    if (!cmd) return

    // Capture navigation path
    let navPath = ''
    const captureNavigate = (path: string) => {
      navPath = path
    }

    // Run the command
    try {
      await cmd.run({ navigate: captureNavigate })
    } catch { /* ignore */ }

    // If a navigation path was captured, emit to main window
    if (navPath && isTauri()) {
      try {
        const { emit } = await import('@tauri-apps/api/event')
        await emit('palette-navigate', { path: navPath })
      } catch { /* ignore */ }
    }

    // Close palette
    await closeWindow()
  }, [results, selectedIdx, closeWindow])

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIdx((i) => (i > 0 ? i - 1 : results.length - 1))
          break
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIdx((i) => (i < results.length - 1 ? i + 1 : 0))
          break
        case 'Enter':
          e.preventDefault()
          executeSelected()
          break
        case 'Escape':
          e.preventDefault()
          closeWindow()
          break
      }
    },
    [results.length, executeSelected, closeWindow]
  )

  // Group results by module for display
  const groupedResults = useMemo(() => {
    const groups: { moduleName: string; moduleIcon: LucideIcon | string; items: CommandSearchItem[] }[] = []
    const map = new Map<string, typeof groups[0]>()

    for (const item of results) {
      let group = map.get(item.moduleName)
      if (!group) {
        group = { moduleName: item.moduleName, moduleIcon: item.moduleIcon, items: [] }
        map.set(item.moduleName, group)
        groups.push(group)
      }
      group.items.push(item)
    }
    return groups
  }, [results])

  // Flat index tracker for grouped rendering
  const flatIndexMap = useMemo(() => {
    const map: number[] = []
    for (const g of groupedResults) {
      for (const _item of g.items) {
        map.push(0) // placeholder, we'll use running index
      }
    }
    return map
  }, [groupedResults])
  void flatIndexMap // suppress unused

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden rounded-xl border border-border-base bg-bg-elevated"
      onKeyDown={handleKeyDown}
    >
      {/* Search input */}
      <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
        <Search className="h-5 w-5 shrink-0 text-text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('palette.searchPlaceholder', 'Search tools and commands...')}
          className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
          autoComplete="off"
          spellCheck={false}
        />
        <kbd className="shrink-0 rounded bg-bg-hover px-1.5 py-0.5 text-[10px] text-text-muted">
          ESC
        </kbd>
      </div>

      {/* Results list */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-2">
        {ready && results.length > 0 ? (
          (() => {
            let flatIdx = 0
            return groupedResults.map((group) => (
              <div key={group.moduleName} className="mb-1">
                {/* Module group header */}
                <div className="flex items-center gap-1.5 px-2 py-1.5">
                  <ModuleIcon icon={group.moduleIcon} className="h-3 w-3 text-text-muted" />
                  <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
                    {group.moduleName}
                  </span>
                </div>
                {/* Commands */}
                {group.items.map((item) => {
                  const idx = flatIdx++
                  const isSelected = idx === selectedIdx
                  return (
                    <button
                      key={item.id}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                        isSelected
                          ? 'bg-primary/10 text-text-primary'
                          : 'text-text-secondary hover:bg-bg-hover'
                      }`}
                      onClick={() => {
                        setSelectedIdx(idx)
                        executeSelected()
                      }}
                      onMouseEnter={() => setSelectedIdx(idx)}
                    >
                      <CommandIcon item={item} selected={isSelected} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.label}</p>
                        {item.description && (
                          <p className="truncate text-xs text-text-muted">{item.description}</p>
                        )}
                      </div>
                      {isSelected && (
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary" />
                      )}
                      {item.shortcut && (
                        <kbd className="shrink-0 rounded bg-bg-base px-1.5 py-0.5 text-[10px] text-text-muted">
                          {formatShortcut(item.shortcut)}
                        </kbd>
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          })()
        ) : ready && results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Box className="mb-2 h-8 w-8 text-text-muted" />
            <p className="text-sm text-text-muted">
              {t('palette.noResults', 'No matching results')}
            </p>
          </div>
        ) : (
          // Loading skeleton
          <div className="space-y-2 p-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2.5">
                <div className="h-7 w-7 animate-pulse rounded-md bg-bg-hover" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-32 animate-pulse rounded bg-bg-hover" />
                  <div className="h-2 w-20 animate-pulse rounded bg-bg-hover" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border-subtle px-4 py-2">
        <div className="flex items-center gap-3 text-[11px] text-text-muted">
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-bg-hover px-1 py-0.5">↑↓</kbd>
            {t('palette.navigate', 'Navigate')}
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-bg-hover px-1 py-0.5">↵</kbd>
            {t('palette.open', 'Open')}
          </span>
        </div>
        <span className="text-[11px] text-text-muted">
          {results.length} {t('palette.items', 'items')}
        </span>
      </div>
    </div>
  )
}

// ---- Helper components ----

function ModuleIcon({ icon, className }: { icon: LucideIcon | string; className?: string }) {
  if (typeof icon === 'string') {
    return <Box className={className} />
  }
  const Icon = icon as LucideIcon
  return <Icon className={className} />
}

function CommandIcon({ item, selected }: { item: CommandSearchItem; selected: boolean }) {
  const Icon = typeof item.icon === 'string' ? Box : (item.icon as LucideIcon) || Box
  return (
    <div
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
        selected ? 'bg-primary/15 text-primary' : 'bg-bg-base text-text-muted'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </div>
  )
}

