/**
 * ClipboardPopup — Quick clipboard history popup (utility window)
 * Triggered by global shortcut Alt+V; route /utility/clipboard-popup
 * Keyboard: ↑↓ select · Enter paste · Ctrl+Enter copy · Ctrl+P pin ·
 *           Del delete · Ctrl+1~9 quick paste · Esc close
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { ClipboardList, X, Layers } from 'lucide-react'
import { useClipboardStore } from './clipboardStore'
import { useClipboardHistory } from './hooks/useClipboardHistory'
import { SearchBar } from './components/SearchBar'
import { ClipCard } from './components/ClipCard'
import { PasteStackPanel } from './components/PasteStackPanel'
import { TransformList } from './components/TransformMenu'
import { timeGroupKey, type TimeGroupKey } from './utils/format'
import { formatShortcut } from '../../shared/utils'
import {
  fileClipPaths,
  openErrorKey,
  openFileOrDir,
  openUrlInBrowser,
  quickOpenKind,
  revealInDir,
  textClipPath,
  type OpenResult,
} from './utils/openers'
import type { ClipEntry } from './types'

const POPUP_LABEL = 'clipboard-popup'

function closeWindow() {
  const internals = (window as any).__TAURI_INTERNALS__
  if (internals?.invoke) {
    internals.invoke('close_utility_window', { label: POPUP_LABEL }).catch(() => {})
  }
  window.close()
}

interface Tab {
  id: string
  category: string
  clipType: string
}

const TABS: Tab[] = [
  { id: 'all', category: 'all', clipType: 'all' },
  { id: 'text', category: 'all', clipType: 'text' },
  { id: 'image', category: 'all', clipType: 'image' },
  { id: 'url', category: 'url', clipType: 'all' },
  { id: 'code', category: 'code', clipType: 'all' },
  { id: 'json', category: 'json', clipType: 'all' },
  { id: 'secret', category: 'secret', clipType: 'all' },
]

const TAB_LABELS: Record<string, string> = {
  all: 'All',
  text: 'Text',
  image: 'Images',
  url: 'Links',
  code: 'Code',
  json: 'JSON',
  secret: 'Secret',
}

const GROUP_LABELS: Record<TimeGroupKey, string> = {
  pinned: 'Pinned',
  today: 'Today',
  yesterday: 'Yesterday',
  earlier: 'Earlier',
}

interface CtxMenuState {
  x: number
  y: number
  clip: ClipEntry
  showTransforms: boolean
}

export default function ClipboardPopup() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()

  useClipboardHistory()
  const items = useClipboardStore((s) => s.items)
  const filters = useClipboardStore((s) => s.filters)
  const capability = useClipboardStore((s) => s.capability)
  const applyTabFilter = useClipboardStore((s) => s.applyTabFilter)
  const pasteClip = useClipboardStore((s) => s.pasteClip)
  const copyClip = useClipboardStore((s) => s.copyClip)
  const togglePin = useClipboardStore((s) => s.togglePin)
  const deleteClip = useClipboardStore((s) => s.deleteClip)
  const addToStack = useClipboardStore((s) => s.addToStack)

  const [activeIndex, setActiveIndex] = useState(0)
  const [showStack, setShowStack] = useState(() => searchParams.get('mode') === 'paste-stack')
  const [status, setStatus] = useState('')
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flash = useCallback((msg: string) => {
    setStatus(msg)
    if (statusTimer.current) clearTimeout(statusTimer.current)
    statusTimer.current = setTimeout(() => setStatus(''), 2500)
  }, [])

  // ── Window lifecycle ───────────────────────────────────────────────────────

  // Signal Rust to show the window once React has mounted
  useEffect(() => {
    ;(async () => {
      try {
        const { emit } = await import('@tauri-apps/api/event')
        await emit('util-window-ready', POPUP_LABEL)
      } catch {
        /* ignore */
      }
    })()
  }, [])

  // Close on window blur (focus moved to another app)
  useEffect(() => {
    const onBlur = () => closeWindow()
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [])

  // Mode switch while the popup is already open (e.g. Alt+V is open and the
  // user presses Alt+Shift+V → Rust emits 'clipboard-popup-set-mode')
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let disposed = false
    import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<string>('clipboard-popup-set-mode', (e) => {
          if (e.payload === 'paste-stack') setShowStack(true)
          else setShowStack(false)
        })
      )
      .then((fn) => {
        if (disposed) fn()
        else unlisten = fn
      })
      .catch(() => {})
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  // Backend toast / rule notifications → inline status
  useEffect(() => {
    const onToast = (e: Event) => {
      const key = (e as CustomEvent).detail?.messageKey as string
      if (key) flash(t(`modules.clipboardManager.toast.${key}`, { defaultValue: key }))
    }
    const onRule = (e: Event) => {
      const name = (e as CustomEvent).detail?.ruleName as string
      if (name) flash(t('modules.clipboardManager.ruleTriggered', { defaultValue: 'Rule matched: {{name}}', name }))
    }
    window.addEventListener('clipboard-toast', onToast)
    window.addEventListener('clipboard-rule-notify', onRule)
    return () => {
      window.removeEventListener('clipboard-toast', onToast)
      window.removeEventListener('clipboard-rule-notify', onRule)
    }
  }, [flash, t])

  // ── Grouped list ───────────────────────────────────────────────────────────

  const groups = useMemo(() => {
    const order: TimeGroupKey[] = ['pinned', 'today', 'yesterday', 'earlier']
    const map = new Map<TimeGroupKey, ClipEntry[]>()
    for (const clip of items) {
      const key = timeGroupKey(clip.createdAt, clip.isPinned)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(clip)
    }
    return order.filter((k) => map.has(k)).map((k) => ({ key: k, clips: map.get(k)! }))
  }, [items])

  useEffect(() => {
    setActiveIndex((i) => Math.max(0, Math.min(i, items.length - 1)))
  }, [items.length])

  // Keep the active card visible
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  // ── Actions ────────────────────────────────────────────────────────────────

  const handlePaste = useCallback(
    async (clip: ClipEntry) => {
      const result = await pasteClip(clip.id)
      if (result === 'pasted') {
        closeWindow()
      } else {
        const reason = result.split(':')[1] || ''
        flash(
          t('modules.clipboardManager.pasteDegraded', {
            defaultValue: 'Auto-paste unavailable ({{reason}}) — copied instead',
            reason,
          })
        )
      }
    },
    [pasteClip, flash, t]
  )

  const handleCopy = useCallback(
    async (clip: ClipEntry) => {
      await copyClip(clip.id)
      flash(t('modules.clipboardManager.copiedMsg', { defaultValue: 'Copied to clipboard' }))
    },
    [copyClip, flash, t]
  )

  const openInManager = useCallback(async (id: string) => {
    try {
      const { emitTo } = await import('@tauri-apps/api/event')
      await emitTo('main', 'clipboard-open-in-manager', { clipId: id })
    } catch {
      /* ignore */
    }
    closeWindow()
  }, [])

  /** Contextual quick-open: url → browser, file-path/file → system app */
  const handleQuickOpen = useCallback(
    async (clip: ClipEntry) => {
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
        flash(
          t(`modules.clipboardManager.${openErrorKey(result, kind)}`, {
            defaultValue: 'Cannot open this item',
          })
        )
      }
    },
    [flash, t]
  )

  /** Reveal the clip's path in the system file explorer */
  const handleReveal = useCallback(
    async (clip: ClipEntry) => {
      const p = clip.clipType === 'file' ? fileClipPaths(clip)[0] : textClipPath(clip)
      if (!p) return
      const ok = await revealInDir(p)
      if (!ok) {
        flash(
          t('modules.clipboardManager.openFailed', { defaultValue: 'Cannot open this item' })
        )
      }
    },
    [flash, t]
  )

  // ── Keyboard navigation ────────────────────────────────────────────────────

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (ctxMenu) {
        if (e.key === 'Escape') {
          e.preventDefault()
          setCtxMenu(null)
        }
        return
      }
      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          closeWindow()
          return
        case 'ArrowDown':
          e.preventDefault()
          setActiveIndex((i) => Math.min(i + 1, items.length - 1))
          ;(document.activeElement as HTMLElement | null)?.blur()
          return
        case 'ArrowUp':
          e.preventDefault()
          setActiveIndex((i) => Math.max(i - 1, 0))
          ;(document.activeElement as HTMLElement | null)?.blur()
          return
        case 'Delete': {
          e.preventDefault()
          const clip = items[activeIndex]
          if (clip) void deleteClip(clip.id)
          return
        }
        case 'Enter': {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            const clip = items[activeIndex]
            if (clip) void handleCopy(clip)
            return
          }
          // Plain Enter while typing → paste first (or active) result
          if (document.activeElement instanceof HTMLInputElement && activeIndex === 0) {
            e.preventDefault()
            const clip = items[0]
            if (clip) void handlePaste(clip)
            return
          }
          e.preventDefault()
          const clip = items[activeIndex]
          if (clip) void handlePaste(clip)
          return
        }
        case 'p':
        case 'P':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            const clip = items[activeIndex]
            if (clip) void togglePin(clip.id)
          }
          return
        default: {
          // Ctrl+1..9 quick paste
          if ((e.ctrlKey || e.metaKey) && /^[1-9]$/.test(e.key)) {
            const clip = items[parseInt(e.key, 10) - 1]
            if (clip) {
              e.preventDefault()
              void handlePaste(clip)
            }
          }
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [items, activeIndex, ctxMenu, handlePaste, handleCopy, deleteClip, togglePin])

  // ── Render ─────────────────────────────────────────────────────────────────

  const activeTab =
    TABS.find((tab) => tab.category === filters.category && tab.clipType === filters.clipType)
      ?.id ?? 'all'

  let flatIndex = -1

  return (
    <div className="flex h-screen flex-col bg-bg-base" onClick={() => setCtxMenu(null)}>
      {/* Header (draggable) */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5" data-tauri-drag-region>
        <div className="flex flex-1 items-center gap-2 pointer-events-none">
          <ClipboardList size={14} className="text-primary" />
          <span className="text-sm font-medium text-text-primary">
            {t('modules.clipboardManager.popupTitle', { defaultValue: 'Clipboard History' })}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setShowStack((v) => !v)}
            title={t('modules.clipboardManager.pasteStack', { defaultValue: 'Paste Stack' })}
            className={`rounded p-1 cursor-pointer transition-colors ${
              showStack
                ? 'bg-primary/10 text-primary'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
            }`}
          >
            <Layers size={14} />
          </button>
          <button
            onClick={() => closeWindow()}
            className="rounded p-1 text-text-muted hover:text-text-primary hover:bg-bg-hover cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <SearchBar autoFocus />
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-1 overflow-x-auto px-3 pb-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => applyTabFilter(tab.category, tab.clipType)}
            className={`shrink-0 rounded-md px-2 py-1 text-[10px] transition-colors cursor-pointer ${
              activeTab === tab.id
                ? 'bg-primary text-white'
                : 'bg-bg-overlay text-text-muted hover:bg-bg-hover hover:text-text-primary'
            }`}
          >
            {t(`modules.clipboardManager.tab.${tab.id}`, {
              defaultValue: TAB_LABELS[tab.id] ?? tab.id,
            })}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* History list */}
        <div ref={listRef} className="min-w-0 flex-1 overflow-y-auto px-2 pb-2">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-text-disabled">
              <ClipboardList size={28} />
              <p className="text-[11px]">
                {t('modules.clipboardManager.empty', {
                  defaultValue: 'No clipboard entries yet. Copy something to get started.',
                })}
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.key}>
                <div className="sticky top-0 z-10 bg-bg-base/95 px-1.5 py-1 text-[9px] font-medium uppercase tracking-wide text-text-disabled backdrop-blur">
                  {t(`modules.clipboardManager.group.${group.key}`, {
                    defaultValue: GROUP_LABELS[group.key],
                  })}
                </div>
                {group.clips.map((clip) => {
                  flatIndex += 1
                  const index = flatIndex
                  return (
                    <ClipCard
                      key={clip.id}
                      clip={clip}
                      active={index === activeIndex}
                      hotkey={index < 9 ? index + 1 : undefined}
                      onActivate={() => setActiveIndex(index)}
                      onPaste={() => void handlePaste(clip)}
                      onCopy={() => void handleCopy(clip)}
                      onQuickOpen={() => void handleQuickOpen(clip)}
                      onPin={() => void togglePin(clip.id)}
                      onDelete={() => void deleteClip(clip.id)}
                      onAddToStack={() => {
                        addToStack(clip.id)
                        setShowStack(true)
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setActiveIndex(index)
                        setCtxMenu({ x: e.clientX, y: e.clientY, clip, showTransforms: false })
                      }}
                    />
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Paste Stack side panel */}
        {showStack && (
          <div className="w-56 shrink-0 border-l border-border-subtle">
            <PasteStackPanel onClose={() => setShowStack(false)} onStatus={flash} />
          </div>
        )}
      </div>

      {/* Footer: status + hints */}
      <div className="flex items-center justify-between border-t border-border-subtle px-3 py-1.5">
        <span className={`truncate text-[9px] ${status ? 'text-info' : 'text-text-disabled'}`}>
          {status ||
            (!capability.capable
              ? t(`modules.clipboardManager.capability.${capability.reason || 'none'}`, {
                  defaultValue: 'Auto-paste unavailable — entries will be copied only',
                })
              : t('modules.clipboardManager.popupHint', {
                  defaultValue: '↑↓ select · Enter paste · {{key}} copy · Esc close',
                  key: formatShortcut('CommandOrControl+Enter'),
                }))}
        </span>
        {searchParams.get('mode') === 'paste-stack' && !showStack && (
          <button
            onClick={() => setShowStack(true)}
            className="text-[9px] text-primary hover:underline cursor-pointer"
          >
            {t('modules.clipboardManager.pasteStack', { defaultValue: 'Paste Stack' })}
          </button>
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          className="fixed z-50 min-w-[180px] rounded-md border border-border-base bg-bg-base py-1 shadow-lg"
          style={{
            left: Math.min(ctxMenu.x, window.innerWidth - 200),
            top: Math.min(ctxMenu.y, window.innerHeight - (ctxMenu.showTransforms ? 300 : 200)),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {ctxMenu.showTransforms ? (
            <TransformList
              clip={ctxMenu.clip}
              onDone={() => {
                setCtxMenu(null)
                flash(t('modules.clipboardManager.copiedMsg', { defaultValue: 'Copied to clipboard' }))
              }}
            />
          ) : (
            <>
              <CtxItem
                label={t('modules.clipboardManager.actionCopy', { defaultValue: 'Copy' })}
                onClick={() => {
                  setCtxMenu(null)
                  void handleCopy(ctxMenu.clip)
                }}
              />
              <CtxItem
                label={t('modules.clipboardManager.actionPaste', { defaultValue: 'Paste' })}
                onClick={() => {
                  setCtxMenu(null)
                  void handlePaste(ctxMenu.clip)
                }}
              />
              <CtxItem
                label={
                  ctxMenu.clip.isPinned
                    ? t('modules.clipboardManager.unpin', { defaultValue: 'Unpin' })
                    : t('modules.clipboardManager.pin', { defaultValue: 'Pin' })
                }
                onClick={() => {
                  setCtxMenu(null)
                  void togglePin(ctxMenu.clip.id)
                }}
              />
              <CtxItem
                label={t('modules.clipboardManager.addToStack', {
                  defaultValue: 'Add to Paste Stack',
                })}
                onClick={() => {
                  setCtxMenu(null)
                  addToStack(ctxMenu.clip.id)
                  setShowStack(true)
                }}
              />
              {quickOpenKind(ctxMenu.clip) === 'url' && (
                <CtxItem
                  label={t('modules.clipboardManager.openInBrowser', {
                    defaultValue: 'Open in browser',
                  })}
                  onClick={() => {
                    setCtxMenu(null)
                    void handleQuickOpen(ctxMenu.clip)
                  }}
                />
              )}
              {(quickOpenKind(ctxMenu.clip) === 'file-path' ||
                quickOpenKind(ctxMenu.clip) === 'file') && (
                <>
                  <CtxItem
                    label={t('modules.clipboardManager.openQuick', { defaultValue: 'Open' })}
                    onClick={() => {
                      setCtxMenu(null)
                      void handleQuickOpen(ctxMenu.clip)
                    }}
                  />
                  <CtxItem
                    label={t('modules.clipboardManager.openFolder', {
                      defaultValue: 'Open containing folder',
                    })}
                    onClick={() => {
                      setCtxMenu(null)
                      void handleReveal(ctxMenu.clip)
                    }}
                  />
                </>
              )}
              {ctxMenu.clip.clipType === 'text' && (
                <CtxItem
                  label={t('modules.clipboardManager.copyAs', { defaultValue: 'Copy as' }) + ' …'}
                  onClick={() => setCtxMenu((m) => (m ? { ...m, showTransforms: true } : m))}
                />
              )}
              <CtxItem
                label={t('modules.clipboardManager.openInManager', {
                  defaultValue: 'Open in Manager',
                })}
                onClick={() => {
                  setCtxMenu(null)
                  void openInManager(ctxMenu.clip.id)
                }}
              />
              <div className="my-1 border-t border-border-subtle" />
              <CtxItem
                danger
                label={t('modules.clipboardManager.actionDelete', { defaultValue: 'Delete' })}
                onClick={() => {
                  setCtxMenu(null)
                  void deleteClip(ctxMenu.clip.id)
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function CtxItem({
  label,
  onClick,
  danger,
}: {
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`block w-full px-3 py-1.5 text-left text-[11px] cursor-pointer transition-colors ${
        danger ? 'text-error hover:bg-error/10' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
      }`}
    >
      {label}
    </button>
  )
}
