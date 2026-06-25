/**
 * A7Box HTTP Service — Multi-instance LAN file server
 * Each instance serves a directory for browser-based viewing.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, Play, Square, Copy, Wifi, WifiOff, FolderOpen, ChevronDown, ChevronUp, QrCode, Trash2, RotateCcw } from 'lucide-react'
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

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

const GUIDE_KEY = 'a7box-http-guide-seen'
const HISTORY_KEY = 'a7box-http-history'
const MAX_HISTORY = 5

interface HistoryItem { directory: string; port: number; stoppedAt: number }

function loadHistory(): HistoryItem[] {
  try {
    const items: HistoryItem[] = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
    // Deduplicate by directory (keep the most recent one)
    const seen = new Set<string>()
    return items.filter((item) => {
      if (seen.has(item.directory)) return false
      seen.add(item.directory)
      return true
    })
  } catch { return [] }
}
function saveHistory(items: HistoryItem[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)))
}

// ── Component ─────────────────────────────────────────────────────────────

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

    // Show guide for first-time users
    if (!localStorage.getItem(GUIDE_KEY)) setShowGuide(true)

    // Restore running instances + check for cold-start deep link dir
    ;(async () => {
      const list = await httpListServers()
      if (list.length > 0) setInstances(list)

      // Fetch pending HTTP serve dir from Rust (cold-start from context menu)
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const dir = await invoke<string | null>('get_pending_http_serve_dir')
        if (dir && !startingDirRef.current) {
          startingDirRef.current = dir
          const alreadyRunning = list.some((i: HttpInstanceInfo) => i.directory === dir)
          if (alreadyRunning) {
            toast(t('modules.httpServer.ui.alreadyRunning', { defaultValue: '该目录的网页服务已在运行中' }), 'info')
          } else {
            const info = await httpStartServer(dir, undefined)
            if (info) {
              addInstance(info)
              setHighlightId(info.id)
              setTimeout(() => setHighlightId(null), 2500)
              toast(t('modules.httpServer.ui.started', { defaultValue: '网页服务已启动' }))
            } else {
              setDirectory(dir)
              toast(t('modules.httpServer.ui.startFailed', { defaultValue: '启动失败' }), 'error')
            }
          }
          startingDirRef.current = null
          // Track recently started to prevent duplicate from delayed events
          recentlyStartedRef.current.set(dir, Date.now())
        }
      } catch { /* ignore */ }
    })()
  }, [])

  // ── Consume pending directory from deep link (Windows context menu) ──
  useEffect(() => {
    if (pendingDirectory && !startingDirRef.current) {
      const dir = pendingDirectory
      setPendingDirectory('')
      // Skip if same directory was started very recently (prevents race condition)
      const recent = recentlyStartedRef.current.get(dir)
      if (recent && Date.now() - recent < 5000) return
      startingDirRef.current = dir
      ;(async () => {
        setStarting(true)
        try {
          // Re-check against latest instances
          const list = await httpListServers()
          const alreadyRunning = list.some((i: HttpInstanceInfo) => i.directory === dir)
          if (alreadyRunning) {
            if (list.length > 0) setInstances(list)
            toast(t('modules.httpServer.ui.alreadyRunning', { defaultValue: '该目录的网页服务已在运行中' }), 'info')
          } else {
            const info = await httpStartServer(dir, undefined)
            if (info) {
              addInstance(info)
              setHighlightId(info.id)
              setTimeout(() => setHighlightId(null), 2500)
              toast(t('modules.httpServer.ui.started', { defaultValue: '网页服务已启动' }))
            } else {
              setDirectory(dir)
              toast(t('modules.httpServer.ui.startFailed', { defaultValue: '启动失败' }), 'error')
            }
          }
        } catch {
          setDirectory(dir)
          toast(t('modules.httpServer.ui.startFailed', { defaultValue: '启动失败' }), 'error')
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
      return t('modules.httpServer.ui.portInvalid', { defaultValue: '端口范围 1024-65535' })
    }
    return ''
  })()

  // ── Start a new server instance ──
  const handleStart = useCallback(async () => {
    if (!directory.trim()) {
      toast(t('modules.httpServer.ui.selectDirFirst', { defaultValue: '请先选择目录' }), 'error')
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
        toast(t('modules.httpServer.ui.started', { defaultValue: '网页服务已启动' }))
      } else {
        toast(t('modules.httpServer.ui.startFailed', { defaultValue: '启动失败' }), 'error')
      }
    } catch (e) {
      console.error('[HttpServer] Start error:', e)
      toast(t('modules.httpServer.ui.startFailed', { defaultValue: '启动失败' }), 'error')
    }
    setStarting(false)
  }, [directory, port, portError, addInstance, toast, t])

  // ── Stop an instance (with fade-out animation) ──
  const handleStop = useCallback(async (inst: HttpInstanceInfo) => {
    const ok = await confirm({
      title: t('modules.httpServer.ui.stopServer', { defaultValue: '停止服务' }),
      message: t('modules.httpServer.ui.stopConfirm', { defaultValue: '确定要停止此网页服务吗？' }),
      detail: `${inst.directory} (端口 ${inst.port})`,
      confirmText: t('common.confirm', { defaultValue: '确认' }),
      cancelText: t('common.cancel', { defaultValue: '取消' }),
      danger: true,
    })
    if (!ok) return

    // Start fade-out animation
    setStoppingId(inst.id)
    await httpStopServer(inst.id)

    // Wait for animation to complete
    await new Promise((r) => setTimeout(r, 420))

    removeInstance(inst.id)
    setStoppingId(null)
    setQrCache((prev) => { const next = { ...prev }; delete next[inst.id]; return next })
    // Save to history
    const newItem: HistoryItem = { directory: inst.directory, port: inst.port, stoppedAt: Date.now() }
    setRecentHistory((prev) => {
      const next = [newItem, ...prev.filter((h) => h.directory !== inst.directory)].slice(0, MAX_HISTORY)
      saveHistory(next)
      return next
    })
    toast(t('modules.httpServer.ui.stopped', { defaultValue: '服务已停止' }))
  }, [confirm, removeInstance, toast, t])

  // ── Copy URL ──
  const handleCopyUrl = useCallback(async (url: string) => {
    await navigator.clipboard.writeText(url)
    toast(t('common.copied', { defaultValue: '已复制' }))
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
      void guideRef.current?.offsetWidth // force reflow
      guideRef.current?.classList.add('guide-flash')
    } else {
      setShowGuide(true)
    }
  }, [showGuide])

  // ── Reuse a history item (restart service) ──
  const handleRestart = useCallback(async (item: HistoryItem) => {
    try {
      // Try with stored port first
      const info = await httpStartServer(item.directory, item.port)
      if (info) {
        addInstance(info)
        setHighlightId(info.id)
        setTimeout(() => setHighlightId(null), 2500)
        // Remove from history since it's now running
        setRecentHistory((prev) => {
          const next = prev.filter((h) => h.directory !== item.directory)
          saveHistory(next)
          return next
        })
        toast(t('modules.httpServer.ui.started', { defaultValue: '网页服务已启动' }))
        return
      }
    } catch {
      // Port might be occupied, try auto port
    }
    // Fallback: auto port
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
        toast(t('modules.httpServer.ui.restartedNewPort', { defaultValue: '原端口已被占用，已使用新端口启动' }))
      } else {
        toast(t('modules.httpServer.ui.startFailed', { defaultValue: '启动失败' }), 'error')
      }
    } catch (e) {
      console.error('[HttpServer] Restart error:', e)
      toast(t('modules.httpServer.ui.startFailed', { defaultValue: '启动失败' }), 'error')
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
              {t('modules.httpServer.ui.guide.title', { defaultValue: '快速上手' })} →
            </button>
          </div>
        </div>
      </div>

      {/* ── Guide ── */}
      {showGuide && (
        <div ref={guideRef} className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-5 guide-section">
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-sm font-semibold text-primary">
              {t('modules.httpServer.ui.guide.title', { defaultValue: '快速上手' })}
            </h3>
            <button onClick={dismissGuide} className="text-text-muted hover:text-text-primary text-xs cursor-pointer">✕</button>
          </div>
          <p className="text-xs text-text-secondary mb-4 leading-relaxed">
            {t('modules.httpServer.ui.guide.intro', {
              defaultValue: '为你的任意文件夹快速创建一个局域网网站，让同事或同学通过浏览器直接访问其中的文件。适合分享 HTML 原型、项目文档或临时资料。',
            })}
          </p>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">1</span>
              <div>
                <p className="text-xs font-medium text-text-primary">
                  {t('modules.httpServer.ui.guide.step1', { defaultValue: '选择要分享的文件夹' })}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">2</span>
              <div>
                <p className="text-xs font-medium text-text-primary">
                  {t('modules.httpServer.ui.guide.step2', { defaultValue: '点击启动服务，自动生成端口和访问地址' })}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">3</span>
              <div>
                <p className="text-xs font-medium text-text-primary">
                  {t('modules.httpServer.ui.guide.step3', { defaultValue: '把访问地址发给小伙伴，或扫码即可浏览' })}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">4</span>
              <div>
                <p className="text-xs font-medium text-text-primary">
                  {t('modules.httpServer.ui.guide.step4', { defaultValue: '小技巧：在文件夹上右键可直接“开启网页服务”，无需打开应用' })}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add New Server Form ── */}
      <div className="mb-6 rounded-xl border border-border-subtle bg-bg-elevated p-4">
        <div className="flex flex-wrap items-end gap-3">
          {/* Directory picker */}
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
              {t('modules.httpServer.ui.directory', { defaultValue: '目录' })}
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
                {directory || t('modules.httpServer.ui.selectDir', { defaultValue: '选择文件夹...' })}
              </span>
            </button>
          </div>

          {/* Port (optional) */}
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
              {t('modules.httpServer.ui.port', { defaultValue: '端口' })}
            </label>
            <input
              type="number"
              min={1024}
              max={65535}
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder={t('modules.httpServer.ui.portAuto', { defaultValue: '自动' })}
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

          {/* Start button */}
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
            {t('modules.httpServer.ui.start', { defaultValue: '启动服务' })}
          </button>
        </div>
      </div>

      {/* ── Running Instances ── */}
      {instances.length > 0 ? (
        <div className="space-y-3">
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
        /* Empty state */
        !starting && (
          <div className="rounded-xl border-2 border-dashed border-border-subtle bg-bg-elevated/50 p-10 text-center">
            <WifiOff size={32} className="mx-auto mb-3 text-text-disabled" />
            <p className="text-sm text-text-muted">
              {t('modules.httpServer.ui.noServers', { defaultValue: '暂无运行中的网页服务' })}
            </p>
            <p className="mt-1 text-xs text-text-disabled">
              {t('modules.httpServer.ui.noServersHint', { defaultValue: '选择目录并点击启动服务开始' })}
            </p>
            {!showGuide && (
              <button
                onClick={openGuide}
                className="mt-3 text-xs text-text-muted hover:text-primary cursor-pointer transition"
              >
                {t('modules.httpServer.ui.viewGuide', { defaultValue: '查看使用指南' })} →
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
                {t('modules.httpServer.ui.recentHistory', { defaultValue: '最近使用' })}
              </h3>
              <span className="text-[10px] text-text-disabled">({recentHistory.length})</span>
            </div>
            <button
              onClick={clearHistory}
              className="flex items-center gap-1 text-[11px] text-text-disabled hover:text-red-400 cursor-pointer transition"
            >
              <Trash2 size={11} />
              {t('modules.httpServer.ui.clearHistory', { defaultValue: '清除' })}
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
                    :{item.port} · {t('modules.httpServer.ui.historyStopped', { defaultValue: '已停止' })}
                  </p>
                </div>
                <button
                  onClick={() => handleRestart(item)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-green-500/70 hover:text-green-500 hover:bg-green-500/10 transition cursor-pointer"
                  title={t('modules.httpServer.ui.restart', { defaultValue: '重新启动' })}
                >
                  <RotateCcw size={12} />
                  <span className="hidden sm:inline">{t('modules.httpServer.ui.restart', { defaultValue: '重启' })}</span>
                </button>
                <button
                  onClick={() => removeHistoryItem(i)}
                  className="rounded-md p-1 text-text-disabled hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                  title={t('common.delete', { defaultValue: '删除' })}
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

// ── Instance Card ─────────────────────────────────────────────────────────

function InstanceCard({
  instance: inst,
  expandedQr,
  setExpandedQr,
  qrCache,
  getQrCode,
  onCopy,
  onStop,
  isStopping,
  isHighlight,
  t,
}: {
  instance: HttpInstanceInfo
  expandedQr: string | null
  setExpandedQr: (id: string | null) => void
  qrCache: Record<string, string>
  getQrCode: (url: string, id: string) => Promise<string>
  onCopy: (url: string) => void
  onStop: (inst: HttpInstanceInfo) => void
  isStopping?: boolean
  isHighlight?: boolean
  t: (key: string, opts?: any) => string
}) {
  const url = inst.urls[0] || `http://localhost:${inst.port}`
  const isQrExpanded = expandedQr === inst.id
  const [qrDataUrl, setQrDataUrl] = useState<string>('')

  const toggleQr = useCallback(async () => {
    if (isQrExpanded) {
      setExpandedQr(null)
    } else {
      setExpandedQr(inst.id)
      if (!qrDataUrl) {
        const dataUrl = await getQrCode(url, inst.id)
        setQrDataUrl(dataUrl)
      }
    }
  }, [isQrExpanded, inst.id, url, getQrCode, setExpandedQr, qrDataUrl])

  // Update from cache
  useEffect(() => {
    if (qrCache[inst.id] && !qrDataUrl) setQrDataUrl(qrCache[inst.id])
  }, [qrCache, inst.id, qrDataUrl])

  return (
    <div className={`rounded-xl border bg-green-500/5 p-4 transition-all duration-400 ${isStopping ? 'instance-fadeout border-green-500/20' : isHighlight ? 'instance-highlight' : 'border-green-500/20'}`}>
      {/* Top row: directory + status */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Wifi size={13} className="text-green-400 shrink-0" />
            <span className="text-xs font-semibold text-green-400">
              {t('modules.httpServer.ui.instanceRunning', { defaultValue: '运行中' })}
              <span className="text-text-muted font-normal ml-1">· 端口 {inst.port}</span>
            </span>
          </div>
          <p className="font-mono text-sm text-text-primary truncate" title={inst.directory}>
            {inst.directory}
          </p>
        </div>
        <button
          onClick={() => onStop(inst)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-muted hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
          title={t('modules.httpServer.ui.stop', { defaultValue: '停止' })}
        >
          <Square size={12} />
          <span className="hidden sm:inline">{t('modules.httpServer.ui.stop', { defaultValue: '停止' })}</span>
        </button>
      </div>

      {/* URL + actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <code className="flex-1 min-w-0 rounded bg-bg-base px-3 py-1.5 text-sm text-primary truncate">
          {url}
        </code>
        <button
          onClick={() => onCopy(url)}
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-text-secondary hover:text-primary transition cursor-pointer"
        >
          <Copy size={12} />
          {t('modules.httpServer.ui.copy', { defaultValue: '复制' })}
        </button>
        <button
          onClick={toggleQr}
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-text-secondary hover:text-primary transition cursor-pointer"
        >
          <QrCode size={12} />
          {t('modules.httpServer.ui.qr', { defaultValue: '二维码' })}
          {isQrExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* QR code (expandable) */}
      {isQrExpanded && qrDataUrl && (
        <div className="mt-3 flex justify-center">
          <img src={qrDataUrl} alt="QR Code" className="rounded-lg" width={160} height={160} />
        </div>
      )}
    </div>
  )
}
