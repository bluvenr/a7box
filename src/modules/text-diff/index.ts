/**
 * Text Diff Module Registration
 */
import { FileDiff } from 'lucide-react'
import type { A7Module } from '../../core/types'

export const textDiffModule: A7Module = {
  meta: {
    id: 'text-diff',
    name: 'Text Diff',
    nameI18n: 'modules.textDiff.name',
    description: 'Compare two texts and highlight differences',
    descriptionI18n: 'modules.textDiff.description',
    icon: FileDiff,
    category: 'text',
    tags: ['diff', 'compare', 'text', 'difference'],
    version: '1.0.0',
    enabledByDefault: true,
  },
  commands: [
    {
      id: 'open',
      label: 'Text Diff',
      labelI18n: 'modules.textDiff.commands.open',
      description: 'Compare two texts',
      descriptionI18n: 'modules.textDiff.commands.openDesc',
      icon: FileDiff,
      run: async (ctx) => { ctx.navigate('/text-diff') },
    },
  ],
  component: () => import('./TextDiff'),
}
