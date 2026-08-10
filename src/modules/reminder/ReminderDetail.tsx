/**
 * ReminderDetail - Read-only detail view inside Drawer
 * Shows full reminder info with action buttons.
 */
import { useTranslation } from 'react-i18next'
import {
  Bell, Clock, CheckCircle, Repeat,
  Pencil, Trash2, RotateCcw, Calendar, FileText,
} from 'lucide-react'
import { useConfirm } from '../../components/Dialog'
import { handleSnooze } from './notificationBridge'
import type { Reminder } from './types'

interface Props {
  reminder: Reminder
  onEdit: (r: Reminder) => void
  onDelete: (id: string) => void
  onDone: (id: string) => void
  onRestore: (id: string) => void
}


/** Format trigger time with weekday */
function formatTriggerDateTime(ts: number, locale: string): string {
  const d = new Date(ts)
  return d.toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Format timestamp without weekday: "2025/07/07 15:00" */
function formatTimestamp(ts: number, locale: string): string {
  const d = new Date(ts)
  return d.toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelativeTime(ts: number, t: (k: string, v?: any) => string): string {
  const now = Date.now()
  const diff = ts - now
  const absDiff = Math.abs(diff)

  const minutes = Math.floor(absDiff / 60_000)
  const hours = Math.floor(absDiff / 3_600_000)
  const days = Math.floor(absDiff / 86_400_000)

  if (diff < 0) {
    // Overdue
    if (minutes < 1) return t('modules.reminder.ui.detail.relativeNow')
    if (hours < 1) return t('modules.reminder.ui.detail.relativeOverdueMin', { m: minutes })
    if (days < 1) return t('modules.reminder.ui.detail.relativeOverdueHour', { h: hours })
    return t('modules.reminder.ui.detail.relativeOverdueDay', { d: days })
  } else {
    // Upcoming
    if (minutes < 1) return t('modules.reminder.ui.detail.relativeNow')
    if (hours < 1) return t('modules.reminder.ui.detail.relativeInMin', { m: minutes })
    if (days < 1) return t('modules.reminder.ui.detail.relativeInHour', { h: hours })
    return t('modules.reminder.ui.detail.relativeInDay', { d: days })
  }
}

function getRepeatDetail(repeat: Reminder['repeat'], t: (k: string, v?: any) => string, locale: string): string {
  if (!repeat) return t('modules.reminder.ui.detail.noRepeat')
  let label: string
  switch (repeat.type) {
    case 'daily':
      label = t('modules.reminder.ui.repeatDaily')
      break
    case 'weekly': {
      const weekdaysList = t('modules.reminder.ui.weekdays', { returnObjects: true }) as unknown as string[]
      const days = (repeat.weekdays ?? [])
        .slice()
        .sort((a, b) => a - b)
        .map((d) => weekdaysList[d] ?? '')
        .filter(Boolean)
        .join(t('modules.reminder.ui.weekdaySep'))
      label = days
        ? t('modules.reminder.ui.detail.weeklyOn', { days })
        : t('modules.reminder.ui.repeatWeekly')
      break
    }
    case 'monthly': {
      const days = (repeat.monthDays ?? (repeat.monthDay ? [repeat.monthDay] : [1])).sort((a, b) => a - b)
      if (days.length <= 1) {
        label = t('modules.reminder.ui.detail.monthlyOn', { day: days[0] ?? 1 })
      } else {
        label = t('modules.reminder.ui.detail.monthlyOnDays', { days: days.join(t('modules.reminder.ui.weekdaySep')) })
      }
      break
    }
    case 'custom': {
      const val = repeat.interval ?? 1
      const unit = repeat.intervalUnit === 'minute' ? t('modules.reminder.ui.minutes')
        : repeat.intervalUnit === 'hour' ? t('modules.reminder.ui.hours')
        : t('modules.reminder.ui.days')
      label = t('modules.reminder.ui.repeatCustom', { val, unit })
      break
    }
    default:
      label = t('modules.reminder.ui.detail.noRepeat')
  }
  // Append end date if set
  if (repeat.endDate) {
    const endDateStr = new Date(repeat.endDate).toLocaleDateString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    label += ` \u00b7 ${t('modules.reminder.ui.detail.repeatEnd', { date: endDateStr })}`
  }
  return label
}

const statusConfig = {
  pending: { icon: Bell, color: 'text-primary', bg: 'bg-primary/10' },
  completed: { icon: CheckCircle, color: 'text-success', bg: 'bg-success/10' },
  snoozed: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
}

export default function ReminderDetail({ reminder }: Props) {
  const { t, i18n } = useTranslation()

  const isOverdue = reminder.status === 'pending' && reminder.triggerAt <= Date.now()
  const isCompleted = reminder.status === 'completed'

  const statusKey = isOverdue ? 'statusOverdue'
    : reminder.status === 'completed' ? 'statusCompleted'
    : reminder.status === 'snoozed' ? 'statusSnoozed'
    : 'statusPending'

  const StatusIcon = statusConfig[reminder.status === 'snoozed' ? 'snoozed' : isCompleted ? 'completed' : 'pending'].icon
  const statusColor = statusConfig[reminder.status === 'snoozed' ? 'snoozed' : isCompleted ? 'completed' : 'pending'].color
  const statusBg = statusConfig[reminder.status === 'snoozed' ? 'snoozed' : isCompleted ? 'completed' : 'pending'].bg

  const relativeLabel = formatRelativeTime(reminder.triggerAt, t)

  return (
    <div className="space-y-5">
      {/* Status badge */}
      <div className="flex items-center gap-2">
        <div className={`flex h-7 items-center gap-1.5 rounded-full px-2.5 ${statusBg}`}>
          <StatusIcon size={12} className={statusColor} />
          <span className={`text-[11px] font-medium ${statusColor}`}>
            {t(`modules.reminder.ui.detail.${statusKey}`)}
          </span>
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-muted">
          {t('modules.reminder.ui.detail.title')}
        </label>
        <p className="text-base font-medium text-text-primary">{reminder.title}</p>
      </div>

      {/* Note */}
      <div>
        <label className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-text-muted">
          <FileText size={10} />
          {t('modules.reminder.ui.detail.note')}
        </label>
        <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
          {reminder.note || <span className="italic text-text-disabled">{t('modules.reminder.ui.detail.noNote')}</span>}
        </p>
      </div>

      {/* Divider */}
      <div className="border-t border-border-subtle" />

      {/* Trigger Time */}
      <div>
        <label className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-text-muted">
          <Calendar size={10} />
          {t('modules.reminder.ui.detail.triggerTime')}
        </label>
        <p className={`text-sm ${isOverdue ? 'text-error font-medium' : 'text-text-primary'}`}>
          {formatTriggerDateTime(reminder.triggerAt, i18n.language)}
          {relativeLabel && (
            <span className="ml-2 text-xs text-text-muted">({relativeLabel})</span>
          )}
        </p>
        {reminder.status === 'snoozed' && reminder.snoozeUntil && (
          <p className="mt-0.5 text-[11px] text-warning">
            {t('modules.reminder.ui.snoozed')} → {formatTriggerDateTime(reminder.snoozeUntil, i18n.language)}
          </p>
        )}
        {!!reminder.advanceMinutes && (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-text-muted">
            <Bell size={10} className="text-warning" />
            {t('modules.reminder.ui.detail.advanceNotice', {
              defaultValue: '{{n}} min before',
              n: reminder.advanceMinutes,
            })}
          </p>
        )}
      </div>

      {/* Repeat */}
      <div>
        <label className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-text-muted">
          <Repeat size={10} />
          {t('modules.reminder.ui.detail.repeat')}
        </label>
        <p className="text-sm text-text-primary">
          {getRepeatDetail(reminder.repeat, t, i18n.language)}
        </p>
      </div>

      {/* Divider */}
      <div className="border-t border-border-subtle" />

      {/* Timestamps */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-disabled">
            {t('modules.reminder.ui.detail.createdAt')}
          </label>
          <p className="text-[11px] text-text-muted">{formatTimestamp(reminder.createdAt, i18n.language)}</p>
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-disabled">
            {t('modules.reminder.ui.detail.updatedAt')}
          </label>
          <p className="text-[11px] text-text-muted">{formatTimestamp(reminder.updatedAt, i18n.language)}</p>
        </div>
      </div>
    </div>
  )
}

/** Detail footer rendered in Drawer footer slot */
export function ReminderDetailFooter({
  reminder,
  onEdit,
  onDelete,
  onDone,
  onRestore,
}: {
  reminder: Reminder
  onEdit: () => void
  onDelete: () => void
  onDone: () => void
  onRestore: () => void
}) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const isCompleted = reminder.status === 'completed'

  const handleDeleteWithConfirm = async () => {
    const ok = await confirm({
      title: t('modules.reminder.ui.deleteConfirmTitle'),
      message: t('modules.reminder.ui.deleteConfirmMsg'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      danger: true,
    })
    if (ok) onDelete()
  }

  if (isCompleted) {
    return (
      <div className="flex items-center justify-between">
        <button
          onClick={onRestore}
          className="flex items-center gap-1.5 rounded-lg border border-border-base px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover transition-colors cursor-pointer"
        >
          <RotateCcw size={12} />
          {t('modules.reminder.ui.restore')}
        </button>
        <button
          onClick={handleDeleteWithConfirm}
          className="flex items-center gap-1.5 rounded-lg bg-error/10 px-3 py-2 text-xs text-error hover:bg-error/20 transition-colors cursor-pointer"
        >
          <Trash2 size={12} />
          {t('modules.reminder.ui.delete')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {/* Left: mark done */}
      <button
        onClick={onDone}
        className="flex items-center gap-1.5 rounded-lg bg-success/10 px-3 py-2 text-xs font-medium text-success hover:bg-success/20 transition-colors cursor-pointer"
      >
        <CheckCircle size={12} />
        {t('modules.reminder.ui.markDone')}
      </button>
      {/* Middle: snooze */}
      <button
        onClick={() => { handleSnooze(reminder.id) }}
        className="flex items-center gap-1.5 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning hover:bg-warning/20 transition-colors cursor-pointer"
      >
        <Clock size={12} />
        {t('modules.reminder.ui.snooze10m')}
      </button>
      {/* Right: edit + delete */}
      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={onEdit}
          className="flex items-center gap-1 rounded-lg border border-border-base px-2.5 py-2 text-xs text-text-secondary hover:bg-bg-hover transition-colors cursor-pointer"
          title={t('modules.reminder.ui.edit')}
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={handleDeleteWithConfirm}
          className="flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs text-error hover:bg-error/10 transition-colors cursor-pointer"
          title={t('modules.reminder.ui.delete')}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}
