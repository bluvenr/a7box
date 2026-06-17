/**
 * A7Box Router Configuration
 */

import { createBrowserRouter, RouterProvider } from 'react-router-dom'
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

// Router configuration
export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
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
        element: <ModuleRoute moduleId="json-formatter"><JsonFormatter /></ModuleRoute>,
      },
      {
        path: 'qr-code',
        element: <ModuleRoute moduleId="qr-code"><QrCode /></ModuleRoute>,
      },
      {
        path: 'markdown-preview',
        element: <ModuleRoute moduleId="markdown-preview"><MarkdownPreview /></ModuleRoute>,
      },
      {
        path: 'code-minify',
        element: <ModuleRoute moduleId="code-minify"><CodeMinify /></ModuleRoute>,
      },
      {
        path: 'image-compress',
        element: <ModuleRoute moduleId="image-compress"><ImageCompress /></ModuleRoute>,
      },
      {
        path: 'hash-generator',
        element: <ModuleRoute moduleId="hash-generator"><HashGenerator /></ModuleRoute>,
      },
      {
        path: 'image-convert',
        element: <ModuleRoute moduleId="image-convert"><ImageConvert /></ModuleRoute>,
      },
      {
        path: 'color-tool',
        element: <ModuleRoute moduleId="color-tool"><ColorTool /></ModuleRoute>,
      },
      {
        path: 'base64-tool',
        element: <ModuleRoute moduleId="base64-tool"><Base64Tool /></ModuleRoute>,
      },
      {
        path: 'timestamp-converter',
        element: <ModuleRoute moduleId="timestamp-converter"><TimestampConverter /></ModuleRoute>,
      },
      {
        path: 'uuid-generator',
        element: <ModuleRoute moduleId="uuid-generator"><UuidGenerator /></ModuleRoute>,
      },
      {
        path: 'jwt-decoder',
        element: <ModuleRoute moduleId="jwt-decoder"><JwtDecoder /></ModuleRoute>,
      },
      {
        path: 'regex-tester',
        element: <ModuleRoute moduleId="regex-tester"><RegexTester /></ModuleRoute>,
      },
      {
        path: 'text-diff',
        element: <ModuleRoute moduleId="text-diff"><TextDiff /></ModuleRoute>,
      },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
