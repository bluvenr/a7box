/**
 * A7Box Settings Page (v2 - with Tauri integration)
 */

import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore, SUPPORTED_LANGUAGES, changeLanguage, useUpdater } from '../../core'
import { useModuleRegistry } from '../../core/registry'
import { getCacheSizes, clearCache } from '../../shared/utils/tauriBridge'
import type { CacheSizes as CacheSizesType } from '../../shared/utils/tauriBridge'
import { useConfirm } from '../../components/Dialog'
import {
  Globe, Palette, Box, Info, RefreshCw, Download,
  CheckCircle, AlertCircle, Loader2, GripVertical,
  Database, Trash2, FolderOpen, Image, Keyboard, RotateCcw
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useShortcutStore } from '../../core/shortcuts'
import { KeyCapture } from '../../components/KeyCapture'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export default function Settings() {
  const { t } = useTranslation()
  const settings = useSettingsStore()
  const modulesMap = useModuleRegistry((state) => state.modules)
  const enabledModuleIds = useModuleRegistry((state) => state.enabledModuleIds)
  const registryEnable = useModuleRegistry((state) => state.enable)
  const registryDisable = useModuleRegistry((state) => state.disable)

  const moduleOrder = useSettingsStore((s) => s.moduleOrder)
  const reorderModule = useSettingsStore((s) => s.reorderModule)
  const syncModuleOrder = useSettingsStore((s) => s.syncModuleOrder)

  // Pointer-based drag-and-drop (more reliable in Tauri WebView than HTML5 DnD)
  const scrollRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [dragState, setDragState] = useState<{
    fromIdx: number; startY: number; currentY: number
  } | null>(null)
  const [dropPos, setDropPos] = useState<number | null>(null)
  const [lineY, setLineY] = useState<number>(0)
  const autoScrollRef = useRef<number | null>(null)
  const scrollDeltaRef = useRef<number>(0)

  const updater = useUpdater()

  // ─── Tab navigation state ───────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState('general')
  const isScrollingRef = useRef(false)

  const navItems: { id: string; label: string; icon: LucideIcon }[] = useMemo(() => {
    const items: { id: string; label: string; icon: LucideIcon }[] = [
      { id: 'general', label: t('settings.general'), icon: Globe },
      { id: 'appearance', label: t('settings.appearance'), icon: Palette },
      { id: 'modules', label: t('settings.modules'), icon: Box },
      { id: 'storage', label: t('settings.storageCache', { defaultValue: '存储与缓存' }), icon: Database },
    ]
    if (isTauri()) {
      items.push({ id: 'shortcuts', label: t('settings.shortcuts', { defaultValue: '快捷键' }), icon: Keyboard })
    }
    items.push({ id: 'about', label: t('common.about'), icon: Info })
    return items
  }, [t])

  const handleNavClick = useCallback((sectionId: string) => {
    const el = document.getElementById(`settings-${sectionId}`)
    if (!el) return
    isScrollingRef.current = true
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveSection(sectionId)
    setTimeout(() => { isScrollingRef.current = false }, 600)
  }, [])

  // IntersectionObserver — auto-highlight active tab on scroll
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (isScrollingRef.current) return
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id.replace('settings-', ''))
            break
          }
        }
      },
      { root, rootMargin: '0px 0px -50% 0px' }
    )
    navItems.forEach(({ id }) => {
      const el = document.getElementById(`settings-${id}`)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [navItems])

  // Auto-start toggle: sync with Tauri autostart plugin
  const handleAutoStartToggle = async (v: boolean) => {
    settings.updateSetting('autoStart', v)
    if (!isTauri()) return
    try {
      const { isEnabled, enable, disable } = await import('@tauri-apps/plugin-autostart')
      const currentlyEnabled = await isEnabled()
      if (v && !currentlyEnabled) await enable()
      else if (!v && currentlyEnabled) await disable()
    } catch {
      // Plugin may not be available
    }
  }

  // Sync auto-start state from Tauri on mount
  useEffect(() => {
    if (!isTauri()) return
    (async () => {
      try {
        const { isEnabled } = await import('@tauri-apps/plugin-autostart')
        const enabled = await isEnabled()
        if (enabled !== settings.autoStart) {
          settings.updateSetting('autoStart', enabled)
        }
      } catch { /* ignore */ }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const allModules = Array.from(modulesMap.values())

  // Sync module order with registered modules on mount
  useEffect(() => {
    syncModuleOrder(allModules.map((m) => m.meta.id))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allModules.length])

  // Sort modules by persisted order
  const orderedModules = [...allModules].sort((a, b) => {
    const idxA = moduleOrder.indexOf(a.meta.id)
    const idxB = moduleOrder.indexOf(b.meta.id)
    if (idxA === -1 && idxB === -1) return 0
    if (idxA === -1) return 1
    if (idxB === -1) return -1
    return idxA - idxB
  })

  const handleModuleToggle = async (moduleId: string, enabled: boolean) => {
    settings.setModuleEnabled(moduleId, enabled)
    if (enabled) {
      registryEnable(moduleId)
    } else {
      registryDisable(moduleId)
    }
    // Sync associated shortcuts with module enable/disable state
    if (isTauri()) {
      try {
        const shortcuts = useShortcutStore.getState().shortcuts
        const { invoke } = await import('@tauri-apps/api/core')
        for (const sc of shortcuts) {
          if (sc.moduleId === moduleId) {
            // When module disabled: unregister its shortcuts
            // When module enabled: re-register with stored enabled state
            await invoke('update_shortcut', {
              action: sc.action,
              keys: sc.keys,
              enabled: enabled && sc.enabled,
            })
          }
        }
      } catch { /* ignore */ }
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-2">
        <h1 className="text-2xl font-bold text-text-primary">
          {t('settings.title')}
        </h1>
      </div>

      {/* Mobile horizontal tabs */}
      <nav className="flex md:hidden shrink-0 gap-1 px-3 py-2 overflow-x-auto border-b border-border-subtle">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => handleNavClick(id)}
            className={`flex items-center gap-1.5 shrink-0 rounded-md px-3 py-1.5 text-xs transition-colors whitespace-nowrap ${
              activeSection === id
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-text-muted hover:bg-bg-hover hover:text-text-secondary'
            }`}
          >
            <Icon size={13} className="shrink-0" />
            {label}
          </button>
        ))}
      </nav>

      <div className="flex flex-1 min-h-0">
        {/* Left tab navigation (desktop) */}
        <nav className="hidden md:flex shrink-0 flex-col gap-0.5 px-3 py-4 overflow-y-auto border-r border-border-subtle w-[140px]">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => handleNavClick(id)}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors text-left ${
                activeSection === id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-text-muted hover:bg-bg-hover hover:text-text-secondary'
              }`}
            >
              <Icon size={15} className="shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </nav>

        {/* Right content area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
          <div className="max-w-2xl space-y-8">
            {/* General settings */}
            <section id="settings-general">
            <SettingSection title={t('settings.general')} icon={Globe}>
          {/* Language selection */}
          <SettingRow
            label={t('settings.language')}
            description={t('settings.languageDesc')}
          >
            <select
              value={settings.language}
              onChange={(e) => {
                const lang = e.target.value as 'zh-CN' | 'en-US'
                settings.updateSetting('language', lang)
                changeLanguage(lang)
              }}
              className="rounded-md border border-border-base bg-bg-elevated px-3 py-1.5 text-sm text-text-primary focus:border-border-focus focus:outline-none"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </SettingRow>

          {/* Auto start */}
          <SettingRow
            label={t('settings.autoStart')}
            description={t('settings.autoStartDesc')}
          >
            <Toggle
              checked={settings.autoStart}
              onChange={handleAutoStartToggle}
            />
          </SettingRow>

          {/* Minimize to tray */}
          <SettingRow
            label={t('settings.minimizeToTray')}
            description={t('settings.minimizeToTrayDesc')}
          >
            <Toggle
              checked={settings.minimizeToTray}
              onChange={(v) => settings.updateSetting('minimizeToTray', v)}
            />
          </SettingRow>

          {/* Check for updates on start */}
          <SettingRow
            label={t('settings.checkUpdateOnStart')}
            description={t('settings.checkUpdateOnStartDesc')}
          >
            <Toggle
              checked={settings.checkUpdateOnStart}
              onChange={(v) => settings.updateSetting('checkUpdateOnStart', v)}
            />
          </SettingRow>
          </SettingSection>
            </section>

            {/* Appearance settings */}
            <section id="settings-appearance">
            <SettingSection title={t('settings.appearance')} icon={Palette}>
          <SettingRow label={t('settings.theme')} description={t('settings.themeDesc')}>
            <select
              value={settings.theme}
              onChange={(e) =>
                settings.updateSetting('theme', e.target.value as 'dark' | 'light' | 'system')
              }
              className="rounded-md border border-border-base bg-bg-elevated px-3 py-1.5 text-sm text-text-primary focus:border-border-focus focus:outline-none"
            >
              <option value="dark">{t('settings.darkMode')}</option>
              <option value="light">{t('settings.lightMode')}</option>
              <option value="system">{t('settings.followSystem')}</option>
            </select>
          </SettingRow>

          <SettingRow label={t('settings.fontSize')} description={t('settings.fontSizeDesc')}>
            <input
              type="range"
              min="12"
              max="18"
              value={settings.fontSize}
              onChange={(e) =>
                settings.updateSetting('fontSize', parseInt(e.target.value))
              }
              className="w-32"
            />
            <span className="ml-2 text-sm text-text-muted">{settings.fontSize}px</span>
          </SettingRow>
          </SettingSection>
            </section>

            {/* Module management */}
            <section id="settings-modules">
            <SettingSection title={t('settings.modules')} icon={Box}>
          <p className="mb-2 flex items-center gap-1.5 text-xs text-text-muted">
            <GripVertical size={12} className="shrink-0" />
            {t('settings.modulesDragHint')}
          </p>
          <div ref={listRef} className="relative">
            {/* Insertion line indicator */}
            {dragState && dropPos !== null && (
              <div
                data-insertion-line
                className="absolute left-0 right-0 z-20 pointer-events-none"
                style={{ top: `${lineY}px` }}
              >
                <div className="flex items-center">
                  <div className="w-2 h-2 rounded-full bg-primary shadow-sm" />
                  <div className="flex-1 h-[2px] bg-primary rounded-full" />
                </div>
              </div>
            )}
            {orderedModules.map((mod, index) => {
              const displayName = mod.meta.nameI18n ? t(mod.meta.nameI18n) : mod.meta.name
              const displayDesc = mod.meta.descriptionI18n ? t(mod.meta.descriptionI18n) : mod.meta.description
              const isDragging = dragState?.fromIdx === index
              return (
                <div
                  key={mod.meta.id}
                  className={`flex items-center justify-between py-3 gap-3 rounded-lg select-none transition-colors ${
                    isDragging ? 'bg-primary/10 ring-1 ring-primary/30 shadow-lg' : ''
                  }`}
                  style={isDragging && dragState ? {
                    position: 'relative',
                    zIndex: 10,
                    transform: `translateY(${dragState.currentY - dragState.startY}px)`,
                    transition: 'none',
                  } : undefined}
                  onPointerDown={(e) => {
                    // Only start drag from the grip handle
                    if (!(e.target as HTMLElement).closest('[data-drag-handle]')) return
                    e.preventDefault()
                    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                    setDragState({ fromIdx: index, startY: e.clientY, currentY: e.clientY })
                    setDropPos(index)
                    // Set initial insertion line at the item's own position
                    const row = e.currentTarget as HTMLElement
                    setLineY(row.offsetTop + 2)
                  }}
                  onPointerMove={(e) => {
                    if (!dragState || dragState.fromIdx !== index) return
                    const currentY = e.clientY
                    setDragState((s) => s ? { ...s, currentY } : null)

                    // Auto-scroll when near edges (use ref to avoid stale closure)
                    const scroller = scrollRef.current
                    if (scroller) {
                      const scrollRect = scroller.getBoundingClientRect()
                      const edgeThreshold = 80
                      const maxSpeed = 8
                      let delta = 0
                      if (currentY < scrollRect.top + edgeThreshold) {
                        delta = -(scrollRect.top + edgeThreshold - currentY) * maxSpeed / edgeThreshold
                      } else if (currentY > scrollRect.bottom - edgeThreshold) {
                        delta = (currentY - scrollRect.bottom + edgeThreshold) * maxSpeed / edgeThreshold
                      }
                      scrollDeltaRef.current = delta
                      if (delta !== 0 && autoScrollRef.current === null) {
                        const tick = () => {
                          if (autoScrollRef.current !== null) {
                            scroller.scrollBy({ top: scrollDeltaRef.current })
                            autoScrollRef.current = requestAnimationFrame(tick)
                          }
                        }
                        autoScrollRef.current = requestAnimationFrame(tick)
                      } else if (delta === 0 && autoScrollRef.current !== null) {
                        cancelAnimationFrame(autoScrollRef.current)
                        autoScrollRef.current = null
                      }
                    }

                    // Compute drop position and insertion line Y using offsetTop
                    // (getBoundingClientRect includes transform, which shifts the dragged item)
                    const container = listRef.current
                    if (!container) return
                    const items = Array.from(container.children).filter(
                      (c): c is HTMLElement => c instanceof HTMLElement && !c.hasAttribute('data-insertion-line')
                    )
                    const containerRect = container.getBoundingClientRect()
                    const localPointerY = currentY - containerRect.top
                    let pos = 0
                    let y = 0
                    for (let i = 0; i < items.length; i++) {
                      const itemTop = items[i].offsetTop
                      const itemH = items[i].offsetHeight
                      const mid = itemTop + itemH / 2
                      if (localPointerY > mid) {
                        pos = i + 1
                        y = itemTop + itemH
                      } else {
                        pos = i
                        y = itemTop
                        break
                      }
                    }
                    if (pos > dragState.fromIdx) pos -= 1
                    setDropPos(pos)
                    setLineY(y + 2)
                  }}
                  onPointerUp={() => {
                    // Stop auto-scroll
                    scrollDeltaRef.current = 0
                    if (autoScrollRef.current !== null) {
                      cancelAnimationFrame(autoScrollRef.current)
                      autoScrollRef.current = null
                    }
                    if (!dragState || dragState.fromIdx !== index) return
                    if (dropPos !== null && dropPos !== dragState.fromIdx) {
                      reorderModule(dragState.fromIdx, dropPos)
                    }
                    setDragState(null)
                    setDropPos(null)
                  }}
                >
                  {/* Drag handle — only this area initiates drag */}
                  <div
                    data-drag-handle
                    className="flex items-center shrink-0 cursor-grab active:cursor-grabbing touch-none py-1"
                  >
                    <GripVertical size={14} className={`${dragState?.fromIdx === index ? 'text-primary' : 'text-text-disabled'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary">{displayName}</p>
                    {displayDesc && (
                      <p className="mt-0.5 text-xs text-text-muted">{displayDesc}</p>
                    )}
                  </div>
                  <div className="ml-2 shrink-0">
                    <Toggle
                      checked={enabledModuleIds.has(mod.meta.id)}
                      onChange={(v) => handleModuleToggle(mod.meta.id, v)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          {allModules.length === 0 && (
            <p className="py-4 text-center text-sm text-text-muted">{t('settings.noModules')}</p>
          )}
          </SettingSection>
            </section>

            {/* Storage & Cache */}
            <section id="settings-storage">
            <StorageCacheSection t={t} />
            </section>

            {/* Shortcuts */}
            {isTauri() && (
              <section id="settings-shortcuts">
              <ShortcutsSection t={t} />
              </section>
            )}

            {/* About & Updates */}
            <section id="settings-about">
            <SettingSection title={t('common.about')} icon={Info}>
          <div className="space-y-3 text-sm">
            <p className="text-text-secondary">
              <span className="text-text-muted">{t('app.name')}</span> v0.1.0
            </p>
            <p className="text-text-muted">{t('app.description')}</p>
            <a
              href="https://github.com/bluvenr/a7box"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-primary hover:text-primary-hover"
            >
              {t('settings.githubRepo')}
            </a>

            {/* Update section */}
            <div className="mt-4 border-t border-border-subtle pt-4">
              <UpdateSection updater={updater} t={t} />
            </div>
          </div>
            </SettingSection>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

// Update section component
function UpdateSection({
  updater,
  t,
}: {
  updater: ReturnType<typeof useUpdater>
  t: (key: string) => string
}) {
  const { checking, available, downloading, progress, info, error, checkForUpdates, downloadAndInstall } = updater

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          onClick={checkForUpdates}
          disabled={checking || downloading}
          className="inline-flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
        >
          {checking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {checking ? t('settings.checkingUpdate') : t('settings.checkUpdate')}
        </button>

        {available && !downloading && (
          <button
            onClick={downloadAndInstall}
            className="inline-flex items-center gap-2 rounded-md bg-green-500/10 px-3 py-1.5 text-sm font-medium text-green-500 transition-colors hover:bg-green-500/20"
          >
            <Download className="h-4 w-4" />
            {t('settings.downloadUpdate')}
          </button>
        )}
      </div>

      {/* Status messages */}
      {!checking && !available && !error && (
        <p className="flex items-center gap-1.5 text-xs text-text-muted">
          <CheckCircle className="h-3.5 w-3.5" />
          {t('settings.upToDate')}
        </p>
      )}

      {available && info && (
        <div className="rounded-md border border-green-500/20 bg-green-500/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-green-500">
            <CheckCircle className="h-4 w-4" />
            {t('settings.updateAvailable')}: v{info.version}
          </p>
          {info.body && (
            <p className="mt-1 text-xs text-text-muted whitespace-pre-line">{info.body}</p>
          )}
        </div>
      )}

      {downloading && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('settings.downloading')} {progress}%
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-hover">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </p>
      )}
    </div>
  )
}

// Settings section component
function SettingSection({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: LucideIcon
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-5 w-5 text-text-secondary" />
        <h2 className="text-lg font-medium text-text-primary">{title}</h2>
      </div>
      <div className="space-y-1 rounded-lg border border-border-base bg-bg-elevated p-4">
        {children}
      </div>
    </section>
  )
}

// Settings row component
function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-text-muted">{description}</p>
        )}
      </div>
      <div className="ml-4">{children}</div>
    </div>
  )
}

