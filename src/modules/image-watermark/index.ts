/**
 * Image Watermark Module Registration
 */

import { Stamp } from 'lucide-react'
import type { A7Module } from '../../core/types'

export const imageWatermarkModule: A7Module = {
  meta: {
    id: 'image-watermark',
    name: 'Image Watermark',
    nameI18n: 'modules.imageWatermark.name',
    description: 'Add text, logo or timestamp watermarks to images',
    descriptionI18n: 'modules.imageWatermark.description',
    icon: Stamp,
    category: 'image',
    tags: ['image', 'watermark', 'text', 'logo', 'timestamp', 'batch', 'copyright'],
    version: '1.0.0',
    enabledByDefault: true,
  },

  commands: [
    {
      id: 'open',
      label: 'Image Watermark',
      labelI18n: 'modules.imageWatermark.commands.open',
      description: 'Add watermarks to images',
      descriptionI18n: 'modules.imageWatermark.commands.openDesc',
      icon: Stamp,
      run: async (ctx) => {
        ctx.navigate('/image-watermark')
      },
    },
  ],

  component: () => import('./ImageWatermark'),
}
