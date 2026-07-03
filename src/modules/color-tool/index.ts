/**
 * Color Tool Module Registration
 */
import { Palette } from 'lucide-react'
import type { A7Module } from '../../core/types'

export const colorToolModule: A7Module = {
  meta: {
    id: 'color-tool',
    name: 'Color Tool',
    nameI18n: 'modules.colorTool.name',
    description: 'Color picker, format converter and palette generator',
    descriptionI18n: 'modules.colorTool.description',
    icon: Palette,
    category: 'dev',
    tags: ['color', 'hex', 'rgb', 'hsl', 'palette', 'picker', 'contrast'],
    version: '1.0.0',
    enabledByDefault: true,
  },
  commands: [
    {
      id: 'open',
      label: 'Color Tool',
      labelI18n: 'modules.colorTool.commands.open',
      description: 'Color picker and converter',
      descriptionI18n: 'modules.colorTool.commands.openDesc',
      icon: Palette,
      run: async (ctx) => { ctx.navigate('/color-tool') },
    },
  ],
  component: () => import('./ColorTool'),
}
