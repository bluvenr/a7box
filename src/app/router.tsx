/**
 * A7Box Router Configuration
 */

import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { MainLayout } from './layouts/MainLayout'
import { ErrorBoundary, ModuleSkeleton } from '../shared/components'

// Core pages (lazy loaded)
const Home = lazy(() => import('./pages/Home'))
const Settings = lazy(() => import('./pages/Settings'))

// Tool modules (lazy loaded)
const JsonFormatter = lazy(() => import('../modules/json-formatter/JsonFormatter'))
const QrCode = lazy(() => import('../modules/qr-code/QrCode'))
const MarkdownPreview = lazy(() => import('../modules/markdown-preview/MarkdownPreview'))
const CodeMinify = lazy(() => import('../modules/code-minify/CodeMinify'))
const ImageCompress = lazy(() => import('../modules/image-compress/ImageCompress'))
const HashGenerator = lazy(() => import('../modules/hash-generator/HashGenerator'))
const ImageConvert = lazy(() => import('../modules/image-convert/ImageConvert'))
const ColorTool = lazy(() => import('../modules/color-tool/ColorTool'))
const Base64Tool = lazy(() => import('../modules/base64-tool/Base64Tool'))
const TimestampConverter = lazy(() => import('../modules/timestamp-converter/TimestampConverter'))
const UuidGenerator = lazy(() => import('../modules/uuid-generator/UuidGenerator'))
const JwtDecoder = lazy(() => import('../modules/jwt-decoder/JwtDecoder'))
const RegexTester = lazy(() => import('../modules/regex-tester/RegexTester'))
const TextDiff = lazy(() => import('../modules/text-diff/TextDiff'))
const Screenshot = lazy(() => import('../modules/screenshot/Screenshot'))
const HttpServer = lazy(() => import('../modules/http-server/HttpServer'))
const P2PTransfer = lazy(() => import('../modules/p2p-transfer/P2PTransfer'))

// Utility windows (standalone, no layout)
const QrQuick = lazy(() => import('./pages/utility/QrQuick'))
const MdConvert = lazy(() => import('./pages/utility/MdConvert'))
const JsonQuick = lazy(() => import('./pages/utility/JsonQuick'))
const CodeQuick = lazy(() => import('./pages/utility/CodeQuick'))

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
  // Tool module routes
  {
    path: 'json-formatter',
    handle: { moduleId: 'json-formatter' },
    element: <ModuleRoute moduleId="json-formatter"><JsonFormatter /></ModuleRoute>,
  },
  {
    path: 'qr-code',
    handle: { moduleId: 'qr-code' },
    element: <ModuleRoute moduleId="qr-code"><QrCode /></ModuleRoute>,
  },
  {
    path: 'markdown-preview',
    handle: { moduleId: 'markdown-preview' },
    element: <ModuleRoute moduleId="markdown-preview"><MarkdownPreview /></ModuleRoute>,
  },
  {
    path: 'code-minify',
    handle: { moduleId: 'code-minify' },
    element: <ModuleRoute moduleId="code-minify"><CodeMinify /></ModuleRoute>,
  },
  {
    path: 'image-compress',
    handle: { moduleId: 'image-compress' },
    element: <ModuleRoute moduleId="image-compress"><ImageCompress /></ModuleRoute>,
  },
  {
    path: 'hash-generator',
    handle: { moduleId: 'hash-generator' },
    element: <ModuleRoute moduleId="hash-generator"><HashGenerator /></ModuleRoute>,
  },
  {
    path: 'image-convert',
    handle: { moduleId: 'image-convert' },
    element: <ModuleRoute moduleId="image-convert"><ImageConvert /></ModuleRoute>,
  },
  {
    path: 'color-tool',
    handle: { moduleId: 'color-tool' },
    element: <ModuleRoute moduleId="color-tool"><ColorTool /></ModuleRoute>,
  },
  {
    path: 'base64-tool',
    handle: { moduleId: 'base64-tool' },
    element: <ModuleRoute moduleId="base64-tool"><Base64Tool /></ModuleRoute>,
  },
  {
    path: 'timestamp-converter',
    handle: { moduleId: 'timestamp-converter' },
    element: <ModuleRoute moduleId="timestamp-converter"><TimestampConverter /></ModuleRoute>,
  },
  {
    path: 'uuid-generator',
    handle: { moduleId: 'uuid-generator' },
    element: <ModuleRoute moduleId="uuid-generator"><UuidGenerator /></ModuleRoute>,
  },
  {
    path: 'jwt-decoder',
    handle: { moduleId: 'jwt-decoder' },
    element: <ModuleRoute moduleId="jwt-decoder"><JwtDecoder /></ModuleRoute>,
  },
  {
    path: 'regex-tester',
    handle: { moduleId: 'regex-tester' },
    element: <ModuleRoute moduleId="regex-tester"><RegexTester /></ModuleRoute>,
  },
  {
    path: 'text-diff',
    handle: { moduleId: 'text-diff' },
    element: <ModuleRoute moduleId="text-diff"><TextDiff /></ModuleRoute>,
  },
  {
    path: 'screenshot',
    handle: { moduleId: 'screenshot' },
    element: <ModuleRoute moduleId="screenshot"><Screenshot /></ModuleRoute>,
  },
  {
    path: 'http-server',
    handle: { moduleId: 'http-server' },
    element: <ModuleRoute moduleId="http-server"><HttpServer /></ModuleRoute>,
  },
  {
    path: 'p2p-transfer',
    handle: { moduleId: 'p2p-transfer' },
    element: <ModuleRoute moduleId="p2p-transfer"><P2PTransfer /></ModuleRoute>,
  },
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
