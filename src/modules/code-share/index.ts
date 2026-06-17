/**
 * Code Share Module Registration
 */
import { Share2 } from 'lucide-react'
import type { A7Module } from '../../core/types'

export const codeShareModule: A7Module = {
  meta: {
    id: 'code-share',
    name: 'Code Share',
    nameI18n: 'modules.codeShare.name',
    description: 'Share code snippets via paste service',
    descriptionI18n: 'modules.codeShare.description',
    icon: Share2,
    category: 'dev',
    tags: ['code', 'share', 'paste', 'snippet', 'gist'],
    version: '1.0.0',
    enabledByDefault: true,
  },
  commands: [
    {
      id: 'open',
      label: 'Code Share',
      labelI18n: 'modules.codeShare.commands.open',
      description: 'Share code snippets',
      icon: Share2,
      run: async (ctx) => { ctx.navigate('/code-share') },
    },
  ],
  component: () => import('./CodeShare'),
}
