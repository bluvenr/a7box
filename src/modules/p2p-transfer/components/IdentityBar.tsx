/**
 * P2P Transfer — Top bar: identity info + service status + auto-start
 */
import { useTranslation } from 'react-i18next'
import {
  Wifi, WifiOff, Edit3, RefreshCw, Power,
} from 'lucide-react'
import type { P2PState } from '../hooks/useP2PState'
import type { P2PActions } from '../hooks/useP2PActions'
import { ALIAS_MAX } from '../utils'

interface Props {
  s: P2PState
  a: P2PActions
}

export function IdentityBar({ s, a }: Props) {
  const { t } = useTranslation()

  return (
    <div className="mb-6 rounded-xl border border-border-subtle bg-bg-elevated px-4 py-3">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Wifi size={18} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-text-primary">{t('modules.p2p.name')}</h1>
            <div className="flex items-center gap-2">
              <p className="text-xs text-text-secondary">{t('modules.p2p.description')}</p>
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
                className="text-[11px] text-primary/70 hover:text-primary cursor-pointer transition shrink-0">
                {t('modules.p2p.ui.guide.title', { defaultValue: 'Quick Start' })} →
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {/* Service Status */}
          <div className="flex items-center gap-2">
            {s.starting ? (
              <span className="flex items-center gap-1.5 text-xs text-text-muted">
                <RefreshCw size={12} className="animate-spin" />{t('modules.p2p.ui.startService')}...
              </span>
            ) : s.running ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs text-green-400">
                  <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                  {t('modules.p2p.ui.serviceRunning')}
                </span>
                {s.localIps.length > 0 && (
                  <button
                    onClick={async () => {
                      const addr = `${s.localIps[0]}:${s._tcpPort}`
                      await navigator.clipboard.writeText(addr)
                      s.toast(s.t('common.copied'))
                    }}
                    className="rounded-md bg-bg-hover/60 px-2 py-0.5 font-mono text-[11px] text-text-secondary hover:text-primary cursor-pointer transition"
                    title={t('modules.p2p.ui.clickToCopy')}
                  >
                    {s.localIps[0]}:{s._tcpPort}
                  </button>
                )}
                <button onClick={a.handleStopService}
                  className="text-text-muted hover:text-red-400 cursor-pointer" title={t('modules.p2p.ui.stopService')}>
                  <Power size={13} />
                </button>
              </div>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-text-muted">
                <WifiOff size={12} />{t('modules.p2p.ui.serviceStopped')}
                <button onClick={a.handleStartService}
                  className="ml-1 text-primary hover:underline cursor-pointer">{t('modules.p2p.ui.startService')}</button>
              </span>
            )}
          </div>
          {/* Auto-start */}
          <label className="flex items-center gap-1.5 text-[11px] text-text-muted cursor-pointer select-none" title={t('modules.p2p.ui.autoStart')}>
            <input type="checkbox" checked={s.autoStart} onChange={(e) => a.toggleAutoStart(e.target.checked)}
              className="h-3 w-3 rounded border-border-base accent-primary cursor-pointer" />
            {t('modules.p2p.ui.autoStart')}
          </label>
          {/* Identity: Code + Alias */}
          {s.identity && (
            <div className="flex items-center gap-3 border-l border-border-subtle pl-3">
              {/* Device Code */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-text-muted uppercase tracking-wide">{t('modules.p2p.ui.deviceCode')}</span>
                <button
                  onClick={a.handleCopyCode}
                  className="font-mono text-sm font-bold text-primary hover:text-primary/80 cursor-pointer transition"
                  title={t('common.copy')}
                >
                  {s.identity.code}
                </button>
              </div>
              {/* Alias */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-text-muted uppercase tracking-wide">{t('modules.p2p.ui.deviceName')}</span>
                {s.editingAlias ? (
                  <input
                    value={s.aliasInput}
                    maxLength={ALIAS_MAX}
                    onChange={(e) => s.setAliasInput(e.target.value)}
                    onBlur={a.handleSaveAlias}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') a.handleSaveAlias()
                      if (e.key === 'Escape') { s.setAliasInput(s.identity!.alias); s.setEditingAlias(false) }
                    }}
                    className="w-28 rounded border border-primary bg-bg-base px-2 py-0.5 text-xs text-text-primary outline-none"
                    autoFocus
                  />
                ) : (
                  <span
                    className="text-xs text-text-secondary cursor-pointer hover:text-text-primary transition truncate max-w-[120px]"
                    onClick={() => { s.setEditingAlias(true); s.setAliasInput(s.identity!.alias) }}
                    title={s.identity.alias}
                  >
                    {s.identity.alias} <Edit3 size={9} className="inline opacity-50" />
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
