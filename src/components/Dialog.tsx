/**
 * Global Dialog System
 * Centered modal dialogs for confirmations, alerts, and info display.
 * Same architecture as Toast: Zustand store + hooks + container in MainLayout.
 */
import { create } from 'zustand'
import { useCallback, useEffect, useRef } from 'react'
import { AlertTriangle, Info, X } from 'lucide-react'

// ---- Types ----

interface ConfirmOptions {
  title: string
  message: string
  detail?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

interface AlertOptions {
  title: string
  message: string
  detail?: string
  okText?: string
  icon?: 'info' | 'warning'
}

interface DialogState {
  // Confirm dialog
  confirmDialog: (ConfirmOptions & { resolve: (v: boolean) => void }) | null
  // Alert dialog
  alertDialog: (AlertOptions & { resolve: () => void }) | null
}

interface DialogStore {
  state: DialogState
  confirm: (opts: ConfirmOptions) => Promise<boolean>
  alert: (opts: AlertOptions) => Promise<void>
  resolveConfirm: (value: boolean) => void
  resolveAlert: () => void
}

// ---- Store ----

export const useDialogStore = create<DialogStore>((set, get) => ({
  state: { confirmDialog: null, alertDialog: null },

  confirm: (opts) =>
    new Promise<boolean>((resolve) => {
      set((s) => ({
        state: { ...s.state, confirmDialog: { ...opts, resolve } },
      }))
    }),

  alert: (opts) =>
    new Promise<void>((resolve) => {
      set((s) => ({
        state: { ...s.state, alertDialog: { ...opts, resolve } },
      }))
    }),

  resolveConfirm: (value) => {
    const { confirmDialog } = get().state
    if (confirmDialog) {
      confirmDialog.resolve(value)
      set((s) => ({ state: { ...s.state, confirmDialog: null } }))
    }
  },

  resolveAlert: () => {
    const { alertDialog } = get().state
    if (alertDialog) {
      alertDialog.resolve()
      set((s) => ({ state: { ...s.state, alertDialog: null } }))
    }
  },
}))

// ---- Convenience hooks ----

/** Call `await confirm({ title, message, ... })` from anywhere */
export function useConfirm() {
  const fn = useDialogStore((s) => s.confirm)
  return useCallback((opts: ConfirmOptions) => fn(opts), [fn])
}

/** Call `await alert({ title, message, ... })` from anywhere */
export function useAlert() {
  const fn = useDialogStore((s) => s.alert)
  return useCallback((opts: AlertOptions) => fn(opts), [fn])
}

// ---- Container (mount once in MainLayout) ----

export function DialogContainer() {
  const confirmDialog = useDialogStore((s) => s.state.confirmDialog)
  const alertDialog = useDialogStore((s) => s.state.alertDialog)
  const resolveConfirm = useDialogStore((s) => s.resolveConfirm)
  const resolveAlert = useDialogStore((s) => s.resolveAlert)

  return (
    <>
      {confirmDialog && (
        <ConfirmModal
          opts={confirmDialog}
          onConfirm={() => resolveConfirm(true)}
          onCancel={() => resolveConfirm(false)}
        />
      )}
      {alertDialog && (
        <AlertModal
          opts={alertDialog}
          onOk={() => resolveAlert()}
        />
      )}
    </>
  )
}

// ---- Confirm modal ----

function ConfirmModal({
  opts,
  onConfirm,
  onCancel,
}: {
  opts: ConfirmOptions
  onConfirm: () => void
  onCancel: () => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)

  // ESC to cancel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  useEffect(() => {
    cardRef.current?.focus()
  }, [])

  const Icon = opts.danger ? AlertTriangle : Info
  const iconColor = opts.danger ? 'text-red-400' : 'text-blue-400'
  const btnColor = opts.danger
    ? 'bg-red-500 hover:bg-red-600'
    : 'bg-primary hover:bg-primary/90'

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
      style={{ animation: 'dialogFadeIn 0.15s ease-out' }}
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        className="relative w-full max-w-sm mx-4 rounded-xl border border-border-subtle bg-bg-elevated shadow-2xl outline-none p-5"
        style={{ animation: 'dialogScaleIn 0.15s ease-out' }}
      >
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <Icon size={18} className={`${iconColor} shrink-0 mt-0.5`} />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text-primary">{opts.title}</h3>
            <p className="mt-1 text-xs text-text-secondary leading-relaxed">{opts.message}</p>
            {opts.detail && (
              <p className="mt-1.5 text-[11px] text-text-muted">{opts.detail}</p>
            )}
          </div>
          <button
            onClick={onCancel}
            className="shrink-0 text-text-muted hover:text-text-primary cursor-pointer -mt-1 -mr-1 p-1"
          >
            <X size={14} />
          </button>
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border-base px-4 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover cursor-pointer transition"
          >
            {opts.cancelText || 'Cancel'}
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-1.5 text-xs font-medium text-white cursor-pointer transition ${btnColor}`}
          >
            {opts.confirmText || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Alert modal ----

function AlertModal({
  opts,
  onOk,
}: {
  opts: AlertOptions
  onOk: () => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)

  // ESC or Enter to dismiss
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') onOk()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onOk])

  useEffect(() => {
    cardRef.current?.focus()
  }, [])

  const Icon = opts.icon === 'warning' ? AlertTriangle : Info
  const iconColor = opts.icon === 'warning' ? 'text-yellow-400' : 'text-blue-400'

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onOk}
      style={{ animation: 'dialogFadeIn 0.15s ease-out' }}
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        className="relative w-full max-w-sm mx-4 rounded-xl border border-border-subtle bg-bg-elevated shadow-2xl outline-none p-5"
        style={{ animation: 'dialogScaleIn 0.15s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3">
          <Icon size={18} className={`${iconColor} shrink-0 mt-0.5`} />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text-primary">{opts.title}</h3>
            <p className="mt-1 text-xs text-text-secondary leading-relaxed">{opts.message}</p>
            {opts.detail && (
              <p className="mt-1.5 text-[11px] text-text-muted">{opts.detail}</p>
            )}
          </div>
        </div>

        {/* OK button */}
        <div className="flex justify-end mt-4">
          <button
            onClick={onOk}
            className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white hover:bg-primary/90 cursor-pointer transition"
          >
            {opts.okText || 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}
