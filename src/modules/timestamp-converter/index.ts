/**
 * Timestamp Converter Module Registration
 */
import { CalendarClock } from 'lucide-react'
import type { A7Module } from '../../core/types'

export const timestampConverterModule: A7Module = {
  meta: {
    id: 'timestamp-converter',
    name: 'Timestamp Converter',
    nameI18n: 'modules.timestampConverter.name',
    description: 'Convert between Unix timestamps and human-readable dates',
    descriptionI18n: 'modules.timestampConverter.description',
    icon: CalendarClock,
    category: 'text',
    tags: ['timestamp', 'unix', 'epoch', 'date', 'time', 'convert'],
    version: '1.0.0',
    enabledByDefault: true,
  },
  commands: [
    {
      id: 'open',
      label: 'Timestamp Converter',
      labelI18n: 'modules.timestampConverter.commands.open',
      description: 'Convert timestamps and dates',
      icon: CalendarClock,
      run: async (ctx) => { ctx.navigate('/timestamp-converter') },
    },
  ],
  component: () => import('./TimestampConverter'),
}
