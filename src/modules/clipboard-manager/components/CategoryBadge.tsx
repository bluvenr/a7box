/**
 * Clipboard Manager — Category badge with i18n label and themed color.
 */
import { useTranslation } from 'react-i18next'
import type { ClipCategory } from '../types'

const CATEGORY_STYLES: Record<ClipCategory, string> = {
  general: 'bg-bg-hover text-text-muted',
  url: 'bg-info/10 text-info',
  code: 'bg-warning/10 text-warning',
  json: 'bg-success/10 text-success',
  email: 'bg-info/10 text-info',
  'file-path': 'bg-bg-hover text-text-secondary',
  color: 'bg-primary/10 text-primary',
  secret: 'bg-error/10 text-error',
}

const CATEGORY_LABELS: Record<ClipCategory, string> = {
  general: 'General',
  url: 'URL',
  code: 'Code',
  json: 'JSON',
  email: 'Email',
  'file-path': 'File path',
  color: 'Color',
  secret: 'Secret',
}

export function CategoryBadge({ category }: { category: ClipCategory }) {
  const { t } = useTranslation()
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[9px] font-medium leading-none ${CATEGORY_STYLES[category] ?? CATEGORY_STYLES.general}`}
    >
      {t(`modules.clipboardManager.category.${category}`, {
        defaultValue: CATEGORY_LABELS[category] ?? category,
      })}
    </span>
  )
}
