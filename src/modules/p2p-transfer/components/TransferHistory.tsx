/**
 * P2P Transfer — Transfer history panel (active + completed)
 */
import { useTranslation } from 'react-i18next'
import {
  RefreshCw, X, Clock, Search, Trash2, Download, RotateCcw, ExternalLink,
} from 'lucide-react'
import { p2pCancelTransfer } from '../../../shared/utils/tauriBridge'
import type { P2PState } from '../hooks/useP2PState'
import type { P2PActions } from '../hooks/useP2PActions'
import { formatSpeed, formatEta } from '../utils'

interface Props {
  s: P2PState
  a: P2PActions
}

export function TransferHistory({ s, a }: Props) {
  const { t } = useTranslation()

  return (
    <>
      {/* Active transfers */}
      {s.activeTransfers.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <RefreshCw size={14} className="text-primary animate-spin" />
            <h2 className="text-sm font-semibold text-text-primary">{t('modules.p2p.ui.activeTransfers')}</h2>
          </div>
          <div className="space-y-2">
            {s.activeTransfers.map(tr => {
              const spd = s.speedMap[tr.id]
              return (
                <div key={tr.id} className="rounded-lg bg-bg-elevated px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${tr.direction === 'send' ? 'bg-blue-500/10 text-blue-400' : 'bg-green-500/10 text-green-400'}`}>
                        {tr.direction === 'send' ? '\u2191' : '\u2193'}
                      </span>
                      <span className="text-sm text-text-primary truncate max-w-[160px]">{tr.filename}</span>
                      <span className="text-[11px] text-text-muted">{tr.peer_code}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {spd && (
                        <span className="text-[10px] text-text-muted">
                          {formatSpeed(spd.speed)} {spd.eta > 0 && `\u00B7 ${formatEta(spd.eta)}`}
                        </span>
                      )}
                      <span className="text-xs font-bold text-primary">{tr.progress.toFixed(0)}%</span>
                      <button onClick={() => p2pCancelTransfer(tr.id)}
                        className="text-text-muted hover:text-red-400 cursor-pointer" title={t('modules.p2p.ui.cancelTransfer', { defaultValue: 'Cancel transfer' })}>
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-bg-base overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${tr.progress}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Transfer History */}
      <div className="rounded-xl border border-border-subtle bg-bg-elevated p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-primary" />
            <h2 className="text-sm font-semibold text-text-primary">{t('modules.p2p.ui.transfers')}</h2>
            <span className="text-[10px] text-text-disabled">{s.transfers.length}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Download directory */}
            <button
              onClick={a.handleChangeDownloadDir}
              className="flex items-center gap-1 text-text-muted hover:text-primary cursor-pointer transition"
              title={`${t('modules.p2p.ui.downloadDir', { defaultValue: 'Download directory' })}: ${s.downloadDir}`}>
              <Download size={12} />
              <span className="text-[11px]">{t('modules.p2p.ui.saveTo', { defaultValue: 'Save to' })}</span>
            </button>
            {s.transfers.length > 0 && (
              <button onClick={a.handleClearHistory} className="text-text-muted hover:text-red-400 cursor-pointer" title={t('modules.p2p.ui.clearHistory')}>
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Search + Filter */}
        {s.transfers.length > 3 && (
          <div className="flex gap-2 mb-2">
            <div className="relative flex-1">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-disabled" />
              <input value={s.historySearch} onChange={(e) => s.setHistorySearch(e.target.value)}
                placeholder={t('modules.p2p.ui.searchHistory')}
                className="w-full rounded border border-border-base bg-bg-base pl-7 pr-2 py-1 text-xs text-text-primary outline-none focus:border-primary" />
            </div>
            <select value={s.historyFilter} onChange={(e) => s.setHistoryFilter(e.target.value as 'all' | 'send' | 'receive')}
              className="rounded border border-border-base bg-bg-base px-2 py-1 text-xs text-text-primary outline-none cursor-pointer">
              <option value="all">{t('modules.p2p.ui.filterAll')}</option>
              <option value="send">{t('modules.p2p.ui.filterSend')}</option>
              <option value="receive">{t('modules.p2p.ui.filterReceive')}</option>
            </select>
          </div>
        )}

        {s.filteredHistory.length === 0 ? (
          <p className="text-center text-xs text-text-disabled py-3">{t('modules.p2p.ui.noTransfers')}</p>
        ) : (
          <div className="max-h-32 overflow-y-auto space-y-1.5">
            {s.filteredHistory.map(tr => (
              <div key={tr.id} className="flex items-center justify-between rounded bg-bg-base px-2.5 py-1.5 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`font-medium shrink-0 ${tr.direction === 'send' ? 'text-blue-400' : 'text-green-400'}`}>
                    {tr.direction === 'send' ? '\u2191' : '\u2193'}
                  </span>
                  <span className="text-text-primary truncate max-w-[120px]">{tr.filename}</span>
                  <span className="text-text-disabled shrink-0">{tr.peer_code}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {(tr.status === 'failed' || tr.status === 'rejected') && tr.direction === 'send' && (
                    <button onClick={() => a.handleRetry(tr.id)} className="text-amber-400 hover:text-amber-300 cursor-pointer" title={t('modules.p2p.ui.retry')}>
                      <RotateCcw size={11} />
                    </button>
                  )}
                  {tr.status === 'complete' && tr.file_path && (
                    <button onClick={() => a.handleOpenFolder(tr.file_path)} className="text-text-muted hover:text-primary cursor-pointer" title={t('modules.p2p.ui.openFolder')}>
                      <ExternalLink size={11} />
                    </button>
                  )}
                  <span className={`font-medium ${
                    tr.status === 'complete' ? 'text-green-400' :
                    tr.status === 'failed' || tr.status === 'rejected' ? 'text-red-400' :
                    tr.status === 'cancelled' ? 'text-orange-400' : 'text-text-muted'
                  }`}>
                    {tr.status === 'complete' ? '\u2713' :
                     tr.status === 'cancelled' ? t('modules.p2p.ui.cancelled', { defaultValue: 'Cancelled' }) : tr.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
