/**
 * Clipboard Manager — Export / Import dialog (JSON / CSV).
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Upload, X } from 'lucide-react'
import { useAlert } from '../../../components/Dialog'
import * as bridge from '../bridge'
import { useClipboardStore } from '../clipboardStore'

export function ExportImportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const alert = useAlert()
  const refresh = useClipboardStore((s) => s.refresh)
  const [format, setFormat] = useState<'json' | 'csv'>('json')
  const [busy, setBusy] = useState(false)

  const handleExport = async () => {
    setBusy(true)
    try {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const path = await save({
        defaultPath: `clipboard-export.${format}`,
        filters:
          format === 'json'
            ? [{ name: 'JSON', extensions: ['json'] }]
            : [{ name: 'CSV', extensions: ['csv'] }],
      })
      if (!path) return
      const count = await bridge.exportClips(format, path)
      await alert({
        title: t('modules.clipboardManager.exportDone', { defaultValue: 'Export complete' }),
        message: t('modules.clipboardManager.exportCount', {
          defaultValue: '{{count}} entries exported',
          count,
        }),
      })
      onClose()
    } catch {
      await alert({
        title: t('common.error', { defaultValue: 'Error' }),
        message: t('modules.clipboardManager.ioFailed', {
          defaultValue: 'Operation failed, please try again',
        }),
      })
    } finally {
      setBusy(false)
    }
  }

  const handleImport = async () => {
    setBusy(true)
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        multiple: false,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (!selected || typeof selected !== 'string') return
      const count = await bridge.importClips(selected)
      await refresh()
      await alert({
        title: t('modules.clipboardManager.importDone', { defaultValue: 'Import complete' }),
        message: t('modules.clipboardManager.importCount', {
          defaultValue: '{{count}} entries imported',
          count,
        }),
      })
      onClose()
    } catch {
      await alert({
        title: t('common.error', { defaultValue: 'Error' }),
        message: t('modules.clipboardManager.ioFailed', {
          defaultValue: 'Operation failed, please try again',
        }),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{ animation: 'dialogFadeIn 0.15s ease-out' }}
    >
      <div
        className="relative w-full max-w-sm mx-4 rounded-xl border border-border-subtle bg-bg-elevated p-5 shadow-2xl"
        style={{ animation: 'dialogScaleIn 0.15s ease-out' }}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 p-1 text-text-muted hover:text-text-primary cursor-pointer"
        >
          <X size={14} />
        </button>
        <h3 className="text-sm font-semibold text-text-primary">
          {t('modules.clipboardManager.exportImport', { defaultValue: 'Export / Import' })}
        </h3>

        {/* Export */}
        <div className="mt-4 rounded-lg border border-border-base p-3">
          <p className="text-xs font-medium text-text-secondary">
            {t('modules.clipboardManager.exportTitle', { defaultValue: 'Export history' })}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as 'json' | 'csv')}
              className="rounded-md border border-border-base bg-bg-overlay px-2 py-1.5 text-xs text-text-primary outline-none focus:border-border-focus"
            >
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
            </select>
            <button
              onClick={() => void handleExport()}
              disabled={busy}
              className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary-hover disabled:opacity-40 cursor-pointer transition-colors"
            >
              <Download size={12} />
              {t('modules.clipboardManager.exportBtn', { defaultValue: 'Export' })}
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-text-disabled">
            {t('modules.clipboardManager.exportHint', {
              defaultValue: 'Secret entries are decrypted in the export file.',
            })}
          </p>
        </div>

        {/* Import */}
        <div className="mt-3 rounded-lg border border-border-base p-3">
          <p className="text-xs font-medium text-text-secondary">
            {t('modules.clipboardManager.importTitle', { defaultValue: 'Import from JSON' })}
          </p>
          <button
            onClick={() => void handleImport()}
            disabled={busy}
            className="mt-2 flex items-center gap-1 rounded-md border border-border-base px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover disabled:opacity-40 cursor-pointer transition-colors"
          >
            <Upload size={12} />
            {t('modules.clipboardManager.importBtn', { defaultValue: 'Choose file…' })}
          </button>
        </div>
      </div>
    </div>
  )
}
