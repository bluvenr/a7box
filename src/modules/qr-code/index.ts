/**
 * QR Code Module Registration
 */

import { QrCode } from 'lucide-react'
import type { A7Module } from '../../core/types'

export const qrCodeModule: A7Module = {
  meta: {
    id: 'qr-code',
    name: 'QR Code',
    nameI18n: 'modules.qrCode.name',
    description: 'Generate and decode QR codes',
    descriptionI18n: 'modules.qrCode.description',
    icon: QrCode,
    category: 'text',
    tags: ['qr', 'qrcode', 'barcode', 'scan', 'wifi'],
    version: '1.0.0',
    enabledByDefault: true,
  },

  commands: [
    {
      id: 'generate',
      label: 'Generate QR Code',
      labelI18n: 'modules.qrCode.commands.generate',
      description: 'Generate a QR code from text or URL',
      icon: QrCode,
      run: async (ctx) => {
        ctx.navigate('/qr-code')
      },
    },
    {
      id: 'decode',
      label: 'Decode QR Code',
      labelI18n: 'modules.qrCode.commands.decode',
      description: 'Decode a QR code from an image',
      run: async (ctx) => {
        ctx.navigate('/qr-code?tab=decode')
      },
    },
  ],

  component: () => import('./QrCode'),
}
