/**
 * JSON Formatter Module Registration
 */

import { Braces } from 'lucide-react'
import type { A7Module } from '../../core/types'

export const jsonFormatterModule: A7Module = {
  meta: {
    id: 'json-formatter',
    name: 'JSON Formatter',
    nameI18n: 'modules.jsonFormatter.name',
    description: 'Auto-format or compress JSON data with syntax validation',
    descriptionI18n: 'modules.jsonFormatter.description',
    icon: Braces,
    category: 'text',
    tags: ['json', 'format', 'compress', 'beautify', 'validate'],
    version: '1.0.0',
    enabledByDefault: true,
  },

  commands: [
    {
      id: 'format',
      label: 'Format JSON',
      labelI18n: 'modules.jsonFormatter.commands.format',
      description: 'Format JSON data for readability',
      descriptionI18n: 'modules.jsonFormatter.commands.formatDesc',
      icon: Braces,
      shortcut: 'CommandOrControl+Shift+J',
      run: async (ctx) => {
        if (ctx.clipboardText) {
          try {
            const formatted = JSON.stringify(JSON.parse(ctx.clipboardText), null, 2)
            await navigator.clipboard.writeText(formatted)
            return
          } catch {
            // Invalid JSON, open editor
          }
        }
        ctx.navigate('/json-formatter')
      },
    },
    {
      id: 'compress',
      label: 'Compress JSON',
      labelI18n: 'modules.jsonFormatter.commands.compress',
      description: 'Compress JSON data to single line',
      descriptionI18n: 'modules.jsonFormatter.commands.compressDesc',
      run: async (ctx) => {
        if (ctx.clipboardText) {
          try {
            const compressed = JSON.stringify(JSON.parse(ctx.clipboardText))
            await navigator.clipboard.writeText(compressed)
            return
          } catch {
            // Invalid JSON, open editor
          }
        }
        ctx.navigate('/json-formatter')
      },
    },
  ],

  component: () => import('./JsonFormatter'),

  settings: [
    {
      key: 'autoFormat',
      label: 'Auto Format',
      labelI18n: 'modules.jsonFormatter.settings.autoFormat',
      type: 'switch',
      defaultValue: false,
      description: 'Auto-format when JSON detected in clipboard',
      descriptionI18n: 'modules.jsonFormatter.settings.autoFormatDesc',
    },
    {
      key: 'indentSize',
      label: 'Indent Size',
      labelI18n: 'modules.jsonFormatter.settings.indentSize',
      type: 'select',
      defaultValue: '2spaces',
      options: [
        { label: '2 Spaces', value: '2spaces' },
        { label: '4 Spaces', value: '4spaces' },
        { label: 'Tab', value: 'tab' },
      ],
    },
  ],

  onClipboard: async (_text: string) => {
    // Reserved for future: auto-format when JSON detected in clipboard
    // Controlled by settings.autoFormat toggle
  },
}
