/**
 * ClipboardManager — Main management page (route /clipboard-manager)
 * Tabs: History | Snippets | Rules | Settings
 */
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import {
  ClipboardList,
  FileText,
  Zap,
  Settings2,
  Trash2,
  Download,
  CheckSquare,
  Square,
  Layers,
  Eraser,
} from 'lucide-react'
import { useClipboardStore } from './clipboardStore'
import { formatShortcut } from '../../shared/utils'
import { useClipboardHistory } from './hooks/useClipboardHistory'
import { useConfirm } from '../../components/Dialog'
import { useToast } from '../../components/Toast'
import { SearchBar } from './components/SearchBar'
import { ClipCard } from './components/ClipCard'
import { ClipDetail } from './components/ClipDetail'
import { StatsBar } from './components/StatsBar'
import { SnippetList } from './components/SnippetList'
import { RuleList } from './components/RuleList'
import { ExportImportDialog } from './components/ExportImportDialog'
import { CLIP_CATEGORIES } from './types'
import type { ClipboardSettings, ClipEntry } from './types'
import {
  fileClipPaths,
  openErrorKey,
  openFileOrDir,
  openUrlInBrowser,
  quickOpenKind,
  textClipPath,
  type OpenResult,
} from './utils/openers'

type TabId = 'history' | 'snippets' | 'rules' | 'settings'

const TAB_DEFS: Array<{ id: TabId; icon: typeof ClipboardList; label: string }> = [
  { id: 'history', icon: ClipboardList, label: 'History' },
  { id: 'snippets', icon: FileText, label: 'Snippets' },
  { id: 'rules', icon: Zap, label: 'Rules' },
  { id: 'settings', icon: Settings2, label: 'Settings' },
]

