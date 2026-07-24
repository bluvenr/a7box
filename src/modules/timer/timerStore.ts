/**
 * Timer Store
 * Zustand store managing countdowns, stopwatch, and recent presets.
 * Countdowns persist to localStorage so running timers survive app restart.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CountdownTimer, StopwatchState, StopwatchLap, TimerRecent } from './types'

/** Emit stopwatch state to floating widget windows via Tauri event.
 *  Uses emitTo for targeted cross-window delivery (Tauri 2 emit is window-scoped). */
function emitSwState(state: { running: boolean; elapsed: number; startedAt: number | null }) {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    import('@tauri-apps/api/event').then(({ emitTo }) => {
      emitTo('sw-widget', 'sw-state-update', {
        running: state.running,
        elapsed: state.elapsed,
        startedAt: state.startedAt,
      }).catch(() => {})
    }).catch(() => {})
  }
}

/** Emit countdown list to floating widget window (same pattern as emitSwState). */
function emitCdState(countdowns: CountdownTimer[]) {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const payload = countdowns.map((c) => ({
      id: c.id, title: c.title, totalDuration: c.totalDuration,
      endsAt: c.endsAt, remainingMs: c.remainingMs, status: c.status, createdAt: c.createdAt,
    }))
    import('@tauri-apps/api/event').then(({ emitTo, emit }) => {
      emitTo('cd-widget', 'cd-state-update', payload).catch(() => {})
      // Broadcast to all windows (cd-item-* cards receive this)
      emit('cd-state-update', payload).catch(() => {})
    }).catch(() => {})
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Get remaining ms for a countdown (works for both running and paused) */
export function getRemaining(timer: CountdownTimer, now?: number): number {
  if (timer.status === 'completed') return 0
  if (timer.status === 'paused') return timer.remainingMs
  // running: endsAt - now
  return Math.max(0, timer.endsAt - (now ?? Date.now()))
}

/** Get progress 0..1 (0 = just started, 1 = done) */
export function getProgress(timer: CountdownTimer, now?: number): number {
  if (timer.totalDuration <= 0) return 1
  const remaining = getRemaining(timer, now)
  return Math.min(1, Math.max(0, 1 - remaining / timer.totalDuration))
}

/** Generate default title from duration ms */
export function defaultTitle(durationMs: number, t: (key: string, opts?: any) => string): string {
  const totalSecs = Math.round(durationMs / 1000)
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60

  const parts: string[] = []
  if (h > 0) parts.push(`${h}${t('modules.timer.ui.units.hShort')}`)
  if (m > 0) parts.push(`${m}${t('modules.timer.ui.units.mShort')}`)
  if (s > 0 && h === 0) parts.push(`${s}${t('modules.timer.ui.units.sShort')}`)

  return t('modules.timer.ui.defaultTitle', { duration: parts.join(' ') || `${totalSecs}s` })
}

// ─── Store Shape ────────────────────────────────────────────────────────────────

interface TimerStoreState {
  // ── Countdowns ──
  countdowns: CountdownTimer[]
  addCountdown: (durationMs: number, title?: string) => CountdownTimer
  removeCountdown: (id: string) => void
  pauseCountdown: (id: string) => void
  resumeCountdown: (id: string) => void
  resetCountdown: (id: string) => void
  addTime: (id: string, deltaMs: number) => void
  updateTitle: (id: string, title: string) => void
  /** Called every tick to mark completed timers */
  tick: () => CountdownTimer[]

  // ── Stopwatch (in-memory only) ──
  stopwatch: StopwatchState
  swStart: () => void
  swPause: () => void
  swReset: () => void
  swLap: () => void

  // ── Recents (persisted) ──
  recents: TimerRecent[]
  addRecent: (durationMs: number, title: string) => void

  // ── Active tab ──
  activeTab: 'countdown' | 'stopwatch'
  setActiveTab: (tab: 'countdown' | 'stopwatch') => void

  // ── Widget pin state (persisted for preference memory) ──
  cdWidgetPinned: boolean
  swWidgetPinned: boolean
  setCdWidgetPinned: (v: boolean) => void
  setSwWidgetPinned: (v: boolean) => void

  // ── Countdown item card pin state ──
  cdItemPinned: string[]
  toggleCdItemPinned: (id: string) => void
  removeCdItemPinned: (id: string) => void
  addCdItemPinned: (id: string) => void
  cdAutoSpawn: boolean
  setCdAutoSpawn: (v: boolean) => void
}

// ─── Store ───────────────────────────────────────────────────────────────────────

export const useTimerStore = create<TimerStoreState>()(
  persist(
    (set, get) => ({
      countdowns: [],
      recents: [],
      activeTab: 'countdown',

      // ── Stopwatch (NOT persisted — cleared on app restart) ──
      stopwatch: {
        running: false,
        elapsed: 0,
        startedAt: null,
        laps: [],
      },

      // ── Countdown Actions ──

      addCountdown: (durationMs, title) => {
        const now = Date.now()
        const timer: CountdownTimer = {
          id: crypto.randomUUID(),
          title: title?.trim() || '',
          totalDuration: durationMs,
          endsAt: now + durationMs,
          remainingMs: 0,
          status: 'running',
          createdAt: now,
        }
        set((s) => ({ countdowns: [...s.countdowns, timer] }))
        emitCdState(get().countdowns)
        // Also add to recents
        get().addRecent(durationMs, timer.title)
        return timer
      },

      removeCountdown: (id) => {
        set((s) => ({ countdowns: s.countdowns.filter((c) => c.id !== id) }))
        emitCdState(get().countdowns)
      },

      pauseCountdown: (id) => {
        set((s) => ({
          countdowns: s.countdowns.map((c) => {
            if (c.id !== id || c.status !== 'running') return c
            return {
              ...c,
              status: 'paused' as const,
              remainingMs: Math.max(0, c.endsAt - Date.now()),
              endsAt: 0,
            }
          }),
        }))
        emitCdState(get().countdowns)
      },

      resumeCountdown: (id) => {
        set((s) => ({
          countdowns: s.countdowns.map((c) => {
            if (c.id !== id || c.status !== 'paused') return c
            return {
              ...c,
              status: 'running' as const,
              endsAt: Date.now() + c.remainingMs,
              remainingMs: 0,
            }
          }),
        }))
        emitCdState(get().countdowns)
      },

      resetCountdown: (id) => {
        set((s) => ({
          countdowns: s.countdowns.map((c) => {
            if (c.id !== id) return c
            return {
              ...c,
              status: 'running' as const,
              endsAt: Date.now() + c.totalDuration,
              remainingMs: 0,
            }
          }),
        }))
        emitCdState(get().countdowns)
      },

      addTime: (id, deltaMs) => {
        set((s) => ({
          countdowns: s.countdowns.map((c) => {
            if (c.id !== id || c.status === 'completed') return c
            if (c.status === 'running') {
              const newEndsAt = c.endsAt + deltaMs
              // If adding time to an almost-done timer, prevent endsAt from going into the past
              return { ...c, endsAt: Math.max(Date.now() + 1000, newEndsAt) }
            }
            // paused
            const newRemaining = Math.max(1000, c.remainingMs + deltaMs)
            return { ...c, remainingMs: newRemaining }
          }),
        }))
        emitCdState(get().countdowns)
      },

      updateTitle: (id, title) => {
        set((s) => ({
          countdowns: s.countdowns.map((c) =>
            c.id === id ? { ...c, title: title.slice(0, 100) } : c
          ),
        }))
      },

      tick: () => {
        const now = Date.now()
        let completed: CountdownTimer[] = []
        set((s) => {
          const updated = s.countdowns.map((c) => {
            if (c.status !== 'running') return c
            if (c.endsAt <= now) {
              completed.push(c)
              return { ...c, status: 'completed' as const, endsAt: 0, remainingMs: 0 }
            }
            return c
          })
          return { countdowns: updated }
        })
        if (completed.length > 0) emitCdState(get().countdowns)
        return completed
      },

      // ── Stopwatch Actions ──

      swStart: () => {
        set((s) => {
          if (s.stopwatch.running) return s
          return {
            stopwatch: {
              ...s.stopwatch,
              running: true,
              startedAt: Date.now(),
            },
          }
        })
        emitSwState(get().stopwatch)
      },

      swPause: () => {
        set((s) => {
          if (!s.stopwatch.running || !s.stopwatch.startedAt) return s
          const segment = Date.now() - s.stopwatch.startedAt
          return {
            stopwatch: {
              ...s.stopwatch,
              running: false,
              elapsed: s.stopwatch.elapsed + segment,
              startedAt: null,
            },
          }
        })
        emitSwState(get().stopwatch)
      },

      swReset: () => {
        set({ stopwatch: { running: false, elapsed: 0, startedAt: null, laps: [] } })
        emitSwState(get().stopwatch)
      },

      swLap: () => {
        set((s) => {
          if (!s.stopwatch.running || !s.stopwatch.startedAt) return s
          const segment = Date.now() - s.stopwatch.startedAt
          const totalTime = s.stopwatch.elapsed + segment
          const lastLapTotal = s.stopwatch.laps.length > 0
            ? s.stopwatch.laps[s.stopwatch.laps.length - 1].totalTime
            : 0
          const lap: StopwatchLap = {
            index: s.stopwatch.laps.length + 1,
            lapTime: totalTime - lastLapTotal,
            totalTime,
          }
          return {
            stopwatch: { ...s.stopwatch, laps: [...s.stopwatch.laps, lap] },
          }
        })
      },

      // ── Recents ──

      addRecent: (durationMs, title) => {
        set((s) => {
          const existing = s.recents.find(
            (r) => r.duration === durationMs && r.title === title
          )
          if (existing) {
            return {
              recents: s.recents
                .map((r) =>
                  r.duration === durationMs && r.title === title
                    ? { ...r, lastUsedAt: Date.now(), count: r.count + 1 }
                    : r
                )
                .sort((a, b) => b.count - a.count || b.lastUsedAt - a.lastUsedAt)
                .slice(0, 8),
            }
          }
          const entry: TimerRecent = {
            duration: durationMs,
            title,
            lastUsedAt: Date.now(),
            count: 1,
          }
          return {
            recents: [entry, ...s.recents]
              .sort((a, b) => b.count - a.count || b.lastUsedAt - a.lastUsedAt)
              .slice(0, 8),
          }
        })
      },

      // ── Widget pin state ──
      cdWidgetPinned: false,
      swWidgetPinned: false,
      setCdWidgetPinned: (v) => set({ cdWidgetPinned: v }),
      setSwWidgetPinned: (v) => set({ swWidgetPinned: v }),

      // ── Countdown item card pin state ──
      cdItemPinned: [],
      toggleCdItemPinned: (id) => set((s) => ({
        cdItemPinned: s.cdItemPinned.includes(id)
          ? s.cdItemPinned.filter((x) => x !== id)
          : [...s.cdItemPinned, id],
      })),
      removeCdItemPinned: (id) => set((s) => ({
        cdItemPinned: s.cdItemPinned.filter((x) => x !== id),
      })),
      addCdItemPinned: (id) => set((s) => ({
        cdItemPinned: s.cdItemPinned.includes(id) ? s.cdItemPinned : [...s.cdItemPinned, id],
      })),
      cdAutoSpawn: false,
      setCdAutoSpawn: (v) => set({ cdAutoSpawn: v }),

      // ── Tab ──

      setActiveTab: (tab) => set({ activeTab: tab }),
    }),
    {
      name: 'a7box-timer',
      version: 1,
      partialize: (state) => ({
        countdowns: state.countdowns,
        recents: state.recents,
        activeTab: state.activeTab,
        cdWidgetPinned: state.cdWidgetPinned,
        swWidgetPinned: state.swWidgetPinned,
        cdItemPinned: state.cdItemPinned,
        cdAutoSpawn: state.cdAutoSpawn,
        // stopwatch is intentionally NOT persisted
      }),
      merge: (persisted, current) => {
        const stored = persisted as Partial<TimerStoreState> | undefined
        return {
          ...current,
          ...stored,
          // Ensure running timers that expired while app was closed are marked completed
          countdowns: (stored?.countdowns ?? []).map((c) => {
            if (c.status === 'running' && c.endsAt <= Date.now()) {
              return { ...c, status: 'completed' as const, endsAt: 0, remainingMs: 0 }
            }
            return c
          }),
        }
      },
    }
  )
)
