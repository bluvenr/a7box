/**
 * Clipboard Manager — History Store
 * Holds history list, filters, settings, paste stack queue and multi-window sync.
 */
import { create } from 'zustand'
import * as bridge from './bridge'
import type {
  ClipEntry,
  ClipStats,
  ClipboardSettings,
  HistoryChangedPayload,
  PasteCapability,
} from './types'

const PAGE_SIZE = 50

export interface HistoryFilters {
  search: string
  category: string // 'all' | category
  clipType: string // 'all' | text | image | file
  onlyPinned: boolean
}

interface ClipboardState {
  items: ClipEntry[]
  loading: boolean
  hasMore: boolean
  filters: HistoryFilters
  stats: ClipStats | null
  settings: ClipboardSettings | null
  capability: PasteCapability
  imagesDir: string
  selectedIds: string[]
  pasteStack: string[]
  /** Monotonic bump to force refresh across windows */
  revision: number

  // Loading
  loadHistory: (reset?: boolean) => Promise<void>
  loadMore: () => Promise<void>
  refresh: () => Promise<void>
  loadStats: () => Promise<void>
  loadSettings: () => Promise<void>
  saveSettings: (settings: ClipboardSettings) => Promise<void>

  // Filters
  setSearch: (search: string) => void
  setCategory: (category: string) => void
  setClipType: (clipType: string) => void
  setOnlyPinned: (onlyPinned: boolean) => void
  /** Apply category + clipType together (single reload, used by popup tabs) */
  applyTabFilter: (category: string, clipType: string) => void

  // Actions
  copyClip: (id: string) => Promise<void>
  pasteClip: (id: string) => Promise<string>
  togglePin: (id: string) => Promise<void>
  deleteClip: (id: string) => Promise<void>
  deleteSelected: () => Promise<void>
  clearHistory: (keepPinned: boolean) => Promise<void>

  // Selection
  toggleSelected: (id: string) => void
  setSelected: (ids: string[]) => void
  clearSelection: () => void

  // Paste Stack
  addToStack: (id: string) => void
  removeFromStack: (id: string) => void
  moveInStack: (from: number, to: number) => void
  clearStack: () => void
  runStack: () => Promise<string>

  // External event bump (from clipboard-history-changed)
  bump: () => void
}

export const useClipboardStore = create<ClipboardState>()((set, get) => ({
  items: [],
  loading: false,
  hasMore: false,
  filters: { search: '', category: 'all', clipType: 'all', onlyPinned: false },
  stats: null,
  settings: null,
  capability: { capable: true, reason: '' },
  imagesDir: '',
  selectedIds: [],
  pasteStack: [],
  revision: 0,

  loadHistory: async (reset = true) => {
    const { filters, items } = get()
    if (get().loading) return
    set({ loading: true })
    try {
      const offset = reset ? 0 : items.length
      const fetched = await bridge.getHistory({
        limit: PAGE_SIZE,
        offset,
        category: filters.category,
        clipType: filters.clipType,
        search: filters.search,
        onlyPinned: filters.onlyPinned,
      })
      set((state) => ({
        items: reset ? fetched : [...state.items, ...fetched],
        hasMore: fetched.length === PAGE_SIZE,
      }))
    } finally {
      set({ loading: false })
    }
  },

  loadMore: async () => {
    if (!get().hasMore || get().loading) return
    await get().loadHistory(false)
  },

  refresh: async () => {
    await get().loadHistory(true)
    await get().loadStats()
  },

  loadStats: async () => {
    const stats = await bridge.getStats()
    if (stats) set({ stats })
  },

  loadSettings: async () => {
    const resp = await bridge.getCmSettings()
    if (!resp) return
    const { capability, imagesDir, ...settings } = resp
    set({ settings, capability, imagesDir })
  },

  saveSettings: async (settings) => {
    await bridge.saveCmSettings(settings)
    set({ settings })
  },

  setSearch: (search) => {
    set((s) => ({ filters: { ...s.filters, search } }))
    void get().loadHistory(true)
  },
  setCategory: (category) => {
    set((s) => ({ filters: { ...s.filters, category } }))
    void get().loadHistory(true)
  },
  setClipType: (clipType) => {
    set((s) => ({ filters: { ...s.filters, clipType } }))
    void get().loadHistory(true)
  },
  setOnlyPinned: (onlyPinned) => {
    set((s) => ({ filters: { ...s.filters, onlyPinned } }))
    void get().loadHistory(true)
  },
  applyTabFilter: (category, clipType) => {
    set((s) => ({ filters: { ...s.filters, category, clipType } }))
    void get().loadHistory(true)
  },

  copyClip: async (id) => {
    await bridge.copyClip(id)
  },

  pasteClip: async (id) => {
    return bridge.pasteClip(id)
  },

  togglePin: async (id) => {
    const pinned = await bridge.togglePin(id)
    set((state) => ({
      items: state.items.map((c) => (c.id === id ? { ...c, isPinned: pinned } : c)),
    }))
  },

  deleteClip: async (id) => {
    await bridge.deleteClip(id)
    set((state) => ({
      items: state.items.filter((c) => c.id !== id),
      selectedIds: state.selectedIds.filter((sid) => sid !== id),
      pasteStack: state.pasteStack.filter((sid) => sid !== id),
    }))
  },

  deleteSelected: async () => {
    const ids = get().selectedIds
    if (!ids.length) return
    await bridge.deleteClips(ids)
    set((state) => ({
      items: state.items.filter((c) => !ids.includes(c.id)),
      selectedIds: [],
      pasteStack: state.pasteStack.filter((sid) => !ids.includes(sid)),
    }))
    await get().loadStats()
  },

  clearHistory: async (keepPinned) => {
    await bridge.clearHistory(keepPinned)
    await get().refresh()
  },

  toggleSelected: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((sid) => sid !== id)
        : [...state.selectedIds, id],
    })),
  setSelected: (ids) => set({ selectedIds: ids }),
  clearSelection: () => set({ selectedIds: [] }),

  addToStack: (id) =>
    set((state) =>
      state.pasteStack.includes(id) ? state : { pasteStack: [...state.pasteStack, id] }
    ),
  removeFromStack: (id) =>
    set((state) => ({ pasteStack: state.pasteStack.filter((sid) => sid !== id) })),
  moveInStack: (from, to) =>
    set((state) => {
      const stack = [...state.pasteStack]
      if (from < 0 || from >= stack.length || to < 0 || to >= stack.length) return state
      const [moved] = stack.splice(from, 1)
      stack.splice(to, 0, moved)
      return { pasteStack: stack }
    }),
  clearStack: () => set({ pasteStack: [] }),

  runStack: async () => {
    const ids = get().pasteStack
    if (!ids.length) return 'empty'
    const result = await bridge.pasteStack(ids)
    if (result === 'pasted') set({ pasteStack: [] })
    return result
  },

  bump: () => set((state) => ({ revision: state.revision + 1 })),
}))

