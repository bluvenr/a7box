/**
 * PDF Toolkit — Shell
 * Two-row header + tab bar switching four lazily-loaded panels.
 * Heavy pdf.js / pdf-lib dependencies are code-split inside each panel's engine.
 */

import { lazy, Suspense, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { FileText, Image as ImageIcon, Combine, LayoutGrid } from 'lucide-react'
import { ModuleSkeleton } from '../../shared/components'
import { type TabId, TABS } from './utils'

// Module-level lazy() — never call lazy() inside render
const ToImagePanel = lazy(() => import('./components/ToImagePanel'))
const ToPdfPanel = lazy(() => import('./components/ToPdfPanel'))
const MergeSplitPanel = lazy(() => import('./components/MergeSplitPanel'))
const PageManagerPanel = lazy(() => import('./components/PageManagerPanel'))

const TAB_META: Record<TabId, { icon: typeof FileText; labelKey: string }> = {
  'to-image': { icon: ImageIcon, labelKey: 'modules.pdfToolkit.tabs.toImage' },
  'to-pdf': { icon: FileText, labelKey: 'modules.pdfToolkit.tabs.toPdf' },
  'merge-split': { icon: Combine, labelKey: 'modules.pdfToolkit.tabs.mergeSplit' },
  'pages': { icon: LayoutGrid, labelKey: 'modules.pdfToolkit.tabs.pages' },
}

function isTabId(v: string | null): v is TabId {
  return v !== null && (TABS as string[]).includes(v)
}

export default function PdfToolkit() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<TabId>(() => {
    const q = searchParams.get('tab')
    return isTabId(q) ? q : 'to-image'
  })

  const switchTab = useCallback((next: TabId) => {
    setTab(next)
    setSearchParams(next === 'to-image' ? {} : { tab: next }, { replace: true })
  }, [setSearchParams])

  return (
    <div className="relative flex h-full flex-col">
      {/* Row 1: identity */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border-subtle bg-bg-elevated px-4 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <FileText size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">{t('modules.pdfToolkit.name', { defaultValue: 'PDF Toolkit' })}</h1>
          <p className="text-sm text-text-secondary">{t('modules.pdfToolkit.description', { defaultValue: 'Convert, merge, split and manage PDF pages — fully local' })}</p>
        </div>
      </div>

      {/* Row 2: tab bar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border-subtle bg-bg-elevated/50 px-4 py-2">
        {TABS.map((id) => {
          const { icon: Icon, labelKey } = TAB_META[id]
          const active = tab === id
          return (
            <button
              key={id}
              onClick={() => switchTab(id)}
              className={`flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-bg-hover'}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(labelKey, { defaultValue: id })}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-bg-base p-4">
        <Suspense fallback={<ModuleSkeleton />}>
          {tab === 'to-image' && <ToImagePanel />}
          {tab === 'to-pdf' && <ToPdfPanel />}
          {tab === 'merge-split' && <MergeSplitPanel />}
          {tab === 'pages' && <PageManagerPanel />}
        </Suspense>
      </div>
    </div>
  )
}