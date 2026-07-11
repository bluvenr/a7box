/**
 * P2P Transfer — actions hook
 * All callback handlers, derived from state
 */
import { useCallback, type DragEvent } from 'react'
import QRCode from 'qrcode'
import {
  p2pSetAlias, p2pStopService, p2pStartService,
  p2pSendFile, p2pGetSharedInfo, p2pSetSharedDir,
  p2pSetDownloadDir, p2pGetLocalIps,
  p2pRequestDir, p2pDownloadFile, p2pManualConnect, p2pRetryTransfer,
  p2pValidateDir,
  startHttpServer, stopHttpServer, getHttpServerInfo,
} from '../../../shared/utils/tauriBridge'
import { isTauri } from '../../../shared/utils'
import { ALIAS_MAX, GUIDE_KEY, FAVORITES_KEY } from '../utils'
import type { P2PState } from './useP2PState'

export function useP2PActions(s: P2PState) {
  const dismissGuide = useCallback(() => {
    localStorage.setItem(GUIDE_KEY, '1'); s.setShowGuide(false)
  }, [s.setShowGuide])

  const toggleAutoStart = useCallback((val: boolean) => {
    s.setAutoStart(val)
    localStorage.setItem('a7box-p2p-autostart', val ? 'true' : 'false')
  }, [s.setAutoStart])

  const toggleFavorite = useCallback((code: string) => {
    s.setFavorites(prev => {
      const next = prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next))
      return next
    })
  }, [s.setFavorites])

  const handleSaveAlias = useCallback(async () => {
    const trimmed = s.aliasInput.trim().slice(0, ALIAS_MAX)
    if (!trimmed || trimmed === s.identity?.alias) {
      s.setAliasInput(s.identity?.alias || '')
      s.setEditingAlias(false)
      return
    }
    await p2pSetAlias(trimmed)
    s.setIdentity(prev => prev ? { ...prev, alias: trimmed } : null)
    s.setEditingAlias(false)
    s.toast(s.t('common.saved', { defaultValue: 'Saved' }))
  }, [s.aliasInput, s.identity, s.toast, s.t, s.setAliasInput, s.setEditingAlias, s.setIdentity])

  const handleCopyCode = useCallback(async () => {
    if (!s.identity) return
    await navigator.clipboard.writeText(s.identity.code)
    s.toast(s.t('common.copied'))
  }, [s.identity, s.toast, s.t])

  const handleBrowseFile = useCallback(async () => {
    if (!isTauri()) return
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({ multiple: true })
      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected]
        s.setFilePaths(prev => [...prev, ...paths])
      }
    } catch (e) { console.error('[P2P] Dialog error:', e) }
  }, [s.setFilePaths])

  const handleBrowseDir = useCallback(async (setter: (v: string) => void) => {
    if (!isTauri()) return
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({ directory: true, multiple: false })
      if (selected) setter(selected as string)
    } catch (e) { console.error('[P2P] Dialog error:', e) }
  }, [])

  // Drag & Drop
  const handleDragOver = useCallback((e: DragEvent) => { e.preventDefault(); s.setIsDragging(true) }, [s.setIsDragging])
  const handleDragLeave = useCallback(() => s.setIsDragging(false), [s.setIsDragging])
  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault(); s.setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      s.setFilePaths(prev => [...prev, ...files.map(f => (f as unknown as { path?: string }).path || f.name)])
    }
  }, [s.setIsDragging, s.setFilePaths])

  const handleManualConnect = useCallback(async () => {
    const addr = s.manualAddr.trim()
    if (!addr) return
    const match = addr.match(/^(.+):(\d+)$/)
    if (!match) {
      s.toast(s.t('modules.p2p.ui.invalidAddr', { defaultValue: 'Invalid format. Use IP:Port' }), 'error')
      return
    }
    const port = parseInt(match[2], 10)
    if (port < 1 || port > 65535) {
      s.toast(s.t('modules.p2p.ui.invalidPort', { defaultValue: 'Port must be 1-65535' }), 'error')
      return
    }
    const inputIp = match[1].trim()
    if (port === s._tcpPort && (s.localIps.includes(inputIp) || inputIp === '127.0.0.1' || inputIp === 'localhost')) {
      s.toast(s.t('modules.p2p.ui.cannotConnectSelf', { defaultValue: 'Cannot connect to your own device' }), 'error')
      return
    }
    const peer = await p2pManualConnect(addr)
    if (peer) {
      s.setPeers(prev => prev.find(p => p.code === peer.code) ? prev : [...prev, peer])
      s.setManualAddr(''); s.setShowManual(false)
      s.toast(s.t('modules.p2p.ui.connectSuccess', { defaultValue: 'Connected successfully' }))
    } else {
      s.toast(s.t('modules.p2p.ui.connectFailed', { defaultValue: 'Connection failed' }), 'error')
    }
  }, [s.manualAddr, s.toast, s.t, s._tcpPort, s.localIps, s.setPeers, s.setManualAddr, s.setShowManual])

  const handleSendFile = useCallback(async () => {
    if (s.filePaths.length === 0 || !s.targetPeer) return
    s.setSending(true)
    let ok = 0
    for (const fp of s.filePaths) {
      const id = await p2pSendFile(s.targetPeer, fp)
      if (id) {
        ok++
        s.setTransfers(prev => [...prev, {
          id, filename: fp.split(/[/\\]/).pop() || fp, size: 0,
          progress: 0, status: 'transferring', direction: 'send', peer_code: s.targetPeer, file_path: fp,
        }])
      }
    }
    if (ok > 0) { s.setFilePaths([]); s.setTargetPeer('') }
    else s.toast(s.t('modules.p2p.ui.sendFailed'), 'error')
    s.setSending(false)
  }, [s.filePaths, s.targetPeer, s.t, s.toast, s.setSending, s.setTransfers, s.setFilePaths, s.setTargetPeer])

  const handleRetry = useCallback(async (transferId: string) => {
    const result = await p2pRetryTransfer(transferId)
    if (!result) s.toast(s.t('modules.p2p.ui.sendFailed'), 'error')
  }, [s.t, s.toast])

  const handleOpenFolder = useCallback(async (filePath: string) => {
    if (!filePath) return
    try {
      const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
      await revealItemInDir(filePath)
    } catch (e) { console.error('[P2P] Open folder error:', e) }
  }, [])

  const handleToggleShared = useCallback(async (enabled: boolean) => {
    if (enabled && !s.sharedDir) {
      await s.alert({
        title: s.t('modules.p2p.ui.sharedDir', { defaultValue: 'Shared directory' }),
        message: s.t('modules.p2p.ui.selectDir', { defaultValue: 'Please select a shared directory first' }),
        icon: 'warning',
      })
      return
    }
    if (enabled && s.sharedDir) {
      const valid = await p2pValidateDir(s.sharedDir)
      if (!valid) { s.toast(s.t('modules.p2p.ui.dirInvalid'), 'error'); return }
    }
    await p2pSetSharedDir(s.sharedDir, enabled)
    s.setSharedEnabled(enabled)
    const info = await p2pGetSharedInfo()
    if (info) { s.setSharedFiles(info.files); s.setAccessLog(info.accessLog) }

    if (!enabled && s.httpServer) {
      await stopHttpServer()
      s.setHttpServer(null); s.setHttpUrl(''); s.setQrDataUrl(''); s.setShowQr(false)
      s.toast(s.t('modules.p2p.ui.httpStopped'))
    }
  }, [s.sharedDir, s.t, s.toast, s.alert, s.httpServer, s.setSharedEnabled, s.setSharedFiles, s.setAccessLog, s.setHttpServer, s.setHttpUrl, s.setQrDataUrl, s.setShowQr])

  // HTTP Server handlers
  const handleStartHttpServer = useCallback(async () => {
    if (!s.sharedDir || !s.sharedEnabled) { s.toast(s.t('modules.p2p.ui.selectDir'), 'error'); return }
    const valid = await p2pValidateDir(s.sharedDir)
    if (!valid) { s.toast(s.t('modules.p2p.ui.dirInvalid'), 'error'); return }
    let port = s.lastHttpPort.current || (8080 + Math.floor(Math.random() * 1000))
    let info = await startHttpServer(s.sharedDir, port, s.allowUpload)
    if (!info && s.lastHttpPort.current) {
      port = 8080 + Math.floor(Math.random() * 1000)
      info = await startHttpServer(s.sharedDir, port, s.allowUpload)
    }
    if (info) s.lastHttpPort.current = info.port
    if (info && info.urls.length > 0) {
      s.setHttpServer(info)
      const url = info.urls[0]
      s.setHttpUrl(url)
      const qr = await QRCode.toDataURL(url, { width: 180, margin: 1 })
      s.setQrDataUrl(qr)
      s.setShowQr(true)
      s.toast(s.t('modules.p2p.ui.httpStarted'))
    } else {
      s.toast(s.t('modules.p2p.ui.httpStartFailed'), 'error')
    }
  }, [s.sharedDir, s.sharedEnabled, s.allowUpload, s.t, s.toast, s.lastHttpPort, s.setHttpServer, s.setHttpUrl, s.setQrDataUrl, s.setShowQr])

  const handleStopHttpServer = useCallback(async () => {
    await stopHttpServer()
    s.setHttpServer(null); s.setHttpUrl(''); s.setQrDataUrl(''); s.setShowQr(false)
    s.toast(s.t('modules.p2p.ui.httpStopped'))
  }, [s.t, s.toast, s.setHttpServer, s.setHttpUrl, s.setQrDataUrl, s.setShowQr])

  const handleCopyUrl = useCallback(async () => {
    if (s.httpUrl) {
      await navigator.clipboard.writeText(s.httpUrl)
      s.toast(s.t('common.copied'))
    }
  }, [s.httpUrl, s.t, s.toast])

  const handleRequestDir = useCallback(async () => {
    if (!s.remoteDirPeer) return
    s.setRemoteFiles(await p2pRequestDir(s.remoteDirPeer))
  }, [s.remoteDirPeer, s.setRemoteFiles])

  const handleDownloadFile = useCallback(async (fileName: string) => {
    if (!s.remoteDirPeer) return
    let downloadDir: string | null = null
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      downloadDir = await open({ directory: true, multiple: false }) as string | null
    } catch { /* noop */ }
    if (!downloadDir) return
    const result = await p2pDownloadFile(s.remoteDirPeer, fileName, downloadDir)
    if (result) {
      s.setTransfers(prev => [...prev, {
        id: 'dl-' + Date.now(), filename: fileName, size: 0,
        progress: 100, status: 'complete', direction: 'receive', peer_code: s.remoteDirPeer, file_path: result,
      }])
    }
  }, [s.remoteDirPeer, s.setTransfers])

  const handleClearHistory = useCallback(async () => {
    const ok = await s.confirm({
      title: s.t('modules.p2p.ui.clearHistory', { defaultValue: 'Clear history' }),
      message: s.t('modules.p2p.ui.clearHistoryConfirm', { defaultValue: 'Are you sure to clear all transfer history? This cannot be undone.' }),
      confirmText: s.t('common.confirm', { defaultValue: 'Confirm' }),
      cancelText: s.t('common.cancel', { defaultValue: 'Cancel' }),
      danger: true,
    })
    if (ok) s.setTransfers([])
  }, [s.confirm, s.t, s.setTransfers])

  const handleStopService = useCallback(async () => {
    await p2pStopService()
    s.setRunning(false); s.setPeers([]); s.setTcpPort(0); s.setScanTimedOut(false)
    s.setSharedFiles([]); s.setAccessLog([])
    if (s.httpServer) {
      await stopHttpServer()
      s.setHttpServer(null); s.setHttpUrl(''); s.setQrDataUrl(''); s.setShowQr(false)
    }
    const info = await p2pGetSharedInfo()
    if (info) {
      s.setSharedDir(info.directory); s.setSharedEnabled(info.enabled)
    }
  }, [s.setRunning, s.setPeers, s.setTcpPort, s.setScanTimedOut, s.setSharedFiles, s.setAccessLog, s.httpServer, s.setHttpServer, s.setHttpUrl, s.setQrDataUrl, s.setShowQr, s.setSharedDir, s.setSharedEnabled])

  const handleStartService = useCallback(async () => {
    s.setStarting(true)
    const port = await p2pStartService()
    if (port !== null) { s.setTcpPort(port); s.setRunning(true) }
    s.setStarting(false)
    const info = await p2pGetSharedInfo()
    if (info) {
      s.setSharedDir(info.directory); s.setSharedEnabled(info.enabled)
      s.setSharedFiles(info.files); s.setAccessLog(info.accessLog)
    }
    const httpInfo = await getHttpServerInfo()
    if (httpInfo) {
      const ips = await p2pGetLocalIps()
      const urls = ips.length > 0
        ? ips.map(ip => `http://${ip}:${httpInfo.port}`)
        : httpInfo.urls
      s.setHttpServer({ ...httpInfo, urls })
      const url = urls[0]
      s.setHttpUrl(url)
      s.lastHttpPort.current = httpInfo.port
      const qr = await QRCode.toDataURL(url, { width: 180, margin: 1 })
      s.setQrDataUrl(qr)
      s.setShowQr(true)
    }
  }, [s.setStarting, s.setTcpPort, s.setRunning, s.setSharedDir, s.setSharedEnabled, s.setSharedFiles, s.setAccessLog, s.setHttpServer, s.setHttpUrl, s.setQrDataUrl, s.setShowQr, s.lastHttpPort])

  const handleChangeDownloadDir = useCallback(async () => {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({ directory: true, multiple: false })
    if (selected) {
      await p2pSetDownloadDir(selected as string)
      s.setDownloadDir(selected as string)
    }
  }, [s.setDownloadDir])

  return {
    dismissGuide, toggleAutoStart, toggleFavorite,
    handleSaveAlias, handleCopyCode, handleBrowseFile, handleBrowseDir,
    handleDragOver, handleDragLeave, handleDrop,
    handleManualConnect, handleSendFile, handleRetry, handleOpenFolder,
    handleToggleShared, handleStartHttpServer, handleStopHttpServer, handleCopyUrl,
    handleRequestDir, handleDownloadFile, handleClearHistory,
    handleStopService, handleStartService, handleChangeDownloadDir,
  }
}

export type P2PActions = ReturnType<typeof useP2PActions>
