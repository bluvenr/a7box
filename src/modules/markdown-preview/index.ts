/**
 * Markdown Editor Module Registration
 */

import { FileText } from 'lucide-react'
import type { A7Module } from '../../core/types'

export const markdownPreviewModule: A7Module = {
  meta: {
    id: 'markdown-preview',
    name: 'Markdown Editor',
    nameI18n: 'modules.markdownPreview.name',
    description: 'Markdown editor with live preview, HTML conversion and file management',
    descriptionI18n: 'modules.markdownPreview.description',
    icon: FileText,
    category: 'text',
    tags: ['markdown', 'preview', 'render', 'html', 'editor', 'convert'],
    version: '2.0.0',
    enabledByDefault: true,
  },

  commands: [
    {
      id: 'open',
      label: 'Markdown Editor',
      labelI18n: 'modules.markdownPreview.commands.open',
      description: 'Open markdown editor with live preview and HTML conversion',
      descriptionI18n: 'modules.markdownPreview.commands.openDesc',
      icon: FileText,
      run: async (ctx) => {
        ctx.navigate('/markdown-preview')
      },
    },
  ],

  component: () => import('./MarkdownPreview'),
}
