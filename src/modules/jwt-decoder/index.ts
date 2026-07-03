/**
 * JWT Decoder Module Registration
 */
import { KeyRound } from 'lucide-react'
import type { A7Module } from '../../core/types'

export const jwtDecoderModule: A7Module = {
  meta: {
    id: 'jwt-decoder',
    name: 'JWT Decoder',
    nameI18n: 'modules.jwtDecoder.name',
    description: 'Decode and inspect JWT tokens',
    descriptionI18n: 'modules.jwtDecoder.description',
    icon: KeyRound,
    category: 'text',
    tags: ['jwt', 'token', 'decode', 'auth', 'bearer'],
    version: '1.0.0',
    enabledByDefault: true,
  },
  commands: [
    {
      id: 'open',
      label: 'JWT Decoder',
      labelI18n: 'modules.jwtDecoder.commands.open',
      description: 'Decode JWT tokens',
      descriptionI18n: 'modules.jwtDecoder.commands.openDesc',
      icon: KeyRound,
      run: async (ctx) => { ctx.navigate('/jwt-decoder') },
    },
  ],
  component: () => import('./JwtDecoder'),
}
