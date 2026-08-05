/**
 * Clipboard Manager — "Copy as" transform menu.
 * Fetches full (decrypted) content, applies the transform, copies via Rust
 * with self-write suppression so no ghost record is created.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ClipEntry } from '../types'
import * as bridge from '../bridge'
import { applyTransform, TRANSFORM_ORDER, type TransformId } from '../utils/transforms'

const TRANSFORM_LABELS: Record<TransformId, string> = {
  base64: 'Base64',
  'url-encode': 'URL encoded',
  'json-string': 'JSON string',
  upper: 'UPPERCASE',
  lower: 'lowercase',
  title: 'Title Case',
  snake: 'snake_case',
  kebab: 'kebab-case',
  camel: 'camelCase',
  'md-code': 'Markdown code block',
  'md-link': 'Markdown link',
}

export function transformLabel(id: TransformId, t: (k: string, o?: any) => string): string {
  return t(`modules.clipboardManager.transform.${id}`, {
    defaultValue: TRANSFORM_LABELS[id] ?? id,
  })
}

/** Copy a clip's content after applying a transform. Returns true on success. */
export async function copyAsTransform(clip: ClipEntry, id: TransformId): Promise<boolean> {
  if (clip.clipType !== 'text') return false
  // List previews may be truncated — always fetch the full content first
  const full = await bridge.getClip(clip.id)
  const text = full?.content ?? clip.content
  if (!text) return false
  await bridge.copyText(applyTransform(id, text))
  return true
}

/** Dropdown body listing all transforms; rendered by popup / context menus. */
export function TransformList({
  clip,
  onDone,
}: {
  clip: ClipEntry
  onDone: (ok: boolean) => void
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<TransformId | null>(null)

  const disabled = clip.clipType !== 'text'

  return (
    <div className="flex flex-col py-0.5">
      <div className="px-2.5 py-1 text-[9px] uppercase tracking-wide text-text-disabled">
        {t('modules.clipboardManager.copyAs', { defaultValue: 'Copy as' })}
      </div>
      {TRANSFORM_ORDER.map((id) => (
        <button
          key={id}
          disabled={disabled || busy !== null}
          onClick={async () => {
            setBusy(id)
            const ok = await copyAsTransform(clip, id)
            setBusy(null)
            onDone(ok)
          }}
          className="flex items-center gap-2 px-2.5 py-1 text-left text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <span className="w-24 shrink-0 font-mono text-[9px] text-text-disabled">
            {busy === id ? '…' : ''}
          </span>
          {transformLabel(id, t)}
        </button>
      ))}
    </div>
  )
}
