/**
 * CachedOutlet — lazy keep-alive for React Router v6
 *
 * - Routes are only rendered when first visited (lazy mount).
 * - Once visited, they stay mounted and are hidden with CSS when inactive.
 * - Disabled modules are fully unmounted to save resources.
 * - Context tracks which paths have been visited across navigation.
 */

import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { useMatch } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'
import { useModuleRegistry } from '../../core/registry'

// ── Page-active context ─────────────────────────────────────────────────────
// Lets deeply-nested components know whether their CachedRoute is currently
// the active route.  Default `true` so components outside CachedRoute still work.

const PageActiveContext = createContext(true)

/** Returns `true` when the enclosing CachedRoute is the active route. */
export function usePageActive(): boolean {
  return useContext(PageActiveContext)
}

// ── Visited-paths context ───────────────────────────────────────────────────

const VisitedContext = createContext<{
  visited: Set<string>
  markVisited: (path: string) => void
  unmarkVisited: (path: string) => void
}>({ visited: new Set(), markVisited: () => {}, unmarkVisited: () => {} })

export function VisitedProvider({ children }: { children: React.ReactNode }) {
  const [visited, setVisited] = useState<Set<string>>(new Set(['']))
  const markVisited = useCallback((path: string) => {
    setVisited((prev) => {
      if (prev.has(path)) return prev
      const next = new Set(prev)
      next.add(path)
      return next
    })
  }, [])
  const unmarkVisited = useCallback((path: string) => {
    setVisited((prev) => {
      if (!prev.has(path)) return prev
      const next = new Set(prev)
      next.delete(path)
      return next
    })
  }, [])
  return (
    <VisitedContext.Provider value={{ visited, markVisited, unmarkVisited }}>
      {children}
    </VisitedContext.Provider>
  )
}

// ── Per-route wrapper ───────────────────────────────────────────────────────

function CachedRoute({ path, index, moduleId, children }: {
  path?: string
  index?: boolean
  moduleId?: string
  children: React.ReactNode
}) {
  const pattern = index ? '/' : (path || '')
  const match = useMatch(pattern)
  const isActive = !!match

  // Track first visit
  const { visited, markVisited, unmarkVisited } = useContext(VisitedContext)
  if (isActive && !visited.has(pattern)) {
    markVisited(pattern)
  }

  // Module-level enable check (skip for non-module routes like home/settings)
  const enabledModuleIds = useModuleRegistry((s) => s.enabledModuleIds)
  const isEnabled = !moduleId || enabledModuleIds.has(moduleId)

  // When module is disabled, clear visited record so re-enable requires actual navigation
  if (moduleId && !isEnabled && visited.has(pattern)) {
    unmarkVisited(pattern)
  }

  // Decide visibility: must be visited, enabled, and (currently active or already mounted)
  const hasBeenVisited = visited.has(pattern)
  const isVisible = hasBeenVisited && isEnabled
  const shouldMount = isVisible || isActive

  if (!shouldMount) return null

  return (
    <div style={{ display: isActive ? 'contents' : 'none', height: '100%' }}>
      <PageActiveContext.Provider value={isActive}>
        {children}
      </PageActiveContext.Provider>
    </div>
  )
}

// ── Outlet replacement ──────────────────────────────────────────────────────

export function CachedOutlet({ routes }: { routes: RouteObject[] }) {
  // Create all CachedRoute elements once and keep them stable via useRef.
  // We intentionally bypass React Router's useRoutes because it internally
  // re-evaluates and may recreate element trees on every location change,
  // which breaks keep-alive by causing unmount/remount cycles.
  //
  // Instead, we render ALL CachedRoute components simultaneously.
  // Each one uses useMatch() internally to decide whether it is active.
  const elementsRef = useRef<React.ReactNode[] | null>(null)
  if (!elementsRef.current) {
    elementsRef.current = routes.map((route, i) => (
      <CachedRoute
        key={route.path ?? `index-${i}`}
        path={route.path}
        index={route.index}
        moduleId={(route.handle as any)?.moduleId}
      >
        {route.element}
      </CachedRoute>
    ))
  }

  return <>{elementsRef.current}</>
}