// Toggle switch component
function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
        checked ? 'bg-primary' : 'bg-bg-hover'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// Storage & Cache section component
function StorageCacheSection({ t }: { t: (key: string, opts?: Record<string, unknown>) => string }) {
  const [cacheSizes, setCacheSizes] = useState<CacheSizesType | null>(null)
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState<string | null>(null)
  const confirm = useConfirm()

  const loadSizes = async () => {
    setLoading(true)
    const sizes = await getCacheSizes()
    setCacheSizes(sizes)
    setLoading(false)
  }

  useEffect(() => { loadSizes() }, [])

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    const val = bytes / Math.pow(1024, i)
    return `${val.toFixed(i > 0 ? 1 : 0)} ${units[i]}`
  }

  const handleClear = async (category: 'p2pDownloads' | 'screenshots' | 'transferHistory') => {
    setClearing(category)
    await clearCache(category)
    await loadSizes()
    setClearing(null)
  }

  const totalSize = cacheSizes ? cacheSizes.p2pDownloads + cacheSizes.screenshots : 0

  const handleClearAll = async () => {
    setClearing('all')
    await clearCache('p2pDownloads')
    await clearCache('screenshots')
    await clearCache('transferHistory')
    await loadSizes()
    setClearing(null)
  }

  return (
    <SettingSection title={t('settings.storageCache', { defaultValue: '存储与缓存' })} icon={Database}>
      <div className="space-y-3">
        {/* Total + Clear all */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text-primary">
              {t('settings.cacheTotal', { defaultValue: '缓存总大小' })}
            </p>
            <p className="text-xs text-text-muted">
              {loading ? '...' : formatSize(totalSize)}
            </p>
          </div>
          <button
            onClick={async () => {
              const ok = await confirm({
                title: t('settings.cacheClearAll', { defaultValue: '全部清理' }),
                message: t('settings.cacheConfirmAll', { defaultValue: '将清理所有缓存数据和传输记录，此操作不可撤销。' }),
                detail: `${(cacheSizes?.p2pFileCount ?? 0) + (cacheSizes?.screenshotFileCount ?? 0)} ${t('settings.cacheFileUnit', { defaultValue: '个文件' })}，${formatSize(totalSize)}`,
                confirmText: t('settings.cacheConfirmBtn', { defaultValue: '确认清理' }),
                cancelText: t('common.cancel', { defaultValue: '取消' }),
                danger: true,
              })
              if (ok) handleClearAll()
            }}
            disabled={loading || clearing === 'all' || totalSize === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/20 disabled:opacity-40 cursor-pointer"
          >
            {clearing === 'all' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {t('settings.cacheClearAll', { defaultValue: '全部清理' })}
          </button>
        </div>

        {/* Cache items */}
        <div className="divide-y divide-border-subtle">
          {/* Transfer Downloads */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2 min-w-0">
              <FolderOpen size={14} className="text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-text-primary">{t('settings.cacheDownloads', { defaultValue: '传输接收文件' })}</p>
                <p className="text-[11px] text-text-muted truncate" title={cacheSizes?.p2pDownloadsPath}>
                  {cacheSizes?.p2pFileCount != null ? `${cacheSizes.p2pFileCount} ${t('settings.cacheFileUnit', { defaultValue: '个文件' })} · ` : ''}
                  {cacheSizes?.p2pDownloadsPath || '...'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-3">
              <span className="text-xs text-text-secondary tabular-nums">
                {loading ? '...' : formatSize(cacheSizes?.p2pDownloads ?? 0)}
              </span>
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: t('settings.cacheDownloads', { defaultValue: '传输接收文件' }),
                    message: t('settings.cacheConfirmDownloads', { defaultValue: '将删除下载目录中的所有文件，此操作不可撤销。' }),
                    detail: `${cacheSizes?.p2pFileCount ?? 0} ${t('settings.cacheFileUnit', { defaultValue: '个文件' })}，${formatSize(cacheSizes?.p2pDownloads ?? 0)}`,
                    confirmText: t('settings.cacheConfirmBtn', { defaultValue: '确认清理' }),
                    cancelText: t('common.cancel', { defaultValue: '取消' }),
                    danger: true,
                  })
                  if (ok) handleClear('p2pDownloads')
                }}
                disabled={loading || clearing !== null || (cacheSizes?.p2pDownloads ?? 0) === 0}
                className="text-text-muted hover:text-red-400 cursor-pointer disabled:opacity-30 transition"
                title={t('settings.cacheClear', { defaultValue: '清理' })}
              >
                {clearing === 'p2pDownloads' ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              </button>
            </div>
          </div>

          {/* Screenshots */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2 min-w-0">
              <Image size={14} className="text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-text-primary">{t('settings.cacheScreenshots', { defaultValue: '截图文件' })}</p>
                <p className="text-[11px] text-text-muted truncate" title={cacheSizes?.screenshotsPath}>
                  {cacheSizes?.screenshotFileCount != null ? `${cacheSizes.screenshotFileCount} ${t('settings.cacheFileUnit', { defaultValue: '个文件' })} · ` : ''}
                  {cacheSizes?.screenshotsPath || '...'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-3">
              <span className="text-xs text-text-secondary tabular-nums">
                {loading ? '...' : formatSize(cacheSizes?.screenshots ?? 0)}
              </span>
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: t('settings.cacheScreenshots', { defaultValue: '截图文件' }),
                    message: t('settings.cacheConfirmScreenshots', { defaultValue: '将删除所有截图文件，此操作不可撤销。' }),
                    detail: `${cacheSizes?.screenshotFileCount ?? 0} ${t('settings.cacheFileUnit', { defaultValue: '个文件' })}，${formatSize(cacheSizes?.screenshots ?? 0)}`,
                    confirmText: t('settings.cacheConfirmBtn', { defaultValue: '确认清理' }),
                    cancelText: t('common.cancel', { defaultValue: '取消' }),
                    danger: true,
                  })
                  if (ok) handleClear('screenshots')
                }}
                disabled={loading || clearing !== null || (cacheSizes?.screenshots ?? 0) === 0}
                className="text-text-muted hover:text-red-400 cursor-pointer disabled:opacity-30 transition"
                title={t('settings.cacheClear', { defaultValue: '清理' })}
              >
                {clearing === 'screenshots' ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              </button>
            </div>
          </div>

          {/* Transfer History */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2 min-w-0">
              <RefreshCw size={14} className="text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-text-primary">{t('settings.cacheTransferHistory', { defaultValue: '传输记录' })}</p>
                <p className="text-[11px] text-text-muted">
                  {cacheSizes?.transferCount ?? 0} {t('settings.cacheRecordUnit', { defaultValue: '条记录' })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-3">
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: t('settings.cacheTransferHistory', { defaultValue: '传输记录' }),
                    message: t('settings.cacheConfirmHistory', { defaultValue: '将清空所有传输记录，此操作不可撤销。' }),
                    detail: `${cacheSizes?.transferCount ?? 0} ${t('settings.cacheRecordUnit', { defaultValue: '条记录' })}`,
                    confirmText: t('settings.cacheConfirmBtn', { defaultValue: '确认清理' }),
                    cancelText: t('common.cancel', { defaultValue: '取消' }),
                    danger: true,
                  })
                  if (ok) handleClear('transferHistory')
                }}
                disabled={loading || clearing !== null || (cacheSizes?.transferCount ?? 0) === 0}
                className="text-text-muted hover:text-red-400 cursor-pointer disabled:opacity-30 transition"
                title={t('settings.cacheClear', { defaultValue: '清理' })}
              >
                {clearing === 'transferHistory' ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              </button>
            </div>
          </div>
        </div>

        {/* Refresh button */}
        <div className="flex justify-end">
          <button
            onClick={loadSizes}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-primary cursor-pointer transition"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            {t('settings.cacheRefresh', { defaultValue: '重新扫描' })}
          </button>
        </div>
      </div>
    </SettingSection>
  )
}

