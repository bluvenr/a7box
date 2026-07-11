/**
 * A7Box Module Registry
 * Manages registration, enable/disable, and command collection for all tool modules
 */

import { create } from 'zustand'
import type { A7Module, CommandSearchItem } from '../types'
import { i18n } from '../i18n'
import { useSettingsStore } from '../settings/settingsStore'

interface ModuleRegistryState {
  /** All registered modules */
  modules: Map<string, A7Module>
  /** Set of enabled module IDs */
  enabledModuleIds: Set<string>

  /** Register a single module */
  register: (module: A7Module) => void
  /** Register multiple modules */
  registerAll: (modules: A7Module[]) => void
  /** Enable a module */
  enable: (moduleId: string) => Promise<void>
  /** Disable a module */
  disable: (moduleId: string) => Promise<void>
  /** Get a single module */
  getModule: (moduleId: string) => A7Module | undefined
  /** Get all modules */
  getAllModules: () => A7Module[]
  /** Get all enabled modules */
  getEnabledModules: () => A7Module[]
  /** Get all commands (flattened, for command palette) */
  getAllCommands: () => CommandSearchItem[]
}

export const useModuleRegistry = create<ModuleRegistryState>((set, get) => ({
  modules: new Map(),
  enabledModuleIds: new Set(),

  register: (module) => {
    const settings = useSettingsStore.getState()
    set((state) => {
      const newModules = new Map(state.modules)
      newModules.set(module.meta.id, module)
      const newEnabled = new Set(state.enabledModuleIds)
      // Use settingsStore as source of truth (defaults to true for new modules)
      if (settings.isModuleEnabled(module.meta.id)) {
        newEnabled.add(module.meta.id)
      }
      return { modules: newModules, enabledModuleIds: newEnabled }
    })
  },

  registerAll: (modules) => {
    const settings = useSettingsStore.getState()
    // Sync module order: add new modules, remove deleted ones
    settings.syncModuleOrder(modules.map((m) => m.meta.id))
    set((state) => {
      const newModules = new Map(state.modules)
      const newEnabled = new Set<string>()
      modules.forEach((module) => {
        newModules.set(module.meta.id, module)
        // Use settingsStore as source of truth (defaults to true for new modules)
        if (settings.isModuleEnabled(module.meta.id)) {
          newEnabled.add(module.meta.id)
        }
      })
      return { modules: newModules, enabledModuleIds: newEnabled }
    })
  },

  enable: async (moduleId) => {
    const module = get().modules.get(moduleId)
    if (!module) return
    await module.onActivate?.()
    // Write to settingsStore (source of truth) so state persists across restarts
    useSettingsStore.getState().setModuleEnabled(moduleId, true)
    set((state) => {
      const newEnabled = new Set(state.enabledModuleIds)
      newEnabled.add(moduleId)
      return { enabledModuleIds: newEnabled }
    })
  },

  disable: async (moduleId) => {
    const module = get().modules.get(moduleId)
    if (!module) return
    await module.onDeactivate?.()
    // Write to settingsStore (source of truth) so state persists across restarts
    useSettingsStore.getState().setModuleEnabled(moduleId, false)
    set((state) => {
      const newEnabled = new Set(state.enabledModuleIds)
      newEnabled.delete(moduleId)
      return { enabledModuleIds: newEnabled }
    })
  },

  getModule: (moduleId) => {
    return get().modules.get(moduleId)
  },

  getAllModules: () => {
    return Array.from(get().modules.values())
  },

  getEnabledModules: () => {
    const { modules, enabledModuleIds } = get()
    return Array.from(modules.values()).filter((m) => enabledModuleIds.has(m.meta.id))
  },

  getAllCommands: () => {
    const enabledModules = get().getEnabledModules()
    return enabledModules.flatMap((mod) =>
      mod.commands
        .filter((cmd) => !cmd.when || cmd.when())
        .map((cmd) => ({
          id: `${mod.meta.id}:${cmd.id}`,
          moduleId: mod.meta.id,
          moduleName: mod.meta.nameI18n ? i18n.t(mod.meta.nameI18n) : mod.meta.name,
          moduleIcon: mod.meta.icon,
          label: cmd.labelI18n ? i18n.t(cmd.labelI18n) : cmd.label,
          description: cmd.descriptionI18n ? i18n.t(cmd.descriptionI18n) : cmd.description,
          icon: cmd.icon,
          shortcut: cmd.shortcut,
          tags: mod.meta.tags,
          run: cmd.run,
        }))
    )
  },
}))
