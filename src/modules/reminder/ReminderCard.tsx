/**
 * ReminderCard - Single reminder item display
 */
import { useTranslation } from 'react-i18next'
import { Bell, Clock, Trash2, CheckCircle, Pencil, Repeat, AlertCircle, RotateCcw } from 'lucide-react'
import { useConfirm } from '../../components/Dialog'
import type { Reminder } from './types'

interface Props {
  reminder: Reminder
  onEdit: (r: Reminder) => void
  onDelete: (id: string) => void
  onDone: (id: string) => void
  onSnooze: (id: string) => void
  onRestore: (id: string) => void
  onClick?: (r: Reminder) => void
}

function formatTriggerTime(ts: number, t: (k: string, options?: any) => any, locale: string): string {
  const date = new Date(ts)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const isTomorrow = date.toDateString() === tomorrow.toDateString()

  const timeStr = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })

  // Get localized weekday label
  const weekdays = t('modules.reminder.ui.weekdays', { returnObjects: true }) as unknown as string[]
  const weekday = weekdays[date.getDay()] ?? ''

  if (isToday) return `${t('modules.reminder.ui.today')} ${weekday} ${timeStr}`
  if (isTomorrow) return `${t('modules.reminder.ui.tomorrow')} ${weekday} ${timeStr}`

  const dateStr = date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
  return `${dateStr} ${weekday} ${timeStr}`
}

function getRepeatLabel(repeat: Reminder['repeat'], t: (k: string, v?: any) => string): string | null {
  if (!repeat) return null
  switch (repeat.type) {
    case 'daily': return t('modules.reminder.ui.repeatDaily')
    case 'weekly': {
      if (repeat.weekdays?.length) {
        const weekdaysList = t('modules.reminder.ui.weekdays', { returnObjects: true }) as unknown as string[]
        const days = repeat.weekdays
          .slice()
          .sort((a, b) => a - b)
          .map((d) => weekdaysList[d] ?? '')
          .filter(Boolean)
          .join(t('modules.reminder.ui.weekdaySep'))
        return `${t('modules.reminder.ui.repeatWeekly')} ${days}`
      }
      return t('modules.reminder.ui.repeatWeekly')
    }
    case 'monthly': {
      const days = (repeat.monthDays ?? (repeat.monthDay ? [repeat.monthDay] : [1])).sort((a, b) => a - b)
      return `${t('modules.reminder.ui.repeatMonthly')} ${days.join(t('modules.reminder.ui.weekdaySep'))}`
    }
    case 'custom': {
      const val = repeat.interval ?? 1
      const unit = repeat.intervalUnit === 'minute' ? t('modules.reminder.ui.minutes')
        : repeat.intervalUnit === 'hour' ? t('modules.reminder.ui.hours')
        : t('modules.reminder.ui.days')
      return t('modules.reminder.ui.repeatCustom', { val, unit })
    }
  }
}

export default function ReminderCard({ reminder, onEdit, onDelete, onDone, onSnooze, onRestore, onClick }: Props) {
  const { t, i18n } = useTranslation()
  const confirm = useConfirm()
  const isOverdue = reminder.status === 'pending' && reminder.triggerAt <= Date.now()
  const isCompleted = reminder.status === 'completed'
  const isSnoozed = reminder.status === 'snoozed'

  const handleDelete = async () => {
    const ok = await confirm({
      title: t('modules.reminder.ui.deleteConfirmTitle'),
      message: t('modules.reminder.ui.deleteConfirmMsg'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      danger: true,
    })
    if (ok) onDelete(reminder.id)
  }

  return (
    <div
      onClick={() => onClick?.(reminder)}
      className={`
        group flex items-start gap-3 rounded-xl border p-4 transition-colors border-l-[3px] cursor-pointer
        ${isCompleted
          ? 'border-border-subtle border-l-success/40 bg-bg-base/50 opacity-70'
          : isOverdue
            ? 'border-error/20 border-l-error/60 bg-error/[0.03]'
            : isSnoozed
              ? 'border-border-base border-l-warning/50 bg-bg-elevated'
              : 'border-border-base border-l-primary/40 bg-bg-elevated hover:border-border-hover'
        }
      `}
    >
      {/* Status indicator */}
      <div className="mt-0.5 shrink-0">
        {isCompleted ? (
          <CheckCircle size={16} className="text-success" />
        ) : isOverdue ? (
          <AlertCircle size={16} className="text-error" />
        ) : isSnoozed ? (
          <Clock size={16} className="text-warning" />
        ) : (
          <Bell size={16} className="text-text-muted" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <span className={`text-sm font-medium truncate block ${isCompleted ? 'line-through text-text-muted' : ''}`}>
          {reminder.title}
        </span>

        <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
          <span className={isOverdue ? 'text-error' : ''}>
            {isSnoozed && reminder.snoozeUntil
              ? `${t('modules.reminder.ui.snoozed')} → ${formatTriggerTime(reminder.snoozeUntil, t, i18n.language)}`
              : formatTriggerTime(reminder.triggerAt, t, i18n.language)
            }
          </span>
          {reminder.repeat && (
            <span className="inline-flex items-center gap-0.5 rounded bg-info/10 px-1.5 py-0.5 text-[10px] text-info">
              <Repeat size={10} />
              {getRepeatLabel(reminder.repeat, t)}
            </span>
          )}
          {reminder.note && (
            <span className="truncate text-text-disabled">· {reminder.note}</span>
          )}
        </div>
      </div>

      {/* Actions: not completed — "mark done" always visible, others on hover */}
      {!isCompleted && (
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); onDone(reminder.id) }}
            className="rounded-md p-1.5 text-success/50 hover:text-success hover:bg-success/10 transition-colors cursor-pointer"
            title={t('modules.reminder.ui.markDone')}
          >
            <CheckCircle size={14} />
          </button>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onSnooze(reminder.id) }}
              className="rounded-md p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors cursor-pointer"
              title={t('modules.reminder.ui.snooze10m')}
            >
              <Clock size={14} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(reminder) }}
              className="rounded-md p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
              title={t('modules.reminder.ui.edit')}
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete() }}
              className="rounded-md p-1.5 text-text-muted hover:text-error hover:bg-error/10 transition-colors cursor-pointer"
              title={t('modules.reminder.ui.delete')}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Actions: completed */}
      {isCompleted && (
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); onRestore(reminder.id) }}
            className="rounded-md p-1.5 text-text-muted hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
            title={t('modules.reminder.ui.restore')}
          >
            <RotateCcw size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete() }}
            className="rounded-md p-1.5 text-text-muted hover:text-error hover:bg-error/10 transition-colors cursor-pointer"
            title={t('modules.reminder.ui.delete')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
