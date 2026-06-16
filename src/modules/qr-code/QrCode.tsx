/**
 * QR Code Module Main Component
 */

import { useState } from 'react'
import { QrCode as QrCodeIcon, ScanLine } from 'lucide-react'
import { useQrCode } from './hooks/useQrCode'
import { GeneratePanel } from './components/GeneratePanel'
import { QrPreview } from './components/QrPreview'
import { DecodePanel } from './components/DecodePanel'

type Tab = 'generate' | 'decode'

export default function QrCode() {
  const [activeTab, setActiveTab] = useState<Tab>('generate')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const {
    content,
    setContent,
    qrDataUrl,
    options,
    setOptions,
    error,
    generate,
    downloadPng,
    downloadSvg,
    copyToClipboard,
    clear,

    decodedText,
    decodeError,
    decodeImage,
    decode,
  } = useQrCode()

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2000)
  }

  const handleGenerate = async () => {
    const ok = await generate()
    if (ok) showToast('QR code generated')
  }

  const handleCopy = async () => {
    await copyToClipboard()
    showToast('Copied to clipboard')
  }

  const handleClear = () => {
    clear()
    showToast('Cleared')
  }

  return (
    <div className="relative flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-2 border-b border-border-subtle bg-bg-elevated px-4 py-2">
        <button
          onClick={() => setActiveTab('generate')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === 'generate'
              ? 'bg-primary/10 text-primary'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          <QrCodeIcon className="h-4 w-4" />
          Generate
        </button>
        <button
          onClick={() => setActiveTab('decode')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === 'decode'
              ? 'bg-primary/10 text-primary'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          <ScanLine className="h-4 w-4" />
          Decode
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {activeTab === 'generate' ? (
          <>
            {/* Left: Config panel */}
            <div className="w-80 overflow-y-auto border-r border-border-subtle p-4">
              <GeneratePanel
                content={content}
                onContentChange={setContent}
                options={options}
                onOptionsChange={setOptions}
                onGenerate={handleGenerate}
              />
            </div>

            {/* Right: Preview */}
            <div className="flex-1 overflow-y-auto p-6">
              <QrPreview
                qrDataUrl={qrDataUrl}
                error={error}
                onCopy={handleCopy}
                onDownloadPng={downloadPng}
                onDownloadSvg={downloadSvg}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-6">
            <DecodePanel
              decodedText={decodedText}
              decodeError={decodeError}
              decodeImage={decodeImage}
              onDecode={decode}
              onClear={handleClear}
            />
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg px-4 py-2 text-sm font-medium shadow-lg transition-all ${
            toast.type === 'success' ? 'bg-success text-white' : 'bg-error text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
