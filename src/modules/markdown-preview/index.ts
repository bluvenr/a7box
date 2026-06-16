/**
 * Markdown Preview Module Registration
 */

import { FileText } from 'lucide-react'
import type { A7Module } from '../../core/types'

export const markdownPreviewModule: A7Module = {
  meta: {
    id: 'markdown-preview',
    name: 'Markdown Preview',
    nameI18n: 'modules.markdownPreview.name',
    description: 'Live markdown preview with syntax highlighting',
    descriptionI18n: 'modules.markdownPreview.description',
    icon: FileText,
    category: 'text',
    tags: ['markdown', 'preview', 'render', 'html', 'editor'],
    version: '1.0.0',
    enabledByDefault: true,
  },

  commands: [
    {
      id: 'open',
      label: 'Markdown Preview',
      labelI18n: 'modules.markdownPreview.commands.open',
      description: 'Open markdown editor with live preview',
      icon: FileText,
      run: async (ctx) => {
        ctx.navigate('/markdown-preview')
      },
    },
  ],

  component: () => import('./MarkdownPreview'),
}
