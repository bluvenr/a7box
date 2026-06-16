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
      const source = text ?? content
      if (!source.trim()) {
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
      const source = text ?? content
      if (!source.trim()) return null

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

      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        setDecodeError('Canvas not supported')
        return null
      }

      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      // Decode
      const code = jsQR(imageData.data, imageData.width, imageData.height)
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
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = `qrcode-${Date.now()}.png`
    a.click()
  }, [qrDataUrl])

  /** Download QR as SVG */
  const downloadSvg = useCallback(async () => {
    const svg = await generateSvg()
    if (!svg) return
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `qrcode-${Date.now()}.svg`
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
