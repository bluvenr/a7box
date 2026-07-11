/**
 * P2P Transfer — Onboarding guide for new users
 */
import { useTranslation } from 'react-i18next'
import { Wifi, Send, Globe, Zap } from 'lucide-react'
import type { P2PState } from '../hooks/useP2PState'
import type { P2PActions } from '../hooks/useP2PActions'

interface Props {
  s: P2PState
  a: P2PActions
}

export function OnboardingGuide({ s, a }: Props) {
  const { t } = useTranslation()

  if (!s.showGuide) return null

  return (
    <div ref={s.guideRef} className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-primary" />
          <h2 className="text-sm font-bold text-text-primary">{t('modules.p2p.ui.guide.title')}</h2>
        </div>
        <button onClick={a.dismissGuide} className="text-xs text-text-muted hover:text-text-primary cursor-pointer">{t('modules.p2p.ui.guide.skip')}</button>
      </div>
      <p className="text-xs text-text-secondary mb-4 leading-relaxed">
        {t('modules.p2p.ui.guide.intro', { defaultValue: 'Transfer files between devices on the same network (WiFi/Ethernet). No USB, no internet needed. Supports PC-to-PC and PC-to-phone.' })}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: Wifi, title: s.running ? 'guideStep1Running' : 'guideStep1Stopped', desc: s.running ? 'step1desc' : 'step1descStopped', color: 'text-green-400' },
          { icon: Send, title: 'step2title', desc: 'step2desc', color: 'text-blue-400' },
          { icon: Globe, title: 'step3title', desc: 'step3desc', color: 'text-purple-400' },
        ].map((step, i) => (
          <div key={i} className="rounded-lg bg-bg-elevated p-3 border border-border-subtle">
            <div className="flex items-center gap-2 mb-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{i + 1}</span>
              <step.icon size={14} className={step.color} />
              <span className="text-xs font-semibold text-text-primary">{t(`modules.p2p.ui.guide.${step.title}`)}</span>
            </div>
            <p className="text-[11px] text-text-secondary leading-relaxed">{t(`modules.p2p.ui.guide.${step.desc}`)}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 text-right">
        <button onClick={a.dismissGuide} className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white hover:bg-primary/90 cursor-pointer transition">
          {t('modules.p2p.ui.guide.gotIt')}
        </button>
      </div>
    </div>
  )
}