// Shortcuts section component
function ShortcutsSection({ t }: { t: (key: string, opts?: Record<string, unknown>) => string }) {
  const shortcuts = useShortcutStore((s: any) => s.shortcuts)
  const updateShortcut = useShortcutStore((s: any) => s.updateShortcut)
  const toggleShortcut = useShortcutStore((s: any) => s.toggleShortcut)
  const resetDefaults = useShortcutStore((s: any) => s.resetDefaults)
  const enabledModuleIds = useModuleRegistry((s: any) => s.enabledModuleIds)

  const handleShortcutChange = async (action: string, keys: string, enabled: boolean) => {
    updateShortcut(action, keys)
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('update_shortcut', { action, keys, enabled })
      } catch { /* ignore */ }
    }
  }

  const handleToggle = async (action: string, enabled: boolean) => {
    toggleShortcut(action, enabled)
    const sc = shortcuts.find((s: any) => s.action === action)
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('update_shortcut', { action, keys: sc?.keys || '', enabled })
      } catch { /* ignore */ }
    }
  }

  const handleReset = async () => {
    resetDefaults()
    const defaults = useShortcutStore.getState().shortcuts
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        for (const sc of defaults) {
          await invoke('update_shortcut', { action: sc.action, keys: sc.keys, enabled: sc.enabled })
        }
      } catch { /* ignore */ }
    }
  }

  return (
    <SettingSection title={t('settings.shortcuts', { defaultValue: '快捷键' })} icon={Keyboard}>
      <div className="space-y-2">
        {shortcuts.map((sc: any) => {
          const moduleDisabled = sc.moduleId && !enabledModuleIds.has(sc.moduleId)
          return (
            <div
              key={sc.action}
              className={`flex items-center justify-between py-2 ${moduleDisabled ? 'opacity-40 pointer-events-none' : ''}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm text-text-primary">{t(sc.labelI18n)}</span>
                {sc.descriptionI18n && (
                  <span className="group relative">
                    <Info size={13} className="text-text-disabled cursor-help" />
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-bg-elevated px-2.5 py-1.5 text-xs text-text-secondary shadow-lg border border-border-subtle opacity-0 transition-opacity group-hover:opacity-100">
                      {t(sc.descriptionI18n)}
                    </span>
                  </span>
                )}
                {moduleDisabled && (
                  <span className="text-xs text-text-disabled">
                    ({t('settings.shortcutModuleDisabled', { defaultValue: '模块已关闭' })})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <KeyCapture
                  value={sc.keys}
                  onChange={(keys: string) => handleShortcutChange(sc.action, keys, sc.enabled)}
                  onCancel={() => {}}
                />
                <Toggle
                  checked={sc.enabled}
                  onChange={(v: boolean) => handleToggle(sc.action, v)}
                />
              </div>
            </div>
          )
        })}
        <div className="flex justify-end pt-2">
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-primary cursor-pointer transition"
          >
            <RotateCcw size={12} />
            {t('settings.shortcutsReset', { defaultValue: '重置默认' })}
          </button>
        </div>
      </div>
    </SettingSection>
  )
}
