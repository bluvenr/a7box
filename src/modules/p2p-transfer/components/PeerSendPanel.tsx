/**
 * P2P Transfer — Peer discovery + send file panel
 */
import { useTranslation } from 'react-i18next'
import {
  Users, RefreshCw, X, Radar, AlertCircle, Send, FolderOpen,
  Star,
} from 'lucide-react'
import { p2pGetPeers } from '../../../shared/utils/tauriBridge'
import type { P2PState } from '../hooks/useP2PState'
import type { P2PActions } from '../hooks/useP2PActions'
import { SCAN_TIMEOUT } from '../utils'

interface Props {
  s: P2PState
  a: P2PActions
}

export function PeerSendPanel({ s, a }: Props) {
  const { t } = useTranslation()

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-elevated p-4">
      {/* Peer list header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={15} className="text-primary" />
          <h2 className="text-sm font-semibold text-text-primary">{t('modules.p2p.ui.peers')}</h2>
          {s.peers.length > 0 && (
            <>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{s.peers.length}</span>
              <button onClick={() => s.withRefresh('peers', async () => s.setPeers(await p2pGetPeers()))} className="text-text-muted hover:text-primary cursor-pointer ml-1" title={t('common.refresh')}>
                <RefreshCw size={13} className={s.refreshing.peers ? 'animate-spin' : ''} />
              </button>
            </>
          )}
        </div>
        {!s.showManual && (
          <button onClick={() => s.setShowManual(true)}
            className="text-[11px] text-text-muted hover:text-primary cursor-pointer">{t('modules.p2p.ui.manualConnect')}</button>
        )}
      </div>

      {/* Inline manual connect */}
      {s.showManual && (
        <div className="flex gap-2 mb-3">
          <input value={s.manualAddr} onChange={(e) => s.setManualAddr(e.target.value)}
            placeholder={t('modules.p2p.ui.manualConnectPlaceholder')}
            className="flex-1 rounded-lg border border-border-base bg-bg-base px-3 py-2 text-xs text-text-primary outline-none focus:border-primary"
            onKeyDown={(e) => e.key === 'Enter' && s.manualAddr.trim() && a.handleManualConnect()} />
          <button onClick={a.handleManualConnect} disabled={!s.manualAddr.trim() || !/^.+:\d+$/.test(s.manualAddr.trim())}
            className="rounded-lg bg-primary px-3 py-2 text-xs text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">{t('modules.p2p.ui.connect')}</button>
          <button onClick={() => { s.setShowManual(false); s.setManualAddr('') }}
            className="rounded-lg border border-border-base px-2 py-2 text-text-muted hover:text-text-primary cursor-pointer">
            <X size={12} />
          </button>
        </div>
      )}

      {s.running && s.peers.length === 0 && !s.scanTimedOut ? (
        /* Scanning animation */
        <div className="flex flex-col items-center py-6">
          <div className="relative h-16 w-16 mb-3">
            <div className="absolute inset-0 flex items-center justify-center">
              <Radar size={24} className="text-primary" />
            </div>
            <div className="absolute inset-0 rounded-full border-2 border-primary/30 p2p-scan-ring" />
            <div className="absolute inset-0 rounded-full border-2 border-primary/30 p2p-scan-ring" />
            <div className="absolute inset-0 rounded-full border-2 border-primary/30 p2p-scan-ring" />
          </div>
          <p className="text-xs text-text-muted">{t('modules.p2p.ui.scanning')}</p>
          {s.scanElapsed > 2 && (
            <p className="text-[11px] text-text-disabled mt-1.5 tabular-nums">{s.scanElapsed}s / {SCAN_TIMEOUT / 1000}s</p>
          )}
        </div>
      ) : s.running && s.peers.length === 0 && s.scanTimedOut ? (
        /* Scan timeout with tips */
        <div className="text-center py-4 space-y-3">
          <AlertCircle size={20} className="mx-auto text-amber-400" />
          <p className="text-xs text-amber-400">{t('modules.p2p.ui.scanTimeout')}</p>
          <p className="text-[11px] text-text-secondary leading-relaxed">{t('modules.p2p.ui.scanTips')}</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => { s.setScanTimedOut(false); s.setScanResetKey(k => k + 1) }}
              className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer">
              <RefreshCw size={11} />{t('modules.p2p.ui.rescan')}
            </button>
            <button onClick={() => s.setShowManual(!s.showManual)}
              className="text-xs text-primary hover:underline cursor-pointer">{t('modules.p2p.ui.manualConnect')}</button>
          </div>
        </div>
      ) : s.peers.length === 0 ? (
        <p className="text-center text-xs text-text-disabled py-4">{t('modules.p2p.ui.noPeers')}</p>
      ) : (
        <div className="space-y-1.5 max-h-40 overflow-y-auto mb-4">
          {s.sortedPeers.map(peer => (
            <div key={peer.code}
              onClick={() => s.setTargetPeer(peer.code)}
              className={`flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer transition ${
                s.targetPeer === peer.code
                  ? 'bg-primary/10 border border-primary/30'
                  : 'bg-bg-base border border-transparent hover:border-border-subtle'
              }`}>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-400" />
                <span className="font-mono text-xs font-bold text-primary">{peer.code}</span>
                <span className="text-sm text-text-secondary">{peer.alias}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-text-muted">{peer.ip}</span>
                <button onClick={(e) => { e.stopPropagation(); a.toggleFavorite(peer.code) }}
                  title={s.favorites.includes(peer.code) ? t('modules.p2p.ui.unfavorite') : t('modules.p2p.ui.favorite')}
                  className={`cursor-pointer ${s.favorites.includes(peer.code) ? 'text-yellow-400' : 'text-text-disabled hover:text-yellow-400'}`}>
                  <Star size={12} fill={s.favorites.includes(peer.code) ? 'currentColor' : 'none'} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-border-subtle my-3" />

      {s.peers.length > 0 ? (
        <>
          {/* Send file area */}
          <div className="flex items-center gap-2 mb-2">
            <Send size={14} className="text-primary" />
            <h2 className="text-sm font-semibold text-text-primary">{t('modules.p2p.ui.sendFile')}</h2>
            {s.batchInProgress > 0 && (
              <span className="text-[10px] text-primary font-medium">
                {t('modules.p2p.ui.batchProgress', { done: s.batchDone, total: s.batchTotal })}
              </span>
            )}
          </div>

          {/* Selected files */}
          {s.filePaths.length > 0 && (
            <div className="mb-2 max-h-20 overflow-y-auto rounded-lg border border-border-subtle bg-bg-base p-2 space-y-1">
              {s.filePaths.map((fp, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary truncate max-w-[280px]">{fp.split(/[/\\]/).pop() || fp}</span>
                  <button onClick={() => s.setFilePaths(prev => prev.filter((_, j) => j !== i))} className="text-text-muted hover:text-red-400 cursor-pointer ml-2 shrink-0"><X size={11} /></button>
                </div>
              ))}
              {s.filePaths.length > 1 && (
                <button onClick={() => s.setFilePaths([])} className="text-[10px] text-text-muted hover:text-red-400 cursor-pointer">{t('common.clear')}</button>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <input
              value={s.filePaths.length > 0 ? `${s.filePaths.length} ${t('modules.p2p.ui.filesSelected')}` : ''}
              readOnly placeholder={t('modules.p2p.ui.selectFile')}
              className="flex-1 rounded-lg border border-border-base bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-primary transition cursor-pointer"
              onClick={a.handleBrowseFile}
            />
            <button onClick={a.handleBrowseFile} className="rounded-lg border border-border-base px-3 py-2 text-text-muted hover:text-primary hover:border-primary cursor-pointer transition">
              <FolderOpen size={14} />
            </button>
          </div>
          <div className="flex gap-2 mt-2">
            <select value={s.targetPeer} onChange={(e) => s.setTargetPeer(e.target.value)}
              className="flex-1 rounded-lg border border-border-base bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-primary transition cursor-pointer">
              <option value="">{t('modules.p2p.ui.selectPeer')}</option>
              {s.sortedPeers.map(p => <option key={p.code} value={p.code}>{p.code} — {p.alias}</option>)}
            </select>
            <button onClick={a.handleSendFile} disabled={s.filePaths.length === 0 || !s.targetPeer || s.sending}
              title={(s.filePaths.length === 0 || !s.targetPeer) ? t('modules.p2p.ui.sendNotReady') : undefined}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
              {s.sending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              {t('modules.p2p.ui.send')}
            </button>
          </div>
        </>
      ) : (
        <p className="text-center text-[11px] text-text-disabled py-3">{t('modules.p2p.ui.noPeersHideSend')}</p>
      )}
    </div>
  )
}
