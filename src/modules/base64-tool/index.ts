/**
 * Base64 Tool Module Registration
 */
import { Binary } from 'lucide-react'
import type { A7Module } from '../../core/types'

export const base64ToolModule: A7Module = {
  meta: {
    id: 'base64-tool',
    name: 'Base64 Tool',
    nameI18n: 'modules.base64Tool.name',
    description: 'Encode and decode Base64 text, and convert files to/from Base64',
    descriptionI18n: 'modules.base64Tool.description',
    icon: Binary,
    category: 'text',
    tags: ['base64', 'encode', 'decode', 'binary', 'text', 'file'],
    version: '1.0.0',
    enabledByDefault: true,
  },
  commands: [
    {
      id: 'open',
      label: 'Base64 Tool',
      labelI18n: 'modules.base64Tool.commands.open',
      description: 'Base64 encode/decode',
      descriptionI18n: 'modules.base64Tool.commands.openDesc',
      icon: Binary,
      run: async (ctx) => { ctx.navigate('/base64-tool') },
    },
  ],
  component: () => import('./Base64Tool'),
}
