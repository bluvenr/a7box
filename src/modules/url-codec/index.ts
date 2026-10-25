/**
 * URL Codec Module Registration
 */
import { Link } from 'lucide-react'
import type { A7Module } from '../../core/types'

export const urlCodecModule: A7Module = {
  meta: {
    id: 'url-codec',
    name: 'URL Codec',
    nameI18n: 'modules.urlCodec.name',
    description: 'URL encode/decode and query parameter parsing',
    descriptionI18n: 'modules.urlCodec.description',
    icon: Link,
    category: 'dev',
    tags: ['url', 'encode', 'decode', 'uri', 'query', 'parameter'],
    version: '1.0.0',
    enabledByDefault: true,
  },
  commands: [
    {
      id: 'open',
      label: 'URL Codec',
      labelI18n: 'modules.urlCodec.commands.open',
      description: 'URL encode/decode',
      descriptionI18n: 'modules.urlCodec.commands.openDesc',
      icon: Link,
      run: async (ctx) => { ctx.navigate('/url-codec') },
    },
  ],
  component: () => import('./UrlCodec'),
}
