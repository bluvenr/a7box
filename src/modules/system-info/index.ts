/**
 * System Info Module Registration
 */
import { MonitorSmartphone } from 'lucide-react'
import type { A7Module } from '../../core/types'

export const systemInfoModule: A7Module = {
  meta: {
    id: 'system-info',
    name: 'System Info',
    nameI18n: 'modules.systemInfo.name',
    description: 'Performance, network, storage, display, battery and device diagnostics',
    descriptionI18n: 'modules.systemInfo.description',
    icon: MonitorSmartphone,
    category: 'misc',
    tags: ['system', 'network', 'device', 'battery', 'storage', 'display', 'ip', 'resolution'],
    version: '1.0.0',
    enabledByDefault: true,
  },
  commands: [
    {
      id: 'open',
      label: 'System Info',
      labelI18n: 'modules.systemInfo.commands.open',
      description: 'View network and device information',
      descriptionI18n: 'modules.systemInfo.commands.openDesc',
      icon: MonitorSmartphone,
      run: async (ctx) => { ctx.navigate('/system-info') },
    },
  ],
  component: () => import('./SystemInfo'),
}
