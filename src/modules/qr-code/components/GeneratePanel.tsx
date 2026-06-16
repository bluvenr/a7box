/**
 * QR Code Generate Panel
 * Input configuration for QR code generation
 */

import { Type, Wifi } from 'lucide-react'
import { useState } from 'react'
import type { QrOptions, QrErrorLevel } from '../hooks/useQrCode'
import { buildWifiQrContent } from '../hooks/useQrCode'

interface GeneratePanelProps {
  content: string
  onContentChange: (value: string) => void
  options: QrOptions
  onOptionsChange: (options: QrOptions) => void
  onGenerate: () => void
}

type InputMode = 'text' | 'url' | 'wifi'

export function GeneratePanel({
  content,
  onContentChange,
  options,
  onOptionsChange,
  onGenerate,
}: GeneratePanelProps) {
  const [mode, setMode] = useState<InputMode>('text')

  // WiFi state
  const [ssid, setSsid] = useState('')
  const [password, setPassword] = useState('')
  const [encryption, setEncryption] = useState<'WPA' | 'WEP' | 'nopass'>('WPA')

  const handleWifiChange = () => {
    if (ssid) {
      const wifiContent = buildWifiQrContent(ssid, password, encryption)
      onContentChange(wifiContent)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Mode tabs */}
      <div className="flex gap-1 rounded-lg bg-bg-base p-1">
        <ModeTab icon={Type} label="Text" active={mode === 'text'} onClick={() => setMode('text')} />
        <ModeTab icon={Wifi} label="WiFi" active={mode === 'wifi'} onClick={() => setMode('wifi')} />
      </div>

      {/* Input area */}
      {mode === 'wifi' ? (
        <div className="flex flex-col gap-3">
          <InputField
            label="SSID (Network Name)"
            value={ssid}
            onChange={(v) => { setSsid(v); }}
            placeholder="Enter WiFi name"
          />
          <InputField
            label="Password"
            value={password}
            onChange={(v) => { setPassword(v); }}
            placeholder="Enter password"
            type="password"
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Encryption
            </label>
            <select
              value={encryption}
              onChange={(e) => setEncryption(e.target.value as 'WPA' | 'WEP' | 'nopass')}
              className="w-full rounded-md border border-border-base bg-bg-base px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none"
            >
              <option value="WPA">WPA/WPA2</option>
              <option value="WEP">WEP</option>
              <option value="nopass">None</option>
            </select>
          </div>
          <button
            onClick={handleWifiChange}
            className="rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
          >
            Apply WiFi Settings
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="text-xs font-medium text-text-secondary">
            {mode === 'url' ? 'URL' : 'Content'}
          </label>
          <textarea
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            placeholder={mode === 'url' ? 'https://example.com' : 'Enter text or URL...'}
            rows={4}
            className="w-full resize-none rounded-md border border-border-base bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:border-border-focus focus:outline-none"
          />
        </div>
      )}

      {/* Options */}
      <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
        <span className="text-xs font-medium text-text-muted">Options</span>

        {/* Size */}
        <div className="flex items-center justify-between">
          <label className="text-xs text-text-secondary">Size</label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="150"
              max="600"
              step="50"
              value={options.size}
              onChange={(e) => onOptionsChange({ ...options, size: parseInt(e.target.value) })}
              className="w-24"
            />
            <span className="w-12 text-right text-xs text-text-muted">{options.size}px</span>
          </div>
        </div>

        {/* Error correction */}
        <div className="flex items-center justify-between">
          <label className="text-xs text-text-secondary">Error Correction</label>
          <select
            value={options.errorCorrection}
            onChange={(e) => onOptionsChange({ ...options, errorCorrection: e.target.value as QrErrorLevel })}
            className="rounded border border-border-base bg-bg-base px-2 py-1 text-xs text-text-primary focus:border-border-focus focus:outline-none"
          >
            <option value="L">L (7%)</option>
            <option value="M">M (15%)</option>
            <option value="Q">Q (25%)</option>
            <option value="H">H (30%)</option>
          </select>
        </div>

        {/* Colors */}
        <div className="flex items-center justify-between">
          <label className="text-xs text-text-secondary">Foreground</label>
          <input
            type="color"
            value={options.foreground}
            onChange={(e) => onOptionsChange({ ...options, foreground: e.target.value })}
            className="h-7 w-10 cursor-pointer rounded border border-border-base bg-transparent"
          />
        </div>
        <div className="flex items-center justify-between">
          <label className="text-xs text-text-secondary">Background</label>
          <input
            type="color"
            value={options.background}
            onChange={(e) => onOptionsChange({ ...options, background: e.target.value })}
            className="h-7 w-10 cursor-pointer rounded border border-border-base bg-transparent"
          />
        </div>
      </div>

      {/* Generate button */}
      <button
        onClick={onGenerate}
        disabled={!content.trim()}
        className="mt-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        Generate QR Code
      </button>
    </div>
  )
}

// Sub-components
function ModeTab({ icon: Icon, label, active, onClick }: { icon: typeof Type; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? 'bg-bg-hover text-text-primary' : 'text-text-muted hover:text-text-secondary'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-text-secondary">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-border-base bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:border-border-focus focus:outline-none"
      />
    </div>
  )
}
