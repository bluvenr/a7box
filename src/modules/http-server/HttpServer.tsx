/**
 * A7Box HTTP Service — Multi-instance LAN file server
 * Each instance serves a directory for browser-based viewing.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, Play, Square, FolderOpen, Trash2, RotateCcw, WifiOff } from 'lucide-react'
import QRCode from 'qrcode'
import {
  httpStartServer,
  httpStopServer,
  httpListServers,
  type HttpInstanceInfo,
} from '../../shared/utils/tauriBridge'
import { useHttpServiceStatus } from './httpServiceStore'
import { useToast } from '../../components/Toast'
import { useConfirm } from '../../components/Dialog'
import { isTauri } from '../../shared/utils'
import {
  GUIDE_KEY, MAX_HISTORY,
  type HistoryItem,
  loadHistory, saveHistory, loadActive, saveActive,
} from './utils'
import { InstanceCard } from './components/InstanceCard'

export default function HttpServer() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()

  const { instances, setInstances, addInstance, removeInstance, pendingDirectory, setPendingDirectory } = useHttpServiceStatus()

  const [directory, setDirectory] = useState('')
  const [port, setPort] = useState('')
  const [starting, setStarting] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [expandedQr, setExpandedQr] = useState<string | null>(null)
  const [qrCache, setQrCache] = useState<Record<string, string>>({})
  const [stoppingId, setStoppingId] = useState<string | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)

  const synced = useRef(false)
  const startingDirRef = useRef<string | null>(null)
  const recentlyStartedRef = useRef<Map<string, number>>(new Map())
  const guideRef = useRef<HTMLDivElement>(null)
  const [recentHistory, setRecentHistory] = useState<HistoryItem[]>(() => loadHistory())

  // ── Sync with backend on mount ──
  useEffect(() => {
    if (!isTauri() || synced.current) return
    synced.current = true

    if (!localStorage.getItem(GUIDE_KEY)) setShowGuide(true)

    ;(async () => {
      const list = await httpListServers()
      if (list.length > 0) setInstances(list)

      const prevActive = loadActive()
      const runningDirs = new Set(list.map((i: HttpInstanceInfo) => i.directory))
      const orphaned = prevActive.filter((a) => !runningDirs.has(a.directory))
      if (orphaned.length > 0) {
        setRecentHistory((prev) => {
          const merged = [
            ...orphaned.map((o) => ({ directory: o.directory, port: o.port, stoppedAt: Date.now() })),
            ...prev,
          ]
          const seen = new Set<string>()
          const deduped = merged.filter((item) => {
            if (seen.has(item.directory)) return false
            seen.add(item.directory)
            return true
          })
          const next = deduped.slice(0, MAX_HISTORY)
          saveHistory(next)
          return next
        })
      }
      saveActive(list.map((i: HttpInstanceInfo) => ({ directory: i.directory, port: i.port })))

      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const dir = await invoke<string | null>('get_pending_http_serve_dir')
        if (dir && !startingDirRef.current) {
          startingDirRef.current = dir
          const alreadyRunning = list.some((i: HttpInstanceInfo) => i.directory === dir)
          if (alreadyRunning) {
            toast(t('modules.httpServer.ui.alreadyRunning', { defaultValue: 'Web service is already running for this directory' }), 'info')
          } else {
            const info = await httpStartServer(dir, undefined)
            if (info) {
              addInstance(info)
              setHighlightId(info.id)
              setTimeout(() => setHighlightId(null), 2500)
              toast(t('modules.httpServer.ui.started', { defaultValue: 'Web service started' }))
            } else {
              setDirectory(dir)
              toast(t('modules.httpServer.ui.startFailed', { defaultValue: 'Failed to start' }), 'error')
            }
          }
          startingDirRef.current = null
          recentlyStartedRef.current.set(dir, Date.now())
        }
      } catch { /* ignore */ }
    })()
  }, [])

  // ── Track running instances for crash recovery ──
  useEffect(() => {
    saveActive(instances.map((i) => ({ directory: i.directory, port: i.port })))
  }, [instances])

  // ── Consume pending directory from deep link ──
  useEffect(() => {
    if (pendingDirectory && !startingDirRef.current) {
      const dir = pendingDirectory
      setPendingDirectory('')
      const recent = recentlyStartedRef.current.get(dir)
      if (recent && Date.now() - recent < 5000) return
      startingDirRef.current = dir
      ;(async () => {
        setStarting(true)
        try {
          const list = await httpListServers()
          const alreadyRunning = list.some((i: HttpInstanceInfo) => i.directory === dir)
          if (alreadyRunning) {
            if (list.length > 0) setInstances(list)
            toast(t('modules.httpServer.ui.alreadyRunning', { defaultValue: 'Web service is already running for this directory' }), 'info')
          } else {
            const info = await httpStartServer(dir, undefined)
            if (info) {
              addInstance(info)
              setHighlightId(info.id)
              setTimeout(() => setHighlightId(null), 2500)
              toast(t('modules.httpServer.ui.started', { defaultValue: 'Web service started' }))
            } else {
              setDirectory(dir)
              toast(t('modules.httpServer.ui.startFailed', { defaultValue: 'Failed to start' }), 'error')
            }
          }
        } catch {
          setDirectory(dir)
          toast(t('modules.httpServer.ui.startFailed', { defaultValue: 'Failed to start' }), 'error')
        }
        setStarting(false)
        startingDirRef.current = null
      })()
    }
  }, [pendingDirectory, setPendingDirectory, addInstance, setInstances, toast, t])

  // ── Generate QR code for an instance ──
  const getQrCode = useCallback(async (url: string, id: string) => {
    if (qrCache[id]) return qrCache[id]
    const dataUrl = await QRCode.toDataURL(url, { width: 160, margin: 1 })
    setQrCache((prev) => ({ ...prev, [id]: dataUrl }))
    return dataUrl
  }, [qrCache])

  // ── Select directory via system dialog ──
  const handleSelectDir = useCallback(async () => {
    if (!isTauri()) return
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({ directory: true, multiple: false })
      if (selected) setDirectory(selected as string)
    } catch (e) {
      console.error('[HttpServer] Dialog error:', e)
    }
  }, [])

  // ── Port validation ──
  const portError = (() => {
    if (!port.trim()) return ''
    const n = Number(port)
    if (!Number.isInteger(n) || n < 1024 || n > 65535) {
      return t('modules.httpServer.ui.portInvalid', { defaultValue: 'Port range 1024-65535' })
    }
    return ''
  })()

  // ── Start a new server instance ──
  const handleStart = useCallback(async () => {
    if (!directory.trim()) {
      toast(t('modules.httpServer.ui.selectDirFirst', { defaultValue: 'Please select a directory first' }), 'error')
      return
    }
    setStarting(true)
    try {
      const portNum = port.trim() ? parseInt(port, 10) : undefined
      if (portError) {
        toast(portError, 'error')
        setStarting(false)
        return
      }
      const info = await httpStartServer(directory.trim(), portNum)
      if (info) {
        addInstance(info)
        setDirectory('')
        setPort('')
        toast(t('modules.httpServer.ui.started', { defaultValue: 'Web service started' }))
      } else {
        toast(t('modules.httpServer.ui.startFailed', { defaultValue: 'Failed to start' }), 'error')
      }
    } catch (e) {
      console.error('[HttpServer] Start error:', e)
      toast(t('modules.httpServer.ui.startFailed', { defaultValue: 'Failed to start' }), 'error')
    }
    setStarting(false)
  }, [directory, port, portError, addInstance, toast, t])

  // ── Stop an instance (with fade-out animation) ──
  const handleStop = useCallback(async (inst: HttpInstanceInfo) => {
    const ok = await confirm({
      title: t('modules.httpServer.ui.stopServer', { defaultValue: 'Stop service' }),
      message: t('modules.httpServer.ui.stopConfirm', { defaultValue: 'Are you sure you want to stop this web service?' }),
      detail: `${inst.directory} (端口 ${inst.port})`,
      confirmText: t('common.confirm', { defaultValue: 'Confirm' }),
      cancelText: t('common.cancel', { defaultValue: 'Cancel' }),
      danger: true,
    })
    if (!ok) return

    setStoppingId(inst.id)
    await httpStopServer(inst.id)

    removeInstance(inst.id)
    setStoppingId(null)
    setQrCache((prev) => { const next = { ...prev }; delete next[inst.id]; return next })
    const newItem: HistoryItem = { directory: inst.directory, port: inst.port, stoppedAt: Date.now() }
    setRecentHistory((prev) => {
      const next = [newItem, ...prev.filter((h) => h.directory !== inst.directory)].slice(0, MAX_HISTORY)
      saveHistory(next)
      return next
    })
    toast(t('modules.httpServer.ui.stopped', { defaultValue: 'Service stopped' }))
  }, [confirm, removeInstance, toast, t])

  // ── Stop all instances ──
  const handleStopAll = useCallback(async () => {
    if (instances.length === 0) return
    const ok = await confirm({
      title: t('modules.httpServer.ui.stopAll', { defaultValue: 'Stop all' }),
      message: t('modules.httpServer.ui.stopAllConfirm', {
        defaultValue: 'Are you sure you want to stop all {{count}} web services?',
        count: instances.length,
      }),
      confirmText: t('common.confirm', { defaultValue: 'Confirm' }),
      cancelText: t('common.cancel', { defaultValue: 'Cancel' }),
      danger: true,
    })
    if (!ok) return
    const stopped = instances.map((inst) => ({
      inst,
      promise: httpStopServer(inst.id).then(() => inst).catch(() => null),
    }))
    const results = await Promise.all(stopped.map((s) => s.promise))
    results.forEach((inst) => {
      if (inst) removeInstance(inst.id)
    })
    setStoppingId(null)
    const now = Date.now()
    const newItems: HistoryItem[] = results
      .filter(Boolean)
      .map((inst) => ({ directory: inst!.directory, port: inst!.port, stoppedAt: now }))
    if (newItems.length > 0) {
      setRecentHistory((prev) => {
        const merged = [...newItems, ...prev]
        const seen = new Set<string>()
        const deduped = merged.filter((item) => {
          if (seen.has(item.directory)) return false
          seen.add(item.directory)
          return true
        })
        const next = deduped.slice(0, MAX_HISTORY)
        saveHistory(next)
        return next
      })
    }
    toast(t('modules.httpServer.ui.stoppedAll', {
      defaultValue: 'Stopped {{count}} services',
      count: newItems.length,
    }))
  }, [instances, confirm, removeInstance, toast, t])

  // ── Copy URL ──
  const handleCopyUrl = useCallback(async (url: string) => {
    await navigator.clipboard.writeText(url)
    toast(t('common.copied', { defaultValue: 'Copied' }))
  }, [toast, t])

  // ── Dismiss guide ──
  const dismissGuide = useCallback(() => {
    localStorage.setItem(GUIDE_KEY, '1')
    setShowGuide(false)
  }, [])

  // ── Open/show guide with scroll + flash feedback ──
  const openGuide = useCallback(() => {
    if (showGuide) {
      guideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      guideRef.current?.classList.remove('guide-flash')
      void guideRef.current?.offsetWidth
      guideRef.current?.classList.add('guide-flash')
    } else {
      setShowGuide(true)
    }
  }, [showGuide])

  // ── Reuse a history item (restart service) ──
  const handleRestart = useCallback(async (item: HistoryItem) => {
    try {
      const info = await httpStartServer(item.directory, item.port)
      if (info) {
        addInstance(info)
        setHighlightId(info.id)
        setTimeout(() => setHighlightId(null), 2500)
        setRecentHistory((prev) => {
          const next = prev.filter((h) => h.directory !== item.directory)
          saveHistory(next)
          return next
        })
        toast(t('modules.httpServer.ui.started', { defaultValue: 'Web service started' }))
        return
      }
    } catch { /* Port might be occupied */ }
    try {
      const info = await httpStartServer(item.directory, undefined)
      if (info) {
        addInstance(info)
        setHighlightId(info.id)
        setTimeout(() => setHighlightId(null), 2500)
        setRecentHistory((prev) => {
          const next = prev.filter((h) => h.directory !== item.directory)
          saveHistory(next)
          return next
        })
        toast(t('modules.httpServer.ui.restartedNewPort', { defaultValue: 'Original port was occupied, using new port' }))
      } else {
        toast(t('modules.httpServer.ui.startFailed', { defaultValue: 'Failed to start' }), 'error')
      }
    } catch (e) {
      console.error('[HttpServer] Restart error:', e)
      toast(t('modules.httpServer.ui.startFailed', { defaultValue: 'Failed to start' }), 'error')
    }
  }, [addInstance, toast, t])

  // ── Delete a history item ──
  const removeHistoryItem = useCallback((idx: number) => {
    setRecentHistory((prev) => {
      const next = [...prev]
      next.splice(idx, 1)
      saveHistory(next)
      return next
    })
  }, [])

  // ── Clear all history ──
  const clearHistory = useCallback(() => {
    setRecentHistory([])
    saveHistory([])
  }, [])

  // ── Render ──
  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Globe size={20} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-text-primary">
            {t('modules.httpServer.name')}
          </h1>
          <div className="flex items-center gap-2">
            <p className="text-xs text-text-secondary">
              {t('modules.httpServer.description')}
            </p>
            <button
              onClick={openGuide}
              className="text-[11px] text-primary/70 hover:text-primary cursor-pointer transition shrink-0"
            >
              {t('modules.httpServer.ui.guide.title', { defaultValue: 'Quick Start' })} →
            </button>
          </div>
        </div>
      </div>

      {/* ── Guide ── */}
      {showGuide && (
        <div ref={guideRef} className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-5 guide-section">
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-sm font-semibold text-primary">
              {t('modules.httpServer.ui.guide.title', { defaultValue: 'Quick Start' })}
            </h3>
            <button onClick={dismissGuide} className="text-text-muted hover:text-text-primary text-xs cursor-pointer">✕</button>
          </div>
          <p className="text-xs text-text-secondary mb-4 leading-relaxed">
            {t('modules.httpServer.ui.guide.intro', {
              defaultValue: 'Quickly create a LAN website for any folder, letting colleagues access files via browser. Great for sharing HTML prototypes, docs, or temporary files.',
            })}
          </p>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">{n}</span>
                <div>
                  <p className="text-xs font-medium text-text-primary">
                    {t(`modules.httpServer.ui.guide.step${n}`)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Add New Server Form ── */}
      <div className="mb-6 rounded-xl border border-border-subtle bg-bg-elevated p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
              {t('modules.httpServer.ui.directory', { defaultValue: 'Directory' })}
            </label>
            <button
              type="button"
              onClick={handleSelectDir}
              className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition cursor-pointer ${
                directory
                  ? 'border-primary/30 bg-primary/5 text-text-primary hover:border-primary/50'
                  : 'border-border-base bg-bg-base text-text-muted hover:border-primary hover:text-primary'
              }`}
            >
              <FolderOpen size={16} className="shrink-0" />
              <span className="truncate">
                {directory || t('modules.httpServer.ui.selectDir', { defaultValue: 'Select folder...' })}
              </span>
            </button>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
              {t('modules.httpServer.ui.port', { defaultValue: 'Port' })}
            </label>
            <input
              type="number"
              min={1024}
              max={65535}
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder={t('modules.httpServer.ui.portAuto', { defaultValue: 'Auto' })}
              className={`w-28 rounded-lg border bg-bg-base px-3 py-2 text-sm outline-none transition ${
                portError
                  ? 'border-red-400 text-red-400 focus:border-red-500'
                  : 'border-border-base text-text-primary focus:border-primary'
              }`}
            />
            {portError && (
              <p className="mt-1 text-[10px] text-red-400">{portError}</p>
            )}
          </div>

          <button
            onClick={handleStart}
            disabled={starting || !!portError}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {starting ? (
              <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Play size={14} />
            )}
            {t('modules.httpServer.ui.start', { defaultValue: 'Start service' })}
          </button>
        </div>
      </div>

      {/* ── Running Instances ── */}
      {instances.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
              <span>{t('modules.httpServer.ui.runningCount', {
                defaultValue: '{{count}} running',
                count: instances.length,
              })}</span>
            </div>
            {instances.length >= 2 && (
              <button
                type="button"
                onClick={handleStopAll}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-text-muted transition hover:bg-danger/10 hover:text-danger cursor-pointer"
              >
                <Square size={11} className="fill-current" />
                {t('modules.httpServer.ui.stopAll', { defaultValue: 'Stop all' })}
              </button>
            )}
          </div>
          {instances.map((inst) => (
            <InstanceCard
              key={inst.id}
              instance={inst}
              expandedQr={expandedQr}
              setExpandedQr={setExpandedQr}
              qrCache={qrCache}
              getQrCode={getQrCode}
              onCopy={handleCopyUrl}
              onStop={handleStop}
              isStopping={stoppingId === inst.id}
              isHighlight={highlightId === inst.id}
              t={t}
            />
          ))}
        </div>
      ) : (
        !starting && (
          <div className="rounded-xl border-2 border-dashed border-border-subtle bg-bg-elevated/50 p-10 text-center">
            <WifiOff size={32} className="mx-auto mb-3 text-text-disabled" />
            <p className="text-sm text-text-muted">
              {t('modules.httpServer.ui.noServers', { defaultValue: 'No web services running' })}
            </p>
            <p className="mt-1 text-xs text-text-disabled">
              {t('modules.httpServer.ui.noServersHint', { defaultValue: 'Select a directory and click start' })}
            </p>
            {!showGuide && (
              <button
                onClick={openGuide}
                className="mt-3 text-xs text-text-muted hover:text-primary cursor-pointer transition"
              >
                {t('modules.httpServer.ui.viewGuide', { defaultValue: 'View guide' })} →
              </button>
            )}
          </div>
        )
      )}

      {/* ── Recent History ── */}
      {recentHistory.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                {t('modules.httpServer.ui.recentHistory', { defaultValue: 'Recent' })}
              </h3>
              <span className="text-[10px] text-text-disabled">({recentHistory.length})</span>
            </div>
            <button
              onClick={clearHistory}
              className="flex items-center gap-1 text-[11px] text-text-disabled hover:text-red-400 cursor-pointer transition"
            >
              <Trash2 size={11} />
              {t('modules.httpServer.ui.clearHistory', { defaultValue: 'Clear' })}
            </button>
          </div>
          <div className="space-y-2">
            {recentHistory.map((item, i) => (
              <div
                key={`${item.directory}-${i}`}
                className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-elevated/40 px-3 py-2.5"
              >
                <FolderOpen size={14} className="shrink-0 text-text-disabled" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-text-secondary truncate" title={item.directory}>
                    {item.directory}
                  </p>
                  <p className="text-[10px] text-text-disabled">
                    :{item.port} · {t('modules.httpServer.ui.historyStopped', { defaultValue: 'Stopped' })}
                  </p>
                </div>
                <button
                  onClick={() => handleRestart(item)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-green-500/70 hover:text-green-500 hover:bg-green-500/10 transition cursor-pointer"
                  title={t('modules.httpServer.ui.restart', { defaultValue: 'Restart' })}
                >
                  <RotateCcw size={12} />
                  <span className="hidden sm:inline">{t('modules.httpServer.ui.restart', { defaultValue: 'Restart' })}</span>
                </button>
                <button
                  onClick={() => removeHistoryItem(i)}
                  className="rounded-md p-1 text-text-disabled hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                  title={t('common.delete', { defaultValue: 'Delete' })}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
