/**
 * QR Quick Utility Window
 * Floating window that auto-detects clipboard content:
 * - Image → decode QR code and show result
 * - Text → generate QR code
 * Triggered by global shortcut (Ctrl+Shift+Q).
 */
import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { QrCode, Copy, Download, X, FileText, ScanLine } from 'lucide-react'
import QRCodeLib from 'qrcode'
import jsQR from 'jsqr'
import { isTauri } from '../../../shared/utils'

type Mode = 'generate' | 'decode'

export default function QrQuick() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode>('generate')
  const [text, setText] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [sourceImage, setSourceImage] = useState<string | null>(null)
  const [decodedText, setDecodedText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'img' | 'text' | false>(false)

  // Smart clipboard detection on mount
  useEffect(() => {
    (async () => {
      try {
        // Try image first
        if (isTauri()) {
          const { invoke } = await import('@tauri-apps/api/core')
          try {
            const imgData = await invoke<{ base64: string; width: number; height: number }>('get_clipboard_image')
            const dataUrl = await rgbaToDataUrl(imgData.base64, imgData.width, imgData.height)
            setSourceImage(dataUrl)
            setMode('decode')
            await decodeQrFromDataUrl(dataUrl, imgData.width, imgData.height)
            return
          } catch {
            // No image in clipboard, fall through to text
          }
        }

        // Try text
        let clipText = ''
        if (isTauri()) {
          const { invoke } = await import('@tauri-apps/api/core')
          clipText = await invoke<string>('get_clipboard_text')
        } else {
          clipText = await navigator.clipboard.readText()
        }
        const trimmed = clipText.trim()
        if (!trimmed) {
          setError(t('qrQuick.clipboardEmpty', { defaultValue: 'Clipboard is empty or contains non-text content' }))
          return
        }
        setText(trimmed)
        await generateQr(trimmed)
      } catch {
        setError(t('qrQuick.clipboardEmpty', { defaultValue: 'Clipboard is empty or contains non-text content' }))
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closeWindow = useCallback(async () => {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('close_utility_window', { label: 'qr-quick' })
      } catch { /* ignore */ }
    }
  }, [])

  // Double-click title bar to maximize/restore
  const toggleMaximize = useCallback(async () => {
    try {
      const win = getCurrentWindow()
      if (await win.isMaximized()) {
        await win.unmaximize()
      } else {
        await win.maximize()
      }
    } catch { /* ignore in non-Tauri env */ }
  }, [])

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeWindow()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [closeWindow])

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

  /** Decode QR from RGBA canvas data */
  const decodeQrFromDataUrl = async (dataUrl: string, _w: number, _h: number) => {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = reject
        image.src = dataUrl
      })

      // Upscale small images for better detection
      const minSize = 512
      const scale = Math.max(1, minSize / Math.min(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) { setError('Canvas not supported'); return }

      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      // Grayscale + binarize
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        const bw = gray > 128 ? 255 : 0
        data[i] = data[i + 1] = data[i + 2] = bw
      }
      ctx.putImageData(imageData, 0, 0)

      const processedData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      let code = jsQR(processedData.data, processedData.width, processedData.height)

      // Retry with original if preprocessing didn't help
      if (!code) {
        const origCanvas = document.createElement('canvas')
        origCanvas.width = img.width
        origCanvas.height = img.height
        const origCtx = origCanvas.getContext('2d')
        if (origCtx) {
          origCtx.drawImage(img, 0, 0)
          const origData = origCtx.getImageData(0, 0, origCanvas.width, origCanvas.height)
          code = jsQR(origData.data, origData.width, origData.height)
        }
      }

      if (code) {
        setDecodedText(code.data)
        setError(null)
      } else {
        setError(t('qrQuick.noQrFound', { defaultValue: 'No QR code detected in image' }))
      }
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
      await navigator.clipboard.writeText(qrDataUrl)
      setCopied('img')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleCopyText = async (content: string) => {
    if (!content) return
    await navigator.clipboard.writeText(content)
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
    <div className="flex h-screen flex-col bg-bg-elevated px-4 pb-4 select-none">
      {/* Title bar - draggable (extends to top edge) */}
      <div
        className="mb-3 flex cursor-pointer items-center justify-between pt-4"
      >
        <div className="flex flex-1 items-center gap-2" data-tauri-drag-region onDoubleClick={toggleMaximize}>
          {mode === 'generate' ? (
            <QrCode size={16} className="text-primary" />
          ) : (
            <ScanLine size={16} className="text-primary" />
          )}
          <span className="text-sm font-medium text-text-primary">
            {mode === 'generate'
              ? t('qrQuick.title', { defaultValue: 'Quick QR Code' })
              : t('qrQuick.decodeTitle', { defaultValue: 'QR Decode' })}
          </span>
        </div>
        <button
          onClick={closeWindow}
          className="pointer-events-auto rounded p-1 text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col items-center justify-center">
        {error ? (
          <div className="text-center">
            <p className="text-sm text-text-muted">{error}</p>
          </div>
        ) : mode === 'generate' ? (
          /* Generate mode: show QR */
          qrDataUrl ? (
            <div className="rounded-lg bg-white p-3 shadow-lg">
              <img src={qrDataUrl} alt="QR Code" className="h-56 w-56" />
            </div>
          ) : (
            <LoadingIndicator />
          )
        ) : (
          /* Decode mode: show source image */
          sourceImage ? (
            <div className="rounded-lg bg-white p-3 shadow-lg">
              <img src={sourceImage} alt="Source" className="max-h-48 max-w-56 rounded object-contain" />
            </div>
          ) : (
            <LoadingIndicator />
          )
        )}
      </div>

      {/* Text area */}
      {(mode === 'generate' ? text : decodedText) && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-bg-base p-2">
          <p className="line-clamp-3 flex-1 text-xs text-text-muted break-all">
            {mode === 'generate' ? text : decodedText}
          </p>
          <button
            onClick={() => handleCopyText(mode === 'generate' ? text : decodedText!)}
            className="shrink-0 rounded p-1 text-text-disabled transition hover:text-primary"
            title={t('qrQuick.copyText', { defaultValue: 'Copy text' })}
          >
            {copied === 'text' ? <Copy size={12} className="text-success" /> : <FileText size={12} />}
          </button>
        </div>
      )}

      {/* Actions */}
      {mode === 'generate' && qrDataUrl && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={handleCopyImage}
            className="flex items-center gap-1.5 rounded-lg bg-bg-base px-3 py-2 text-xs font-medium text-text-secondary transition hover:bg-bg-hover"
          >
            <Copy size={13} />
            {copied === 'img' ? t('common.copied') : t('qrQuick.copyImage', { defaultValue: 'Copy image' })}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition hover:bg-primary/20"
          >
            <Download size={13} />
            {t('qrQuick.download', { defaultValue: 'Download' })}
          </button>
        </div>
      )}
      {mode === 'decode' && decodedText && (
        <div className="flex items-center justify-center">
          <button
            onClick={() => handleCopyText(decodedText)}
            className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-4 py-2 text-xs font-medium text-primary transition hover:bg-primary/20"
          >
            <Copy size={13} />
            {copied === 'text' ? t('common.copied') : t('qrQuick.copyResult', { defaultValue: 'Copy result' })}
          </button>
        </div>
      )}

    </div>
  )
}

function LoadingIndicator() {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2 text-text-muted">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <span className="text-sm">{t('common.loading', { defaultValue: 'Loading...' })}</span>
    </div>
  )
}

/** Convert RGBA base64 bytes to a PNG data URL via canvas */
async function rgbaToDataUrl(base64: string, width: number, height: number): Promise<string> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const imageData = new ImageData(new Uint8ClampedArray(bytes.buffer), width, height)
  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}
