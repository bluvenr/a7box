/**
 * A7Box Command Palette State Management
 */

import { create } from 'zustand'
import type { CommandSearchItem } from '../types'
import { searchEngine } from './SearchEngine'
import { useModuleRegistry } from '../registry'
import { recordUsage as recordUsageShared, getAllHistory } from '../../shared/utils'

interface CommandPaletteState {
  /** Is the palette open */
  isOpen: boolean
  /** Search query */
  query: string
  /** Search results */
  results: CommandSearchItem[]
  /** Selected item index */
  selectedIndex: number

  /** Open command palette */
  open: () => void
  /** Close command palette */
  close: () => void
  /** Toggle command palette */
  toggle: () => void
  /** Set search query */
  setQuery: (query: string) => void
  /** Set selected index */
  setSelectedIndex: (index: number) => void
  /** Move selection up */
  moveUp: () => void
  /** Move selection down */
  moveDown: () => void
  /** Execute selected command */
  execute: (context?: { navigate?: (path: string) => void }) => Promise<void>
  /** Refresh command list from registry */
  refreshCommands: () => void
}

export const useCommandPalette = create<CommandPaletteState>((set, get) => ({
  isOpen: false,
  query: '',
  results: [],
  selectedIndex: 0,

  open: () => {
    get().refreshCommands()
    set({ isOpen: true, query: '', selectedIndex: 0 })
  },

  close: () => {
    set({ isOpen: false, query: '' })
  },

  toggle: () => {
    const { isOpen } = get()
    if (isOpen) {
      get().close()
    } else {
      get().open()
    }
  },

  setQuery: (query) => {
    const results = searchEngine.search(query)
    set({
      query,
      results,
      selectedIndex: 0,
    })
  },

  setSelectedIndex: (index) => {
    set({ selectedIndex: index })
  },

  moveUp: () => {
    const { selectedIndex, results } = get()
    const newIndex = selectedIndex > 0 ? selectedIndex - 1 : results.length - 1
    set({ selectedIndex: newIndex })
  },

  moveDown: () => {
    const { selectedIndex, results } = get()
    const newIndex = selectedIndex < results.length - 1 ? selectedIndex + 1 : 0
    set({ selectedIndex: newIndex })
  },

  execute: async (context) => {
    const { results, selectedIndex } = get()
    const command = results[selectedIndex]
    if (!command) return

    recordUsageShared(command.id)
    get().close()

    await command.run({
      navigate: context?.navigate ?? ((path) => console.log('Navigate to:', path)),
    })
  },

  refreshCommands: () => {
    const commands = useModuleRegistry.getState().getAllCommands()

    // Build usage map from shared history
    const usageMap: Record<string, number> = {}
    for (const record of getAllHistory()) {
      usageMap[record.moduleId] = record.timestamp
    }

    const commandsWithHistory = commands.map((cmd) => ({
      ...cmd,
      lastUsedAt: usageMap[cmd.id],
    }))

    searchEngine.setItems(commandsWithHistory)
    set({ results: searchEngine.search('') })
  },
}))

// Initialize (kept as no-op for backward compatibility)
export function initUsageHistory() {
  // Usage history is now managed by shared/utils/usageHistory.ts
}
