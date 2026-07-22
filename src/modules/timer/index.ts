/**
 * Timer Module Registration
 */
import { Timer } from 'lucide-react'
import type { A7Module } from '../../core/types'

export const timerModule: A7Module = {
  meta: {
    id: 'timer',
    name: 'Timer',
    nameI18n: 'modules.timer.name',
    description: 'Countdown timers and stopwatch for time management',
    descriptionI18n: 'modules.timer.description',
    icon: Timer,
    category: 'misc',
    tags: ['timer', 'countdown', 'stopwatch', 'alarm', 'pomodoro', 'clock'],
    version: '1.0.0',
    enabledByDefault: true,
  },
  commands: [
    {
      id: 'open',
      label: 'Timer',
      labelI18n: 'modules.timer.commands.open',
      description: 'Open countdown timers and stopwatch',
      descriptionI18n: 'modules.timer.commands.openDesc',
      icon: Timer,
      run: async (ctx) => { ctx.navigate('/timer') },
    },
  ],
  component: () => import('./Timer'),
}
