/**
 * A7Box Settings Page
 */

import { useTranslation } from 'react-i18next'
import { useSettingsStore, SUPPORTED_LANGUAGES, changeLanguage } from '../../core'
import { useModuleRegistry } from '../../core/registry'
import { Globe, Palette, Box, Info } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export default function Settings() {
  const { t } = useTranslation()
  const settings = useSettingsStore()
  const modulesMap = useModuleRegistry((state) => state.modules)

  // Stable selector: derive array from Map reference
  const allModules = Array.from(modulesMap.values())

  return (
    <div className="h-full overflow-auto p-8">
      <h1 className="mb-8 text-2xl font-bold text-text-primary">
        {t('settings.title')}
      </h1>

      <div className="max-w-2xl space-y-8">
        {/* General settings */}
        <SettingSection title={t('settings.general')} icon={Globe}>
          {/* Language selection */}
          <SettingRow
            label={t('settings.language')}
            description="Select interface display language"
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
              onChange={(v) => settings.updateSetting('autoStart', v)}
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

        {/* Appearance settings */}
        <SettingSection title={t('settings.appearance')} icon={Palette}>
          <SettingRow label={t('settings.theme')} description="Select app theme">
            <select
              value={settings.theme}
              onChange={(e) =>
                settings.updateSetting('theme', e.target.value as 'dark' | 'light' | 'system')
              }
              className="rounded-md border border-border-base bg-bg-elevated px-3 py-1.5 text-sm text-text-primary focus:border-border-focus focus:outline-none"
            >
              <option value="dark">Dark Mode</option>
              <option value="light">Light Mode</option>
              <option value="system">Follow System</option>
            </select>
          </SettingRow>

          <SettingRow label="Font Size" description="Adjust interface font size">
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

        {/* Module management */}
        <SettingSection title={t('settings.modules')} icon={Box}>
          {allModules.map((mod) => (
            <SettingRow
              key={mod.meta.id}
              label={mod.meta.name}
              description={mod.meta.description}
            >
              <Toggle
                checked={settings.isModuleEnabled(mod.meta.id)}
                onChange={(v) => settings.setModuleEnabled(mod.meta.id, v)}
              />
            </SettingRow>
          ))}
          {allModules.length === 0 && (
            <p className="py-4 text-center text-sm text-text-muted">No available modules</p>
          )}
        </SettingSection>

        {/* About */}
        <SettingSection title={t('common.about')} icon={Info}>
          <div className="space-y-2 text-sm">
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
              GitHub Repository
            </a>
          </div>
        </SettingSection>
      </div>
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
