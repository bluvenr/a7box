/**
 * HTTP Service Status Store
 * Cross-component state for independent HTTP server instances.
 * Used by HttpServer page, sidebar, and home page cards.
 */
import { create } from 'zustand'
import type { HttpInstanceInfo } from '../../shared/utils/tauriBridge'

interface HttpServiceState {
  instances: HttpInstanceInfo[]
  count: number
  pendingDirectory: string
  setInstances: (list: HttpInstanceInfo[]) => void
  addInstance: (inst: HttpInstanceInfo) => void
  removeInstance: (id: string) => void
  setPendingDirectory: (dir: string) => void
}

export const useHttpServiceStatus = create<HttpServiceState>((set) => ({
  instances: [],
  count: 0,
  pendingDirectory: '',
  setInstances: (list) => set({ instances: list, count: list.length }),
  addInstance: (inst) =>
    set((s) => {
      const next = [...s.instances.filter((i) => i.id !== inst.id), inst]
      return { instances: next, count: next.length }
    }),
  removeInstance: (id) =>
    set((s) => {
      const next = s.instances.filter((i) => i.id !== id)
      return { instances: next, count: next.length }
    }),
  setPendingDirectory: (dir) => set({ pendingDirectory: dir }),
}))
