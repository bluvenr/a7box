/**
 * A7Box i18n Type Safety
 *
 * Augments react-i18next with the actual zh-CN resource shape,
 * so every `t('some.key')` call is type-checked at compile time.
 *
 * Invalid keys will produce TypeScript errors immediately.
 */

import 'react-i18next'
import type zhCN from '../../locales/zh-CN.json'

declare module 'react-i18next' {
  interface CustomTypeOptions {
    resources: {
      translation: typeof zhCN
    }
  }
}
