/**
 * Clipboard Manager — Entry detail drawer.
 * Shows the full content, metadata and quick actions for a history entry.
 * Full content is re-fetched on open (list items may hold truncated previews).
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Copy,
  ClipboardPaste,
  Pin,
  PinOff,
  Trash2,
  Layers,
  Eye,
  EyeOff,
  ImageOff,
  FileText,
  Globe,
  SquareArrowOutUpRight,
  FolderOpen,
  Maximize2,
  X,
} from 'lucide-react'
import Drawer from '../../../components/Drawer'
import { useToast } from '../../../components/Toast'
import { CategoryBadge } from './CategoryBadge'
import * as bridge from '../bridge'
import type { ClipEntry } from '../types'
import { formatBytes, formatDateTime } from '../utils/format'
import { fileClipPaths, openErrorKey, openFileOrDir, openUrlInBrowser, revealInDir, textClipPath } from '../utils/openers'

interface ClipDetailProps {
  clip: ClipEntry
  onClose: () => void
  onCopy: () => void
  onPaste: () => void
  onPin: () => void
  onDelete: () => void
  onAddToStack: () => void
}

export function ClipDetail({
  clip,
  onClose,
  onCopy,
  onPaste,
  onPin,
  onDelete,
  onAddToStack,
}: ClipDetailProps) {
  const { t } = useTranslation()
  const toast = useToast()
  const [full, setFull] = useState<ClipEntry>(clip)
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [zoom, setZoom] = useState(false)

  // Fetch the stored (possibly long / decrypted) content for this entry
  useEffect(() => {
    let cancelled = false
    void bridge.getClip(clip.id).then((c) => {
      if (c && !cancelled) setFull(c)
    })
    return () => {
      cancelled = true
    }
  }, [clip.id])

  // Load the full-size image: image entries keep the file name in content,
  // text entries may carry an attached image (mixed text+image capture)
  useEffect(() => {
    const fileName = clip.clipType === 'image' ? clip.content : clip.attachedImagePath
    if (!fileName) return
    let cancelled = false
    setImgSrc(null)
    void bridge.imageDataUrl(fileName).then((url) => {
      if (!cancelled) setImgSrc(url)
    })
    return () => {
      cancelled = true
    }
  }, [clip.clipType, clip.content, clip.attachedImagePath])

  const filePaths = fileClipPaths(full)
  const textPath = textClipPath(full)
  const isUrl = full.clipType === 'text' && full.category === 'url'

  // Esc closes the full-size image overlay
  useEffect(() => {
    if (!zoom) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoom(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoom])

  const handleOpenUrl = async () => {
    const ok = await openUrlInBrowser(full.content)
    if (!ok) {
      toast(
        t('modules.clipboardManager.openUrlFailed', { defaultValue: 'Could not open the link' }),
        'error'
      )
    }
  }

  const handleOpenPath = async (path: string) => {
    const result = await openFileOrDir(path)
    if (result !== 'ok') {
      toast(
        t(`modules.clipboardManager.${openErrorKey(result, 'file-path')}`, {
          defaultValue: 'Cannot open this item',
        }),
        'error'
      )
    }
  }

  const handleReveal = async (path: string) => {
    const ok = await revealInDir(path)
    if (!ok) {
      toast(
        t('modules.clipboardManager.openFailed', { defaultValue: 'Cannot open this item' }),
        'error'
      )
    }
  }

  // Optimistic pin flip so the footer reflects the new state immediately
  const handlePin = () => {
    setFull((f) => ({ ...f, isPinned: !f.isPinned }))
    onPin()
  }

  const handleCopyAttachedImage = async () => {
    const ok = await bridge.copyAttachedImage(full.id)
    toast(
      ok
        ? t('modules.clipboardManager.copiedMsg', { defaultValue: 'Copied to clipboard' })
        : t('modules.clipboardManager.copyAttachedFailed', {
            defaultValue: 'Could not copy the image',
          }),
      ok ? 'success' : 'error'
    )
  }

  const actionBtn =
    'flex items-center gap-1.5 rounded-md border border-border-base px-2.5 py-1.5 text-[11px] text-text-muted hover:text-text-primary hover:bg-bg-hover cursor-pointer transition-colors'
  // Compact variant used inline next to the "Content" label
  const ctxBtn =
    'flex items-center gap-1 rounded-md border border-border-base px-2 py-1 text-[10px] text-text-muted hover:text-text-primary hover:bg-bg-hover cursor-pointer transition-colors'

  return (
    <Drawer
      open
      onClose={onClose}
      title={t('modules.clipboardManager.detail.title', { defaultValue: 'Entry details' })}
      footer={
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={onCopy} className={actionBtn}>
            <Copy size={12} />
            {t('modules.clipboardManager.actionCopy', { defaultValue: 'Copy' })}
          </button>
          <button onClick={onPaste} className={actionBtn}>
            <ClipboardPaste size={12} />
            {t('modules.clipboardManager.actionPaste', { defaultValue: 'Paste' })}
          </button>
          <button onClick={onAddToStack} className={actionBtn}>
            <Layers size={12} />
            {t('modules.clipboardManager.addToStack', { defaultValue: 'Add to Paste Stack' })}
          </button>
          <button onClick={handlePin} className={actionBtn}>
            {full.isPinned ? <PinOff size={12} /> : <Pin size={12} />}
            {full.isPinned
              ? t('modules.clipboardManager.unpin', { defaultValue: 'Unpin' })
              : t('modules.clipboardManager.pin', { defaultValue: 'Pin' })}
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 rounded-md border border-error/40 px-2.5 py-1.5 text-[11px] text-error hover:bg-error/10 cursor-pointer transition-colors"
          >
            <Trash2 size={12} />
            {t('modules.clipboardManager.actionDelete', { defaultValue: 'Delete' })}
          </button>
        </div>
      }
    >
      {/* Badges */}
      <div className="flex flex-wrap items-center gap-1.5">
        <CategoryBadge category={full.category} />
        {full.isPinned && (
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
            {t('modules.clipboardManager.pinned', { defaultValue: 'Pinned' })}
          </span>
        )}
        {full.isSecret && (
          <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">
            {t('modules.clipboardManager.secret', { defaultValue: 'Secret' })}
          </span>
        )}
        {full.isEncrypted && (
          <span className="rounded bg-info/10 px-1.5 py-0.5 text-[10px] text-info">
            {t('modules.clipboardManager.encrypted', { defaultValue: 'Encrypted' })}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
            {t('modules.clipboardManager.detail.content', { defaultValue: 'Content' })}
          </p>
          {/* Contextual open action for links (path actions live beside the path itself) */}
          {isUrl && (
            <button onClick={() => void handleOpenUrl()} className={ctxBtn}>
              <Globe size={11} />
              {t('modules.clipboardManager.openInBrowser', {
                defaultValue: 'Open in browser',
              })}
            </button>
          )}
        </div>

        {full.clipType === 'image' ? (
          imgSrc ? (
            <div
              className="group/img relative inline-block cursor-zoom-in"
              onClick={() => setZoom(true)}
              title={t('modules.clipboardManager.viewFullSize', {
                defaultValue: 'Click to view full size',
              })}
            >
              <img
                src={imgSrc}
                alt=""
                className="max-h-64 w-auto max-w-full rounded-md border border-border-subtle object-contain"
                draggable={false}
              />
              <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover/img:opacity-100">
                <Maximize2 size={11} />
              </span>
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center rounded-md border border-border-subtle bg-bg-overlay text-text-disabled">
              <ImageOff size={20} />
            </div>
          )
        ) : textPath ? (
          /* Single path — actions travel with the path text itself */
          <div className="flex items-center gap-1.5 rounded-md border border-border-subtle bg-bg-overlay px-3 py-2">
            <FileText size={11} className="shrink-0 text-text-disabled" />
            <span className="min-w-0 flex-1 break-all font-mono text-xs text-text-primary">
              {textPath}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => void handleOpenPath(textPath)}
                title={t('modules.clipboardManager.openFile', { defaultValue: 'Open file' })}
                className="flex items-center gap-1 rounded border border-border-base px-2 py-1 text-[10px] text-text-muted hover:text-text-primary hover:bg-bg-hover cursor-pointer transition-colors"
              >
                <SquareArrowOutUpRight size={10} />
                {t('modules.clipboardManager.openFile', { defaultValue: 'Open file' })}
              </button>
              <button
                onClick={() => void handleReveal(textPath)}
                title={t('modules.clipboardManager.openFolder', {
                  defaultValue: 'Open containing folder',
                })}
                className="flex items-center gap-1 rounded border border-border-base px-2 py-1 text-[10px] text-text-muted hover:text-text-primary hover:bg-bg-hover cursor-pointer transition-colors"
              >
                <FolderOpen size={10} />
                {t('modules.clipboardManager.openFolder', {
                  defaultValue: 'Open containing folder',
                })}
              </button>
            </span>
          </div>
        ) : full.clipType === 'file' ? (
          <div className="rounded-md border border-border-subtle bg-bg-overlay px-3 py-2">
            {filePaths.length > 0 ? (
              <ul className="space-y-1">
                {filePaths.map((p) => (
                  <li key={p} className="flex items-start gap-1.5 font-mono text-[11px] text-text-secondary">
                    <FileText size={11} className="mt-0.5 shrink-0 text-text-disabled" />
                    <span className="min-w-0 flex-1 break-all">{p}</span>
                    <span className="flex shrink-0 items-center">
                      <button
                        onClick={() => void handleOpenPath(p)}
                        title={t('modules.clipboardManager.openFile', { defaultValue: 'Open file' })}
                        className="rounded p-1 text-text-muted hover:text-text-primary hover:bg-bg-hover cursor-pointer transition-colors"
                      >
                        <SquareArrowOutUpRight size={11} />
                      </button>
                      <button
                        onClick={() => void handleReveal(p)}
                        title={t('modules.clipboardManager.openFolder', {
                          defaultValue: 'Open containing folder',
                        })}
                        className="rounded p-1 text-text-muted hover:text-text-primary hover:bg-bg-hover cursor-pointer transition-colors"
                      >
                        <FolderOpen size={11} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-mono text-[11px] text-text-muted">{full.content}</p>
            )}
          </div>
        ) : full.isSecret && !revealed ? (
          <div className="flex items-center justify-between rounded-md border border-border-subtle bg-bg-overlay px-3 py-2.5">
            <span className="font-mono text-xs text-text-muted">••••••••••••</span>
            <button
              onClick={() => setRevealed(true)}
              className="flex items-center gap-1 rounded p-1 text-[11px] text-text-muted hover:text-text-primary cursor-pointer"
            >
              <Eye size={12} />
              {t('modules.clipboardManager.reveal', { defaultValue: 'Reveal' })}
            </button>
          </div>
        ) : (
          <div className="relative rounded-md border border-border-subtle bg-bg-overlay px-3 py-2">
            <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-text-primary">
              {full.content}
            </pre>
            {full.isSecret && revealed && (
              <button
                onClick={() => setRevealed(false)}
                className="absolute right-1.5 top-1.5 rounded p-1 text-text-muted hover:text-text-primary hover:bg-bg-hover cursor-pointer"
                title={t('modules.clipboardManager.toggleSecret', { defaultValue: 'Show / hide' })}
              >
                <EyeOff size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Attached image — text entry captured together with a bitmap
          (e.g. spreadsheet selection, browser image with URL text) */}
      {full.clipType !== 'image' && full.attachedImagePath && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
              {t('modules.clipboardManager.detail.attachedImage', {
                defaultValue: 'Attached image',
              })}
            </p>
            <button onClick={() => void handleCopyAttachedImage()} className={ctxBtn}>
              <Copy size={11} />
              {t('modules.clipboardManager.copyAttachedImage', { defaultValue: 'Copy image' })}
            </button>
          </div>
          {imgSrc ? (
            <div
              className="group/img relative inline-block cursor-zoom-in"
              onClick={() => setZoom(true)}
              title={t('modules.clipboardManager.viewFullSize', {
                defaultValue: 'Click to view full size',
              })}
            >
              <img
                src={imgSrc}
                alt=""
                className="max-h-48 w-auto max-w-full rounded-md border border-border-subtle object-contain"
                draggable={false}
              />
              <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover/img:opacity-100">
                <Maximize2 size={11} />
              </span>
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center rounded-md border border-border-subtle bg-bg-overlay text-text-disabled">
              <ImageOff size={18} />
            </div>
          )}
        </div>
      )}

      {/* Metadata */}
      <div className="mt-4">
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-text-muted">
          {t('modules.clipboardManager.detail.meta', { defaultValue: 'Information' })}
        </p>
        <div className="rounded-md border border-border-subtle bg-bg-overlay/50 px-3 py-1 text-[11px]">
          <MetaRow
            label={t('modules.clipboardManager.detail.type.label', { defaultValue: 'Type' })}
            value={t(`modules.clipboardManager.detail.type.${full.clipType}`, {
              defaultValue: full.clipType,
            })}
          />
          <MetaRow
            label={t('modules.clipboardManager.detail.size', { defaultValue: 'Size' })}
            value={formatBytes(full.size)}
          />
          <MetaRow
            label={t('modules.clipboardManager.detail.captured', { defaultValue: 'Captured' })}
            value={formatDateTime(full.createdAt)}
          />
          <MetaRow
            label={t('modules.clipboardManager.detail.lastUsed', { defaultValue: 'Last used' })}
            value={
              full.lastUsedAt
                ? formatDateTime(full.lastUsedAt)
                : t('modules.clipboardManager.detail.neverUsed', { defaultValue: 'Never' })
            }
          />
          <MetaRow
            label={t('modules.clipboardManager.detail.copyCount', { defaultValue: 'Copy count' })}
            value={String(full.copyCount)}
          />
          <MetaRow
            label={t('modules.clipboardManager.detail.sourceApp', { defaultValue: 'Source app' })}
            value={
              full.sourceApp ||
              t('modules.clipboardManager.detail.unknown', { defaultValue: 'Unknown' })
            }
          />
          {full.sourceTitle && (
            <MetaRow
              label={t('modules.clipboardManager.detail.sourceTitle', {
                defaultValue: 'Source window',
              })}
              value={full.sourceTitle}
            />
          )}
        </div>
      </div>

      {/* Full-size image overlay (lightbox) */}
      {zoom && imgSrc && (
        <div
          className="fixed inset-0 z-[1000] flex cursor-zoom-out items-center justify-center bg-black/85 p-8"
          onClick={() => setZoom(false)}
        >
          <img
            src={imgSrc}
            alt=""
            className="max-h-full max-w-full rounded shadow-2xl object-contain"
            draggable={false}
          />
          <button
            onClick={() => setZoom(false)}
            title={t('common.close', { defaultValue: 'Close' })}
            className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 cursor-pointer transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </Drawer>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={metaRowCls}>
      <span className="shrink-0 text-text-muted">{label}</span>
      <span className="min-w-0 break-all text-right text-text-primary">{value}</span>
    </div>
  )
}

const metaRowCls =
  'flex items-start justify-between gap-4 border-b border-border-subtle py-2 last:border-0'
