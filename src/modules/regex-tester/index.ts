/**
 * Regex Tester Module Registration
 */
import { Regex } from 'lucide-react'
import type { A7Module } from '../../core/types'

export const regexTesterModule: A7Module = {
  meta: {
    id: 'regex-tester',
    name: 'Regex Tester',
    nameI18n: 'modules.regexTester.name',
    description: 'Test and debug regular expressions with live matching',
    descriptionI18n: 'modules.regexTester.description',
    icon: Regex,
    category: 'text',
    tags: ['regex', 'regexp', 'pattern', 'match', 'test'],
    version: '1.0.0',
    enabledByDefault: true,
  },
  commands: [
    {
      id: 'open',
      label: 'Regex Tester',
      labelI18n: 'modules.regexTester.commands.open',
      description: 'Test regular expressions',
      icon: Regex,
      run: async (ctx) => { ctx.navigate('/regex-tester') },
    },
  ],
  component: () => import('./RegexTester'),
}
