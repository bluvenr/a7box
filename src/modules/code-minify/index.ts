/**
 * Code Minify/Beautify Module Registration
 */

import { Minimize2 } from 'lucide-react'
import type { A7Module } from '../../core/types'

export const codeMinifyModule: A7Module = {
  meta: {
    id: 'code-minify',
    name: 'Code Minify/Beautify',
    nameI18n: 'modules.codeMinify.name',
    description: 'Minify or beautify JavaScript, TypeScript, CSS, HTML and JSON code',
    descriptionI18n: 'modules.codeMinify.description',
    icon: Minimize2,
    category: 'text',
    tags: ['code', 'minify', 'beautify', 'compress', 'format', 'javascript', 'typescript', 'css', 'html', 'json'],
    version: '1.0.0',
    enabledByDefault: true,
  },

  commands: [
    {
      id: 'open',
      label: 'Code Minify/Beautify',
      labelI18n: 'modules.codeMinify.commands.open',
      description: 'Minify or beautify code',
      icon: Minimize2,
      run: async (ctx) => {
        ctx.navigate('/code-minify')
      },
    },
  ],

  component: () => import('./CodeMinify'),
}
