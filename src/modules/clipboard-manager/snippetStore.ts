/**
 * Clipboard Manager — Snippet Store
 */
import { create } from 'zustand'
import * as bridge from './bridge'
import type { SnippetEntry } from './types'

interface SnippetState {
  snippets: SnippetEntry[]
  loaded: boolean
  load: () => Promise<void>
  save: (snippet: SnippetEntry) => Promise<SnippetEntry | null>
  remove: (id: string) => Promise<void>
}

export const useSnippetStore = create<SnippetState>()((set, get) => ({
  snippets: [],
  loaded: false,

  load: async () => {
    const snippets = await bridge.listSnippets()
    set({ snippets, loaded: true })
  },

  save: async (snippet) => {
    const saved = await bridge.saveSnippet(snippet)
    if (saved) {
      const exists = get().snippets.some((s) => s.id === saved.id)
      set((state) => ({
        snippets: exists
          ? state.snippets.map((s) => (s.id === saved.id ? saved : s))
          : [saved, ...state.snippets],
      }))
    }
    return saved
  },

  remove: async (id) => {
    await bridge.deleteSnippet(id)
    set((state) => ({ snippets: state.snippets.filter((s) => s.id !== id) }))
  },
}))

/** Replace {{variable}} placeholders with provided values. */
export function renderSnippet(content: string, values: Record<string, string>): string {
  return content.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, name: string) => {
    return values[name] ?? match
  })
}

/** Extract {{variable}} names from snippet content (unique, in order). */
export function extractVariables(content: string): string[] {
  const names: string[] = []
  const re = /\{\{\s*([^}]+?)\s*\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    if (!names.includes(m[1])) names.push(m[1])
  }
  return names
}
