/**
 * P2P Transfer — state management hook
 * All useState declarations, useEffect lifecycle, and event listeners
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
import {
  p2pGetIdentity, p2pGetPeers, p2pStartService, p2pGetSharedInfo,
  p2pGetTransfers, p2pGetLocalIps, p2pGetDownloadDir, p2pGetRunningPort,
  p2pAcceptTransfer, p2pRejectTransfer,
  getHttpServerInfo,
  type ServerInfo,
  onP2PPeerDiscovered, onP2PPeerLost, onP2PTransferProgress,
  onP2PIncomingFile, onP2PAccessLog,
  type P2PIdentity, type P2PPeer, type P2PTransferInfo,
  type P2PDirFile, type P2PAccessLogEntry,
} from '../../../shared/utils/tauriBridge'
import { useP2PStatus } from '../p2pStore'
import { useToast } from '../../../components/Toast'
import { useConfirm, useAlert } from '../../../components/Dialog'
import { isTauri } from '../../../shared/utils'
import { FAVORITES_KEY, GUIDE_KEY, SCAN_TIMEOUT, formatSize } from '../utils'

export function useP2PState() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const alert = useAlert()

  // ---- State declarations ----

  // Identity
  const [identity, setIdentity] = useState<P2PIdentity | null>(null)
  const [editingAlias, setEditingAlias] = useState(false)
  const [aliasInput, setAliasInput] = useState('')
  const [localIps, setLocalIps] = useState<string[]>([])

  // Service — Zustand is single source of truth
  const running = useP2PStatus((s) => s.running)
  const setRunning = useP2PStatus((s) => s.setRunning)
  const [_tcpPort, setTcpPort] = useState(0)
  const [starting, setStarting] = useState(false)
  const autoStartRef = useRef(false)
  const [autoStart, setAutoStart] = useState(() =>
    localStorage.getItem('a7box-p2p-autostart') === 'true'
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

  // Web share (HTTP server)
  const [httpServer, setHttpServer] = useState<ServerInfo | null>(null)
  const [httpUrl, setHttpUrl] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [showQr, setShowQr] = useState(false)
  const [allowUpload, setAllowUpload] = useState(false)
  const lastHttpPort = useRef(0)

  // Refresh spin states
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({})
  const withRefresh = useCallback(async (key: string, fn: () => Promise<unknown>) => {
    setRefreshing(prev => ({ ...prev, [key]: true }))
    try { await fn() } finally { setRefreshing(prev => ({ ...prev, [key]: false })) }
  }, [])

  // Browse remote dir
  const [remoteDirPeer, setRemoteDirPeer] = useState('')
  const [remoteFiles, setRemoteFiles] = useState<P2PDirFile[]>([])

  // Onboarding guide
  const [showGuide, setShowGuide] = useState(false)
  const guideRef = useRef<HTMLDivElement>(null)
  const sharedDirRef = useRef<HTMLDivElement>(null)
  const [highlightSharedDir, setHighlightSharedDir] = useState(false)

  // Transfer history search/filter
  const [historySearch, setHistorySearch] = useState('')
  const [historyFilter, setHistoryFilter] = useState<'all' | 'send' | 'receive'>('all')

  // Download directory
  const [downloadDir, setDownloadDir] = useState('')

  // Scan elapsed counter
  const [scanElapsed, setScanElapsed] = useState(0)

  // ---- Effects ----

  // Sync with backend state on mount
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
      setDownloadDir(await p2pGetDownloadDir())

      const existingPort = await p2pGetRunningPort()
      if (existingPort > 0) {
        setTcpPort(existingPort)
        setRunning(true)
        setPeers(await p2pGetPeers())
      } else if (autoStart) {
        setStarting(true)
        const port = await p2pStartService()
        if (port !== null) {
          setTcpPort(port); setRunning(true)
          setTimeout(async () => setPeers(await p2pGetPeers()), 2000)
        }
        setStarting(false)
      }

      const httpInfo = await getHttpServerInfo()
      if (httpInfo) {
        const ips = await p2pGetLocalIps()
        const urls = ips.length > 0
          ? ips.map(ip => `http://${ip}:${httpInfo.port}`)
          : httpInfo.urls
        const serverInfo: ServerInfo = { ...httpInfo, urls }
        setHttpServer(serverInfo)
        const url = urls[0]
        setHttpUrl(url)
        lastHttpPort.current = httpInfo.port
        const qr = await QRCode.toDataURL(url, { width: 180, margin: 1 })
        setQrDataUrl(qr)
        setShowQr(true)
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

  // Scan elapsed counter
  useEffect(() => {
    if (!running || peers.length > 0 || scanTimedOut) { setScanElapsed(0); return }
    setScanElapsed(0)
    const iv = setInterval(() => setScanElapsed(e => e + 1), 1000)
    return () => clearInterval(iv)
  }, [running, peers.length, scanTimedOut])

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
      setTransfers(prev => prev.map(tr =>
        tr.id === data.transfer_id ? { ...tr, progress: data.progress, status: data.status } : tr
      ))
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
      if (data.status === 'complete' || data.status === 'failed') {
        delete speedRef.current[data.transfer_id]
        setSpeedMap(m => { const { [data.transfer_id]: _, ...rest } = m; return rest })
      }
    }).then(u => u && unsubs.push(u))

    onP2PIncomingFile(data => {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('A7Box - ' + t('modules.p2p.ui.incomingFile'), {
          body: `${data.filename} (${formatSize(data.size)}) — ${data.peer_alias}`,
        })
      }
      confirm({
        title: t('modules.p2p.ui.incomingFile'),
        message: `${data.filename} (${formatSize(data.size)})`,
        detail: `${data.peer_alias} (${data.peer_code})`,
        confirmText: t('modules.p2p.ui.accept', { defaultValue: 'Accept' }),
        cancelText: t('modules.p2p.ui.reject', { defaultValue: 'Reject' }),
      }).then(accepted => {
        if (accepted) p2pAcceptTransfer(data.transfer_id)
        else p2pRejectTransfer(data.transfer_id)
      })
    }).then(u => u && unsubs.push(u))

    onP2PAccessLog(entry => {
      setAccessLog(prev => [entry, ...prev].slice(0, 50))
    }).then(u => u && unsubs.push(u))

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }

    return () => { unsubs.forEach(u => u()) }
  }, [t, confirm])

  // ---- Computed values ----

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

  return {
    // i18n & UI helpers
    t, toast, confirm, alert,
    // Identity
    identity, setIdentity, editingAlias, setEditingAlias, aliasInput, setAliasInput, localIps,
    // Service
    running, setRunning, _tcpPort, setTcpPort, starting, setStarting, autoStart, setAutoStart,
    // Peers
    peers, setPeers, scanTimedOut, setScanTimedOut, scanResetKey, setScanResetKey,
    manualAddr, setManualAddr, showManual, setShowManual, favorites, setFavorites,
    // Send file
    filePaths, setFilePaths, targetPeer, setTargetPeer, sending, setSending, isDragging, setIsDragging,
    // Transfers
    transfers, setTransfers, speedMap, activeTransfers, completedSend,
    batchInProgress, batchTotal, batchDone,
    // Shared directory
    sharedDir, setSharedDir, sharedEnabled, setSharedEnabled, sharedFiles, setSharedFiles,
    accessLog, setAccessLog, showAdvanced, setShowAdvanced,
    // HTTP server
    httpServer, setHttpServer, httpUrl, setHttpUrl, qrDataUrl, setQrDataUrl,
    showQr, setShowQr, allowUpload, setAllowUpload, lastHttpPort,
    // Refresh
    refreshing, withRefresh,
    // Browse remote
    remoteDirPeer, setRemoteDirPeer, remoteFiles, setRemoteFiles,
    // Guide
    showGuide, setShowGuide, guideRef, sharedDirRef, highlightSharedDir, setHighlightSharedDir,
    // History
    historySearch, setHistorySearch, historyFilter, setHistoryFilter,
    downloadDir, setDownloadDir,
    // Scan
    scanElapsed,
    // Computed
    sortedPeers, filteredHistory,
  }
}

export type P2PState = ReturnType<typeof useP2PState>
