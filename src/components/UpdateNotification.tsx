/**
 * UpdateNotification - Bottom-left popup for version update notification
 * Fixed to window bottom-left, does not interfere with page interactions.
 * Shows changelog (scrollable), action buttons, and download progress.
 */

import { useTranslation } from 'react-i18next'
import { useUpdater } from '../core/updater'
import {
  Download, RefreshCw, Loader2, X,
  CheckCircle, AlertCircle, RotateCcw
} from 'lucide-react'

export function UpdateNotification() {
  const { t } = useTranslation()
  const {
    available, downloading, progress, info, error,
    notificationVisible,
    downloadAndInstall, dismissVersion, remindLater, hideNotification,
  } = useUpdater()

  if (!notificationVisible) return null

  // Download finished, waiting for restart
  const readyToInstall = progress >= 100 && !downloading

  return (
    <div
      className="fixed bottom-6 left-6 z-50 w-80 rounded-xl border border-border-base bg-bg-elevated shadow-2xl shadow-black/30"
      style={{ animation: 'slideUp 0.25s ease-out' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15">
            <RefreshCw className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-sm font-semibold text-text-primary">
            {t('updater.newVersion', { version: info?.version || '' })}
          </span>
        </div>
        <button
          onClick={hideNotification}
          className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Changelog body - scrollable */}
      {info?.body && !downloading && !readyToInstall && (
        <div className="relative px-4 py-3">
          <div className="max-h-[180px] overflow-x-hidden overflow-y-auto text-xs leading-relaxed text-text-secondary whitespace-pre-line break-words">
            {info.body}
          </div>
          {/* Fade gradient at bottom when content is scrollable */}
          <div className="pointer-events-none absolute right-4 bottom-3 left-4 h-6 bg-gradient-to-t from-bg-elevated to-transparent" />
        </div>
      )}

      {/* Download progress */}
      {downloading && (
        <div className="space-y-2 px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span>{t('updater.downloadProgress', { progress })}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-hover">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Ready to install */}
      {readyToInstall && (
        <div className="flex items-center gap-2 px-4 py-3 text-xs text-green-500">
          <CheckCircle className="h-3.5 w-3.5" />
          {t('updater.readyToInstall')}
        </div>
      )}

      {/* Error */}
      {error && !downloading && (
        <div className="flex items-center gap-2 px-4 py-3 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 border-t border-border-subtle px-4 py-3">
        {readyToInstall ? (
          <button
            onClick={async () => {
              const { relaunch } = await import('@tauri-apps/plugin-process')
              await relaunch()
            }}
            className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-green-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-green-600"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t('updater.restartNow')}
          </button>
        ) : downloading ? (
          <span className="flex-1 text-center text-xs text-text-muted">
            {t('updater.downloadProgress', { progress })}
          </span>
        ) : (
          <>
            <button
              onClick={downloadAndInstall}
              disabled={!available}
              className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {t('updater.updateNow')}
            </button>
            <button
              onClick={remindLater}
              className="cursor-pointer rounded-md px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-bg-hover"
            >
              {t('updater.later')}
            </button>
            <button
              onClick={dismissVersion}
              className="cursor-pointer rounded-md px-3 py-2 text-xs text-text-muted transition-colors hover:bg-bg-hover"
            >
              {t('updater.skip')}
            </button>
          </>
        )}
      </div>

      {/* Inline keyframes for slide-up animation */}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