// ── Cross-window event synchronization ───────────────────────────────────────

let unlistenHistory: (() => void) | null = null
let unlistenRule: (() => void) | null = null
let unlistenToast: (() => void) | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let eventRefCount = 0

/** Debounced refresh triggered by Rust broadcasts (all windows). */
function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    const store = useClipboardStore.getState()
    void store.loadHistory(true)
    void store.loadStats()
  }, 150)
}

/**
 * Dispatch newly captured text to other modules' `onClipboard` hooks.
 * The clipboard manager is the single clipboard listener; every consumer
 * module is driven exclusively by this broadcast, so disabling the module
 * (which stops the watcher) automatically pauses all of them.
 * Module registry is imported lazily to avoid a static import cycle.
 */
async function dispatchToModules(payload: HistoryChangedPayload) {
  if (payload.action !== 'added' || payload.clipType !== 'text' || !payload.id) return
  try {
    const clip = await bridge.getClip(payload.id)
    if (!clip?.content) return
    const { useModuleRegistry } = await import('../../core/registry/ModuleRegistry')
    for (const mod of useModuleRegistry.getState().getEnabledModules()) {
      if (mod.meta.id === 'clipboard-manager' || !mod.onClipboard) continue
      try {
        await mod.onClipboard(clip.content)
      } catch {
        /* one module failing must not break the others */
      }
    }
  } catch {
    /* broadcast dispatch is best-effort */
  }
}

/**
 * Start listening to clipboard events. Ref-counted and idempotent: each call
 * returns a stop function; subscriptions are only torn down when the last
 * consumer stops (multiple components may mount simultaneously).
 */
export function initClipboardEvents(): () => void {
  eventRefCount += 1
  if (!unlistenHistory) {
    void bridge.onHistoryChanged((payload: HistoryChangedPayload) => {
      const store = useClipboardStore.getState()
      // Optimistic local updates for actions we already applied locally are
      // harmless — the debounced reload keeps all windows consistent.
      store.bump()
      scheduleRefresh()
      void dispatchToModules(payload)
    }).then((un) => {
      unlistenHistory = un
    })
  }
  if (!unlistenRule) {
    void bridge.onRuleNotify((payload) => {
      // Surface rule notifications via a DOM event consumed by the UI toast layer
      window.dispatchEvent(
        new CustomEvent('clipboard-rule-notify', { detail: payload })
      )
    }).then((un) => {
      unlistenRule = un
    })
  }
  if (!unlistenToast) {
    void bridge.onToast((payload) => {
      window.dispatchEvent(new CustomEvent('clipboard-toast', { detail: payload }))
    }).then((un) => {
      unlistenToast = un
    })
  }
  return () => {
    eventRefCount -= 1
    if (eventRefCount > 0) return
    unlistenHistory?.()
    unlistenRule?.()
    unlistenToast?.()
    unlistenHistory = null
    unlistenRule = null
    unlistenToast = null
  }
}
