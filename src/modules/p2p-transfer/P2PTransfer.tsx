/**
 * A7Box P2P LAN Transfer Module
 * Peer-to-peer file transfer over local network
 */
import { useState, useEffect, useCallback, useRef, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Wifi, WifiOff, Edit3, X, Send, FolderOpen,
  Play, Square, Download, FileText, Folder, RefreshCw, Users,
  Radar, ChevronDown, Zap, Share2, Clock, Star, Search, Trash2,
  AlertCircle, ExternalLink, RotateCcw, Power,
} from 'lucide-react'
import {
  p2pGetIdentity, p2pSetAlias, p2pGetPeers, p2pStartService, p2pStopService,
  p2pSendFile, p2pGetSharedInfo, p2pSetSharedDir, p2pGetTransfers,
  p2pGetLocalIps, p2pRequestDir, p2pDownloadFile, p2pManualConnect, p2pRetryTransfer,
  p2pValidateDir,
  onP2PPeerDiscovered, onP2PPeerLost, onP2PTransferProgress,
  onP2PIncomingFile, onP2PAccessLog,
  type P2PIdentity, type P2PPeer, type P2PTransferInfo,
  type P2PDirFile, type P2PAccessLogEntry,
} from '../../shared/utils/tauriBridge'
import { useP2PStatus } from './p2pStore'
import { useToast } from '../../components/Toast'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

function formatSpeed(pctPerSec: number): string {
  if (pctPerSec < 0.01) return ''
  if (pctPerSec < 1) return pctPerSec.toFixed(1) + '%/s'
  return pctPerSec.toFixed(0) + '%/s'
}

function formatEta(seconds: number): string {
  if (seconds < 1 || !isFinite(seconds)) return ''
  if (seconds < 60) return Math.ceil(seconds) + 's'
  if (seconds < 3600) return Math.ceil(seconds / 60) + 'm'
  return (seconds / 3600).toFixed(1) + 'h'
}

const ALIAS_MAX = 20
const GUIDE_KEY = 'a7box-p2p-guide-seen'
const FAVORITES_KEY = 'a7box-p2p-favorites'
const SCAN_TIMEOUT = 15_000

// ---- Scanning animation (CSS keyframes) ----
const scanningStyle = `
@keyframes p2p-scan-ring {
  0% { transform: scale(0.5); opacity: 0.8; }
  100% { transform: scale(1.5); opacity: 0; }
}
.p2p-scan-ring { animation: p2p-scan-ring 2s ease-out infinite; }
.p2p-scan-ring:nth-child(2) { animation-delay: 0.6s; }
.p2p-scan-ring:nth-child(3) { animation-delay: 1.2s; }
`

