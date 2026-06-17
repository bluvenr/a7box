/**
 * UUID/ID Generator Module Registration
 */
import { Binary } from 'lucide-react'
import type { A7Module } from '../../core/types'

export const uuidGeneratorModule: A7Module = {
  meta: {
    id: 'uuid-generator',
    name: 'UUID Generator',
    nameI18n: 'modules.uuidGenerator.name',
    description: 'Generate UUID v4, NanoID, and unique identifiers',
    descriptionI18n: 'modules.uuidGenerator.description',
    icon: Binary,
    category: 'text',
    tags: ['uuid', 'nanoid', 'id', 'unique', 'random', 'guid'],
    version: '1.0.0',
    enabledByDefault: true,
  },
  commands: [
    {
      id: 'open',
      label: 'UUID Generator',
      labelI18n: 'modules.uuidGenerator.commands.open',
      description: 'Generate unique identifiers',
      icon: Binary,
      run: async (ctx) => { ctx.navigate('/uuid-generator') },
    },
  ],
  component: () => import('./UuidGenerator'),
}
