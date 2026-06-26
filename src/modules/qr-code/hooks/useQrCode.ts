/**
 * QR Code Generation & Decode Hook
 */

import { useState, useCallback, useRef } from 'react'
import QRCode from 'qrcode'
import jsQR from 'jsqr'

export type QrErrorLevel = 'L' | 'M' | 'Q' | 'H'

export interface QrOptions {
  size: number
  errorCorrection: QrErrorLevel
  foreground: string
  background: string
  margin: number
}

const DEFAULT_OPTIONS: QrOptions = {
  size: 300,
  errorCorrection: 'M',
  foreground: '#FFFFFF',
  background: '#0A0A0B',
  margin: 2,
}

export function useQrCode() {
  const [content, setContent] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [options, setOptions] = useState<QrOptions>(DEFAULT_OPTIONS)
  const [error, setError] = useState<string | null>(null)

  // Decode state
  const [decodedText, setDecodedText] = useState<string | null>(null)
  const [decodeError, setDecodeError] = useState<string | null>(null)
  const [decodeImage, setDecodeImage] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  /** Generate QR code from content */
  const generate = useCallback(
    async (text?: string): Promise<boolean> => {
      const source = (text ?? content).trim()
      if (!source) {
        setError('Content is empty')
        setQrDataUrl(null)
        return false
      }

      try {
        const dataUrl = await QRCode.toDataURL(source, {
          width: options.size,
          errorCorrectionLevel: options.errorCorrection,
          color: {
            dark: options.foreground,
            light: options.background,
          },
          margin: options.margin,
        })
        setQrDataUrl(dataUrl)
        setError(null)
        return true
      } catch (e) {
        setError((e as Error).message)
        setQrDataUrl(null)
        return false
      }
    },
    [content, options]
  )

  /** Generate QR code as SVG string */
  const generateSvg = useCallback(
    async (text?: string): Promise<string | null> => {
      const source = (text ?? content).trim()
      if (!source) return null

      try {
        return await QRCode.toString(source, {
          type: 'svg',
          errorCorrectionLevel: options.errorCorrection,
          color: {
            dark: options.foreground,
            light: options.background,
          },
          margin: options.margin,
        })
      } catch {
        return null
      }
    },
    [content, options]
  )

  /** Decode QR code from image file */
  const decode = useCallback(async (file: File): Promise<string | null> => {
    setDecodeError(null)
    setDecodedText(null)

    try {
      // Load image
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      setDecodeImage(dataUrl)

      // Draw to canvas
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = reject
        image.src = dataUrl
      })

      // Upscale small images for better QR detection
      const minSize = 512
      const scale = Math.max(1, minSize / Math.min(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        setDecodeError('Canvas not supported')
        return null
      }

      // Use nearest-neighbor for sharp pixel scaling
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      // Get image data and convert to grayscale with threshold
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      for (let i = 0; i < data.length; i += 4) {
        // Grayscale
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        // Threshold (binarize)
        const bw = gray > 128 ? 255 : 0
        data[i] = data[i + 1] = data[i + 2] = bw
      }
      ctx.putImageData(imageData, 0, 0)

      // Try decode with processed image
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
        return code.data
      } else {
        setDecodeError('No QR code found in image')
        return null
      }
    } catch (e) {
      setDecodeError((e as Error).message)
      return null
    }
  }, [])

  /** Download QR as PNG */
  const downloadPng = useCallback(async () => {
    if (!qrDataUrl) return
    const filename = `qrcode-${Date.now()}.png`
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { writeFile } = await import('@tauri-apps/plugin-fs')
        const filePath = await save({
          defaultPath: filename,
          filters: [{ name: 'PNG Image', extensions: ['png'] }],
        })
        if (!filePath) return
        const base64 = qrDataUrl.split(',')[1]
        const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
        await writeFile(filePath, binary)
        return
      } catch { /* fallback to browser */ }
    }
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = filename
    a.click()
  }, [qrDataUrl])

  /** Download QR as SVG */
  const downloadSvg = useCallback(async () => {
    const svg = await generateSvg()
    if (!svg) return
    const filename = `qrcode-${Date.now()}.svg`
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { writeTextFile } = await import('@tauri-apps/plugin-fs')
        const filePath = await save({
          defaultPath: filename,
          filters: [{ name: 'SVG Image', extensions: ['svg'] }],
        })
        if (!filePath) return
        await writeTextFile(filePath, svg)
        return
      } catch { /* fallback to browser */ }
    }
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, [generateSvg])

  /** Copy QR to clipboard */
  const copyToClipboard = useCallback(async () => {
    if (!qrDataUrl) return
    try {
      const res = await fetch(qrDataUrl)
      const blob = await res.blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    } catch {
      // Fallback: copy data URL
      await navigator.clipboard.writeText(qrDataUrl)
    }
  }, [qrDataUrl])

  /** Clear all state */
  const clear = useCallback(() => {
    setContent('')
    setQrDataUrl(null)
    setError(null)
    setDecodedText(null)
    setDecodeError(null)
    setDecodeImage(null)
  }, [])

  return {
    content,
    setContent,
    qrDataUrl,
    options,
    setOptions,
    error,
    generate,
    generateSvg,
    downloadPng,
    downloadSvg,
    copyToClipboard,
    clear,

    // Decode
    decodedText,
    decodeError,
    decodeImage,
    decode,
    canvasRef,
  }
}

/** Build WiFi QR code content string */
export function buildWifiQrContent(ssid: string, password: string, encryption: 'WPA' | 'WEP' | 'nopass' = 'WPA'): string {
  return `WIFI:T:${encryption};S:${ssid};P:${password};;`
}
