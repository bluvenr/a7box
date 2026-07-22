/**
 * A7Box Screenshot Tool - Session-based
 * Capture button + shortcut hint + session history grid with save/delete
 * Screenshots stored as temp files in %TEMP%/a7box_screenshots/ during session
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, Clock, Download, Eye, Trash2, X } from 'lucide-react'
import { formatShortcut, isTauri } from '../../shared/utils'
import { useShortcutStore } from '../../core/shortcuts'

interface SessionCapture {
  tempPath: string
  width: number
  height: number
}

export default function Screenshot() {
  const { t } = useTranslation()
  const [history, setHistory] = useState<SessionCapture[]>([])
  const [error, setError] = useState<string | null>(null)
  // Reactive shortcut subscription — stays in sync when user changes it in Settings
  const shortcutText = useShortcutStore((s) => {
    const sc = s.shortcuts.find((sc) => sc.action === 'open-screenshot')
    return sc?.enabled ? formatShortcut(sc.keys) : ''
  })
  const [previewItem, setPreviewItem] = useState<SessionCapture | null>(null)
  const [previewBase64, setPreviewBase64] = useState<string>('')
  const [thumbnailCache, setThumbnailCache] = useState<Record<string, string>>({})
  const [failedThumbs, setFailedThumbs] = useState<Set<string>>(new Set())
  const thumbnailCacheRef = useRef<Record<string, string>>({})
  const [previewLoading, setPreviewLoading] = useState(false)

  // Clear all screenshots
  const handleClear = useCallback(async () => {
    if (!isTauri()) return
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('clear_session_captures')
      setHistory([])
      setThumbnailCache({})
      thumbnailCacheRef.current = {}
      setFailedThumbs(new Set())
    } catch { /* ignore */ }
  }, [])

  // Load session captures (read temp files as base64)
  const refreshHistory = useCallback(async () => {
    if (!isTauri()) return
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const captures = await invoke<SessionCapture[]>('get_session_captures')
      setHistory(captures)
      const currentCache = thumbnailCacheRef.current
      const cache: Record<string, string> = {}
      const failed: string[] = []
      for (const c of captures) {
        if (!currentCache[c.tempPath]) {
          try {
            const b64 = await invoke<string>('read_capture_thumbnail', { path: c.tempPath })
            cache[c.tempPath] = b64
          } catch {
            failed.push(c.tempPath)
          }
        }
      }
      if (Object.keys(cache).length > 0) {
        thumbnailCacheRef.current = { ...thumbnailCacheRef.current, ...cache }
        setThumbnailCache(prev => ({ ...prev, ...cache }))
      }
      if (failed.length > 0) {
        setFailedThumbs(prev => new Set([...prev, ...failed]))
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { refreshHistory() }, [refreshHistory])

  // Listen for screenshot-captured event → refresh
  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    ;(async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        unlisten = await listen('screenshot-captured', () => { refreshHistory() })
      } catch { /* ignore */ }
    })()
    return () => { unlisten?.() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Trigger capture flow
  const handleCapture = async () => {
    setError(null)
    if (!isTauri()) { setError(t('modules.screenshot.ui.webOnly')); return }
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const { emit } = await import('@tauri-apps/api/event')
      await invoke('set_capture_from_page', { value: true })
      await emit('start-capture-flow', '')
    } catch (e) { setError(String(e)) }
  }

  // Save a single capture to user-chosen directory
  const handleSaveItem = async (e: React.MouseEvent, tempPath: string) => {
    e.stopPropagation()
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('save_capture_from_temp', { path: tempPath })
    } catch { /* ignore */ }
  }

  // Delete a single capture
  const handleDeleteItem = async (e: React.MouseEvent, tempPath: string) => {
    e.stopPropagation()
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('delete_capture_file', { path: tempPath })
      setHistory(prev => prev.filter(h => h.tempPath !== tempPath))
      setThumbnailCache(prev => {
        const next = { ...prev }
        delete next[tempPath]
        thumbnailCacheRef.current = next
        return next
      })
      setFailedThumbs(prev => {
        const next = new Set(prev)
        next.delete(tempPath)
        return next
      })
    } catch { /* ignore */ }
  }

  // Preview item click handler
  const showPreview = async (item: SessionCapture) => {
    setPreviewItem(item)
    setPreviewBase64('')
    setPreviewLoading(true)
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const b64 = await invoke<string>('read_capture_file', { path: item.tempPath })
      setPreviewBase64(b64)
    } catch { setPreviewBase64('') }
    setPreviewLoading(false)
  }

  // ESC to close preview
  useEffect(() => {
    if (!previewItem) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewItem(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [previewItem])

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Camera size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            {t('modules.screenshot.name')}
          </h1>
          <p className="text-sm text-text-secondary">
            {t('modules.screenshot.description')}
          </p>
        </div>
      </div>

      {/* Capture Button + Shortcut Hint */}
      <div className="mb-8 flex flex-col items-center gap-4 rounded-2xl border border-border-subtle bg-bg-elevated py-12">
        <button
          onClick={handleCapture}
          className="group flex items-center gap-3 rounded-2xl bg-primary px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-primary/20 transition hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30 active:scale-[0.97] cursor-pointer"
        >
          <Camera size={22} className="transition group-hover:scale-110" />
          {t('modules.screenshot.ui.startCapture', { defaultValue: 'Start Capture' })}
        </button>

        <div className="flex items-center gap-2 text-sm text-text-muted">
          <kbd className="rounded-md border border-border-base bg-bg-base px-2 py-0.5 text-xs font-mono">
            {shortcutText}
          </kbd>
          <span>{t('modules.screenshot.ui.shortcutHint', { defaultValue: 'to capture anytime' })}</span>
        </div>

      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          {error}
        </div>
      )}

      {/* Session History */}
      {history.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Clock size={14} />
              {t('modules.screenshot.ui.history', { defaultValue: 'Session History' })} ({history.length})
            </h3>
            <button
              onClick={handleClear}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-muted transition hover:bg-red-500/10 hover:text-red-400 cursor-pointer"
              title={t('modules.screenshot.ui.clearHistory', { defaultValue: 'Clear history' })}
            >
              <Trash2 size={12} />
              <span>{t('modules.screenshot.ui.clearHistory', { defaultValue: 'Clear' })}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {history.map((h) => (
              <div
                key={h.tempPath}
                className="group relative aspect-video cursor-pointer overflow-hidden rounded-lg border border-border-subtle bg-bg-base transition hover:border-primary/50 hover:shadow-md"
                onClick={() => showPreview(h)}
              >
                {failedThumbs.has(h.tempPath) ? (
                  <div className="flex h-full w-full items-center justify-center text-xs text-text-muted">
                    {t('modules.screenshot.ui.loadFailed', { defaultValue: 'Failed to load' })}
                  </div>
                ) : (
                  <img
                    src={thumbnailCache[h.tempPath] || ''}
                    alt={h.tempPath.split(/[\\/]/).pop() || 'Capture'}
                    className="h-full w-full object-cover transition group-hover:scale-105"
                    style={!thumbnailCache[h.tempPath] ? { opacity: 0.3 } : undefined}
                    onError={() => setFailedThumbs(prev => new Set([...prev, h.tempPath]))}
                  />
                )}
                {/* Hover overlay with center view icon */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                  <div className="rounded-full bg-white/25 p-3 text-white backdrop-blur-sm transition hover:bg-white/40">
                    <Eye size={20} />
                  </div>
                </div>
                {/* Bottom-left: Save & Delete */}
                <div className="absolute bottom-1 left-1 z-10 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={(e) => handleSaveItem(e, h.tempPath)}
                    className="rounded-full bg-black/50 p-1.5 text-white transition hover:bg-black/70 cursor-pointer"
                    title={t('modules.screenshot.ui.save', { defaultValue: 'Save' })}
                  >
                    <Download size={11} />
                  </button>
                  <button
                    onClick={(e) => handleDeleteItem(e, h.tempPath)}
                    className="rounded-full bg-black/50 p-1.5 text-white transition hover:bg-red-500/70 cursor-pointer"
                    title={t('modules.screenshot.ui.delete', { defaultValue: 'Delete' })}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
                {/* Resolution badge */}
                <div className="absolute bottom-1 right-1 rounded bg-black/50 px-1 py-0.5 text-[9px] text-white/70">
                  {h.width}×{h.height}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
          onClick={() => setPreviewItem(null)}
        >
          <div
            className="relative max-h-full max-w-full overflow-hidden rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreviewItem(null)}
              className="absolute right-2 top-2 z-10 rounded-full bg-black/50 p-1.5 text-white transition hover:bg-black/70 cursor-pointer"
            >
              <X size={14} />
            </button>

            {previewLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              </div>
            )}

            <img
              src={previewBase64}
              alt="Preview"
              className="max-h-[80vh] max-w-[90vw] object-contain"
            />

            {/* Bottom toolbar */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-4 py-3">
              <span className="text-[11px] text-white/50">{previewItem.width}×{previewItem.height}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => handleSaveItem(e, previewItem.tempPath)}
                  className="flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-xs text-white transition hover:bg-white/30 cursor-pointer"
                >
                  <Download size={12} />
                  {t('modules.screenshot.ui.save', { defaultValue: 'Save' })}
                </button>
                <button
                  onClick={(e) => { handleDeleteItem(e, previewItem.tempPath); setPreviewItem(null) }}
                  className="flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-xs text-white transition hover:bg-red-500/50 cursor-pointer"
                >
                  <Trash2 size={12} />
                  {t('modules.screenshot.ui.delete', { defaultValue: 'Delete' })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
