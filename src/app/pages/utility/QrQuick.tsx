/**
 * QR Quick Utility Window
 * Floating window that generates QR code from clipboard text.
 * Triggered by global shortcut (Ctrl+Shift+Q).
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QrCode, Copy, Download, X, FileText } from 'lucide-react'
import QRCodeLib from 'qrcode'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export default function QrQuick() {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'img' | 'text' | false>(false)

  // Read clipboard on mount
  useEffect(() => {
    (async () => {
      try {
        let clipText = ''
        if (isTauri()) {
          const { invoke } = await import('@tauri-apps/api/core')
          clipText = await invoke<string>('get_clipboard_text')
        } else {
          clipText = await navigator.clipboard.readText()
        }
        // Trim whitespace and validate
        const trimmed = clipText.trim()
        if (!trimmed) {
          setError(t('qrQuick.clipboardEmpty', { defaultValue: '剪贴板为空或包含非文本内容' }))
          return
        }
        setText(trimmed)
        await generateQr(trimmed)
      } catch {
        setError(t('qrQuick.clipboardEmpty', { defaultValue: '剪贴板为空或包含非文本内容' }))
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closeWindow = async () => {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('close_utility_window', { label: 'qr-quick' })
      } catch { /* ignore */ }
    }
  }

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeWindow()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const generateQr = async (content: string) => {
    try {
      const dataUrl = await QRCodeLib.toDataURL(content, {
        width: 280,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      })
      setQrDataUrl(dataUrl)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const handleCopyImage = async () => {
    if (!qrDataUrl) return
    try {
      const res = await fetch(qrDataUrl)
      const blob = await res.blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopied('img')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: copy data URL as text
      await navigator.clipboard.writeText(qrDataUrl)
      setCopied('img')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleCopyText = async () => {
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied('text')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = async () => {
    if (!qrDataUrl) return
    if (isTauri()) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { writeFile } = await import('@tauri-apps/plugin-fs')
        const filePath = await save({
          defaultPath: `qr-${Date.now()}.png`,
          filters: [{ name: 'PNG Image', extensions: ['png'] }],
        })
        if (!filePath) return
        const base64 = qrDataUrl.split(',')[1]
        const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
        await writeFile(filePath, binary)
      } catch { /* ignore */ }
    } else {
      const a = document.createElement('a')
      a.href = qrDataUrl
      a.download = `qr-${Date.now()}.png`
      a.click()
    }
  }

  return (
    <div className="flex h-screen flex-col bg-bg-elevated p-4 select-none">
      {/* Title bar - draggable */}
      <div
        className="mb-3 flex items-center justify-between cursor-grab"
        data-tauri-drag-region
        onMouseDown={(e) => {
          // Double-click to close
          if (e.detail === 2) closeWindow()
        }}
      >
        <div className="flex items-center gap-2 pointer-events-none" data-tauri-drag-region>
          <QrCode size={16} className="text-primary" />
          <span className="text-sm font-medium text-text-primary">
            {t('qrQuick.title', { defaultValue: '快速二维码' })}
          </span>
        </div>
        <button
          onClick={closeWindow}
          className="rounded p-1 text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
        >
          <X size={14} />
        </button>
      </div>

      {/* QR code */}
      <div className="flex flex-1 flex-col items-center justify-center">
        {qrDataUrl ? (
          <div className="rounded-lg bg-white p-3 shadow-lg">
            <img src={qrDataUrl} alt="QR Code" className="h-56 w-56" />
          </div>
        ) : error ? (
          <div className="text-center">
            <p className="text-sm text-text-muted">{error}</p>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-text-muted">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm">{t('common.loading', { defaultValue: '加载中...' })}</span>
          </div>
        )}
      </div>

      {/* Source text */}
      {text && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-bg-base p-2">
          <p className="line-clamp-2 flex-1 text-xs text-text-muted break-all">{text}</p>
          <button
            onClick={handleCopyText}
            className="shrink-0 rounded p-1 text-text-disabled transition hover:text-primary"
            title={t('qrQuick.copyText', { defaultValue: '复制文本' })}
          >
            {copied === 'text' ? <Copy size={12} className="text-success" /> : <FileText size={12} />}
          </button>
        </div>
      )}

      {/* Actions */}
      {qrDataUrl && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={handleCopyImage}
            className="flex items-center gap-1.5 rounded-lg bg-bg-base px-3 py-2 text-xs font-medium text-text-secondary transition hover:bg-bg-hover"
          >
            <Copy size={13} />
            {copied === 'img' ? t('common.copied') : t('qrQuick.copyImage', { defaultValue: '复制图片' })}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition hover:bg-primary/20"
          >
            <Download size={13} />
            {t('qrQuick.download', { defaultValue: '下载' })}
          </button>
        </div>
      )}
    </div>
  )
}
