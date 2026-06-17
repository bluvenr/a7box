/**
 * P2P Service Status Store
 * Lightweight cross-component state for P2P running status
 */
import { create } from 'zustand'

interface P2PStatusState {
  running: boolean
  setRunning: (val: boolean) => void
}

export const useP2PStatus = create<P2PStatusState>((set) => ({
  running: false,
  setRunning: (val) => set({ running: val }),
}))
