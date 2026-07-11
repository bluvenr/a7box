/**
 * A7Box Router Configuration
 *
 * Module routes are auto-generated from allModules — no manual enumeration needed.
 * Adding a new module only requires joining the allModules array.
 */

import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import type { ComponentType } from 'react'
import { MainLayout } from './layouts/MainLayout'
import { ErrorBoundary, ModuleSkeleton } from '../shared/components'
import { allModules } from '../modules'

// Core pages (lazy loaded)
const Home = lazy(() => import('./pages/Home'))
const Settings = lazy(() => import('./pages/Settings'))

// Utility windows (standalone, no layout)
const QrQuick = lazy(() => import('./pages/utility/QrQuick'))
const MdConvert = lazy(() => import('./pages/utility/MdConvert'))
const JsonQuick = lazy(() => import('./pages/utility/JsonQuick'))
const CodeQuick = lazy(() => import('./pages/utility/CodeQuick'))
const ColorQuick = lazy(() => import('./pages/utility/ColorQuick'))
const LivePicker = lazy(() => import('./pages/utility/LivePicker'))
const Palette = lazy(() => import('./pages/utility/Palette'))
const RegionPicker = lazy(() => import('./pages/utility/RegionPicker'))
const CapturePreview = lazy(() => import('./pages/utility/CapturePreview'))
const ReminderQuick = lazy(() => import('../modules/reminder/QuickCreate'))
const NotificationToast = lazy(() => import('./pages/utility/NotificationToast'))

// Wrap a module component with ErrorBoundary + Suspense
function ModuleRoute({ moduleId, children }: { moduleId: string; children: React.ReactNode }) {
  return (
    <ErrorBoundary moduleId={moduleId}>
      <Suspense fallback={<ModuleSkeleton />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  )
}

// Cache lazy components — lazy() must NOT be called inside render (creates infinite loop)
const lazyCache = new WeakMap<Function, React.LazyExoticComponent<ComponentType>>()
function getLazyComponent(component: () => Promise<{ default: ComponentType }>) {
  let cached = lazyCache.get(component)
  if (!cached) {
    cached = lazy(component)
    lazyCache.set(component, cached)
  }
  return cached
}

function DynamicModule({ component }: { component: () => Promise<{ default: ComponentType }> }) {
  const LazyComp = getLazyComponent(component)
  return <LazyComp />
}

// Auto-generate module routes from allModules
const moduleRoutes: RouteObject[] = allModules
  .filter((mod) => mod.component)
  .map((mod) => ({
    path: mod.meta.id,
    handle: { moduleId: mod.meta.id },
    element: (
      <ModuleRoute moduleId={mod.meta.id}>
        <DynamicModule component={mod.component!} />
      </ModuleRoute>
    ),
  }))

// Main app child routes (shared between router and CachedOutlet)
export const mainAppChildren: RouteObject[] = [
  {
    index: true,
    element: (
      <Suspense fallback={<ModuleSkeleton />}>
        <Home />
      </Suspense>
    ),
  },
  {
    path: 'settings',
    element: (
      <Suspense fallback={<ModuleSkeleton />}>
        <Settings />
      </Suspense>
    ),
  },
  ...moduleRoutes,
]

// Router configuration
export const router = createBrowserRouter([
  // Utility windows (standalone floating windows)
  {
    path: '/utility/qr-quick',
    element: (
      <Suspense fallback={null}>
        <QrQuick />
      </Suspense>
    ),
  },
  {
    path: '/utility/md-convert',
    element: (
      <Suspense fallback={null}>
        <MdConvert />
      </Suspense>
    ),
  },
  {
    path: '/utility/json-quick',
    element: (
      <Suspense fallback={null}>
        <JsonQuick />
      </Suspense>
    ),
  },
  {
    path: '/utility/code-quick',
    element: (
      <Suspense fallback={null}>
        <CodeQuick />
      </Suspense>
    ),
  },
  {
    path: '/utility/color-quick',
    element: (
      <Suspense fallback={null}>
        <ColorQuick />
      </Suspense>
    ),
  },
  {
    path: '/utility/live-picker',
    element: (
      <Suspense fallback={null}>
        <LivePicker />
      </Suspense>
    ),
  },
  {
    path: '/utility/palette',
    element: (
      <Suspense fallback={null}>
        <Palette />
      </Suspense>
    ),
  },
  {
    path: '/utility/region-picker',
    element: (
      <Suspense fallback={null}>
        <RegionPicker />
      </Suspense>
    ),
  },
  {
    path: '/utility/capture-preview',
    element: (
      <Suspense fallback={null}>
        <CapturePreview />
      </Suspense>
    ),
  },
  {
    path: '/utility/reminder-quick',
    element: (
      <Suspense fallback={null}>
        <ReminderQuick />
      </Suspense>
    ),
  },
  {
    path: '/utility/notification-toast',
    element: (
      <Suspense fallback={null}>
        <NotificationToast />
      </Suspense>
    ),
  },
  // Main app routes
  {
    path: '/',
    element: <MainLayout />,
    children: mainAppChildren,
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
