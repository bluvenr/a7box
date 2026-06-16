/**
 * A7Box Home Page
 * Displays tool grid and recently used items
 */

import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useModuleRegistry } from '../../core/registry'
import { useCommandPalette } from '../../core/command-palette'
import { Box, Search } from 'lucide-react'
import type { A7Module } from '../../core/types'

export default function Home() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const togglePalette = useCommandPalette((state) => state.toggle)
  const modules = useModuleRegistry((state) => state.modules)
  const enabledModuleIds = useModuleRegistry((state) => state.enabledModuleIds)

  // Stable selector: derive enabled modules without creating new array in selector
  const enabledModules = Array.from(modules.values()).filter((m) => enabledModuleIds.has(m.meta.id))

  // Group by category
  const modulesByCategory = enabledModules.reduce((acc, mod) => {
    if (!acc[mod.meta.category]) {
      acc[mod.meta.category] = []
    }
    acc[mod.meta.category].push(mod)
    return acc
  }, {} as Record<string, A7Module[]>)

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

      {/* Tool grid */}
      {Object.entries(modulesByCategory).map(([category, modules]) => (
        <div key={category} className="mb-8">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-text-muted">
            {t(`categories.${category}`)}
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {modules.map((mod) => (
              <ModuleCard
                key={mod.meta.id}
                module={mod}
                onClick={() => navigate(`/${mod.meta.id}`)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Empty state */}
      {enabledModules.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Box className="mb-4 h-12 w-12 text-text-muted" />
          <p className="text-text-secondary">No enabled tool modules</p>
          <p className="mt-1 text-sm text-text-muted">
            Go to Settings to enable tool modules
          </p>
        </div>
      )}
    </div>
  )
}

// Module card component
function ModuleCard({ module, onClick }: { module: A7Module; onClick: () => void }) {
  const { t } = useTranslation()
  const Icon = typeof module.meta.icon === 'string' ? Box : module.meta.icon

  // Use i18n name/description if available, fallback to static name
  const displayName = module.meta.nameI18n ? t(module.meta.nameI18n) : module.meta.name
  const displayDesc = module.meta.descriptionI18n ? t(module.meta.descriptionI18n) : module.meta.description

  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-center gap-3 rounded-lg border border-border-subtle bg-bg-elevated p-6 transition-all cursor-pointer hover:border-border-focus hover:bg-bg-hover"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-bg-hover transition-colors group-hover:bg-primary/10">
        <Icon className="h-6 w-6 text-text-secondary transition-colors group-hover:text-primary" />
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
