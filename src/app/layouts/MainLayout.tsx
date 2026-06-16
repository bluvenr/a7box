/**
 * A7Box Main Layout
 * Contains sidebar navigation and content area
 */

import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Home, Settings, Box } from 'lucide-react'
import { useModuleRegistry } from '../../core/registry'
import { CommandPalette } from '../../core/command-palette'
import { Logo } from '../../components/Logo'
import type { LucideIcon } from 'lucide-react'

// Sidebar navigation items
const navItems = [
  { path: '/', icon: Home, labelKey: 'common.home' },
  { path: '/settings', icon: Settings, labelKey: 'common.settings' },
]

export function MainLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const modules = useModuleRegistry((state) => state.modules)
  const enabledModuleIds = useModuleRegistry((state) => state.enabledModuleIds)

  // Stable selector: derive enabled modules from raw state to avoid getSnapshot infinite loop
  const enabledModules = Array.from(modules.values()).filter((m) => enabledModuleIds.has(m.meta.id))

  return (
    <div className="flex h-full w-full bg-bg-base">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r border-border-base bg-bg-elevated">
        {/* Logo area */}
        <div className="flex h-14 items-center gap-2.5 px-4">
          <Logo size={28} />
          <span className="text-lg font-semibold text-text-primary">
            {t('app.name')}
          </span>
        </div>

        {/* Navigation menu */}
        <nav className="flex-1 space-y-1 px-2 py-4">
          {/* Core navigation */}
          {navItems.map((item) => (
            <NavItem key={item.path} {...item} />
          ))}

          {/* Divider */}
          <div className="my-4 border-t border-border-subtle" />

          {/* Module navigation */}
          <div className="px-2 py-1">
            <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
              {t('nav.tools')}
            </span>
          </div>
          {enabledModules
            .filter((mod) => mod.component)
            .map((mod) => (
              <ModuleNavItem
                key={mod.meta.id}
                icon={mod.meta.icon}
                nameI18n={mod.meta.nameI18n}
                fallbackName={mod.meta.name}
                onClick={() => navigate(`/${mod.meta.id}`)}
              />
            ))}
        </nav>

        {/* Footer info */}
        <div className="border-t border-border-subtle p-4">
          <p className="text-xs text-text-muted">
            {t('app.description')}
          </p>
        </div>
      </aside>

      {/* Content area */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* Command palette overlay (inside Router context) */}
      <CommandPalette />
    </div>
  )
}

// Navigation item component
function NavItem({ path, icon: Icon, labelKey }: { path: string; icon: LucideIcon; labelKey: string }) {
  const { t } = useTranslation()
  return (
    <NavLink
      to={path}
      className={({ isActive }) =>
        `flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
          isActive
            ? 'bg-bg-hover text-text-primary'
            : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
        }`
      }
    >
      <Icon className="h-4 w-4" />
      <span>{t(labelKey)}</span>
    </NavLink>
  )
}

// Module navigation item component
function ModuleNavItem({
  icon: Icon,
  nameI18n,
  fallbackName,
  onClick,
}: {
  icon: LucideIcon | string
  nameI18n?: string
  fallbackName: string
  onClick: () => void
}) {
  const { t } = useTranslation()
  const IconComponent = typeof Icon === 'string' ? Box : Icon
  const displayName = nameI18n ? t(nameI18n) : fallbackName

  return (
    <button
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
    >
      <IconComponent className="h-4 w-4" />
      <span>{displayName}</span>
    </button>
  )
}
