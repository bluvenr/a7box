/**
 * QR Code Preview Component
 */

import { Copy, Download, FileDown } from 'lucide-react'

interface QrPreviewProps {
  qrDataUrl: string | null
  error: string | null
  onCopy: () => void
  onDownloadPng: () => void
  onDownloadSvg: () => void
}

export function QrPreview({
  qrDataUrl,
  error,
  onCopy,
  onDownloadPng,
  onDownloadSvg,
}: QrPreviewProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      {/* QR preview area */}
      <div className="flex items-center justify-center rounded-xl border border-border-base bg-bg-elevated p-6">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt="QR Code"
            className="max-h-72 max-w-72 rounded"
          />
        ) : (
          <div className="flex h-48 w-48 flex-col items-center justify-center rounded-lg border-2 border-dashed border-border-subtle">
            <div className="grid grid-cols-3 gap-1 opacity-20">
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className={`h-4 w-4 rounded-sm ${
                    [0, 1, 3, 5, 7, 8].includes(i) ? 'bg-text-muted' : 'bg-transparent'
                  }`}
                />
              ))}
            </div>
            <p className="mt-4 text-xs text-text-disabled">QR Preview</p>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p className="max-w-xs text-center text-sm text-error">{error}</p>
      )}

      {/* Action buttons */}
      {qrDataUrl && (
        <div className="flex gap-2">
          <button
            onClick={onCopy}
            className="flex items-center gap-1.5 rounded-md bg-bg-hover px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-hover/80 hover:text-text-primary"
          >
            <Copy className="h-4 w-4" />
            Copy
          </button>
          <button
            onClick={onDownloadPng}
            className="flex items-center gap-1.5 rounded-md bg-bg-hover px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-hover/80 hover:text-text-primary"
          >
            <Download className="h-4 w-4" />
            PNG
          </button>
          <button
            onClick={onDownloadSvg}
            className="flex items-center gap-1.5 rounded-md bg-bg-hover px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-hover/80 hover:text-text-primary"
          >
            <FileDown className="h-4 w-4" />
            SVG
          </button>
        </div>
      )}
    </div>
  )
}
