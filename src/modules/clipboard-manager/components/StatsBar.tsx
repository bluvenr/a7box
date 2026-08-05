/**
 * Clipboard Manager — Stats summary bar for the main page header.
 */
import { useTranslation } from 'react-i18next'
import { Database, Pin, ShieldAlert } from 'lucide-react'
import { useClipboardStore } from '../clipboardStore'

export function StatsBar() {
  const { t } = useTranslation()
  const stats = useClipboardStore((s) => s.stats)

  if (!stats) return null

  const imageCount = stats.byType.find(([k]) => k === 'image')?.[1] ?? 0

  return (
    <div className="flex items-center gap-3 text-[10px] text-text-muted">
      <span className="inline-flex items-center gap-1">
        <Database size={11} />
        {t('modules.clipboardManager.statsTotal', {
          defaultValue: '{{count}} entries',
          count: stats.total,
        })}
      </span>
      <span className="inline-flex items-center gap-1">
        <Pin size={11} />
        {t('modules.clipboardManager.statsPinned', {
          defaultValue: '{{count}} pinned',
          count: stats.pinned,
        })}
      </span>
      {stats.secrets > 0 && (
        <span className="inline-flex items-center gap-1 text-error">
          <ShieldAlert size={11} />
          {t('modules.clipboardManager.statsSecrets', {
            defaultValue: '{{count}} secrets',
            count: stats.secrets,
          })}
        </span>
      )}
      {imageCount > 0 && (
        <span>
          {t('modules.clipboardManager.statsImages', {
            defaultValue: '{{count}} images',
            count: imageCount,
          })}
        </span>
      )}
    </div>
  )
}
