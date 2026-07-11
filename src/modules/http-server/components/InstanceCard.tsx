/**
 * HTTP Server — Instance Card with QR code toggle
 */
import { useState, useEffect, useCallback } from 'react'
import { Wifi, Square, Copy, QrCode, ChevronDown, ChevronUp } from 'lucide-react'
import type { HttpInstanceInfo } from '../../../shared/utils/tauriBridge'

interface Props {
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
}

export function InstanceCard({
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
}: Props) {
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
        <button
          onClick={toggleQr}
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-text-secondary hover:text-primary transition cursor-pointer"
        >
          <QrCode size={12} />
          {t('modules.httpServer.ui.qr', { defaultValue: 'QR Code' })}
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
