/**
 * HTTP Server — Instance Card with QR code toggle
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { Wifi, Square, Copy, QrCode, ChevronDown, ChevronUp, Settings2, Check, X } from 'lucide-react'
import type { HttpInstanceInfo } from '../../../shared/utils/tauriBridge'

type PortCheckState = 'idle' | 'checking' | 'free' | 'busy' | 'invalid' | 'same'

interface Props {
  instance: HttpInstanceInfo
  expandedQr: string | null
  setExpandedQr: (id: string | null) => void
  qrCache: Record<string, string>
  getQrCode: (url: string, id: string) => Promise<string>
  onCopy: (url: string) => void
  onStop: (inst: HttpInstanceInfo) => void
  /** Apply a new port; returns true on success (card will remount). */
  onChangePort?: (inst: HttpInstanceInfo, port: number) => Promise<boolean>
  /** Probe whether a port is free. null = cannot probe. */
  onCheckPort?: (port: number) => Promise<boolean | null>
  isStopping?: boolean
  isHighlight?: boolean
  t: (key: string, opts?: any) => string
}

export function InstanceCard({
  instance: inst,
  expandedQr,
  setExpandedQr,
  qrCache,
  getQrCode,
  onCopy,
  onStop,
  onChangePort,
  onCheckPort,
  isStopping,
  isHighlight,
  t,
}: Props) {
  const url = inst.urls[0] || `http://localhost:${inst.port}`
  const isQrExpanded = expandedQr === inst.id
  const [qrDataUrl, setQrDataUrl] = useState<string>('')

  // ── Change-port state ──
  const [editingPort, setEditingPort] = useState(false)
  const [portInput, setPortInput] = useState('')
  const [checkState, setCheckState] = useState<PortCheckState>('idle')
  const [applying, setApplying] = useState(false)
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced availability probe while typing
  useEffect(() => {
    if (!editingPort || !onCheckPort) return
    const raw = portInput.trim()
    if (!raw) { setCheckState('idle'); return }
    const n = Number(raw)
    if (!Number.isInteger(n) || n < 1024 || n > 65535) { setCheckState('invalid'); return }
    if (n === inst.port) { setCheckState('same'); return }
    setCheckState('checking')
    if (checkTimer.current) clearTimeout(checkTimer.current)
    checkTimer.current = setTimeout(async () => {
      const free = await onCheckPort(n)
      if (free === null) { setCheckState('free'); return } // cannot probe — let the bind decide
      setCheckState(free ? 'free' : 'busy')
    }, 350)
    return () => { if (checkTimer.current) clearTimeout(checkTimer.current) }
  }, [editingPort, portInput, inst.port, onCheckPort])

  const applyDisabled = applying || checkState !== 'free'

  const handleApplyPort = useCallback(async () => {
    if (applyDisabled || !onChangePort) return
    const n = Number(portInput.trim())
    setApplying(true)
    const ok = await onChangePort(inst, n)
    // On success the card remounts (key includes port); only reset on failure
    if (!ok) setApplying(false)
  }, [applyDisabled, onChangePort, inst, portInput])

  const closePortEditor = useCallback(() => {
    setEditingPort(false)
    setPortInput('')
    setCheckState('idle')
  }, [])

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
              {t('modules.httpServer.ui.instanceRunning', { defaultValue: 'Running' })}
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
          title={t('modules.httpServer.ui.stop', { defaultValue: 'Stop' })}
        >
          <Square size={12} />
          <span className="hidden sm:inline">{t('modules.httpServer.ui.stop', { defaultValue: 'Stop' })}</span>
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
          {t('modules.httpServer.ui.copy', { defaultValue: 'Copy' })}
        </button>
        {onChangePort && (
          <button
            onClick={() => (editingPort ? closePortEditor() : setEditingPort(true))}
            className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs transition cursor-pointer ${
              editingPort ? 'text-primary' : 'text-text-secondary hover:text-primary'
            }`}
            title={t('modules.httpServer.ui.changePort', { defaultValue: 'Change Port' })}
          >
            <Settings2 size={12} />
            {t('modules.httpServer.ui.changePort', { defaultValue: 'Change Port' })}
          </button>
        )}
        <button
          onClick={toggleQr}
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-text-secondary hover:text-primary transition cursor-pointer"
        >
          <QrCode size={12} />
          {t('modules.httpServer.ui.qr', { defaultValue: 'QR Code' })}
          {isQrExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* Change-port editor (inline) */}
      {editingPort && (
        <div className="mt-3 rounded-lg border border-border-subtle bg-bg-base/60 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1024}
              max={65535}
              value={portInput}
              onChange={(e) => setPortInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleApplyPort(); if (e.key === 'Escape') closePortEditor() }}
              placeholder={t('modules.httpServer.ui.port', { defaultValue: 'Port' })}
              autoFocus
              className={`w-28 rounded-md border bg-bg-overlay px-2.5 py-1.5 text-xs text-text-primary outline-none transition ${
                checkState === 'busy' || checkState === 'invalid'
                  ? 'border-red-400 focus:border-red-500'
                  : 'border-border-base focus:border-primary'
              }`}
            />
            <button
              onClick={handleApplyPort}
              disabled={applyDisabled}
              className="flex items-center gap-1 rounded-md bg-green-600 px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-green-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {applying ? (
                <span className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Check size={11} />
              )}
              {t('modules.httpServer.ui.apply', { defaultValue: 'Apply' })}
            </button>
            <button
              onClick={closePortEditor}
              className="rounded-md p-1.5 text-text-muted hover:text-text-primary transition cursor-pointer"
              title={t('common.cancel', { defaultValue: 'Cancel' })}
            >
              <X size={12} />
            </button>
            {checkState !== 'idle' && (
              <span className={`text-[10px] ${
                checkState === 'free' ? 'text-green-400'
                  : checkState === 'checking' ? 'text-text-muted'
                  : checkState === 'same' ? 'text-text-muted'
                  : 'text-red-400'
              }`}>
                {checkState === 'checking' && t('modules.httpServer.ui.checkingPort', { defaultValue: 'Checking port...' })}
                {checkState === 'free' && t('modules.httpServer.ui.portAvailable', { defaultValue: 'Port is available' })}
                {checkState === 'busy' && t('modules.httpServer.ui.portOccupied', { defaultValue: 'Port is already in use' })}
                {checkState === 'invalid' && t('modules.httpServer.ui.portInvalid', { defaultValue: 'Port range 1024-65535' })}
                {checkState === 'same' && t('modules.httpServer.ui.portSame', { defaultValue: 'Same as current port' })}
              </span>
            )}
          </div>
        </div>
      )}

      {/* QR code (expandable) */}
      {isQrExpanded && qrDataUrl && (
        <div className="mt-3 flex justify-center">
          <img src={qrDataUrl} alt="QR Code" className="rounded-lg" width={160} height={160} />
        </div>
      )}
    </div>
  )
}
