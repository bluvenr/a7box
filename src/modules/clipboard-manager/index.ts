/**
 * Clipboard Manager Module Registration
 */

import { ClipboardList, Layers, Search } from 'lucide-react'
import type { A7Module } from '../../core/types'
import { startClipboardManager, stopClipboardManager, setModuleEnabled, openPopup } from './bridge'

export const clipboardManagerModule: A7Module = {
  meta: {
    id: 'clipboard-manager',
    name: 'Clipboard Manager',
    nameI18n: 'modules.clipboardManager.name',
    description: 'Clipboard history, quick paste, snippets and automation rules',
    descriptionI18n: 'modules.clipboardManager.description',
    icon: ClipboardList,
    category: 'misc',
    tags: [
      'clipboard',
      'history',
      'paste',
      'snippet',
      '剪贴板',
      '复制',
      '粘贴',
      '片段',
      '历史',
    ],
    version: '1.0.0',
    enabledByDefault: true,
  },

  commands: [
    {
      id: 'open-popup',
      label: 'Open Clipboard Popup',
      labelI18n: 'modules.clipboardManager.commands.openPopup',
      description: 'Open the quick clipboard history popup',
      descriptionI18n: 'modules.clipboardManager.commands.openPopupDesc',
      icon: Search,
      shortcut: 'Alt+V',
      run: async () => {
        await openPopup()
      },
    },
    {
      id: 'paste-stack',
      label: 'Paste Stack',
      labelI18n: 'modules.clipboardManager.commands.pasteStack',
      description: 'Queue multiple entries and paste them sequentially',
      descriptionI18n: 'modules.clipboardManager.commands.pasteStackDesc',
      icon: Layers,
      shortcut: 'Alt+Shift+V',
      run: async () => {
        await openPopup('paste-stack')
      },
    },
  ],

  component: () => import('./ClipboardManager'),

  onActivate: async () => {
    await setModuleEnabled(true)
    await startClipboardManager()
  },

  onDeactivate: async () => {
    // Stops the watcher and closes the popup window if open (Rust side)
    await setModuleEnabled(false)
    await stopClipboardManager()
  },
}
