/**
 * Clipboard Manager — Automation rule create/edit modal.
 * Action config layout mirrors the Rust engine:
 *   classify  -> { "category": "<cat>" }
 *   transform -> { "mode": "strip-tracking" | "trim" | "lowercase" | "uppercase" }
 *   copy-as   -> { "mode": "json-format" }
 *   notify    -> {}
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { useRuleStore } from '../ruleStore'
import { CLIP_CATEGORIES, type RuleEntry, type RuleActionType, type RuleTriggerType } from '../types'

const TRANSFORM_MODES = ['strip-tracking', 'trim', 'lowercase', 'uppercase'] as const

function newRule(): RuleEntry {
  return {
    id: '',
    name: '',
    enabled: true,
    triggerPattern: '',
    triggerType: 'contains',
    actionType: 'classify',
    actionConfig: JSON.stringify({ category: 'code' }),
    priority: 0,
  }
}

function parseConfig(raw?: string): Record<string, string> {
  try {
    const v = raw ? JSON.parse(raw) : {}
    return typeof v === 'object' && v !== null ? v : {}
  } catch {
    return {}
  }
}

export function RuleEditor({ rule, onClose }: { rule: RuleEntry | null; onClose: () => void }) {
  const { t } = useTranslation()
  const save = useRuleStore((s) => s.save)
  const [draft, setDraft] = useState<RuleEntry>(() => rule ?? newRule())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(rule ?? newRule())
  }, [rule])

  const config = parseConfig(draft.actionConfig)

  // Regex triggers must compile before saving — an invalid pattern would
  // silently make the rule never match on the Rust side
  const regexInvalid =
    draft.triggerType === 'regex' && draft.triggerPattern.trim().length > 0
      ? (() => {
          try {
            new RegExp(draft.triggerPattern)
            return false
          } catch {
            return true
          }
        })()
      : false

  const setConfig = (next: Record<string, string>) => {
    setDraft({ ...draft, actionConfig: JSON.stringify(next) })
  }

  const setActionType = (actionType: RuleActionType) => {
    const defaults: Record<RuleActionType, Record<string, string>> = {
      classify: { category: 'code' },
      transform: { mode: 'strip-tracking' },
      'copy-as': { mode: 'json-format' },
      notify: {},
    }
    setDraft({ ...draft, actionType, actionConfig: JSON.stringify(defaults[actionType]) })
  }

  const handleSave = async () => {
    if (!draft.name.trim() || !draft.triggerPattern.trim()) return
    setSaving(true)
    await save({ ...draft, name: draft.name.trim() })
    setSaving(false)
    onClose()
  }

  const inputCls =
    'w-full rounded-md border border-border-base bg-bg-overlay px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-disabled outline-none focus:border-border-focus transition-colors'
  const labelCls = 'mb-1 block text-[10px] text-text-muted'

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
          {rule
            ? t('modules.clipboardManager.editRule', { defaultValue: 'Edit rule' })
            : t('modules.clipboardManager.newRule', { defaultValue: 'New rule' })}
        </h3>

        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label className={labelCls}>
              {t('modules.clipboardManager.ruleName', { defaultValue: 'Rule name' })}
            </label>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder={t('modules.clipboardManager.ruleNamePh', {
                defaultValue: 'e.g. Tag GitHub URLs as links',
              })}
              className={inputCls}
            />
          </div>

          {/* Trigger */}
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <div>
              <label className={labelCls}>
                {t('modules.clipboardManager.triggerType', { defaultValue: 'When content' })}
              </label>
              <select
                value={draft.triggerType}
                onChange={(e) =>
                  setDraft({ ...draft, triggerType: e.target.value as RuleTriggerType })
                }
                className={inputCls}
              >
                <option value="contains">
                  {t('modules.clipboardManager.triggerContains', { defaultValue: 'contains' })}
                </option>
                <option value="regex">
                  {t('modules.clipboardManager.triggerRegex', { defaultValue: 'matches regex' })}
                </option>
                <option value="category">
                  {t('modules.clipboardManager.triggerCategory', { defaultValue: 'category is' })}
                </option>
              </select>
            </div>
            <div>
              <label className={labelCls}>
                {t('modules.clipboardManager.triggerPattern', { defaultValue: 'Pattern' })}
              </label>
              {draft.triggerType === 'category' ? (
                <select
                  value={draft.triggerPattern}
                  onChange={(e) => setDraft({ ...draft, triggerPattern: e.target.value })}
                  className={inputCls}
                >
                  {CLIP_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`modules.clipboardManager.category.${c}`, { defaultValue: c })}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={draft.triggerPattern}
                  onChange={(e) => setDraft({ ...draft, triggerPattern: e.target.value })}
                  placeholder={draft.triggerType === 'regex' ? '^https://github\\.com/.*' : 'github.com'}
                  className={`${inputCls} font-mono ${
                    regexInvalid ? 'border-error focus:border-error' : ''
                  }`}
                />
              )}
              {regexInvalid && (
                <p className="mt-1 text-[10px] text-error">
                  {t('modules.clipboardManager.regexInvalid', {
                    defaultValue: 'Invalid regular expression',
                  })}
                </p>
              )}
            </div>
          </div>

          {/* Action */}
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <div>
              <label className={labelCls}>
                {t('modules.clipboardManager.actionType', { defaultValue: 'Then' })}
              </label>
              <select
                value={draft.actionType}
                onChange={(e) => setActionType(e.target.value as RuleActionType)}
                className={inputCls}
              >
                <option value="classify">
                  {t('modules.clipboardManager.actionClassify', { defaultValue: 'set category' })}
                </option>
                <option value="transform">
                  {t('modules.clipboardManager.actionTransform', { defaultValue: 'transform' })}
                </option>
                <option value="copy-as">
                  {t('modules.clipboardManager.actionCopyAs', { defaultValue: 'store copy as' })}
                </option>
                <option value="notify">
                  {t('modules.clipboardManager.actionNotify', { defaultValue: 'notify' })}
                </option>
              </select>
            </div>
            <div>
              <label className={labelCls}>
                {t('modules.clipboardManager.actionDetail', { defaultValue: 'Detail' })}
              </label>
              {draft.actionType === 'classify' ? (
                <select
                  value={config.category ?? 'code'}
                  onChange={(e) => setConfig({ category: e.target.value })}
                  className={inputCls}
                >
                  {CLIP_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`modules.clipboardManager.category.${c}`, { defaultValue: c })}
                    </option>
                  ))}
                </select>
              ) : draft.actionType === 'transform' ? (
                <select
                  value={config.mode ?? 'strip-tracking'}
                  onChange={(e) => setConfig({ mode: e.target.value })}
                  className={inputCls}
                >
                  {TRANSFORM_MODES.map((m) => (
                    <option key={m} value={m}>
                      {t(`modules.clipboardManager.transformMode.${m}`, { defaultValue: m })}
                    </option>
                  ))}
                </select>
              ) : draft.actionType === 'copy-as' ? (
                <select
                  value={config.mode ?? 'json-format'}
                  onChange={(e) => setConfig({ mode: e.target.value })}
                  className={inputCls}
                >
                  <option value="json-format">
                    {t('modules.clipboardManager.copyAsJson', { defaultValue: 'Formatted JSON' })}
                  </option>
                </select>
              ) : (
                <p className="rounded-md border border-border-subtle bg-bg-overlay px-2.5 py-1.5 text-[10px] text-text-disabled">
                  {t('modules.clipboardManager.notifyHint', {
                    defaultValue: 'Shows a toast when the rule matches',
                  })}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>
                {t('modules.clipboardManager.priority', { defaultValue: 'Priority' })}
              </label>
              <input
                type="number"
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: parseInt(e.target.value) || 0 })}
                className={inputCls}
              />
            </div>
            <label className="flex cursor-pointer items-end gap-2 pb-1.5 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                className="accent-primary"
              />
              {t('modules.clipboardManager.ruleEnabled', { defaultValue: 'Enabled' })}
            </label>
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
            disabled={saving || !draft.name.trim() || !draft.triggerPattern.trim() || regexInvalid}
            className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
          >
            {t('common.save', { defaultValue: 'Save' })}
          </button>
        </div>
      </div>
    </div>
  )
}
