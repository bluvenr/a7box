/**
 * Hash Generator Module Registration
 */
import { Fingerprint } from 'lucide-react'
import type { A7Module } from '../../core/types'

export const hashGeneratorModule: A7Module = {
  meta: {
    id: 'hash-generator',
    name: 'Hash Generator',
    nameI18n: 'modules.hashGenerator.name',
    description: 'Generate MD5, SHA-1, SHA-256, SHA-512 hashes from text or files',
    descriptionI18n: 'modules.hashGenerator.description',
    icon: Fingerprint,
    category: 'text',
    tags: ['hash', 'md5', 'sha256', 'sha512', 'checksum', 'digest'],
    version: '1.0.0',
    enabledByDefault: true,
  },
  commands: [
    {
      id: 'open',
      label: 'Hash Generator',
      labelI18n: 'modules.hashGenerator.commands.open',
      description: 'Generate cryptographic hashes',
      icon: Fingerprint,
      run: async (ctx) => { ctx.navigate('/hash-generator') },
    },
  ],
  component: () => import('./HashGenerator'),
}
