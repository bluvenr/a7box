/**
 * Reminder Module Registration
 */
import { Bell } from 'lucide-react'
import type { A7Module } from '../../core/types'

export const reminderModule: A7Module = {
  meta: {
    id: 'reminder',
    name: 'Reminder',
    nameI18n: 'modules.reminder.name',
    description: 'Set reminders with notifications and repeat schedules',
    descriptionI18n: 'modules.reminder.description',
    icon: Bell,
    category: 'misc',
    tags: ['reminder', 'notification', 'alarm', 'schedule', 'todo', 'repeat'],
    version: '1.0.0',
    enabledByDefault: true,
  },
  commands: [
    {
      id: 'open',
      label: 'Reminder',
      labelI18n: 'modules.reminder.commands.open',
      description: 'Manage reminders and notifications',
      descriptionI18n: 'modules.reminder.commands.openDesc',
      icon: Bell,
      run: async (ctx) => { ctx.navigate('/reminder') },
    },
  ],
  component: () => import('./Reminder'),
}
