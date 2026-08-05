/**
 * Clipboard Manager — Automation rule list.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, Zap } from 'lucide-react'
import { useRuleStore } from '../ruleStore'
import { useConfirm } from '../../../components/Dialog'
import { RuleEditor } from './RuleEditor'
import type { RuleEntry } from '../types'

/** localStorage key — first-visit guide dismissal is remembered */
const GUIDE_KEY = 'a7box-cm-guide-rules'

const ACTION_LABELS: Record<string, string> = {
  classify: 'Classify',
  transform: 'Transform',
  'copy-as': 'Copy as',
  notify: 'Notify',
}

export function RuleList() {
  const { t } = useTranslation()
  const rules = useRuleStore((s) => s.rules)
  const load = useRuleStore((s) => s.load)
  const remove = useRuleStore((s) => s.remove)
  const toggle = useRuleStore((s) => s.toggle)
  const confirm = useConfirm()

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<RuleEntry | null>(null)
  const [showGuide, setShowGuide] = useState(() => !localStorage.getItem(GUIDE_KEY))

  const dismissGuide = () => {
    localStorage.setItem(GUIDE_KEY, '1')
    setShowGuide(false)
  }

  useEffect(() => {
    void load()
  }, [load])

  const handleDelete = async (rule: RuleEntry) => {
    const ok = await confirm({
      title: t('modules.clipboardManager.deleteRule', { defaultValue: 'Delete rule' }),
      message: t('modules.clipboardManager.deleteRuleMsg', {
        defaultValue: 'Delete "{{name}}"?',
        name: rule.name,
      }),
      danger: true,
      confirmText: t('modules.clipboardManager.actionDelete', { defaultValue: 'Delete' }),
      cancelText: t('common.cancel', { defaultValue: 'Cancel' }),
    })
    if (ok) await remove(rule.id)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0 text-[11px] text-text-muted">
          {t('modules.clipboardManager.rulesDesc', {
            defaultValue: 'Rules run automatically when new clipboard content is captured.',
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
          {t('modules.clipboardManager.newRule', { defaultValue: 'New rule' })}
        </button>
      </div>

      {/* First-visit guide */}
      {showGuide && (
        <div className="mb-3 shrink-0 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-primary">
              {t('modules.clipboardManager.ruleGuide.title', { defaultValue: 'What are Rules?' })}
            </h3>
            <button
              onClick={dismissGuide}
              className="text-xs text-text-muted hover:text-text-primary cursor-pointer transition-colors"
            >
              ✕
            </button>
          </div>
          <p className="mb-3 text-[11px] leading-relaxed text-text-secondary">
            {t('modules.clipboardManager.ruleGuide.intro', {
              defaultValue:
                'Rules react to every capture automatically — classify, transform, copy formatted, or notify.',
            })}
          </p>
          <div className="space-y-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                  {n}
                </span>
                <p className="text-[11px] leading-relaxed text-text-secondary">
                  {t(`modules.clipboardManager.ruleGuide.step${n}`, { defaultValue: '' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rules.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[11px] text-text-disabled">
              {t('modules.clipboardManager.noRules', { defaultValue: 'No rules yet' })}
            </p>
            <p className="mt-1.5 text-[10px] text-text-disabled">
              {t('modules.clipboardManager.rulesExample', {
                defaultValue:
                  'e.g. automatically classify entries containing a URL into the “Links” category',
              })}
            </p>
          </div>
        ) : (
          rules.map((rule) => (
            <div
              key={rule.id}
              className={`group flex items-center gap-2.5 rounded-md border border-transparent px-2.5 py-2 hover:border-border-base hover:bg-bg-hover/50 transition-colors ${
                rule.enabled ? '' : 'opacity-50'
              }`}
            >
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={(e) => void toggle(rule.id, e.target.checked)}
                className="shrink-0 accent-primary cursor-pointer"
              />
              <Zap size={13} className="shrink-0 text-text-disabled" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-text-primary">{rule.name}</span>
                  <span className="rounded bg-info/10 px-1.5 py-0.5 text-[10px] text-info">
                    {t(`modules.clipboardManager.action.${rule.actionType.replace('-', '')}`, {
                      defaultValue: ACTION_LABELS[rule.actionType] ?? rule.actionType,
                    })}
                  </span>
                </div>
                <p className="mt-0.5 truncate font-mono text-[10px] text-text-muted">
                  {rule.triggerType === 'contains' ? 'contains' : rule.triggerType}:{' '}
                  {rule.triggerPattern}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => {
                    setEditing(rule)
                    setEditorOpen(true)
                  }}
                  title={t('modules.clipboardManager.editRule', { defaultValue: 'Edit rule' })}
                  className="rounded p-1 text-text-muted hover:text-text-primary hover:bg-bg-hover cursor-pointer"
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={() => void handleDelete(rule)}
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

      {editorOpen && <RuleEditor rule={editing} onClose={() => setEditorOpen(false)} />}
    </div>
  )
}
