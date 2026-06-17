/**
 * A7Box Toast System
 * Centralized toast notification via React Context + portal
 * Usage: const { showToast } = useToast()
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: number
  message: string
  type: ToastType
  duration: number
}

interface ToastContextValue {
  /** Show a toast notification */
  showToast: (message: string, type?: ToastType, duration?: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let toastIdCounter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const showToast = useCallback((message: string, type: ToastType = 'success', duration = 2500) => {
    const id = ++toastIdCounter
    const toast: ToastItem = { id, message, type, duration }
    setToasts((prev) => [...prev, toast])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, duration)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container - fixed bottom-right */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // Fallback for use outside provider (shouldn't happen)
    return {
      showToast: (message: string) => console.log('[Toast]', message),
    }
  }
  return ctx
}

// Individual toast card
function ToastCard({ toast }: { toast: ToastItem }) {
  const icons: Record<ToastType, typeof CheckCircle> = {
    success: CheckCircle,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
  }
  const colors: Record<ToastType, string> = {
    success: 'border-success/30 bg-success/10 text-success',
    error: 'border-error/30 bg-error/10 text-error',
    warning: 'border-warning/30 bg-warning/10 text-warning',
    info: 'border-info/30 bg-info/10 text-info',
  }

  const Icon = icons[toast.type]

  return (
    <div
      className={`pointer-events-auto flex items-center gap-2.5 rounded-lg border px-4 py-2.5 shadow-lg backdrop-blur-sm animate-in slide-in-from-right ${colors[toast.type]}`}
      style={{ animation: 'toastSlideIn 0.25s ease-out' }}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="text-sm font-medium">{toast.message}</span>
    </div>
  )
}
