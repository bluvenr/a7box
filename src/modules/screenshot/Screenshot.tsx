/**
 * A7Box Screenshot Tool
 * Capture full-screen and region screenshots via Rust backend
 * Falls back to browser Canvas API in web mode
 */
import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, Monitor, Square, Clock, FolderOpen, Copy, Image as ImageIcon } from 'lucide-react'
import { captureFullScreen, captureToBase64, getMonitors, type CaptureResult, type MonitorInfo } from '../../shared/utils/tauriBridge'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export default function Screenshot() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'fullscreen' | 'region'>('fullscreen')
  const [delay, setDelay] = useState(0)
  const [result, setResult] = useState<CaptureResult | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [monitors, setMonitors] = useState<MonitorInfo[]>([])
  const [capturing, setCapturing] = useState(false)
  const [history, setHistory] = useState<CaptureResult[]>([])
  const [error, setError] = useState<string | null>(null)

  const loadMonitors = useCallback(async () => {
    const m = await getMonitors()
    setMonitors(m)
  }, [])

  const handleCapture = async () => {
    setError(null)
    setCapturing(true)

    try {
      if (delay > 0) {
        await new Promise((r) => setTimeout(r, delay * 1000))
      }

      if (!isTauri()) {
        setError(t('modules.screenshot.ui.webOnly'))
        setCapturing(false)
        return
      }

      const res = await captureFullScreen()
      if (res) {
        setResult(res)
        setHistory((prev) => [res, ...prev].slice(0, 10))
      } else {
        setError(t('modules.screenshot.ui.captureFailed'))
      }
    } catch (e) {
      setError(String(e))
    }

    setCapturing(false)
  }

  const handlePreview = async () => {
    if (!isTauri()) {
      setError(t('modules.screenshot.ui.webOnly'))
      return
    }
    const b64 = await captureToBase64()
    setPreview(b64)
  }

  const copyPath = async (path: string) => {
    await navigator.clipboard.writeText(path)
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
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
        <button
          onClick={loadMonitors}
          className="flex items-center gap-2 rounded-lg bg-bg-hover px-3 py-2 text-sm text-text-secondary transition hover:bg-bg-elevated hover:text-text-primary cursor-pointer"
        >
          <Monitor size={14} />
          {t('modules.screenshot.ui.detectMonitors')}
        </button>
      </div>

      {/* Monitors Info */}
      {monitors.length > 0 && (
        <div className="mb-4 rounded-xl border border-border-subtle bg-bg-elevated p-4">
          <h3 className="mb-2 text-sm font-semibold text-text-primary">
            {t('modules.screenshot.ui.monitors')} ({monitors.length})
          </h3>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {monitors.map((m, i) => (
              <div key={i} className="rounded-lg bg-bg-base p-2 text-xs">
                <span className="text-text-muted">#{m.id}</span>
                <span className="ml-2 text-text-secondary">{m.width}x{m.height}</span>
                <span className="ml-2 text-text-muted">@({m.x},{m.y})</span>
                {m.scale !== 1 && <span className="ml-1 text-primary">x{m.scale}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Capture Config */}
      <div className="mb-6 rounded-xl border border-border-subtle bg-bg-elevated p-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Mode */}
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
              {t('modules.screenshot.ui.mode')}
            </label>
            <div className="flex gap-1 rounded-lg bg-bg-base p-1">
              <button
                onClick={() => setMode('fullscreen')}
                className={`cursor-pointer flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition ${
                  mode === 'fullscreen' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Monitor size={14} />
                {t('modules.screenshot.ui.fullscreen')}
              </button>
              <button
                onClick={() => setMode('region')}
                className={`cursor-pointer flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition ${
                  mode === 'region' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Square size={14} />
                {t('modules.screenshot.ui.region')}
              </button>
            </div>
          </div>

          {/* Delay */}
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
              {t('modules.screenshot.ui.delay')}
            </label>
            <div className="flex gap-1 rounded-lg bg-bg-base p-1">
              {[0, 3, 5, 10].map((s) => (
                <button
                  key={s}
                  onClick={() => setDelay(s)}
                  className={`cursor-pointer rounded-md px-3 py-1.5 text-sm transition ${
                    delay === s ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {s === 0 ? t('modules.screenshot.ui.noDelay') : `${s}s`}
                </button>
              ))}
            </div>
          </div>

          {/* Capture Button */}
          <button
            onClick={handleCapture}
            disabled={capturing}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
          >
            <Camera size={14} />
            {capturing ? t('modules.screenshot.ui.capturing') : t('modules.screenshot.ui.capture')}
          </button>

          {/* Preview */}
          <button
            onClick={handlePreview}
            className="flex items-center gap-2 rounded-lg bg-bg-hover px-3 py-2 text-sm text-text-secondary transition hover:bg-bg-elevated hover:text-text-primary cursor-pointer"
          >
            <ImageIcon size={14} />
            {t('modules.screenshot.ui.previewCapture')}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          {error}
        </div>
      )}

      {/* Preview Image */}
      {preview && (
        <div className="mb-4 rounded-xl border border-border-subtle bg-bg-elevated p-4">
          <h3 className="mb-2 text-sm font-semibold text-text-primary">
            {t('modules.screenshot.ui.preview')}
          </h3>
          <img src={preview} alt="Screenshot preview" className="max-h-[400px] w-auto rounded-lg" />
        </div>
      )}

      {/* Last Result */}
      {result && (
        <div className="mb-4 rounded-xl border border-border-subtle bg-bg-elevated p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-text-primary">
              {t('modules.screenshot.ui.lastCapture')}
            </h3>
            <button
              onClick={() => copyPath(result.path)}
              className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-text-muted transition hover:text-primary cursor-pointer"
            >
              <Copy size={10} /> {t('modules.screenshot.ui.copyPath')}
            </button>
          </div>
          <div className="rounded-lg bg-bg-base p-3 text-sm">
            <p><span className="text-text-muted">{t('modules.screenshot.ui.fileName')}:</span> <span className="text-text-primary">{result.filename}</span></p>
            <p><span className="text-text-muted">{t('modules.screenshot.ui.resolution')}:</span> <span className="text-text-primary">{result.width} x {result.height}</span></p>
            <p className="mt-1 truncate"><span className="text-text-muted">{t('modules.screenshot.ui.filePath')}:</span> <code className="text-xs text-primary">{result.path}</code></p>
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="rounded-xl border border-border-subtle bg-bg-elevated overflow-hidden">
          <div className="border-b border-border-subtle px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Clock size={14} />
              {t('modules.screenshot.ui.history')} ({history.length})
            </h3>
          </div>
          <div className="divide-y divide-border-subtle">
            {history.map((h, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <span className="text-sm text-text-primary">{h.filename}</span>
                  <span className="ml-2 text-xs text-text-muted">{h.width}x{h.height}</span>
                </div>
                <button
                  onClick={() => copyPath(h.path)}
                  className="rounded p-1 text-text-muted transition hover:text-primary cursor-pointer"
                >
                  <FolderOpen size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
