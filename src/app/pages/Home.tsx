/**
 * A7Box Home Page
 * Displays recently used tools, categorized tool grid
 */

import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useModuleRegistry } from '../../core/registry'
import { useCommandPalette } from '../../core/command-palette'
import { useSettingsStore } from '../../core/settings'
import { getRecentModuleIds, recordUsage } from '../../shared/utils'
import { Box, Search, Clock } from 'lucide-react'
import { useState, useEffect } from 'react'
import type { A7Module } from '../../core/types'

export default function Home() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const togglePalette = useCommandPalette((state) => state.toggle)
  const modules = useModuleRegistry((state) => state.modules)
  const enabledModuleIds = useModuleRegistry((state) => state.enabledModuleIds)
  const moduleOrder = useSettingsStore((s) => s.moduleOrder)
  const [recentIds, setRecentIds] = useState<string[]>([])

  // Stable selector: derive enabled modules sorted by persisted order
  const enabledModules = Array.from(modules.values())
    .filter((m) => enabledModuleIds.has(m.meta.id))
    .sort((a, b) => {
      const idxA = moduleOrder.indexOf(a.meta.id)
      const idxB = moduleOrder.indexOf(b.meta.id)
      if (idxA === -1 && idxB === -1) return 0
      if (idxA === -1) return 1
      if (idxB === -1) return -1
      return idxA - idxB
    })

  // Load recent history
  useEffect(() => {
    setRecentIds(getRecentModuleIds(5))
  }, [])

  // Recently used modules (filter to only enabled ones)
  const recentModules = recentIds
    .map((id) => modules.get(id))
    .filter((m): m is A7Module => !!m && enabledModuleIds.has(m.meta.id))

  // Group by category (show all modules in their category, recent also shown above)
  const modulesByCategory = enabledModules
    .reduce((acc, mod) => {
      if (!acc[mod.meta.category]) {
        acc[mod.meta.category] = []
      }
      acc[mod.meta.category].push(mod)
      return acc
    }, {} as Record<string, A7Module[]>)

  const handleModuleClick = (moduleId: string) => {
    recordUsage(moduleId)
    setRecentIds(getRecentModuleIds(5))
    navigate(`/${moduleId}`)
  }

  return (
    <div className="h-full overflow-auto p-8">
      {/* Welcome area */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">
          {t('app.name')}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {t('app.description')}
        </p>
      </div>

      {/* Quick search entry */}
      <button
        onClick={togglePalette}
        className="mb-8 flex w-full cursor-pointer items-center gap-3 rounded-lg border border-border-base bg-bg-elevated px-4 py-3 text-left transition-colors hover:border-border-focus"
      >
        <Search className="h-5 w-5 text-text-muted" />
        <span className="flex-1 text-sm text-text-muted">
          {t('commandPalette.placeholder')}
        </span>
        <kbd className="rounded bg-bg-hover px-2 py-0.5 text-xs text-text-muted">
          Ctrl+Shift+A
        </kbd>
      </button>

      {/* Recently used */}
      {recentModules.length > 0 && (
        <div className="mb-8">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-text-muted" />
            <h2 className="text-sm font-medium uppercase tracking-wider text-text-muted">
              {t('home.recentlyUsed')}
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {recentModules.map((mod) => (
              <ModuleCard
                key={mod.meta.id}
                module={mod}
                highlighted
                onClick={() => handleModuleClick(mod.meta.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tool grid by category */}
      {Object.entries(modulesByCategory).map(([category, mods]) => (
        <div key={category} className="mb-8">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-text-muted">
            {t(`categories.${category}`)}
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {mods.map((mod) => (
              <ModuleCard
                key={mod.meta.id}
                module={mod}
                onClick={() => handleModuleClick(mod.meta.id)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Empty state */}
      {enabledModules.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Box className="mb-4 h-12 w-12 text-text-muted" />
          <p className="text-text-secondary">{t('home.noTools')}</p>
          <p className="mt-1 text-sm text-text-muted">
            {t('home.enableInSettings')}
          </p>
        </div>
      )}
    </div>
  )
}

// Module card component
function ModuleCard({
  module,
  highlighted,
  onClick,
}: {
  module: A7Module
  highlighted?: boolean
  onClick: () => void
}) {
  const { t } = useTranslation()
  const Icon = typeof module.meta.icon === 'string' ? Box : module.meta.icon

  // Use i18n name/description if available, fallback to static name
  const displayName = module.meta.nameI18n ? t(module.meta.nameI18n) : module.meta.name
  const displayDesc = module.meta.descriptionI18n ? t(module.meta.descriptionI18n) : module.meta.description

  return (
    <button
      onClick={onClick}
      className={`group flex flex-col items-center gap-3 rounded-lg border p-6 transition-all cursor-pointer hover:border-border-focus hover:bg-bg-hover ${
        highlighted
          ? 'border-primary/20 bg-primary/5'
          : 'border-border-subtle bg-bg-elevated'
      }`}
    >
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-lg transition-colors ${
          highlighted
            ? 'bg-primary/10 text-primary'
            : 'bg-bg-hover text-text-secondary group-hover:bg-primary/10 group-hover:text-primary'
        }`}
      >
        <Icon className="h-6 w-6" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-text-primary">{displayName}</p>
        {displayDesc && (
          <p className="mt-1 line-clamp-2 text-xs text-text-muted">
            {displayDesc}
          </p>
        )}
      </div>
    </button>
  )
}