export default function ClipboardManager() {
  const { t } = useTranslation()
  const location = useLocation()
  const highlightId = (location.state as { highlightClipId?: string } | null)?.highlightClipId

  useClipboardHistory()
  const items = useClipboardStore((s) => s.items)
  const loading = useClipboardStore((s) => s.loading)
  const hasMore = useClipboardStore((s) => s.hasMore)
  const filters = useClipboardStore((s) => s.filters)
  const loadMore = useClipboardStore((s) => s.loadMore)
  const applyTabFilter = useClipboardStore((s) => s.applyTabFilter)
  const selectedIds = useClipboardStore((s) => s.selectedIds)
  const toggleSelected = useClipboardStore((s) => s.toggleSelected)
  const setSelected = useClipboardStore((s) => s.setSelected)
  const clearSelection = useClipboardStore((s) => s.clearSelection)
  const deleteSelected = useClipboardStore((s) => s.deleteSelected)
  const clearHistory = useClipboardStore((s) => s.clearHistory)
  const copyClip = useClipboardStore((s) => s.copyClip)
  const pasteClip = useClipboardStore((s) => s.pasteClip)
  const togglePin = useClipboardStore((s) => s.togglePin)
  const deleteClip = useClipboardStore((s) => s.deleteClip)
  const addToStack = useClipboardStore((s) => s.addToStack)
  const pasteStackCount = useClipboardStore((s) => s.pasteStack.length)
  const confirm = useConfirm()
  const toast = useToast()

  const [tab, setTab] = useState<TabId>('history')
  const [exportOpen, setExportOpen] = useState(false)
  const [detailClip, setDetailClip] = useState<ClipEntry | null>(null)

  const allSelected = items.length > 0 && items.every((c) => selectedIds.includes(c.id))

  const visibleCategories = useMemo(() => ['all', ...CLIP_CATEGORIES], [])
  const typeFilters = useMemo(() => ['all', 'text', 'image', 'file'], [])

  // Toolbar style tokens
  const toolBtn =
    'flex items-center gap-1.5 rounded-md border border-border-base px-2.5 py-1.5 text-[11px] text-text-muted hover:text-text-primary hover:bg-bg-hover cursor-pointer transition-colors'
  const chipCls = (active: boolean) =>
    `shrink-0 rounded-md px-2 py-1 text-[11px] transition-colors cursor-pointer ${
      active
        ? 'bg-primary text-white'
        : 'bg-bg-overlay text-text-muted hover:bg-bg-hover hover:text-text-primary'
    }`

  /** Contextual quick-open: url → browser, file-path/file → system app */
  const quickOpen = async (clip: ClipEntry) => {
    const kind = quickOpenKind(clip)
    if (!kind) return
    let result: OpenResult = 'failed'
    if (kind === 'url') {
      result = (await openUrlInBrowser(clip.content)) ? 'ok' : 'failed'
    } else if (kind === 'file-path') {
      const p = textClipPath(clip)
      if (p) result = await openFileOrDir(p)
    } else if (kind === 'file') {
      const p = fileClipPaths(clip)[0]
      if (p) result = await openFileOrDir(p)
    }
    if (result !== 'ok') {
      toast(
        t(`modules.clipboardManager.${openErrorKey(result, kind)}`, {
          defaultValue: 'Cannot open this item',
        }),
        'error'
      )
    }
  }

  const handleClearHistory = async () => {
    const ok = await confirm({
      title: t('modules.clipboardManager.clearHistory', { defaultValue: 'Clear history' }),
      message: t('modules.clipboardManager.clearHistoryMsg', {
        defaultValue: 'Delete all non-pinned entries? This cannot be undone.',
      }),
      danger: true,
      confirmText: t('modules.clipboardManager.actionDelete', { defaultValue: 'Delete' }),
      cancelText: t('common.cancel', { defaultValue: 'Cancel' }),
    })
    if (ok) await clearHistory(true)
  }

  const handleDeleteSelected = async () => {
    const ok = await confirm({
      title: t('modules.clipboardManager.deleteSelected', { defaultValue: 'Delete selected' }),
      message: t('modules.clipboardManager.deleteSelectedMsg', {
        defaultValue: 'Delete {{count}} selected entries?',
        count: selectedIds.length,
      }),
      danger: true,
      confirmText: t('modules.clipboardManager.actionDelete', { defaultValue: 'Delete' }),
      cancelText: t('common.cancel', { defaultValue: 'Cancel' }),
    })
    if (ok) {
      await deleteSelected()
      clearSelection()
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pb-3 pt-5">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">
            {t('modules.clipboardManager.name', { defaultValue: 'Clipboard Manager' })}
          </h1>
          <p className="mt-0.5 text-[11px] text-text-muted">
            {t('modules.clipboardManager.subtitle', {
              defaultValue: 'History, snippets and automation for everything you copy',
            })}
          </p>
        </div>
        <StatsBar />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border-subtle px-6">
        {TAB_DEFS.map((def) => {
          const Icon = def.icon
          return (
            <button
              key={def.id}
              onClick={() => setTab(def.id)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                tab === def.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              <Icon size={13} />
              {t(`modules.clipboardManager.tabs.${def.id}`, { defaultValue: def.label })}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-hidden px-6 py-4">
        {tab === 'history' && (
          <div className="flex h-full min-h-0 flex-col">
            {/* Toolbar: row 1 = search + actions, row 2 = filter rail */}
            <div className="mb-3 flex flex-col gap-2">
              {/* Row 1: search + compact action cluster */}
              <div className="flex items-center gap-2">
                <div className="w-72 max-w-full">
                  <SearchBar />
                </div>
                <div className="ml-auto flex items-center gap-1">
                  {selectedIds.length > 0 && (
                    <button
                      onClick={() => void handleDeleteSelected()}
                      className="mr-1 flex items-center gap-1 rounded-md border border-error/40 px-2.5 py-1.5 text-[11px] text-error hover:bg-error/10 cursor-pointer transition-colors"
                    >
                      <Trash2 size={11} />
                      {t('modules.clipboardManager.deleteSelected', {
                        defaultValue: 'Delete selected',
                      })}{' '}
                      ({selectedIds.length})
                    </button>
                  )}
                  <button
                    onClick={() => setSelected(allSelected ? [] : items.map((c) => c.id))}
                    className={toolBtn}
                  >
                    {allSelected ? <CheckSquare size={11} /> : <Square size={11} />}
                    {t('modules.clipboardManager.selectAll', { defaultValue: 'Select all' })}
                  </button>
                  <div className="mx-1 h-4 w-px bg-border-subtle" />
                  <button onClick={() => setExportOpen(true)} className={toolBtn}>
                    <Download size={11} />
                    {t('modules.clipboardManager.exportImport', {
                      defaultValue: 'Export / Import',
                    })}
                  </button>
                  <button
                    onClick={() => void handleClearHistory()}
                    className="flex items-center gap-1.5 rounded-md border border-border-base px-2.5 py-1.5 text-[11px] text-text-muted hover:text-error hover:border-error/40 hover:bg-error/5 cursor-pointer transition-colors"
                  >
                    <Eraser size={11} />
                    {t('modules.clipboardManager.clearHistory', {
                      defaultValue: 'Clear history',
                    })}
                  </button>
                </div>
              </div>

              {/* Row 2: filter rail — category chips | type chips */}
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                {visibleCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => applyTabFilter(cat, filters.clipType)}
                    className={chipCls(filters.category === cat)}
                  >
                    {cat === 'all'
                      ? t('modules.clipboardManager.tab.all', { defaultValue: 'All' })
                      : t(`modules.clipboardManager.category.${cat}`, { defaultValue: cat })}
                  </button>
                ))}
                <div className="mx-1.5 h-4 w-px shrink-0 bg-border-subtle" />
                {typeFilters.map((type) => (
                  <button
                    key={type}
                    onClick={() => applyTabFilter(filters.category, type)}
                    className={chipCls(filters.clipType === type)}
                  >
                    {t(`modules.clipboardManager.tab.${type}`, { defaultValue: type })}
                  </button>
                ))}
              </div>
            </div>

            {/* List */}
            <div className="min-h-0 flex-1 overflow-y-auto pb-4">
              {items.length === 0 && !loading ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-text-disabled">
                  <ClipboardList size={32} />
                  <p className="text-xs">
                    {t('modules.clipboardManager.empty', {
                      defaultValue: 'No clipboard entries yet. Copy something to get started.',
                    })}
                  </p>
                </div>
              ) : (
                <>
                  {items.map((clip) => (
                    <div key={clip.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(clip.id)}
                        onChange={() => toggleSelected(clip.id)}
                        className="shrink-0 accent-primary cursor-pointer"
                      />
                      <div
                        className={`min-w-0 flex-1 ${
                          clip.id === highlightId ? 'rounded-md ring-1 ring-primary' : ''
                        }`}
                      >
                        <ClipCard
                          clip={clip}
                          onActivate={() => setDetailClip(clip)}
                          onQuickOpen={() => void quickOpen(clip)}
                          onCopy={() => void copyClip(clip.id)}
                          onPaste={() => void pasteClip(clip.id)}
                          onPin={() => void togglePin(clip.id)}
                          onDelete={() => void deleteClip(clip.id)}
                          onAddToStack={() => addToStack(clip.id)}
                        />
                      </div>
                    </div>
                  ))}
                  {hasMore && (
                    <button
                      onClick={() => void loadMore()}
                      disabled={loading}
                      className="mx-auto mt-2 block rounded-md border border-border-base px-4 py-1.5 text-[11px] text-text-muted hover:text-text-primary hover:bg-bg-hover disabled:opacity-40 cursor-pointer transition-colors"
                    >
                      {loading
                        ? t('modules.clipboardManager.loading', { defaultValue: 'Loading…' })
                        : t('modules.clipboardManager.loadMore', { defaultValue: 'Load more' })}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Stack hint */}
            {pasteStackCount > 0 && (
              <div className="flex items-center gap-1.5 border-t border-border-subtle pt-2 text-[11px] text-text-muted">
                <Layers size={11} />
                {t('modules.clipboardManager.stackQueued', {
                  defaultValue: '{{count}} entries queued in Paste Stack (open via {{keys}})',
                  count: pasteStackCount,
                  keys: formatShortcut('Alt+Shift+V'),
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'snippets' && <SnippetList />}
        {tab === 'rules' && <RuleList />}
        {tab === 'settings' && <SettingsPanel />}
      </div>

      {exportOpen && <ExportImportDialog onClose={() => setExportOpen(false)} />}

      {detailClip && (
        <ClipDetail
          clip={detailClip}
          onClose={() => setDetailClip(null)}
          onCopy={() => void copyClip(detailClip.id)}
          onPaste={() => void pasteClip(detailClip.id)}
          onPin={() => void togglePin(detailClip.id)}
          onDelete={() => {
            void deleteClip(detailClip.id)
            setDetailClip(null)
          }}
          onAddToStack={() => addToStack(detailClip.id)}
        />
      )}
    </div>
  )
}

// ── Settings panel ───────────────────────────────────────────────────────────

function SettingsPanel() {
  const { t } = useTranslation()
  const settings = useClipboardStore((s) => s.settings)
  const capability = useClipboardStore((s) => s.capability)
  const saveSettings = useClipboardStore((s) => s.saveSettings)
  const [draft, setDraft] = useState<ClipboardSettings | null>(settings)
  // Numeric fields are edited as raw strings so validation happens on save,
  // not while typing (clearing a field no longer snaps back to the default)
  const [numInputs, setNumInputs] = useState<Record<string, string> | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setDraft(settings)
    if (settings) {
      setNumInputs({
        maxHistory: String(settings.maxHistory),
        retentionDays: String(settings.retentionDays),
        pasteStackIntervalMs: String(settings.pasteStackIntervalMs),
        imageCacheLimitMb: String(settings.imageCacheLimitMb),
      })
    }
    setErrors({})
    setSaved(false)
  }, [settings])

  /** Numeric field rules — keep in sync with the Rust-side settings clamps */
  const numFields = useMemo(
    () =>
      [
        { key: 'maxHistory', min: 50, max: 10000 },
        { key: 'retentionDays', min: 1, max: 365 },
        { key: 'pasteStackIntervalMs', min: 50, max: 5000 },
        { key: 'imageCacheLimitMb', min: 50, max: 5000 },
      ] as const,
    []
  )

  if (!draft || !numInputs) {
    return <p className="text-xs text-text-disabled">{t('modules.clipboardManager.loading', { defaultValue: 'Loading…' })}</p>
  }

  const update = <K extends keyof ClipboardSettings>(key: K, value: ClipboardSettings[K]) => {
    setDraft({ ...draft, [key]: value })
    setSaved(false)
  }

  const updateNum = (key: string, value: string) => {
    setNumInputs({ ...numInputs, [key]: value })
    setErrors((e) => {
      if (!e[key]) return e
      const next = { ...e }
      delete next[key]
      return next
    })
    setSaved(false)
  }

  const rangeError = (min: number, max: number) =>
    t('modules.clipboardManager.setRangeError', {
      defaultValue: 'Enter a value between {{min}} and {{max}}',
      min,
      max,
    })

  /** Save is only offered when something actually changed */
  const dirty =
    numFields.some(({ key }) => numInputs[key] !== String(draft[key as keyof ClipboardSettings])) ||
    draft.enabled !== settings!.enabled ||
    draft.captureImages !== settings!.captureImages ||
    draft.captureFiles !== settings!.captureFiles ||
    draft.encryptSecrets !== settings!.encryptSecrets ||
    draft.ignoredApps.join('\n') !== settings!.ignoredApps.join('\n')

  const handleSave = async () => {
    // Validate numeric fields against their ranges before persisting
    const nextErrors: Record<string, string> = {}
    const parsed: Record<string, number> = {}
    for (const { key, min, max } of numFields) {
      const n = parseInt(numInputs[key], 10)
      if (Number.isNaN(n) || n < min || n > max) {
        nextErrors[key] = rangeError(min, max)
      } else {
        parsed[key] = n
      }
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    await saveSettings({
      ...draft,
      ...(parsed as Partial<ClipboardSettings>),
      ignoredApps: draft.ignoredApps.map((a) => a.trim()).filter(Boolean),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const rowCls = 'flex items-center justify-between gap-4 border-b border-border-subtle py-3'
  const numCls = (hasError: boolean) =>
    `w-24 rounded-md border bg-bg-overlay px-2 py-1 text-xs text-text-primary outline-none ${
      hasError
        ? 'border-error focus:border-error'
        : 'border-border-base focus:border-border-focus'
    }`

  /** Numeric setting row with inline range validation */
  const numRow = (
    key: 'maxHistory' | 'retentionDays' | 'pasteStackIntervalMs' | 'imageCacheLimitMb',
    label: React.ReactNode,
    opts: { min: number; max: number; step?: number }
  ) => (
    <div className="border-b border-border-subtle py-3">
      <div className="flex items-center justify-between gap-4">
        {label}
        <input
          type="number"
          min={opts.min}
          max={opts.max}
          step={opts.step}
          value={numInputs[key]}
          onChange={(e) => updateNum(key, e.target.value)}
          className={numCls(!!errors[key])}
        />
      </div>
      {errors[key] && <p className="mt-1 text-right text-[10px] text-error">{errors[key]}</p>}
    </div>
  )

  return (
    <div className="mx-auto h-full max-w-2xl overflow-y-auto overflow-x-hidden pb-8">
      {/* Capability note */}
      {!capability.capable && (
        <div className="mb-4 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-[11px] text-warning">
          {t(`modules.clipboardManager.capability.${capability.reason || 'none'}`, {
            defaultValue: 'Auto-paste unavailable — entries will be copied only',
          })}
        </div>
      )}

      <div className={rowCls}>
        <SettingLabel
          label={t('modules.clipboardManager.setCapture', { defaultValue: 'Capture clipboard' })}
          hint={t('modules.clipboardManager.setCaptureHint', {
            defaultValue: 'Record copied text, images and files in history',
          })}
        />
        <Toggle checked={draft.enabled} onChange={(v) => update('enabled', v)} />
      </div>

      <div className={rowCls}>
        <SettingLabel
          label={t('modules.clipboardManager.setImages', { defaultValue: 'Capture images' })}
          hint={t('modules.clipboardManager.setImagesHint', {
            defaultValue: 'Store copied images with thumbnails',
          })}
        />
        <Toggle checked={draft.captureImages} onChange={(v) => update('captureImages', v)} />
      </div>

      <div className={rowCls}>
        <SettingLabel
          label={t('modules.clipboardManager.setFiles', { defaultValue: 'Capture file lists' })}
          hint={t('modules.clipboardManager.setFilesHint', {
            defaultValue: 'Record paths when files are copied in the file manager',
          })}
        />
        <Toggle checked={draft.captureFiles} onChange={(v) => update('captureFiles', v)} />
      </div>

      <div className={rowCls}>
        <SettingLabel
          label={t('modules.clipboardManager.setEncrypt', { defaultValue: 'Encrypt secrets' })}
          hint={t('modules.clipboardManager.setEncryptHint', {
            defaultValue: 'Encrypt detected keys/tokens at rest (machine-bound key)',
          })}
        />
        <Toggle checked={draft.encryptSecrets} onChange={(v) => update('encryptSecrets', v)} />
      </div>

      {numRow(
        'maxHistory',
        <SettingLabel
          label={t('modules.clipboardManager.setMaxHistory', { defaultValue: 'Max history entries' })}
        />,
        { min: 50, max: 10000 }
      )}

      {numRow(
        'retentionDays',
        <SettingLabel
          label={t('modules.clipboardManager.setRetention', { defaultValue: 'Retention (days)' })}
        />,
        { min: 1, max: 365 }
      )}

      {numRow(
        'pasteStackIntervalMs',
        <SettingLabel
          label={t('modules.clipboardManager.setStackInterval', {
            defaultValue: 'Paste Stack interval (ms)',
          })}
          hint={t('modules.clipboardManager.setStackIntervalHint', {
            defaultValue: 'Delay between sequential pastes',
          })}
        />,
        { min: 50, max: 5000, step: 50 }
      )}

      {numRow(
        'imageCacheLimitMb',
        <SettingLabel
          label={t('modules.clipboardManager.setImageCacheLimit', {
            defaultValue: 'Image cache limit (MB)',
          })}
        />,
        { min: 50, max: 5000 }
      )}

      <div className="py-3">
        <SettingLabel
          label={t('modules.clipboardManager.setIgnoredApps', { defaultValue: 'Ignored apps' })}
          hint={t('modules.clipboardManager.setIgnoredAppsHint', {
            defaultValue: 'Copies from these apps are never recorded (one per line, process name)',
          })}
        />
        <textarea
          value={draft.ignoredApps.join('\n')}
          onChange={(e) => update('ignoredApps', e.target.value.split('\n'))}
          rows={4}
          className="mt-2 w-full rounded-md border border-border-base bg-bg-overlay px-2.5 py-1.5 font-mono text-xs text-text-primary outline-none focus:border-border-focus"
        />
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={() => void handleSave()}
          disabled={!dirty}
          className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-white hover:bg-primary-hover cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('common.save', { defaultValue: 'Save' })}
        </button>
        {saved && (
          <span className="text-[11px] text-success">
            {t('common.saved', { defaultValue: 'Saved' })}
          </span>
        )}
      </div>
    </div>
  )
}

function SettingLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-text-primary">{label}</p>
      {hint && <p className="mt-0.5 text-[10px] text-text-disabled">{hint}</p>}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors cursor-pointer ${
        checked ? 'bg-primary' : 'bg-bg-hover'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
          checked ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}
