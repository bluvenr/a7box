/**
 * Clipboard Manager — Snippet list with fill-in-variables support.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, Copy, FileText } from 'lucide-react'
import { useSnippetStore, renderSnippet } from '../snippetStore'
import * as bridge from '../bridge'
import { useConfirm, useAlert } from '../../../components/Dialog'
import { SnippetEditor } from './SnippetEditor'
import type { SnippetEntry } from '../types'

/** localStorage key — first-visit guide dismissal is remembered */
const GUIDE_KEY = 'a7box-cm-guide-snippets'

export function SnippetList() {
  const { t } = useTranslation()
  const snippets = useSnippetStore((s) => s.snippets)
  const load = useSnippetStore((s) => s.load)
  const remove = useSnippetStore((s) => s.remove)
  const confirm = useConfirm()
  const alert = useAlert()

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<SnippetEntry | null>(null)
  const [fillTarget, setFillTarget] = useState<SnippetEntry | null>(null)
  const [showGuide, setShowGuide] = useState(() => !localStorage.getItem(GUIDE_KEY))

  const dismissGuide = () => {
    localStorage.setItem(GUIDE_KEY, '1')
    setShowGuide(false)
  }

  useEffect(() => {
    void load()
  }, [load])

  const handleUse = (snippet: SnippetEntry) => {
    if (snippet.variables.length > 0) {
      setFillTarget(snippet)
    } else {
      void bridge.copyText(snippet.content)
      void alert({
        title: t('common.copied', { defaultValue: 'Copied' }),
        message: t('modules.clipboardManager.snippetCopied', {
          defaultValue: 'Snippet copied to clipboard',
        }),
      })
    }
  }

  const handleDelete = async (snippet: SnippetEntry) => {
    const ok = await confirm({
      title: t('modules.clipboardManager.deleteSnippet', { defaultValue: 'Delete snippet' }),
      message: t('modules.clipboardManager.deleteSnippetMsg', {
        defaultValue: 'Delete "{{name}}"?',
        name: snippet.name,
      }),
      danger: true,
      confirmText: t('modules.clipboardManager.actionDelete', { defaultValue: 'Delete' }),
      cancelText: t('common.cancel', { defaultValue: 'Cancel' }),
    })
    if (ok) await remove(snippet.id)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0 text-[11px] text-text-muted">
          {t('modules.clipboardManager.snippetsDesc', {
            ph: '{{name}}',
            defaultValue:
              'Reusable text templates with {{ph}} placeholders — emails, signatures, code boilerplate.',
          })}
          {!showGuide && (
            <button
              onClick={() => setShowGuide(true)}
              className="ml-2 text-text-muted hover:text-primary cursor-pointer transition-colors"
            >
              {t('modules.clipboardManager.guide.viewGuide', { defaultValue: 'View guide' })} →
            </button>
          )}
        </div>
        <button
          onClick={() => {
            setEditing(null)
            setEditorOpen(true)
          }}
          className="flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs text-white hover:bg-primary-hover cursor-pointer transition-colors"
        >
          <Plus size={12} />
          {t('modules.clipboardManager.newSnippet', { defaultValue: 'New snippet' })}
        </button>
      </div>

      {/* First-visit guide */}
      {showGuide && (
        <div className="mb-3 shrink-0 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-primary">
              {t('modules.clipboardManager.snippetGuide.title', {
                defaultValue: 'What are Snippets?',
              })}
            </h3>
            <button
              onClick={dismissGuide}
              className="text-xs text-text-muted hover:text-text-primary cursor-pointer transition-colors"
            >
              ✕
            </button>
          </div>
          <p className="mb-3 text-[11px] leading-relaxed text-text-secondary">
            {t('modules.clipboardManager.snippetGuide.intro', {
              defaultValue:
                'Snippets are reusable text templates. Create once, fill the blanks, paste anywhere.',
            })}
          </p>
          <div className="space-y-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                  {n}
                </span>
                <p className="text-[11px] leading-relaxed text-text-secondary">
                  {t(`modules.clipboardManager.snippetGuide.step${n}`, {
                    ph: '{{name}}',
                    defaultValue: '',
                  })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {snippets.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[11px] text-text-disabled">
              {t('modules.clipboardManager.noSnippets', { defaultValue: 'No snippets yet' })}
            </p>
            <p className="mt-1.5 text-[10px] text-text-disabled">
              {t('modules.clipboardManager.snippetsExample', {
                ph: '{{name}}',
                defaultValue:
                  'e.g. “Hi {{ph}}, thanks for reaching out…” — one click fills the blanks and copies',
              })}
            </p>
          </div>
        ) : (
          snippets.map((snippet) => (
            <div
              key={snippet.id}
              className="group flex items-start gap-2 rounded-md border border-transparent px-2.5 py-2 hover:border-border-base hover:bg-bg-hover/50 transition-colors"
            >
              <FileText size={13} className="mt-0.5 shrink-0 text-text-disabled" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-text-primary">{snippet.name}</span>
                  {snippet.variables.map((v) => (
                    <span
                      key={v}
                      className="rounded bg-primary/10 px-1 py-px font-mono text-[9px] text-primary"
                    >
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
                <p className="mt-0.5 truncate font-mono text-[10px] text-text-muted">
                  {snippet.content}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleUse(snippet)}
                  title={t('modules.clipboardManager.actionCopy', { defaultValue: 'Copy' })}
                  className="rounded p-1 text-text-muted hover:text-text-primary hover:bg-bg-hover cursor-pointer"
                >
                  <Copy size={12} />
                </button>
                <button
                  onClick={() => {
                    setEditing(snippet)
                    setEditorOpen(true)
                  }}
                  title={t('modules.clipboardManager.editSnippet', { defaultValue: 'Edit snippet' })}
                  className="rounded p-1 text-text-muted hover:text-text-primary hover:bg-bg-hover cursor-pointer"
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={() => void handleDelete(snippet)}
                  title={t('modules.clipboardManager.actionDelete', { defaultValue: 'Delete' })}
                  className="rounded p-1 text-text-muted hover:text-error hover:bg-bg-hover cursor-pointer"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {editorOpen && (
        <SnippetEditor snippet={editing} onClose={() => setEditorOpen(false)} />
      )}
      {fillTarget && (
        <FillVariablesDialog snippet={fillTarget} onClose={() => setFillTarget(null)} />
      )}
    </div>
  )
}

/** Prompt for variable values, then copy the rendered snippet. */
function FillVariablesDialog({
  snippet,
  onClose,
}: {
  snippet: SnippetEntry
  onClose: () => void
}) {
  const { t } = useTranslation()
  const alert = useAlert()
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(snippet.variables.map((v) => [v, '']))
  )

  const filled = snippet.variables.every((v) => values[v].trim() !== '')

  const handleCopy = async () => {
    await bridge.copyText(renderSnippet(snippet.content, values))
    await alert({
      title: t('common.copied', { defaultValue: 'Copied' }),
      message: t('modules.clipboardManager.snippetCopied', {
        defaultValue: 'Snippet copied to clipboard',
      }),
    })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{ animation: 'dialogFadeIn 0.15s ease-out' }}
    >
      <div
        className="relative w-full max-w-sm mx-4 rounded-xl border border-border-subtle bg-bg-elevated p-5 shadow-2xl"
        style={{ animation: 'dialogScaleIn 0.15s ease-out' }}
      >
        <h3 className="text-sm font-semibold text-text-primary">{snippet.name}</h3>
        <div className="mt-3 flex flex-col gap-2">
          {snippet.variables.map((v) => (
            <div key={v}>
              <label className="mb-0.5 block font-mono text-[10px] text-text-muted">{`{{${v}}}`}</label>
              <input
                value={values[v]}
                onChange={(e) => setValues({ ...values, [v]: e.target.value })}
                className="w-full rounded-md border border-border-base bg-bg-overlay px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-border-focus transition-colors"
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border-base px-4 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary cursor-pointer transition"
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            onClick={() => void handleCopy()}
            disabled={!filled}
            className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
          >
            {t('modules.clipboardManager.actionCopy', { defaultValue: 'Copy' })}
          </button>
        </div>
      </div>
    </div>
  )
}