export default function P2PTransfer() {
  const { t } = useTranslation()

  // Identity
  const [identity, setIdentity] = useState<P2PIdentity | null>(null)
  const [editingAlias, setEditingAlias] = useState(false)
  const [aliasInput, setAliasInput] = useState('')
  const [localIps, setLocalIps] = useState<string[]>([])

  // Service — Zustand is single source of truth (no local `running` state)
  const running = useP2PStatus((s) => s.running)
  const setRunning = useP2PStatus((s) => s.setRunning)
  const toast = useToast()
  const [_tcpPort, setTcpPort] = useState(0)
  const [starting, setStarting] = useState(false)
  const autoStartRef = useRef(false)
  const [autoStart, setAutoStart] = useState(() =>
    localStorage.getItem('a7box-p2p-autostart') !== 'false'
  )

  // Peers
  const [peers, setPeers] = useState<P2PPeer[]>([])
  const [scanTimedOut, setScanTimedOut] = useState(false)
  const [scanResetKey, setScanResetKey] = useState(0)
  const [manualAddr, setManualAddr] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]') } catch { return [] }
  })

  // Send file
  const [filePaths, setFilePaths] = useState<string[]>([])
  const [targetPeer, setTargetPeer] = useState('')
  const [sending, setSending] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // Transfers
  const [transfers, setTransfers] = useState<P2PTransferInfo[]>([])
  const speedRef = useRef<Record<string, { progress: number; ts: number }>>({})
  const [speedMap, setSpeedMap] = useState<Record<string, { speed: number; eta: number }>>({})

  // Shared directory
  const [sharedDir, setSharedDir] = useState('')
  const [sharedEnabled, setSharedEnabled] = useState(false)
  const [sharedFiles, setSharedFiles] = useState<P2PDirFile[]>([])
  const [accessLog, setAccessLog] = useState<P2PAccessLogEntry[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Incoming file notification
  const [incomingFile, setIncomingFile] = useState<{
    transfer_id: string; filename: string; size: number; peer_code: string; peer_alias: string
  } | null>(null)

  // Browse remote dir
  const [remoteDirPeer, setRemoteDirPeer] = useState('')
  const [remoteFiles, setRemoteFiles] = useState<P2PDirFile[]>([])

  // Onboarding guide
  const [showGuide, setShowGuide] = useState(false)

  // Transfer history search/filter
  const [historySearch, setHistorySearch] = useState('')
  const [historyFilter, setHistoryFilter] = useState<'all' | 'send' | 'receive'>('all')

  // ---- Effects ----

  // Auto-start service on mount
  useEffect(() => {
    if (!isTauri() || autoStartRef.current) return
    autoStartRef.current = true
    if (!localStorage.getItem(GUIDE_KEY)) setShowGuide(true)

    ;(async () => {
      const id = await p2pGetIdentity()
      if (id) { setIdentity(id); setAliasInput(id.alias) }
      setLocalIps(await p2pGetLocalIps())
      setTransfers(await p2pGetTransfers())
      const info = await p2pGetSharedInfo()
      if (info) {
        setSharedDir(info.directory); setSharedEnabled(info.enabled)
        setSharedFiles(info.files); setAccessLog(info.accessLog)
      }
      if (autoStart) {
        setStarting(true)
        const port = await p2pStartService()
        if (port !== null) {
          setTcpPort(port); setRunning(true)
          setTimeout(async () => setPeers(await p2pGetPeers()), 2000)
        }
        setStarting(false)
      }
    })()
  }, [])

  // Scan timeout
  useEffect(() => {
    if (!running || peers.length > 0) return
    setScanTimedOut(false)
    const timer = setTimeout(() => setScanTimedOut(true), SCAN_TIMEOUT)
    return () => clearTimeout(timer)
  }, [running, peers.length, scanResetKey])

  // Event listeners
  useEffect(() => {
    if (!isTauri()) return
    const unsubs: (() => void)[] = []

    onP2PPeerDiscovered(peer => {
      setPeers(prev => prev.find(p => p.code === peer.code) ? prev : [...prev, peer])
    }).then(u => u && unsubs.push(u))

    onP2PPeerLost(code => {
      setPeers(prev => prev.filter(p => p.code !== code))
    }).then(u => u && unsubs.push(u))

    onP2PTransferProgress(data => {
      // Update transfer list
      setTransfers(prev => prev.map(tr =>
        tr.id === data.transfer_id ? { ...tr, progress: data.progress, status: data.status } : tr
      ))
      // Calculate speed + ETA
      const now = Date.now()
      const prev = speedRef.current[data.transfer_id]
      if (prev) {
        const dProgress = data.progress - prev.progress
        const dt = (now - prev.ts) / 1000
        if (dt > 0.1 && dProgress > 0) {
          const pctPerSec = dProgress / dt
          const remaining = (100 - data.progress) / pctPerSec
          setSpeedMap(m => ({ ...m, [data.transfer_id]: { speed: pctPerSec, eta: remaining } }))
        }
      }
      speedRef.current[data.transfer_id] = { progress: data.progress, ts: now }
      // Clean up when done
      if (data.status === 'complete' || data.status === 'failed') {
        delete speedRef.current[data.transfer_id]
        setSpeedMap(m => { const { [data.transfer_id]: _, ...rest } = m; return rest })
      }
    }).then(u => u && unsubs.push(u))

    onP2PIncomingFile(data => {
      setIncomingFile(data)
      // System notification (Web API)
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('A7Box - ' + t('modules.p2p.ui.incomingFile'), {
          body: `${data.filename} (${formatSize(data.size)}) — ${data.peer_alias}`,
        })
      }
    }).then(u => u && unsubs.push(u))

    onP2PAccessLog(entry => {
      setAccessLog(prev => [entry, ...prev].slice(0, 50))
    }).then(u => u && unsubs.push(u))

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }

    return () => { unsubs.forEach(u => u()) }
  }, [t])

  // ---- Callbacks ----

  const dismissGuide = useCallback(() => {
    localStorage.setItem(GUIDE_KEY, '1'); setShowGuide(false)
  }, [])

  const toggleAutoStart = useCallback((val: boolean) => {
    setAutoStart(val)
    localStorage.setItem('a7box-p2p-autostart', val ? 'true' : 'false')
  }, [])

  const toggleFavorite = useCallback((code: string) => {
    setFavorites(prev => {
      const next = prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const handleSaveAlias = useCallback(async () => {
    const trimmed = aliasInput.trim().slice(0, ALIAS_MAX)
    if (!trimmed || trimmed === identity?.alias) {
      setAliasInput(identity?.alias || '')
      setEditingAlias(false)
      return
    }
    await p2pSetAlias(trimmed)
    setIdentity(prev => prev ? { ...prev, alias: trimmed } : null)
    setEditingAlias(false)
    toast(t('common.saved', { defaultValue: 'Saved' }))
  }, [aliasInput, identity, toast, t])

  const handleCopyCode = useCallback(async () => {
    if (!identity) return
    await navigator.clipboard.writeText(identity.code)
    toast(t('common.copied'))
  }, [identity, toast, t])

  const handleBrowseFile = useCallback(async () => {
    if (!isTauri()) return
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({ multiple: true })
      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected]
        setFilePaths(prev => [...prev, ...paths])
      }
    } catch (e) { console.error('[P2P] Dialog error:', e) }
  }, [])

  const handleBrowseDir = useCallback(async (setter: (v: string) => void) => {
    if (!isTauri()) return
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({ directory: true, multiple: false })
      if (selected) setter(selected as string)
    } catch (e) { console.error('[P2P] Dialog error:', e) }
  }, [])

  // Drag & Drop
  const handleDragOver = useCallback((e: DragEvent) => { e.preventDefault(); setIsDragging(true) }, [])
  const handleDragLeave = useCallback(() => setIsDragging(false), [])
  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      // In Tauri webview, File objects have an extra `path` property
      setFilePaths(prev => [...prev, ...files.map(f => (f as unknown as { path?: string }).path || f.name)])
    }
  }, [])

  const handleManualConnect = useCallback(async () => {
    const addr = manualAddr.trim()
    if (!addr) return
    // Validate format: host:port (IPv4 or hostname, port 1-65535)
    const match = addr.match(/^(.+):(\d+)$/)
    if (!match) {
      toast(t('modules.p2p.ui.invalidAddr', { defaultValue: 'Invalid format. Use IP:Port' }), 'error')
      return
    }
    const port = parseInt(match[2], 10)
    if (port < 1 || port > 65535) {
      toast(t('modules.p2p.ui.invalidPort', { defaultValue: 'Port must be 1-65535' }), 'error')
      return
    }
    const peer = await p2pManualConnect(addr)
    if (peer) {
      setPeers(prev => prev.find(p => p.code === peer.code) ? prev : [...prev, peer])
      setManualAddr(''); setShowManual(false)
      toast(t('modules.p2p.ui.connectSuccess', { defaultValue: 'Connected successfully' }))
    } else {
      toast(t('modules.p2p.ui.connectFailed', { defaultValue: 'Connection failed' }), 'error')
    }
  }, [manualAddr, toast, t])

  const handleSendFile = useCallback(async () => {
    if (filePaths.length === 0 || !targetPeer) return
    setSending(true)
    let ok = 0
    for (const fp of filePaths) {
      const id = await p2pSendFile(targetPeer, fp)
      if (id) {
        ok++
        setTransfers(prev => [...prev, {
          id, filename: fp.split(/[/\\]/).pop() || fp, size: 0,
          progress: 0, status: 'transferring', direction: 'send', peer_code: targetPeer, file_path: fp,
        }])
      }
    }
    if (ok > 0) { setFilePaths([]); setTargetPeer('') }
    else toast(t('modules.p2p.ui.sendFailed'), 'error')
    setSending(false)
  }, [filePaths, targetPeer, t, toast])

  const handleRetry = useCallback(async (transferId: string) => {
    const result = await p2pRetryTransfer(transferId)
    if (!result) toast(t('modules.p2p.ui.sendFailed'), 'error')
  }, [t, toast])

  const handleOpenFolder = useCallback(async (filePath: string) => {
    if (!filePath) return
    try {
      const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
      await revealItemInDir(filePath)
    } catch (e) { console.error('[P2P] Open folder error:', e) }
  }, [])

  const handleToggleShared = useCallback(async (enabled: boolean) => {
    if (enabled && !sharedDir) { toast(t('modules.p2p.ui.selectDir'), 'error'); return }
    // Validate directory exists before enabling
    if (enabled && sharedDir) {
      const valid = await p2pValidateDir(sharedDir)
      if (!valid) { toast(t('modules.p2p.ui.dirInvalid'), 'error'); return }
    }
    await p2pSetSharedDir(sharedDir, enabled)
    setSharedEnabled(enabled)
    const info = await p2pGetSharedInfo()
    if (info) { setSharedFiles(info.files); setAccessLog(info.accessLog) }
  }, [sharedDir, t, toast])

  const handleRequestDir = useCallback(async () => {
    if (!remoteDirPeer) return
    setRemoteFiles(await p2pRequestDir(remoteDirPeer))
  }, [remoteDirPeer])

  const handleDownloadFile = useCallback(async (fileName: string) => {
    if (!remoteDirPeer) return
    let downloadDir: string | null = null
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      downloadDir = await open({ directory: true, multiple: false }) as string | null
    } catch { /* noop */ }
    if (!downloadDir) return
    const result = await p2pDownloadFile(remoteDirPeer, fileName, downloadDir)
    if (result) {
      setTransfers(prev => [...prev, {
        id: 'dl-' + Date.now(), filename: fileName, size: 0,
        progress: 100, status: 'complete', direction: 'receive', peer_code: remoteDirPeer, file_path: result,
      }])
    }
  }, [remoteDirPeer])

  const handleClearHistory = useCallback(() => {
    setTransfers([])
  }, [])

  // Computed
  const activeTransfers = transfers.filter(tr =>
    tr.status === 'transferring' || tr.status === 'receiving' || tr.status === 'downloading' || tr.status === 'pending'
  )
  const completedSend = transfers.filter(tr => tr.status === 'complete' && tr.direction === 'send')
  const batchInProgress = activeTransfers.filter(tr => tr.direction === 'send').length
  const batchTotal = completedSend.length + batchInProgress
  const batchDone = completedSend.length

  const sortedPeers = [...peers].sort((a, b) => {
    const aFav = favorites.includes(a.code) ? 0 : 1
    const bFav = favorites.includes(b.code) ? 0 : 1
    return aFav - bFav
  })

  const filteredHistory = transfers.slice().reverse().filter(tr => {
    if (historyFilter !== 'all' && tr.direction !== historyFilter) return false
    if (historySearch && !tr.filename.toLowerCase().includes(historySearch.toLowerCase())) return false
    return true
  })

  return (
    <div className="h-full overflow-y-auto p-6" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <style>{scanningStyle}</style>

      {/* Drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-xl pointer-events-none">
          <div className="rounded-xl bg-bg-elevated px-8 py-6 shadow-lg text-center">
            <Send size={32} className="text-primary mx-auto mb-2" />
            <p className="text-sm font-medium text-text-primary">{t('modules.p2p.ui.dragDropHint')}</p>
          </div>
        </div>
      )}

      {/* ---- Top Bar: Identity + Status ---- */}
      <div className="mb-6 rounded-xl border border-border-subtle bg-bg-elevated px-4 py-3">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Wifi size={18} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-text-primary">{t('modules.p2p.name')}</h1>
              <p className="text-xs text-text-secondary">{t('modules.p2p.description')}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {/* Service Status */}
            <div className="flex items-center gap-2">
              {starting ? (
                <span className="flex items-center gap-1.5 text-xs text-text-muted">
                  <RefreshCw size={12} className="animate-spin" />{t('modules.p2p.ui.startService')}...
                </span>
              ) : running ? (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 text-xs text-green-400">
                    <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                    {t('modules.p2p.ui.serviceRunning')}
                  </span>
                  {localIps.length > 0 && (
                    <button
                      onClick={async () => {
                        const addr = `${localIps[0]}:${_tcpPort}`
                        await navigator.clipboard.writeText(addr)
                        toast(t('common.copied'))
                      }}
                      className="rounded-md bg-bg-hover/60 px-2 py-0.5 font-mono text-[11px] text-text-secondary hover:text-primary cursor-pointer transition"
                      title={t('modules.p2p.ui.clickToCopy')}
                    >
                      {localIps[0]}:{_tcpPort}
                    </button>
                  )}
                  <button onClick={async () => {
                    await p2pStopService()
                    setRunning(false); setPeers([]); setTcpPort(0); setScanTimedOut(false)
                  }} className="text-text-muted hover:text-red-400 cursor-pointer" title={t('modules.p2p.ui.stopService')}>
                    <Power size={13} />
                  </button>
                </div>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-text-muted">
                  <WifiOff size={12} />{t('modules.p2p.ui.serviceStopped')}
                  <button onClick={async () => {
                    setStarting(true)
                    const port = await p2pStartService()
                    if (port !== null) { setTcpPort(port); setRunning(true) }
                    setStarting(false)
                  }} className="ml-1 text-primary hover:underline cursor-pointer">{t('modules.p2p.ui.startService')}</button>
                </span>
              )}
            </div>
            {/* Auto-start */}
            <label className="flex items-center gap-1.5 text-[11px] text-text-muted cursor-pointer select-none" title={t('modules.p2p.ui.autoStart')}>
              <input type="checkbox" checked={autoStart} onChange={(e) => toggleAutoStart(e.target.checked)}
                className="h-3 w-3 rounded border-border-base accent-primary cursor-pointer" />
              {t('modules.p2p.ui.autoStart')}
            </label>
            {/* Identity: Code + Alias */}
            {identity && (
              <div className="flex items-center gap-3 border-l border-border-subtle pl-3">
                {/* Device Code */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-text-muted uppercase tracking-wide">{t('modules.p2p.ui.deviceCode')}</span>
                  <button
                    onClick={handleCopyCode}
                    className="font-mono text-sm font-bold text-primary hover:text-primary/80 cursor-pointer transition"
                    title={t('common.copy')}
                  >
                    {identity.code}
                  </button>
                </div>
                {/* Alias */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-text-muted uppercase tracking-wide">{t('modules.p2p.ui.deviceName')}</span>
                  {editingAlias ? (
                    <input
                      value={aliasInput}
                      maxLength={ALIAS_MAX}
                      onChange={(e) => setAliasInput(e.target.value)}
                      onBlur={handleSaveAlias}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveAlias()
                        if (e.key === 'Escape') { setAliasInput(identity.alias); setEditingAlias(false) }
                      }}
                      className="w-28 rounded border border-primary bg-bg-base px-2 py-0.5 text-xs text-text-primary outline-none"
                      autoFocus
                    />
                  ) : (
                    <span
                      className="text-xs text-text-secondary cursor-pointer hover:text-text-primary transition truncate max-w-[120px]"
                      onClick={() => { setEditingAlias(true); setAliasInput(identity.alias) }}
                      title={identity.alias}
                    >
                      {identity.alias} <Edit3 size={9} className="inline opacity-50" />
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Incoming File Notification */}
      {incomingFile && (
        <div className="mb-4 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-400">{t('modules.p2p.ui.incomingFile')}</p>
            <p className="text-xs text-text-secondary">
              {incomingFile.filename} ({formatSize(incomingFile.size)}) — {incomingFile.peer_alias} ({incomingFile.peer_code})
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setIncomingFile(null)} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 cursor-pointer">{t('modules.p2p.ui.accept')}</button>
            <button onClick={() => setIncomingFile(null)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 cursor-pointer">{t('modules.p2p.ui.reject')}</button>
          </div>
        </div>
      )}

      {/* ---- Onboarding Guide ---- */}
      {showGuide && (
        <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-primary" />
              <h2 className="text-sm font-bold text-text-primary">{t('modules.p2p.ui.guide.title')}</h2>
            </div>
            <button onClick={dismissGuide} className="text-xs text-text-muted hover:text-text-primary cursor-pointer">{t('modules.p2p.ui.guide.skip')}</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: Wifi, title: 'step1title', desc: 'step1desc', color: 'text-green-400' },
              { icon: Send, title: 'step2title', desc: 'step2desc', color: 'text-blue-400' },
              { icon: Share2, title: 'step3title', desc: 'step3desc', color: 'text-purple-400' },
            ].map((step, i) => (
              <div key={i} className="rounded-lg bg-bg-elevated p-3 border border-border-subtle">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{i + 1}</span>
                  <step.icon size={14} className={step.color} />
                  <span className="text-xs font-semibold text-text-primary">{t(`modules.p2p.ui.guide.${step.title}`)}</span>
                </div>
                <p className="text-[11px] text-text-secondary leading-relaxed">{t(`modules.p2p.ui.guide.${step.desc}`)}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 text-right">
            <button onClick={dismissGuide} className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white hover:bg-primary/90 cursor-pointer transition">
              {t('modules.p2p.ui.guide.gotIt')}
            </button>
          </div>
        </div>
      )}

      {/* ---- Main Content ---- */}
      {running ? (
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Primary (3/5) */}
        <div className="lg:col-span-3 space-y-5">

          {/* Peer Discovery + Send File combined */}
          <div className="rounded-xl border border-border-subtle bg-bg-elevated p-4">
            {/* Peer list header */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={15} className="text-primary" />
                <h2 className="text-sm font-semibold text-text-primary">{t('modules.p2p.ui.peers')}</h2>
                {peers.length > 0 && (
                  <>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{peers.length}</span>
                    <button onClick={async () => setPeers(await p2pGetPeers())} className="text-text-muted hover:text-primary cursor-pointer ml-1">
                      <RefreshCw size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {running && peers.length === 0 && !scanTimedOut ? (
              /* Scanning animation */
              <div className="flex flex-col items-center py-6">
                <div className="relative h-16 w-16 mb-3">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Radar size={24} className="text-primary" />
                  </div>
                  <div className="absolute inset-0 rounded-full border-2 border-primary/30 p2p-scan-ring" />
                  <div className="absolute inset-0 rounded-full border-2 border-primary/30 p2p-scan-ring" />
                  <div className="absolute inset-0 rounded-full border-2 border-primary/30 p2p-scan-ring" />
                </div>
                <p className="text-xs text-text-muted">{t('modules.p2p.ui.scanning')}</p>
              </div>
            ) : running && peers.length === 0 && scanTimedOut ? (
              /* Scan timeout with tips */
              <div className="text-center py-4 space-y-3">
                <AlertCircle size={20} className="mx-auto text-amber-400" />
                <p className="text-xs text-amber-400">{t('modules.p2p.ui.scanTimeout')}</p>
                <p className="text-[11px] text-text-secondary leading-relaxed">{t('modules.p2p.ui.scanTips')}</p>
                <div className="flex items-center justify-center gap-3">
                  <button onClick={() => { setScanTimedOut(false); setScanResetKey(k => k + 1) }}
                    className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer">
                    <RefreshCw size={11} />{t('modules.p2p.ui.rescan')}
                  </button>
                  <button onClick={() => setShowManual(!showManual)}
                    className="text-xs text-primary hover:underline cursor-pointer">{t('modules.p2p.ui.manualConnect')}</button>
                </div>
                {showManual && (
                  <div className="flex gap-2 mt-2">
                    <input value={manualAddr} onChange={(e) => setManualAddr(e.target.value)}
                      placeholder={t('modules.p2p.ui.manualConnectPlaceholder')}
                      className="flex-1 rounded-lg border border-border-base bg-bg-base px-3 py-2 text-xs text-text-primary outline-none focus:border-primary"
                      onKeyDown={(e) => e.key === 'Enter' && manualAddr.trim() && handleManualConnect()} />
                    <button onClick={handleManualConnect} disabled={!manualAddr.trim() || !/^.+:\d+$/.test(manualAddr.trim())}
                      className="rounded-lg bg-primary px-3 py-2 text-xs text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">{t('modules.p2p.ui.connect')}</button>
                  </div>
                )}
              </div>
            ) : peers.length === 0 ? (
              <p className="text-center text-xs text-text-disabled py-4">{t('modules.p2p.ui.noPeers')}</p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto mb-4">
                {sortedPeers.map(peer => (
                  <div key={peer.code}
                    onClick={() => setTargetPeer(peer.code)}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer transition ${
                      targetPeer === peer.code
                        ? 'bg-primary/10 border border-primary/30'
                        : 'bg-bg-base border border-transparent hover:border-border-subtle'
                    }`}>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-green-400" />
                      <span className="font-mono text-xs font-bold text-primary">{peer.code}</span>
                      <span className="text-sm text-text-secondary">{peer.alias}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-text-muted">{peer.ip}</span>
                      <button onClick={(e) => { e.stopPropagation(); toggleFavorite(peer.code) }}
                        title={favorites.includes(peer.code) ? t('modules.p2p.ui.unfavorite') : t('modules.p2p.ui.favorite')}
                        className={`cursor-pointer ${favorites.includes(peer.code) ? 'text-yellow-400' : 'text-text-disabled hover:text-yellow-400'}`}>
                        <Star size={12} fill={favorites.includes(peer.code) ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-border-subtle my-3" />

            {peers.length > 0 ? (
              <>
                {/* Send file area */}
                <div className="flex items-center gap-2 mb-2">
                  <Send size={14} className="text-primary" />
                  <h2 className="text-sm font-semibold text-text-primary">{t('modules.p2p.ui.sendFile')}</h2>
                  {batchInProgress > 0 && (
                    <span className="text-[10px] text-primary font-medium">
                      {t('modules.p2p.ui.batchProgress', { done: batchDone, total: batchTotal })}
                    </span>
                  )}
                </div>

                {/* Selected files */}
                {filePaths.length > 0 && (
                  <div className="mb-2 max-h-20 overflow-y-auto rounded-lg border border-border-subtle bg-bg-base p-2 space-y-1">
                    {filePaths.map((fp, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-text-secondary truncate max-w-[280px]">{fp.split(/[/\\]/).pop() || fp}</span>
                        <button onClick={() => setFilePaths(prev => prev.filter((_, j) => j !== i))} className="text-text-muted hover:text-red-400 cursor-pointer ml-2 shrink-0"><X size={11} /></button>
                      </div>
                    ))}
                    {filePaths.length > 1 && (
                      <button onClick={() => setFilePaths([])} className="text-[10px] text-text-muted hover:text-red-400 cursor-pointer">{t('common.clear')}</button>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    value={filePaths.length > 0 ? `${filePaths.length} ${t('modules.p2p.ui.filesSelected')}` : ''}
                    readOnly placeholder={t('modules.p2p.ui.selectFile')}
                    className="flex-1 rounded-lg border border-border-base bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-primary transition cursor-pointer"
                    onClick={handleBrowseFile}
                  />
                  <button onClick={handleBrowseFile} className="rounded-lg border border-border-base px-3 py-2 text-text-muted hover:text-primary hover:border-primary cursor-pointer transition">
                    <FolderOpen size={14} />
                  </button>
                </div>
                <div className="flex gap-2 mt-2">
                  <select value={targetPeer} onChange={(e) => setTargetPeer(e.target.value)}
                    className="flex-1 rounded-lg border border-border-base bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-primary transition cursor-pointer">
                    <option value="">{t('modules.p2p.ui.selectPeer')}</option>
                    {sortedPeers.map(p => <option key={p.code} value={p.code}>{p.code} — {p.alias}</option>)}
                  </select>
                  <button onClick={handleSendFile} disabled={filePaths.length === 0 || !targetPeer || sending}
                    title={(filePaths.length === 0 || !targetPeer) ? t('modules.p2p.ui.sendNotReady') : undefined}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                    {sending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                    {t('modules.p2p.ui.send')}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-center text-[11px] text-text-disabled py-3">{t('modules.p2p.ui.noPeersHideSend')}</p>
            )}
          </div>

          {/* Active transfers */}
          {activeTransfers.length > 0 && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <RefreshCw size={14} className="text-primary animate-spin" />
                <h2 className="text-sm font-semibold text-text-primary">{t('modules.p2p.ui.transfers')}</h2>
              </div>
              <div className="space-y-2">
                {activeTransfers.map(tr => {
                  const spd = speedMap[tr.id]
                  return (
                    <div key={tr.id} className="rounded-lg bg-bg-elevated px-3 py-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${tr.direction === 'send' ? 'bg-blue-500/10 text-blue-400' : 'bg-green-500/10 text-green-400'}`}>
                            {tr.direction === 'send' ? '\u2191' : '\u2193'}
                          </span>
                          <span className="text-sm text-text-primary truncate max-w-[160px]">{tr.filename}</span>
                          <span className="text-[11px] text-text-muted">{tr.peer_code}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {spd && (
                            <span className="text-[10px] text-text-muted">
                              {formatSpeed(spd.speed)} {spd.eta > 0 && `\u00B7 ${formatEta(spd.eta)}`}
                            </span>
                          )}
                          <span className="text-xs font-bold text-primary">{tr.progress.toFixed(0)}%</span>
                        </div>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-bg-base overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${tr.progress}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Secondary (2/5) */}
        <div className="lg:col-span-2 space-y-5">
          {/* Shared Directory */}
          <div className="rounded-xl border border-border-subtle bg-bg-elevated p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FolderOpen size={15} className="text-primary" />
                <h2 className="text-sm font-semibold text-text-primary">{t('modules.p2p.ui.sharedDir')}</h2>
                {sharedEnabled && <span className="h-2 w-2 rounded-full bg-green-400" />}
              </div>
              <button onClick={async () => { const info = await p2pGetSharedInfo(); if (info) { setSharedFiles(info.files); setAccessLog(info.accessLog) } }} className="text-text-muted hover:text-primary cursor-pointer">
                <RefreshCw size={13} />
              </button>
            </div>

            <div className="flex gap-2 mb-2">
              <input value={sharedDir} onChange={(e) => setSharedDir(e.target.value)} placeholder={t('modules.p2p.ui.selectDir')} disabled={sharedEnabled}
                title={sharedEnabled ? t('modules.p2p.ui.dirLocked') : undefined}
                className="flex-1 rounded-lg border border-border-base bg-bg-base px-3 py-2 text-xs text-text-primary outline-none focus:border-primary transition disabled:opacity-50 disabled:cursor-not-allowed" />
              <button onClick={() => handleBrowseDir(setSharedDir)} disabled={sharedEnabled}
                title={sharedEnabled ? t('modules.p2p.ui.dirLocked') : undefined}
                className="rounded-lg border border-border-base px-2.5 py-2 text-text-muted hover:text-primary hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition">
                <FolderOpen size={13} />
              </button>
            </div>

            {!sharedEnabled ? (
              <button onClick={() => handleToggleShared(true)} disabled={!sharedDir}
                title={!sharedDir ? t('modules.p2p.ui.selectDir') : undefined}
                className="w-full rounded-lg bg-green-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition">
                <Play size={11} className="inline mr-1" />{t('modules.p2p.ui.enable')}
              </button>
            ) : (
              <button onClick={() => handleToggleShared(false)}
                className="w-full rounded-lg bg-red-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 cursor-pointer transition">
                <Square size={11} className="inline mr-1" />{t('modules.p2p.ui.disable')}
              </button>
            )}

            {sharedEnabled && sharedFiles.length > 0 && (
              <div className="mt-3 max-h-24 overflow-y-auto space-y-1">
                {sharedFiles.map(f => (
                  <div key={f.name} className="flex items-center gap-2 rounded px-2 py-1 text-xs">
                    {f.is_dir ? <Folder size={12} className="text-yellow-500" /> : <FileText size={12} className="text-text-muted" />}
                    <span className="text-text-primary">{f.name}</span>
                    <span className="text-text-disabled">{formatSize(f.size)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Transfer History */}
          <div className="rounded-xl border border-border-subtle bg-bg-elevated p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock size={15} className="text-primary" />
                <h2 className="text-sm font-semibold text-text-primary">{t('modules.p2p.ui.transfers')}</h2>
                <span className="text-[10px] text-text-disabled">{transfers.length}</span>
              </div>
              {transfers.length > 0 && (
                <button onClick={handleClearHistory} className="text-text-muted hover:text-red-400 cursor-pointer" title={t('modules.p2p.ui.clearHistory')}>
                  <Trash2 size={12} />
                </button>
              )}
            </div>

            {/* Search + Filter */}
            {transfers.length > 3 && (
              <div className="flex gap-2 mb-2">
                <div className="relative flex-1">
                  <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-disabled" />
                  <input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder={t('modules.p2p.ui.searchHistory')}
                    className="w-full rounded border border-border-base bg-bg-base pl-7 pr-2 py-1 text-xs text-text-primary outline-none focus:border-primary" />
                </div>
                <select value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value as 'all' | 'send' | 'receive')}
                  className="rounded border border-border-base bg-bg-base px-2 py-1 text-xs text-text-primary outline-none cursor-pointer">
                  <option value="all">{t('modules.p2p.ui.filterAll')}</option>
                  <option value="send">{t('modules.p2p.ui.filterSend')}</option>
                  <option value="receive">{t('modules.p2p.ui.filterReceive')}</option>
                </select>
              </div>
            )}

            {filteredHistory.length === 0 ? (
              <p className="text-center text-xs text-text-disabled py-3">{t('modules.p2p.ui.noTransfers')}</p>
            ) : (
              <div className="max-h-32 overflow-y-auto space-y-1.5">
                {filteredHistory.map(tr => (
                  <div key={tr.id} className="flex items-center justify-between rounded bg-bg-base px-2.5 py-1.5 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`font-medium shrink-0 ${tr.direction === 'send' ? 'text-blue-400' : 'text-green-400'}`}>
                        {tr.direction === 'send' ? '\u2191' : '\u2193'}
                      </span>
                      <span className="text-text-primary truncate max-w-[120px]">{tr.filename}</span>
                      <span className="text-text-disabled shrink-0">{tr.peer_code}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Retry button for failed */}
                      {(tr.status === 'failed' || tr.status === 'rejected') && tr.direction === 'send' && (
                        <button onClick={() => handleRetry(tr.id)} className="text-amber-400 hover:text-amber-300 cursor-pointer" title={t('modules.p2p.ui.retry')}>
                          <RotateCcw size={11} />
                        </button>
                      )}
                      {/* Open folder for completed */}
                      {tr.status === 'complete' && tr.file_path && (
                        <button onClick={() => handleOpenFolder(tr.file_path)} className="text-text-muted hover:text-primary cursor-pointer" title={t('modules.p2p.ui.openFolder')}>
                          <ExternalLink size={11} />
                        </button>
                      )}
                      <span className={`font-medium ${
                        tr.status === 'complete' ? 'text-green-400' :
                        tr.status === 'failed' || tr.status === 'rejected' ? 'text-red-400' : 'text-text-muted'
                      }`}>
                        {tr.status === 'complete' ? '\u2713' : tr.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Advanced: toggleable */}
          <div className="rounded-xl border border-border-subtle bg-bg-elevated">
            <button onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between px-4 py-3 cursor-pointer">
              <div className="flex items-center gap-2">
                <ChevronDown size={14} className={`text-text-muted transition ${showAdvanced ? 'rotate-180' : ''}`} />
                <span className="text-xs font-medium text-text-muted">
                  {t('modules.p2p.ui.browseRemote')} / {t('modules.p2p.ui.accessLog')}
                </span>
              </div>
            </button>

            {showAdvanced && (
              <div className="px-4 pb-4 space-y-4">
                {/* Browse Remote */}
                <div>
                  <div className="flex gap-2 mb-2">
                    <select value={remoteDirPeer} onChange={(e) => { setRemoteDirPeer(e.target.value); setRemoteFiles([]) }}
                      className="flex-1 rounded-lg border border-border-base bg-bg-base px-3 py-2 text-xs text-text-primary outline-none focus:border-primary transition cursor-pointer">
                      <option value="">{t('modules.p2p.ui.selectPeer')}</option>
                      {sortedPeers.map(p => <option key={p.code} value={p.code}>{p.code} — {p.alias}</option>)}
                    </select>
                    <button onClick={handleRequestDir} disabled={!remoteDirPeer}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-700 disabled:opacity-40 cursor-pointer transition">
                      <FolderOpen size={12} className="inline mr-1" />{t('modules.p2p.ui.browse')}
                    </button>
                  </div>
                  {remoteFiles.length > 0 && (
                    <div className="max-h-24 overflow-y-auto space-y-1">
                      {remoteFiles.map(f => (
                        <div key={f.name} className="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-bg-base">
                          <div className="flex items-center gap-1.5">
                            {f.is_dir ? <Folder size={12} className="text-yellow-500" /> : <FileText size={12} className="text-text-muted" />}
                            <span className="text-text-primary">{f.name}</span>
                            <span className="text-text-disabled">{formatSize(f.size)}</span>
                          </div>
                          {!f.is_dir && <button onClick={() => handleDownloadFile(f.name)} className="text-text-muted hover:text-primary cursor-pointer"><Download size={12} /></button>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Access Log */}
                <div>
                  <h3 className="text-xs font-medium text-text-muted mb-2">{t('modules.p2p.ui.accessLog')}</h3>
                  {accessLog.length === 0 ? (
                    <p className="text-center text-[11px] text-text-disabled py-2">{t('modules.p2p.ui.noLogs')}</p>
                  ) : (
                    <div className="max-h-28 overflow-y-auto space-y-1">
                      {accessLog.slice(0, 20).map((log, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-[11px]">
                          <span className="text-text-disabled w-12 shrink-0">{log.timestamp.split(' ')[1]?.slice(0, 5) || ''}</span>
                          <span className="font-mono text-primary">{log.peer_code}</span>
                          <span className={`px-1 py-0.5 rounded text-[10px] ${log.action === 'download' ? 'bg-green-500/10 text-green-400' : 'bg-blue-500/10 text-blue-400'}`}>{log.action}</span>
                          <span className="text-text-secondary truncate">{log.path}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      ) : (
        /* Service stopped: clean empty state */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bg-elevated mb-4">
            <WifiOff size={28} className="text-text-muted" />
          </div>
          <p className="text-sm font-medium text-text-secondary mb-2">{t('modules.p2p.ui.serviceStopped')}</p>
          <p className="text-xs text-text-muted mb-4">{t('modules.p2p.ui.stoppedHint')}</p>
          <button onClick={async () => {
            setStarting(true)
            const port = await p2pStartService()
            if (port !== null) { setTcpPort(port); setRunning(true) }
            setStarting(false)
          }} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 cursor-pointer transition">
            {starting ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
            {t('modules.p2p.ui.startService')}
          </button>
        </div>
      )}
    </div>
  )
}
