/**
 * ReminderBanner - In-app notification banner for due reminders
 * Mounted in MainLayout. Shows a persistent banner when a reminder is due.
 * Supports done / snooze / dismiss actions.
 */
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCircle, Clock, Eye, X } from 'lucide-react'
import { useReminderBannerStore } from '../modules/reminder/notificationBridge'
import { handleMarkDone, handleSnooze } from '../modules/reminder/notificationBridge'
import { useToast } from './Toast'

export function ReminderBanner() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const showToast = useToast()
  const current = useReminderBannerStore((s) => s.current)
  const dismissCurrent = useReminderBannerStore((s) => s.dismissCurrent)

  if (!current) return null

  const { reminder } = current

  const handleDone = () => {
    handleMarkDone(reminder.id)
    showToast(t('modules.reminder.ui.markedDone'))
    dismissCurrent()
  }

  const handleSnoozeClick = () => {
    handleSnooze(reminder.id)
    showToast(t('modules.reminder.ui.snoozedMsg'))
    dismissCurrent()
  }

  const handleView = () => {
    navigate('/reminder', { state: { openReminderId: reminder.id } })
    dismissCurrent()
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[88px] z-[9998] flex justify-center">
      <div className="pointer-events-auto flex w-full max-w-[480px] items-center gap-3 rounded-xl border border-primary/30 bg-bg-elevated px-4 py-3 shadow-2xl animate-[toastSlideIn_0.25s_ease-out]">
        {/* Icon */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Bell size={16} />
        </div>

        {/* Content (clickable to view details) */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={handleView}>
          <p className="text-sm font-medium text-text-primary truncate">{reminder.title}</p>
          <p className="text-[11px] text-text-muted">
            {t('modules.reminder.ui.banner.triggerPrefix')}
          </p>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={handleView}
            className="flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer"
          >
            <Eye size={11} />
            {t('modules.reminder.ui.banner.view')}
          </button>
          <button
            onClick={handleDone}
            className="flex items-center gap-1 rounded-md bg-success/10 px-2.5 py-1.5 text-[11px] font-medium text-success hover:bg-success/20 transition-colors cursor-pointer"
          >
            <CheckCircle size={11} />
            {t('modules.reminder.ui.banner.done')}
          </button>
          <button
            onClick={handleSnoozeClick}
            className="flex items-center gap-1 rounded-md bg-warning/10 px-2.5 py-1.5 text-[11px] font-medium text-warning hover:bg-warning/20 transition-colors cursor-pointer"
          >
            <Clock size={11} />
            {t('modules.reminder.ui.banner.snooze')}
          </button>
          <button
            onClick={dismissCurrent}
            className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted hover:bg-bg-hover hover:text-text-secondary transition-colors cursor-pointer ml-0.5"
            title={t('modules.reminder.ui.banner.dismiss')}
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
