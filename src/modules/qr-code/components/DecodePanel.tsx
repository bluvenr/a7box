/**
 * QR Code Decode Panel
 * Upload image to decode QR code
 */

import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, X, Copy } from 'lucide-react'

interface DecodePanelProps {
  decodedText: string | null
  decodeError: string | null
  decodeImage: string | null
  onDecode: (file: File) => void
  onClear: () => void
}

export function DecodePanel({
  decodedText,
  decodeError,
  decodeImage,
  onDecode,
  onClear,
}: DecodePanelProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file && file.type.startsWith('image/')) {
        onDecode(file)
      }
    },
    [onDecode]
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        onDecode(file)
      }
    },
    [onDecode]
  )

  const handleCopyResult = async () => {
    if (decodedText) {
      await navigator.clipboard.writeText(decodedText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Upload area */}
      <div
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${
          isDragging
            ? 'border-primary bg-primary/5'
            : decodeImage
            ? 'border-border-base'
            : 'border-border-subtle hover:border-border-base'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        {decodeImage ? (
          <div className="relative">
            <img
              src={decodeImage}
              alt="Uploaded"
              className="max-h-48 max-w-48 rounded-lg object-contain"
            />
            <button
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="absolute -right-2 -top-2 rounded-full bg-bg-elevated p-1 text-text-muted hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <Upload className="mb-3 h-10 w-10 text-text-disabled" />
            <p className="text-sm text-text-secondary">
              {t('modules.qrCode.ui.decodeDropText')}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              {t('modules.qrCode.ui.decodeSupportedFormats')}
            </p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Decode result */}
      {decodedText !== null && (
        <div className="rounded-lg border border-success/30 bg-success/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-success">{t('modules.qrCode.ui.decodeSuccess')}</span>
            <button
              onClick={handleCopyResult}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <Copy className="h-3 w-3" />
              {copied ? t('common.copied') : t('common.copy')}
            </button>
          </div>
          <p className="break-all font-mono text-sm text-text-primary leading-relaxed">
            {decodedText}
          </p>
        </div>
      )}

      {/* Decode error */}
      {decodeError && (
        <div className="rounded-lg border border-error/30 bg-error/5 p-4">
          <p className="text-sm text-error">{decodeError}</p>
        </div>
      )}
    </div>
  )
}
