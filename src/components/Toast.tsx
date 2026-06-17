/**
 * Global Toast System
 * Top-center toast notifications for copy feedback, action results, etc.
 */
import { create } from 'zustand'
import { useCallback, useEffect } from 'react'
import { Check, AlertCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

interface ToastStore {
  toasts: ToastItem[]
  add: (message: string, type?: ToastType) => void
  remove: (id: number) => void
}

let nextId = 0

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (message, type = 'success') => {
    const id = ++nextId
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 2200)
  },
  remove: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))

/** Convenience hook – call from anywhere */
export function useToast() {
  const add = useToastStore((s) => s.add)
  return useCallback(
    (message: string, type?: ToastType) => add(message, type),
    [add],
  )
}

const iconMap = {
  success: Check,
  error: AlertCircle,
  info: Info,
}
const colorMap = {
  success: 'border-green-500/40 bg-green-500/15 text-green-400',
  error: 'border-red-500/40 bg-red-500/15 text-red-400',
  info: 'border-blue-500/40 bg-blue-500/15 text-blue-400',
}

/** Mount once in MainLayout */
export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const remove = useToastStore((s) => s.remove)

  return (
    <div className="pointer-events-none fixed inset-x-0 top-10 z-[9999] flex flex-col items-center gap-2">
      {toasts.map((item) => {
        const Icon = iconMap[item.type]
        return (
          <ToastItem key={item.id} item={item} Icon={Icon} onClose={() => remove(item.id)} />
        )
      })}
    </div>
  )
}

function ToastItem({
  item,
  Icon,
  onClose,
}: {
  item: ToastItem
  Icon: typeof Check
  onClose: () => void
}) {
  // Auto-animate in
  useEffect(() => {
    const el = document.getElementById(`toast-${item.id}`)
    if (el) {
      requestAnimationFrame(() => {
        el.style.opacity = '1'
        el.style.transform = 'translateY(0)'
      })
    }
  }, [item.id])

  return (
    <div
      id={`toast-${item.id}`}
      className={`pointer-events-auto flex items-center gap-2 rounded-lg border px-4 py-2 text-xs shadow-lg backdrop-blur-sm transition-all duration-200 ${colorMap[item.type]}`}
      style={{ opacity: 0, transform: 'translateY(-8px)' }}
    >
      <Icon size={13} />
      <span>{item.message}</span>
      <button onClick={onClose} className="ml-1 opacity-60 hover:opacity-100 cursor-pointer">
        <X size={11} />
      </button>
    </div>
  )
}
