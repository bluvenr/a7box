/**
 * A7Box HTTP File Server
 * Start a local HTTP server to share files over LAN
 */
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, Play, Square, Copy, Wifi, WifiOff } from 'lucide-react'
import { startHttpServer, stopHttpServer, getHttpServerInfo, p2pGetLocalIps, type ServerInfo } from '../../shared/utils/tauriBridge'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

const DEFAULT_PORT = 8080

export default function HttpServer() {
  const { t } = useTranslation()
  const [port, setPort] = useState(DEFAULT_PORT)
  const [directory, setDirectory] = useState('')
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Sync with backend state on mount
  useEffect(() => {
    if (!isTauri()) return
    ;(async () => {
      const info = await getHttpServerInfo()
      if (info) {
        const ips = await p2pGetLocalIps()
        const urls = ips.length > 0
          ? ips.map(ip => `http://${ip}:${info.port}`)
          : info.urls
        setServerInfo({ ...info, urls })
        setPort(info.port)
        setDirectory(info.directory)
        setRunning(true)
      }
    })()
  }, [])

  const handleStart = async () => {
    setError(null)
    if (!isTauri()) {
      setError(t('modules.httpServer.ui.desktopOnly'))
      return
    }
    if (!directory.trim()) {
      setError(t('modules.httpServer.ui.selectDir'))
      return
    }

    const info = await startHttpServer(directory.trim(), port)
    if (info) {
      setServerInfo(info)
      setRunning(true)
    } else {
      setError(t('modules.httpServer.ui.startFailed'))
    }
  }

  const handleStop = async () => {
    if (!isTauri()) return
    await stopHttpServer()
    setServerInfo(null)
    setRunning(false)
  }

  const copyUrl = async () => {
    if (serverInfo?.urls.length) {
      await navigator.clipboard.writeText(serverInfo.urls.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Globe size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            {t('modules.httpServer.name')}
          </h1>
          <p className="text-sm text-text-secondary">
            {t('modules.httpServer.description')}
          </p>
        </div>
      </div>

      {/* Config Panel */}
      <div className="mb-6 rounded-xl border border-border-subtle bg-bg-elevated p-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Directory */}
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
              {t('modules.httpServer.ui.directory')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={directory}
                onChange={(e) => setDirectory(e.target.value)}
                placeholder="C:\Users\You\Documents"
                disabled={running}
                className="flex-1 rounded-lg border border-border-base bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-primary transition disabled:opacity-50"
              />
            </div>
          </div>

          {/* Port */}
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
              {t('modules.httpServer.ui.port')}
            </label>
            <input
              type="number"
              min={1024}
              max={65535}
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              disabled={running}
              className="w-24 rounded-lg border border-border-base bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-primary transition disabled:opacity-50"
            />
          </div>

          {/* Start/Stop */}
          {!running ? (
            <button
              onClick={handleStart}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-700 cursor-pointer"
            >
              <Play size={14} />
              {t('modules.httpServer.ui.start')}
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 cursor-pointer"
            >
              <Square size={14} />
              {t('modules.httpServer.ui.stop')}
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          {error}
        </div>
      )}

      {/* Server Status */}
      {running && serverInfo && (
        <div className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Wifi size={16} className="text-green-400" />
            <span className="text-sm font-semibold text-green-400">
              {t('modules.httpServer.ui.serverRunning')}
            </span>
          </div>

          <div className="mb-3">
            <label className="text-xs text-text-muted">{t('modules.httpServer.ui.serving')}</label>
            <p className="font-mono text-sm text-text-primary">{serverInfo.directory}</p>
          </div>

          <div>
            <label className="text-xs text-text-muted">{t('modules.httpServer.ui.accessUrls')}</label>
            <div className="mt-1 space-y-1">
              {serverInfo.urls.map((url, i) => (
                <div key={i} className="flex items-center gap-2">
                  <code className="rounded bg-bg-base px-3 py-1 text-sm text-primary">{url}</code>
                </div>
              ))}
            </div>
            <button
              onClick={copyUrl}
              className="mt-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-text-secondary transition hover:text-primary cursor-pointer"
            >
              <Copy size={12} />
              {copied ? '✓ ' + t('common.copied') : t('modules.httpServer.ui.copyUrls')}
            </button>
          </div>
        </div>
      )}

      {/* Not Running */}
      {!running && !error && (
        <div className="rounded-xl border border-border-subtle bg-bg-elevated p-8 text-center">
          <WifiOff size={32} className="mx-auto mb-3 text-text-disabled" />
          <p className="text-sm text-text-muted">{t('modules.httpServer.ui.notRunning')}</p>
          <p className="mt-1 text-xs text-text-disabled">{t('modules.httpServer.ui.notRunningHint')}</p>
        </div>
      )}
    </div>
  )
}
