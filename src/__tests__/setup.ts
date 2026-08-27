/**
 * Vitest setup file
 * Runs before each test suite
 */
import '@testing-library/jest-dom/vitest'

// Provide a localStorage stub when the environment lacks one
// (zustand persist middleware writes on every setState).
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, String(v)) },
      removeItem: (k: string) => { store.delete(k) },
      clear: () => { store.clear() },
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() { return store.size },
    },
    writable: false,
  })
}
