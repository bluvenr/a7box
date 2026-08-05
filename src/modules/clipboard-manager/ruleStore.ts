/**
 * Clipboard Manager — Automation Rule Store
 */
import { create } from 'zustand'
import * as bridge from './bridge'
import type { RuleEntry } from './types'

interface RuleState {
  rules: RuleEntry[]
  loaded: boolean
  load: () => Promise<void>
  save: (rule: RuleEntry) => Promise<RuleEntry | null>
  remove: (id: string) => Promise<void>
  toggle: (id: string, enabled: boolean) => Promise<void>
}

export const useRuleStore = create<RuleState>()((set, get) => ({
  rules: [],
  loaded: false,

  load: async () => {
    const rules = await bridge.listRules()
    rules.sort((a, b) => b.priority - a.priority)
    set({ rules, loaded: true })
  },

  save: async (rule) => {
    const saved = await bridge.saveRule(rule)
    if (saved) {
      const exists = get().rules.some((r) => r.id === saved.id)
      set((state) => {
        const rules = exists
          ? state.rules.map((r) => (r.id === saved.id ? saved : r))
          : [saved, ...state.rules]
        rules.sort((a, b) => b.priority - a.priority)
        return { rules }
      })
    }
    return saved
  },

  remove: async (id) => {
    await bridge.deleteRule(id)
    set((state) => ({ rules: state.rules.filter((r) => r.id !== id) }))
  },

  toggle: async (id, enabled) => {
    await bridge.toggleRule(id, enabled)
    set((state) => ({
      rules: state.rules.map((r) => (r.id === id ? { ...r, enabled } : r)),
    }))
  },
}))
