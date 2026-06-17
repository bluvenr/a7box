/**
 * A7Box Custom Title Bar
 * Cross-platform: Windows (buttons right) + macOS (traffic lights left)
 * Features: drag to move, double-click to maximize, window control buttons
 */

import { useState, useEffect, useCallback } from 'react'
import { Minus, Square, X, Maximize2 } from 'lucide-react'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

type Platform = 'windows' | 'macos' | 'linux'

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mac')) return 'macos'
  if (ua.includes('linux')) return 'linux'
  return 'windows'
}

export function TitleBar() {
  const [platform] = useState<Platform>(detectPlatform)
  const [isMaximized, setIsMaximized] = useState(false)

  // Sync maximized state from Tauri window
  useEffect(() => {
    if (!isTauri()) return

    let unlisten: (() => void) | undefined

    (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        const win = getCurrentWindow()
        setIsMaximized(await win.isMaximized())

        const { listen } = await import('@tauri-apps/api/event')
        unlisten = await listen('tauri://resize', async () => {
          setIsMaximized(await win.isMaximized())
        })
      } catch {
        // Tauri API not available
      }
    })()

    return () => { unlisten?.() }
  }, [])

  const handleMinimize = useCallback(async () => {
    if (!isTauri()) return
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    getCurrentWindow().minimize()
  }, [])

  const handleMaximize = useCallback(async () => {
    if (!isTauri()) return
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    getCurrentWindow().toggleMaximize()
  }, [])

  const handleClose = useCallback(async () => {
    if (!isTauri()) return
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    getCurrentWindow().hide()
  }, [])

  const handleDragStart = useCallback(async (e: React.MouseEvent) => {
    // Only drag on left click, and not on buttons
    if (e.button !== 0) return
    if (!isTauri()) return
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().startDragging()
    } catch { /* ignore */ }
  }, [])

  const isMac = platform === 'macos'

  return (
    <div
      className="flex h-8 shrink-0 select-none items-center bg-bg-elevated"
      data-tauri-drag-region
      onMouseDown={handleDragStart}
      onDoubleClick={handleMaximize}
    >
      {/* macOS: left padding for traffic light buttons */}
      {isMac && <div className="w-[78px] shrink-0" />}

      {/* Drag region (fills remaining space) */}
      <div className="flex-1" data-tauri-drag-region />

      {/* Windows/Linux: window control buttons on the right */}
      {!isMac && (
        <div className="flex h-full shrink-0 items-center" onMouseDown={(e) => e.stopPropagation()}>
          <TitleBarButton onClick={handleMinimize} title="Minimize">
            <Minus className="h-3.5 w-3.5" />
          </TitleBarButton>
          <TitleBarButton onClick={handleMaximize} title="Maximize">
            {isMaximized ? (
              <Maximize2 className="h-3 w-3" />
            ) : (
              <Square className="h-3 w-3" />
            )}
          </TitleBarButton>
          <TitleBarButton onClick={handleClose} title="Close" danger>
            <X className="h-3.5 w-3.5" />
          </TitleBarButton>
        </div>
      )}
    </div>
  )
}

// Window control button
function TitleBarButton({
  children,
  onClick,
  title,
  danger = false,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  danger?: boolean
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onDoubleClick={(e) => e.stopPropagation()}
      title={title}
      className={`flex h-full w-11.5 items-center justify-center transition-colors ${
        danger
          ? 'text-text-secondary hover:bg-red-500 hover:text-white'
          : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  )
}
