/**
 * Image Compress Module Registration
 */

import { ImageDown } from 'lucide-react'
import type { A7Module } from '../../core/types'

export const imageCompressModule: A7Module = {
  meta: {
    id: 'image-compress',
    name: 'Image Compress',
    nameI18n: 'modules.imageCompress.name',
    description: 'Compress and convert images with quality control',
    descriptionI18n: 'modules.imageCompress.description',
    icon: ImageDown,
    category: 'image',
    tags: ['image', 'compress', 'resize', 'convert', 'png', 'jpg', 'webp'],
    version: '1.0.0',
    enabledByDefault: true,
  },

  commands: [
    {
      id: 'open',
      label: 'Image Compress',
      labelI18n: 'modules.imageCompress.commands.open',
      description: 'Compress and convert images',
      icon: ImageDown,
      run: async (ctx) => {
        ctx.navigate('/image-compress')
      },
    },
  ],

  component: () => import('./ImageCompress'),
}
