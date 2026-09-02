/**
 * Clipboard Manager — Single history entry card.
 * Shared by the quick popup and the main manager page.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, ClipboardPaste, Pin, PinOff, Trash2, Layers, Globe, SquareArrowOutUpRight } from 'lucide-react'
import type { ClipEntry } from '../types'
import { CategoryBadge } from './CategoryBadge'
import { SecretMask } from './SecretMask'
import { ImagePreview } from './ImagePreview'
import { formatTimeAgo } from '../utils/format'
import { quickOpenKind } from '../utils/openers'
import { isMac } from '../../../shared/utils'

export interface ClipCardProps {
  clip: ClipEntry
  active?: boolean
  /** Popup quick-paste hint (Ctrl+1..9) */
  hotkey?: number
  onActivate?: () => void
  onPaste?: () => void
  onCopy?: () => void
  /** Contextual quick-open (browser for urls, system app for paths/files) */
  onQuickOpen?: () => void
  onPin?: () => void
  onDelete?: () => void
  onAddToStack?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

/** Display text for text/file clips (kept short — full content via cm_get_clip). */
function displayText(clip: ClipEntry): string {
  if (clip.clipType === 'file') {
    try {
      const paths: string[] = JSON.parse(clip.content)
      return paths.join('\n')
    } catch {
      return clip.preview
    }
  }
  return clip.preview
}

export function ClipCard({
  clip,
  active,
  hotkey,
  onActivate,
  onPaste,
  onCopy,
  onQuickOpen,
  onPin,
  onDelete,
  onAddToStack,
  onContextMenu,
}: ClipCardProps) {
  const { t } = useTranslation()
  const [revealed, setRevealed] = useState(false)
  const quickKind = onQuickOpen ? quickOpenKind(clip) : null

  const actionBtn =
    'rounded p-1 text-text-muted hover:text-text-primary hover:bg-bg-hover cursor-pointer transition-colors'

  return (
    <div
      onClick={onActivate}
      onDoubleClick={onPaste}
      onContextMenu={onContextMenu}
      className={`group relative flex cursor-pointer gap-2.5 rounded-md border px-2.5 py-2 transition-colors ${
        active
          ? 'border-primary/50 bg-primary/5'
          : 'border-transparent hover:border-border-base hover:bg-bg-hover/50'
      }`}
    >
      {/* Type visual — image entries and text entries with an attached image
          (mixed text+image capture) both show the thumbnail */}
      <div className="shrink-0 pt-0.5">
        {clip.thumbnailPath && (clip.clipType === 'image' || clip.attachedImagePath) ? (
          <ImagePreview fileName={clip.thumbnailPath} size={36} />
        ) : (
          <div
            className={`flex h-9 w-9 items-center justify-center rounded border text-[9px] font-semibold ${
              clip.clipType === 'file'
                ? 'border-border-base bg-bg-overlay text-text-muted'
                : 'border-border-subtle bg-bg-overlay text-text-disabled'
            }`}
          >
            {clip.clipType === 'file' ? 'FILE' : 'TXT'}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1">
        <div className="min-w-0 truncate text-xs text-text-primary">
          {clip.isSecret ? (
            <SecretMask
              id={clip.id}
              preview={clip.preview}
              revealed={revealed}
              onToggle={(_id, next) => setRevealed(next)}
            />
          ) : (
            <span className="whitespace-pre">{displayText(clip).split('\n')[0] || '\u00a0'}</span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-text-disabled">
          <CategoryBadge category={clip.category} />
          {hotkey !== undefined && hotkey < 10 && (
            <span className="rounded bg-bg-overlay px-1 font-mono">
              {isMac() ? `⌘${hotkey}` : `Ctrl+${hotkey}`}
            </span>
          )}
          {clip.sourceApp && <span className="truncate max-w-[90px]">{clip.sourceApp}</span>}
          <span className="shrink-0">{formatTimeAgo(clip.createdAt, t)}</span>
          {clip.copyCount > 1 && (
            <span className="shrink-0">×{clip.copyCount}</span>
          )}
        </div>
      </div>

      {/* Hover actions */}
      <div
        className={`absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-md border border-border-base bg-bg-base px-0.5 py-0.5 shadow-sm ${
          active ? '' : 'opacity-0 group-hover:opacity-100'
        } transition-opacity`}
        onClick={(e) => e.stopPropagation()}
      >
        {quickKind && (
          <button
            className={actionBtn}
            title={
              quickKind === 'url'
                ? t('modules.clipboardManager.openInBrowser', { defaultValue: 'Open in browser' })
                : t('modules.clipboardManager.openQuick', { defaultValue: 'Open' })
            }
            onClick={onQuickOpen}
          >
            {quickKind === 'url' ? <Globe size={12} /> : <SquareArrowOutUpRight size={12} />}
          </button>
        )}
        {onCopy && (
          <button
            className={actionBtn}
            title={t('modules.clipboardManager.actionCopy', { defaultValue: 'Copy' })}
            onClick={onCopy}
          >
            <Copy size={12} />
          </button>
        )}
        {onPaste && (
          <button
            className={actionBtn}
            title={t('modules.clipboardManager.actionPaste', { defaultValue: 'Paste' })}
            onClick={onPaste}
          >
            <ClipboardPaste size={12} />
          </button>
        )}
        {onAddToStack && (
          <button
            className={actionBtn}
            title={t('modules.clipboardManager.addToStack', { defaultValue: 'Add to Paste Stack' })}
            onClick={onAddToStack}
          >
            <Layers size={12} />
          </button>
        )}
        {onPin && (
          <button
            className={actionBtn}
            title={
              clip.isPinned
                ? t('modules.clipboardManager.unpin', { defaultValue: 'Unpin' })
                : t('modules.clipboardManager.pin', { defaultValue: 'Pin' })
            }
            onClick={onPin}
          >
            {clip.isPinned ? <PinOff size={12} /> : <Pin size={12} />}
          </button>
        )}
        {onDelete && (
          <button
            className={`${actionBtn} hover:text-error`}
            title={t('modules.clipboardManager.actionDelete', { defaultValue: 'Delete' })}
            onClick={onDelete}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  )
}
