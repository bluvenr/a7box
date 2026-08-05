/**
 * Clipboard Manager — Masked display for secret entries.
 * Revealed content is fetched decrypted on demand via cm_get_clip.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff } from 'lucide-react'
import * as bridge from '../bridge'

export function SecretMask({
  id,
  preview,
  revealed,
  onToggle,
}: {
  id: string
  preview: string
  revealed: boolean
  onToggle: (id: string, revealed: boolean) => void
}) {
  const { t } = useTranslation()
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleToggle = async () => {
    const next = !revealed
    onToggle(id, next)
    if (next && content === null && !loading) {
      setLoading(true)
      const clip = await bridge.getClip(id)
      setContent(clip?.content ?? '')
      setLoading(false)
    }
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate font-mono text-xs">
        {revealed
          ? loading
            ? t('modules.clipboardManager.loading', { defaultValue: 'Loading…' })
            : content ?? '••••••••'
          : preview || '••••••••'}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          void handleToggle()
        }}
        className="shrink-0 rounded p-0.5 text-text-muted hover:text-text-primary cursor-pointer"
        title={t('modules.clipboardManager.toggleSecret', { defaultValue: 'Show / hide' })}
      >
        {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>
    </span>
  )
}
