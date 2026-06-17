/**
 * Screenshot Tool Module Registration
 */
import { Camera } from 'lucide-react'
import type { A7Module } from '../../core/types'

export const screenshotModule: A7Module = {
  meta: {
    id: 'screenshot',
    name: 'Screenshot',
    nameI18n: 'modules.screenshot.name',
    description: 'Capture full screen or region screenshots',
    descriptionI18n: 'modules.screenshot.description',
    icon: Camera,
    category: 'screen',
    tags: ['screenshot', 'capture', 'screen', 'snap'],
    version: '1.0.0',
    enabledByDefault: true,
  },
  commands: [
    {
      id: 'open',
      label: 'Screenshot',
      labelI18n: 'modules.screenshot.commands.open',
      description: 'Capture screenshots',
      icon: Camera,
      run: async (ctx) => { ctx.navigate('/screenshot') },
    },
  ],
  component: () => import('./Screenshot'),
}
