/**
 * Clipboard Manager — Snippet create/edit modal.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { useSnippetStore, extractVariables } from '../snippetStore'
import type { SnippetEntry } from '../types'

function newSnippet(): SnippetEntry {
  return {
    id: '',
    name: '',
    content: '',
    variables: [],
    createdAt: Date.now(),
  }
}

export function SnippetEditor({
  snippet,
  onClose,
}: {
  snippet: SnippetEntry | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const save = useSnippetStore((s) => s.save)
  const [draft, setDraft] = useState<SnippetEntry>(() => snippet ?? newSnippet())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(snippet ?? newSnippet())
  }, [snippet])

  const variables = extractVariables(draft.content)

  const handleSave = async () => {
    if (!draft.name.trim() || !draft.content.trim()) return
    setSaving(true)
    await save({ ...draft, name: draft.name.trim(), variables })
    setSaving(false)
    onClose()
  }

  const inputCls =
    'w-full rounded-md border border-border-base bg-bg-overlay px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-disabled outline-none focus:border-border-focus transition-colors'

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{ animation: 'dialogFadeIn 0.15s ease-out' }}
    >
      <div
        className="relative w-full max-w-md mx-4 rounded-xl border border-border-subtle bg-bg-elevated p-5 shadow-2xl"
        style={{ animation: 'dialogScaleIn 0.15s ease-out' }}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 p-1 text-text-muted hover:text-text-primary cursor-pointer"
        >
          <X size={14} />
        </button>
        <h3 className="text-sm font-semibold text-text-primary">
          {snippet
            ? t('modules.clipboardManager.editSnippet', { defaultValue: 'Edit snippet' })
            : t('modules.clipboardManager.newSnippet', { defaultValue: 'New snippet' })}
        </h3>

        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-[10px] text-text-muted">
              {t('modules.clipboardManager.snippetName', { defaultValue: 'Name' })}
            </label>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder={t('modules.clipboardManager.snippetNamePh', {
                defaultValue: 'e.g. Email signature',
              })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] text-text-muted">
              {t('modules.clipboardManager.snippetContent', { defaultValue: 'Content' })}
            </label>
            <textarea
              value={draft.content}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              placeholder={t('modules.clipboardManager.snippetContentPh', {
                ph: '{{variable}}',
                defaultValue: 'Use {{ph}} for fill-in fields',
              })}
              rows={5}
              className={`${inputCls} resize-y font-mono`}
            />
            {variables.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {variables.map((v) => (
                  <span
                    key={v}
                    className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] text-primary"
                  >
                    {`{{${v}}}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border-base px-4 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary cursor-pointer transition"
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving || !draft.name.trim() || !draft.content.trim()}
            className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
          >
            {t('common.save', { defaultValue: 'Save' })}
          </button>
        </div>
      </div>
    </div>
  )
}
