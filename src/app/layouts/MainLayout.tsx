/**
 * A7Box Main Layout
 * Custom title bar + collapsible sidebar + scrollable navigation
 */

import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Home, Settings, Box, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useModuleRegistry } from '../../core/registry'
import { CommandPalette } from '../../core/command-palette'
import { useGlobalShortcuts } from '../../core/shortcuts'
import { Logo } from '../../components/Logo'
import { TitleBar } from '../../components/TitleBar'
import { ToastContainer } from '../../components/Toast'
import { useP2PStatus } from '../../modules/p2p-transfer/p2pStore'
import type { LucideIcon } from 'lucide-react'

// LocalStorage key for sidebar state
const SIDEBAR_KEY = 'a7box-sidebar-collapsed'

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

  // Register global shortcuts (Tauri + keyboard fallback)
  useGlobalShortcuts()

  // Sidebar collapsed state (persisted)
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === 'true' } catch { return false }
  })

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_KEY, String(collapsed)) } catch { /* ignore */ }
  }, [collapsed])

  // Derive enabled modules
  const enabledModules = Array.from(modules.values()).filter((m) => enabledModuleIds.has(m.meta.id))

  const sidebarWidth = collapsed ? 'w-16' : 'w-56'

  return (
    <div className="flex h-full w-full flex-col bg-bg-base">
      {/* Custom Title Bar (full width, above sidebar + content) */}
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`flex flex-col border-r border-border-base bg-bg-elevated transition-all duration-200 ${sidebarWidth}`}
        >
          {/* Logo area */}
          <div className={`flex h-12 shrink-0 items-center border-b border-border-subtle ${collapsed ? 'justify-center px-2' : 'gap-2.5 px-4'}`}>
            <Logo size={26} />
            {!collapsed && (
              <span className="truncate text-base font-semibold text-text-primary">
                {t('app.name')}
              </span>
            )}
          </div>

          {/* Scrollable navigation */}
          <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
            {/* Core navigation */}
            <div className="space-y-0.5">
              {navItems.map((item) => (
                <NavItem key={item.path} {...item} collapsed={collapsed} />
              ))}
            </div>

            {/* Divider */}
            <div className={`my-3 border-t border-border-subtle ${collapsed ? 'mx-1' : ''}`} />

            {/* Module navigation */}
            {!collapsed && (
              <div className="px-2 pb-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                  {t('nav.tools')}
                </span>
              </div>
            )}
            <div className="space-y-0.5">
              {enabledModules
                .filter((mod) => mod.component)
                .map((mod) => (
                  <ModuleNavItem
                    key={mod.meta.id}
                    icon={mod.meta.icon}
                    nameI18n={mod.meta.nameI18n}
                    fallbackName={mod.meta.name}
                    collapsed={collapsed}
                    moduleId={mod.meta.id}
                    onClick={() => navigate(`/${mod.meta.id}`)}
                  />
                ))}
            </div>
          </nav>

          {/* Footer: collapse toggle */}
          <div className="shrink-0 border-t border-border-subtle p-2">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className={`flex w-full cursor-pointer items-center rounded-md px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary ${
                collapsed ? 'justify-center' : 'gap-2'
              }`}
              title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4 shrink-0" />
              ) : (
                <>
                  <PanelLeftClose className="h-4 w-4 shrink-0" />
                  <span>{t('sidebar.collapse')}</span>
                </>
              )}
            </button>
          </div>
        </aside>

        {/* Content area */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* Command palette overlay (inside Router context) */}
      <CommandPalette />

      {/* Global toast notifications */}
      <ToastContainer />
    </div>
  )
}

// Navigation item component
function NavItem({
  path,
  icon: Icon,
  labelKey,
  collapsed,
}: {
  path: string
  icon: LucideIcon
  labelKey: string
  collapsed: boolean
}) {
  const { t } = useTranslation()
  return (
    <NavLink
      to={path}
      title={collapsed ? t(labelKey) : undefined}
      className={({ isActive }) =>
        `flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
          collapsed ? 'justify-center' : ''
        } ${
          isActive
            ? 'bg-bg-hover text-text-primary'
            : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
        }`
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{t(labelKey)}</span>}
    </NavLink>
  )
}

// Module navigation item component
function ModuleNavItem({
  icon: Icon,
  nameI18n,
  fallbackName,
  collapsed,
  onClick,
  moduleId,
}: {
  icon: LucideIcon | string
  nameI18n?: string
  fallbackName: string
  collapsed: boolean
  onClick: () => void
  moduleId: string
}) {
  const { t } = useTranslation()
  const IconComponent = typeof Icon === 'string' ? Box : Icon
  const displayName = nameI18n ? t(nameI18n) : fallbackName
  const p2pRunning = useP2PStatus((s) => s.running)
  const showDot = moduleId === 'p2p-transfer' && p2pRunning

  return (
    <button
      onClick={onClick}
      title={collapsed ? displayName : undefined}
      className={`relative flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary ${
        collapsed ? 'justify-center' : ''
      }`}
    >
      <IconComponent className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{displayName}</span>}
      {showDot && (
        <span className={`h-2 w-2 rounded-full bg-green-400 ${collapsed ? 'absolute -top-0.5 -right-0.5' : 'ml-auto'}`} />
      )}
    </button>
  )
}
