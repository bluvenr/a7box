/**
 * HTTP File Server Module Registration
 */
import { Globe } from 'lucide-react'
import type { A7Module } from '../../core/types'

export const httpServerModule: A7Module = {
  meta: {
    id: 'http-server',
    name: 'HTTP Server',
    nameI18n: 'modules.httpServer.name',
    description: 'Start multiple LAN HTTP servers for local directories',
    descriptionI18n: 'modules.httpServer.description',
    icon: Globe,
    category: 'network',
    tags: ['http', 'server', 'lan', 'share', 'file'],
    version: '1.0.0',
    enabledByDefault: true,
  },
  commands: [
    {
      id: 'open',
      label: 'HTTP Server',
      labelI18n: 'modules.httpServer.commands.open',
      description: 'Start HTTP file server',
      descriptionI18n: 'modules.httpServer.commands.openDesc',
      icon: Globe,
      run: async (ctx) => { ctx.navigate('/http-server') },
    },
  ],
  component: () => import('./HttpServer'),
}
