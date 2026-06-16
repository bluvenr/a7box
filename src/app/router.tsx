/**
 * A7Box Router Configuration
 */

import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { MainLayout } from './layouts/MainLayout'

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

// Page loading skeleton
function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center bg-bg-base">
      <div className="animate-pulse text-text-muted text-sm">Loading...</div>
    </div>
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
          <Suspense fallback={<PageLoader />}>
            <Home />
          </Suspense>
        ),
      },
      {
        path: 'settings',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Settings />
          </Suspense>
        ),
      },
      // Tool module routes
      {
        path: 'json-formatter',
        element: (
          <Suspense fallback={<PageLoader />}>
            <JsonFormatter />
          </Suspense>
        ),
      },
      {
        path: 'qr-code',
        element: (
          <Suspense fallback={<PageLoader />}>
            <QrCode />
          </Suspense>
        ),
      },
      {
        path: 'markdown-preview',
        element: (
          <Suspense fallback={<PageLoader />}>
            <MarkdownPreview />
          </Suspense>
        ),
      },
      {
        path: 'code-minify',
        element: (
          <Suspense fallback={<PageLoader />}>
            <CodeMinify />
          </Suspense>
        ),
      },
      {
        path: 'image-compress',
        element: (
          <Suspense fallback={<PageLoader />}>
            <ImageCompress />
          </Suspense>
        ),
      },
      {
        path: 'hash-generator',
        element: (
          <Suspense fallback={<PageLoader />}>
            <HashGenerator />
          </Suspense>
        ),
      },
      {
        path: 'image-convert',
        element: (
          <Suspense fallback={<PageLoader />}>
            <ImageConvert />
          </Suspense>
        ),
      },
      {
        path: 'color-tool',
        element: (
          <Suspense fallback={<PageLoader />}>
            <ColorTool />
          </Suspense>
        ),
      },
      {
        path: 'base64-tool',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Base64Tool />
          </Suspense>
        ),
      },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
