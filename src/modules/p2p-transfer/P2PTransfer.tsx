/**
 * A7Box P2P LAN Transfer Module
 * Peer-to-peer file transfer over local network
 */
import { Send, FolderOpen, RefreshCw, Play, Square, FileText, Folder,
  Globe, AlertCircle, ChevronDown, ExternalLink, QrCode, Wifi, Download,
} from 'lucide-react'
import {
  p2pGetSharedInfo,
} from '../../shared/utils/tauriBridge'

import { scanningStyle, formatSize } from './utils'
import { useP2PState } from './hooks/useP2PState'
import { useP2PActions } from './hooks/useP2PActions'
import { IdentityBar } from './components/IdentityBar'
import { OnboardingGuide } from './components/OnboardingGuide'
import { PeerSendPanel } from './components/PeerSendPanel'
import { TransferHistory } from './components/TransferHistory'

export default function P2PTransfer() {
  const s = useP2PState()
  const a = useP2PActions(s)

  return (
    <div className="h-full overflow-y-auto p-6" onDragOver={a.handleDragOver} onDragLeave={a.handleDragLeave} onDrop={a.handleDrop}>
      <style>{scanningStyle}</style>

      {/* Drag overlay */}
      {s.isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-xl pointer-events-none">
          <div className="rounded-xl bg-bg-elevated px-8 py-6 shadow-lg text-center">
            <Send size={32} className="text-primary mx-auto mb-2" />
            <p className="text-sm font-medium text-text-primary">{s.t('modules.p2p.ui.dragDropHint')}</p>
          </div>
        </div>
      )}

      {/* ---- Top Bar: Identity + Status ---- */}
      <IdentityBar s={s} a={a} />

      {/* ---- Onboarding Guide ---- */}
      <OnboardingGuide s={s} a={a} />

      {/* ---- Main Content ---- */}
      {s.running ? (
      <>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Primary (3/5) */}
        <div className="lg:col-span-3 space-y-5">
          <PeerSendPanel s={s} a={a} />
          <TransferHistory s={s} a={a} />
        </div>

        {/* Right: Secondary (2/5) */}
        <div className="lg:col-span-2 space-y-5">

          {/* Shared Directory — config for web share & remote browsing */}
          <div ref={s.sharedDirRef} className={`rounded-xl border bg-bg-elevated p-4 transition-all duration-500 ${s.highlightSharedDir ? 'border-yellow-400 ring-2 ring-yellow-400/30' : 'border-border-subtle'}`}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <FolderOpen size={15} className="text-primary" />
                <h2 className="text-sm font-semibold text-text-primary">{s.t('modules.p2p.ui.sharedDir')}</h2>
                {s.sharedEnabled && <span className="h-2 w-2 rounded-full bg-green-400" />}
              </div>
              {s.sharedEnabled && (
                <button onClick={() => s.withRefresh('sharedDir', async () => { const info = await p2pGetSharedInfo(); if (info) { s.setSharedFiles(info.files); s.setAccessLog(info.accessLog) } })} className="text-text-muted hover:text-primary cursor-pointer" title={s.t('common.refresh')}>
                  <RefreshCw size={13} className={s.refreshing.sharedDir ? 'animate-spin' : ''} />
                </button>
              )}
            </div>
            <p className="text-xs text-text-muted mb-3">{s.t('modules.p2p.ui.sharedDirDesc')}</p>

            <button onClick={() => a.handleBrowseDir(s.setSharedDir)} disabled={s.sharedEnabled || !!s.httpServer}
              title={(s.sharedEnabled || !!s.httpServer) ? s.t('modules.p2p.ui.dirLocked') : s.t('modules.p2p.ui.clickToSelect')}
              className="w-full flex items-center gap-2 rounded-lg border border-border-base bg-bg-base px-3 py-2 text-xs text-left hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition mb-2">
              <FolderOpen size={13} className="text-text-muted shrink-0" />
              <span className={s.sharedDir ? 'text-text-primary truncate' : 'text-text-disabled'}>
                {s.sharedDir || s.t('modules.p2p.ui.clickToSelect')}
              </span>
            </button>

            <div className="flex gap-2">
              {!s.sharedEnabled ? (
                <button onClick={() => a.handleToggleShared(true)}
                  className="flex-1 rounded-lg bg-green-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 cursor-pointer transition">
                  <Play size={11} className="inline mr-1" />{s.t('modules.p2p.ui.enable')}
                </button>
              ) : (
                <button onClick={() => a.handleToggleShared(false)}
                  className="flex-1 rounded-lg bg-red-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 cursor-pointer transition">
                  <Square size={11} className="inline mr-1" />{s.t('modules.p2p.ui.disable')}
                </button>
              )}
            </div>

            {s.sharedEnabled && s.sharedFiles.length > 0 && (
              <div className="mt-3 max-h-24 overflow-y-auto space-y-1">
                {s.sharedFiles.map(f => (
                  <div key={f.name} className="flex items-center gap-2 rounded px-2 py-1 text-xs">
                    {f.is_dir ? <Folder size={12} className="text-yellow-500" /> : <FileText size={12} className="text-text-muted" />}
                    <span className="text-text-primary">{f.name}</span>
                    <span className="text-text-disabled">{formatSize(f.size)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Web Share (HTTP Server) */}
          <div className="rounded-xl border border-border-subtle bg-bg-elevated p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Globe size={15} className="text-primary" />
                <h2 className="text-sm font-semibold text-text-primary">{s.t('modules.p2p.ui.webShare')}</h2>
                {s.httpServer && <span className="h-2 w-2 rounded-full bg-green-400" />}
              </div>
              {s.httpServer && (
                <button onClick={() => s.setShowQr(!s.showQr)}
                  className="text-text-muted hover:text-primary cursor-pointer"
                  title={s.showQr ? s.t('modules.p2p.ui.hideQr', { defaultValue: 'Hide QR' }) : s.t('modules.p2p.ui.showQr', { defaultValue: 'Show QR' })}>
                  <QrCode size={13} />
                </button>
              )}
            </div>

            {!s.sharedEnabled ? (
              <div
                onClick={() => {
                  s.sharedDirRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  s.setHighlightSharedDir(true)
                  setTimeout(() => s.setHighlightSharedDir(false), 2000)
                }}
                className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 cursor-pointer hover:bg-yellow-500/15 transition">
                <AlertCircle size={14} className="text-yellow-500 shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-600 dark:text-yellow-400">
                  {s.t('modules.p2p.ui.webShareNeedDir')}
                  <span className="ml-1 underline">{s.t('modules.p2p.ui.goToSetup', { defaultValue: 'Click to set up' })}</span>
                </p>
              </div>
            ) : (
              <>
                <p className="text-xs text-text-muted mb-3">{s.t('modules.p2p.ui.webShareDesc')}</p>

                {/* Upload toggle */}
                <div className="flex items-center justify-between mb-3 p-2 rounded-lg bg-bg-base" title={s.httpServer ? s.t('modules.p2p.ui.toggleDisabledHint') : undefined}>
                  <div>
                    <span className="text-xs text-text-primary">{s.t('modules.p2p.ui.allowUpload')}</span>
                    <p className="text-[10px] text-text-muted">{s.t('modules.p2p.ui.allowUploadDesc')}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={s.allowUpload} onChange={(e) => s.setAllowUpload(e.target.checked)}
                      disabled={!!s.httpServer}
                      className="sr-only peer" />
                    <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary peer-disabled:opacity-50"></div>
                  </label>
                </div>

                {!s.httpServer ? (
                  <button onClick={a.handleStartHttpServer}
                    className="w-full rounded-lg bg-blue-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer transition">
                    <ExternalLink size={11} className="inline mr-1" />{s.t('modules.p2p.ui.startWebShare')}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <button onClick={a.handleStopHttpServer}
                      className="w-full rounded-lg bg-red-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 cursor-pointer transition">
                      <Square size={11} className="inline mr-1" />{s.t('modules.p2p.ui.stopWebShare')}
                    </button>

                    <div className="rounded-xl border-2 border-dashed border-border-base p-4 space-y-3">
                      <div className="flex items-center gap-2 text-text-secondary">
                        <Wifi size={12} className="text-primary shrink-0" />
                        <p className="text-[11px]">{s.t('modules.p2p.ui.lanOnlyHint')}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <input value={s.httpUrl} readOnly
                          className="flex-1 rounded-lg border border-border-base bg-bg-base px-3 py-2 text-xs text-text-primary outline-none"
                        />
                        <button onClick={a.handleCopyUrl}
                          className="rounded-lg border border-border-base px-3 py-2 text-xs text-text-muted hover:text-primary hover:border-primary cursor-pointer transition">
                          {s.t('common.copy')}
                        </button>
                      </div>

                      {s.showQr && s.qrDataUrl && (
                        <div className="flex flex-col items-center p-3 bg-white rounded-lg">
                          <img src={s.qrDataUrl} alt="QR Code" className="w-36 h-36" />
                          <p className="mt-2 text-[11px] text-text-secondary">{s.t('modules.p2p.ui.scanToAccess')}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Advanced: toggleable (full width, low frequency) */}
      <div className="mt-6 rounded-xl border border-border-subtle bg-bg-elevated">
        <button onClick={() => s.setShowAdvanced(!s.showAdvanced)}
          className="w-full flex items-center justify-between px-4 py-3 cursor-pointer">
          <div className="flex items-center gap-2">
            <ChevronDown size={14} className={`text-text-muted transition ${s.showAdvanced ? 'rotate-180' : ''}`} />
            <span className="text-xs font-medium text-text-muted">
              {s.t('modules.p2p.ui.browseRemote')} / {s.t('modules.p2p.ui.accessLog')}
            </span>
          </div>
        </button>

        {s.showAdvanced && (
          <div className="px-4 pb-4 space-y-4">
            {/* Browse Remote */}
            <div>
              <div className="flex gap-2 mb-2">
                <select value={s.remoteDirPeer} onChange={(e) => { s.setRemoteDirPeer(e.target.value); s.setRemoteFiles([]) }}
                  className="flex-1 rounded-lg border border-border-base bg-bg-base px-3 py-2 text-xs text-text-primary outline-none focus:border-primary transition cursor-pointer">
                  <option value="">{s.t('modules.p2p.ui.selectPeer')}</option>
                  {s.sortedPeers.map(p => <option key={p.code} value={p.code}>{p.code} — {p.alias}</option>)}
                </select>
                <button onClick={a.handleRequestDir} disabled={!s.remoteDirPeer}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-700 disabled:opacity-40 cursor-pointer transition">
                  <FolderOpen size={12} className="inline mr-1" />{s.t('modules.p2p.ui.browse')}
                </button>
              </div>
              {s.remoteFiles.length > 0 && (
                <div className="max-h-24 overflow-y-auto space-y-1">
                  {s.remoteFiles.map(f => (
                    <div key={f.name} className="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-bg-base">
                      <div className="flex items-center gap-1.5">
                        {f.is_dir ? <Folder size={12} className="text-yellow-500" /> : <FileText size={12} className="text-text-muted" />}
                        <span className="text-text-primary">{f.name}</span>
                        <span className="text-text-disabled">{formatSize(f.size)}</span>
                      </div>
                      {!f.is_dir && <button onClick={() => a.handleDownloadFile(f.name)} className="text-text-muted hover:text-primary cursor-pointer"><Download size={12} /></button>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Access Log */}
            <div>
              <h3 className="text-xs font-medium text-text-muted mb-2">{s.t('modules.p2p.ui.accessLog')}</h3>
              {s.accessLog.length === 0 ? (
                <p className="text-center text-[11px] text-text-disabled py-2">{s.t('modules.p2p.ui.noLogs')}</p>
              ) : (
                <div className="max-h-28 overflow-y-auto space-y-1">
                  {s.accessLog.slice(0, 20).map((log, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px]">
                      <span className="text-text-disabled w-12 shrink-0">{log.timestamp.split(' ')[1]?.slice(0, 5) || ''}</span>
                      <span className="font-mono text-primary">{log.peer_code}</span>
                      <span className={`px-1 py-0.5 rounded text-[10px] ${log.action === 'download' ? 'bg-green-500/10 text-green-400' : 'bg-blue-500/10 text-blue-400'}`}>{log.action}</span>
                      <span className="text-text-secondary truncate">{log.path}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      </>
      ) : (
        /* Service stopped: clean empty state */
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mb-4">
            <Wifi size={24} className="text-primary" />
          </div>
          <p className="text-sm font-medium text-text-secondary mb-2">{s.t('modules.p2p.ui.stoppedHint')}</p>
          <button onClick={a.handleStartService}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 cursor-pointer transition mt-2">
            {s.starting ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
            {s.t('modules.p2p.ui.startService')}
          </button>
          {!s.showGuide && (
            <button onClick={() => {
                  if (s.showGuide) {
                    s.guideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    s.guideRef.current?.classList.remove('guide-flash')
                    void s.guideRef.current?.offsetWidth
                    s.guideRef.current?.classList.add('guide-flash')
                  } else {
                    s.setShowGuide(true)
                  }
                }}
              className="mt-3 text-xs text-text-muted hover:text-primary cursor-pointer transition">
              {s.t('modules.p2p.ui.guide.viewGuide', { defaultValue: 'View guide' })} →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
