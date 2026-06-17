/**
 * P2P LAN Transfer Module Registration
 */
import { Wifi } from 'lucide-react'
import type { A7Module } from '../../core/types'

export const p2pTransferModule: A7Module = {
  meta: {
    id: 'p2p-transfer',
    name: 'LAN Transfer',
    nameI18n: 'modules.p2p.name',
    description: 'Peer-to-peer file transfer over LAN',
    descriptionI18n: 'modules.p2p.description',
    icon: Wifi,
    category: 'network',
    tags: ['p2p', 'lan', 'transfer', 'file', 'share', 'peer'],
    version: '1.0.0',
    enabledByDefault: true,
  },
  commands: [
    {
      id: 'open',
      label: 'LAN Transfer',
      labelI18n: 'modules.p2p.commands.open',
      description: 'Open P2P LAN transfer',
      icon: Wifi,
      run: async (ctx) => { ctx.navigate('/p2p-transfer') },
    },
  ],
  component: () => import('./P2PTransfer'),
}
