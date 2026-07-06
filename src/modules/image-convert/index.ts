/**
 * Image Convert Module Registration
 */
import { ImageIcon } from 'lucide-react'
import type { A7Module } from '../../core/types'

export const imageConvertModule: A7Module = {
  meta: {
    id: 'image-convert',
    name: 'Image Convert',
    nameI18n: 'modules.imageConvert.name',
    description: 'Convert images between PNG, JPG, WebP and ICO formats',
    descriptionI18n: 'modules.imageConvert.description',
    icon: ImageIcon,
    category: 'image',
    tags: ['image', 'convert', 'png', 'jpg', 'webp', 'ico', 'format', 'favicon'],
    version: '1.1.0',
    enabledByDefault: true,
  },
  commands: [
    {
      id: 'open',
      label: 'Image Convert',
      labelI18n: 'modules.imageConvert.commands.open',
      description: 'Convert image formats',
      descriptionI18n: 'modules.imageConvert.commands.openDesc',
      icon: ImageIcon,
      run: async (ctx) => { ctx.navigate('/image-convert') },
    },
  ],
  component: () => import('./ImageConvert'),
}
