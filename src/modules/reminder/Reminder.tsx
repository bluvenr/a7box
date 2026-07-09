/**
 * Reminder Module - Main Page Component
 * Displays reminder list with create/edit/detail via right-side Drawer.
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus, Bell, BellOff, Filter, CheckCircle, Keyboard, Save, Pencil } from 'lucide-react'
import { useReminderStore } from './reminderStore'
import { handleMarkDone, handleSnooze } from './notificationBridge'
import { useToast } from '../../components/Toast'
import Drawer from '../../components/Drawer'
import ReminderForm from './ReminderForm'
import ReminderDetail, { ReminderDetailFooter } from './ReminderDetail'
import type { Reminder, ReminderFormData } from './types'
import ReminderCard from './ReminderCard'
import { formatShortcut } from '../../shared/utils'
import { useShortcutStore } from '../../core/shortcuts'

type TabFilter = 'all' | 'pending' | 'completed'
type DrawerMode = 'closed' | 'create' | 'edit' | 'detail'

export default function ReminderPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const showToast = useToast()
  // Reactive shortcut subscription — stays in sync when user changes it in Settings
  const shortcutText = useShortcutStore((s) => {
    const sc = s.shortcuts.find((sc) => sc.action === 'quick-create-reminder')
    return sc?.enabled ? formatShortcut(sc.keys) : ''
  })
  const reminders = useReminderStore((s) => s.reminders)
  const addReminder = useReminderStore((s) => s.addReminder)
  const updateReminder = useReminderStore((s) => s.updateReminder)
  const deleteReminder = useReminderStore((s) => s.deleteReminder)
  const updateStatus = useReminderStore((s) => s.updateStatus)

  // Drawer state
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('closed')
  const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null)
  const [filter, setFilter] = useState<TabFilter>('all')

  // Form data ref (updated via onDataChange)
  const formDataRef = useRef<ReminderFormData | null>(null)

  // Force re-render every 30s for "overdue" status updates
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30000)
    return () => clearInterval(id)
  }, [])

  // ── Auto-open detail drawer when navigated from notification click ──
  useEffect(() => {
    const openId = (location.state as { openReminderId?: string } | null)?.openReminderId
    if (!openId) return

    // Clear the state so it doesn't reopen on revisit
    navigate(location.pathname, { replace: true, state: null })

    const reminder = reminders.find((r) => r.id === openId)
    if (reminder) {
      setSelectedReminder(reminder)
      setDrawerMode('detail')
    }
  }, [location.state, reminders, navigate, location.pathname])

  const filteredReminders = useMemo(() => {
    let list = [...reminders]
    if (filter === 'pending') list = list.filter((r) => r.status !== 'completed')
    if (filter === 'completed') list = list.filter((r) => r.status === 'completed')
    list.sort((a, b) => {
      if (a.status === 'completed' && b.status !== 'completed') return 1
      if (b.status === 'completed' && a.status !== 'completed') return -1
      return a.triggerAt - b.triggerAt
    })
    return list
  }, [reminders, filter])

  const overdueCount = reminders.filter(
    (r) => r.status === 'pending' && r.triggerAt <= Date.now()
  ).length
  const upcomingCount = reminders.filter(
    (r) => r.status === 'pending' && r.triggerAt > Date.now()
  ).length

  // Filter tab counts
  const tabCounts: Record<TabFilter, number> = {
    all: reminders.length,
    pending: reminders.filter((r) => r.status !== 'completed').length,
    completed: reminders.filter((r) => r.status === 'completed').length,
  }

  // ── Drawer handlers ──

  const closeDrawer = useCallback(() => {
    setDrawerMode('closed')
    setSelectedReminder(null)
    formDataRef.current = null
  }, [])

  // ── Form data change handler ──
  const handleFormDataChange = useCallback((data: ReminderFormData) => {
    formDataRef.current = data
  }, [])

  // Ref to the form container for calling __validate
  const formContainerRef = useRef<HTMLDivElement>(null)

  // ── Submit from Drawer footer ──
  const handleFormSubmit = useCallback(() => {
    // First, trigger form validation to show visual error feedback
    const formEl = formContainerRef.current?.querySelector('[data-form-container]') as any
    if (formEl?.__validate) {
      const valid = formEl.__validate()
      if (!valid) return
    }

    const data = formDataRef.current
    if (!data) return
    // Double-check critical constraints
    if (!data.title.trim()) return
    if (isNaN(data.triggerAt) || data.triggerAt < Date.now() - 60000) return

    if (drawerMode === 'edit' && selectedReminder) {
      updateReminder(selectedReminder.id, data)
      showToast(t('modules.reminder.ui.updated'))
    } else {
      addReminder(data)
      showToast(t('modules.reminder.ui.created'))
    }
    closeDrawer()
  }, [drawerMode, selectedReminder, addReminder, updateReminder, showToast, t, closeDrawer])

  // ── CRUD handlers ──

  const handleDelete = useCallback((id: string) => {
    deleteReminder(id)
    showToast(t('modules.reminder.ui.deleted'))
    closeDrawer()
  }, [deleteReminder, showToast, t, closeDrawer])

  const handleDone = useCallback((id: string) => {
    handleMarkDone(id)
    showToast(t('modules.reminder.ui.markedDone'))
  }, [showToast, t])

  const handleSnoozeClick = useCallback((id: string) => {
    handleSnooze(id)
    showToast(t('modules.reminder.ui.snoozedMsg'))
  }, [showToast, t])

  const handleRestore = useCallback((id: string) => {
    updateStatus(id, 'pending')
    showToast(t('modules.reminder.ui.restored'))
  }, [updateStatus, showToast, t])

  const openCreate = () => {
    setSelectedReminder(null)
    formDataRef.current = null
    setDrawerMode('create')
  }

  const openDetail = (r: Reminder) => {
    const latest = useReminderStore.getState().getById(r.id)
    setSelectedReminder(latest ?? r)
    setDrawerMode('detail')
  }

  const switchToEdit = () => {
    if (selectedReminder) {
      const latest = useReminderStore.getState().getById(selectedReminder.id)
      setSelectedReminder(latest ?? selectedReminder)
      setDrawerMode('edit')
    }
  }

  const handleEditFromCard = (r: Reminder) => {
    const latest = useReminderStore.getState().getById(r.id)
    setSelectedReminder(latest ?? r)
    setDrawerMode('edit')
  }

  // Keep selectedReminder in sync with store updates
  useEffect(() => {
    if (selectedReminder && drawerMode !== 'closed') {
      const latest = reminders.find((r) => r.id === selectedReminder.id)
      if (latest) setSelectedReminder(latest)
    }
  }, [reminders])

  // ── Drawer title ──
  const drawerTitle =
    drawerMode === 'create' ? t('modules.reminder.ui.newReminder')
    : drawerMode === 'edit' ? t('modules.reminder.ui.editing')
    : drawerMode === 'detail' ? selectedReminder?.title ?? ''
    : ''

  // ── Card event props ──
  const cardProps = {
    onEdit: handleEditFromCard,
    onDelete: handleDelete,
    onDone: handleDone,
    onSnooze: handleSnoozeClick,
    onRestore: handleRestore,
    onClick: openDetail,
  }

  // ── Form footer for create/edit modes ──
  const formFooter = (
    <div className="flex items-center justify-end gap-2">
      <button
        onClick={closeDrawer}
        className="rounded-lg px-4 py-2 text-xs text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
      >
        {t('common.cancel')}
      </button>
      <button
        onClick={handleFormSubmit}
        data-submit-btn
        className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary-hover transition-colors cursor-pointer"
      >
        {drawerMode === 'edit' ? <Pencil size={12} /> : <Save size={12} />}
        {drawerMode === 'edit' ? t('common.save') : t('modules.reminder.ui.create')}
      </button>
    </div>
  )

  return (
    <div className="relative flex h-full flex-col">
      {/* Fixed area: Header + Filter */}
      <div className="shrink-0 px-6 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Bell size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-text-primary">{t('modules.reminder.name')}</h1>
                {upcomingCount > 0 && (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {upcomingCount} {t('modules.reminder.ui.upcoming')}
                  </span>
                )}
                {overdueCount > 0 && (
                  <span className="rounded-full bg-error/15 px-2 py-0.5 text-[10px] font-medium text-error">
                    {overdueCount} {t('modules.reminder.ui.overdue')}
                  </span>
                )}
              </div>
              <p className="text-sm text-text-secondary">{t('modules.reminder.description')}</p>
            </div>
          </div>

          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary-hover transition-colors cursor-pointer"
          >
            <Plus size={13} />
            {t('modules.reminder.ui.newReminder')}
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-0.5 border-b border-border-subtle">
          <Filter size={12} className="text-text-muted mr-2" />
          {(['all', 'pending', 'completed'] as TabFilter[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors cursor-pointer mb-[-1px] border-b-2 ${
                filter === tab
                  ? 'border-primary text-text-primary'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
            >
              {t(`modules.reminder.ui.filter.${tab}`)}
              {tabCounts[tab] > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                  filter === tab ? 'bg-primary/15 text-primary' : 'bg-bg-hover text-text-muted'
                }`}>
                  {tabCounts[tab]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Reminder list (scrollable) */}
      <div className="flex-1 overflow-y-auto space-y-3 px-6 py-3" style={{ scrollbarGutter: 'stable' }}>
        {filteredReminders.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border-subtle bg-bg-elevated/30 py-16 text-text-muted">
            <BellOff size={36} className="mb-4 text-text-disabled" />
            <p className="text-sm mb-5">
              {filter === 'completed'
                ? t('modules.reminder.ui.emptyCompleted')
                : t('modules.reminder.ui.empty')}
            </p>
            {filter !== 'completed' && (
              <button
                onClick={openCreate}
                className="flex items-center gap-1.5 rounded-lg bg-primary/15 px-4 py-2 text-xs font-medium text-primary hover:bg-primary/25 transition-colors cursor-pointer"
              >
                <Plus size={13} />
                {t('modules.reminder.ui.emptyCreate')}
              </button>
            )}
          </div>
        ) : filter === 'all' ? (
          <>
            {/* Active section */}
            {filteredReminders.filter((r) => r.status !== 'completed').length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Bell size={11} className="text-text-muted" />
                  <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">
                    {t('modules.reminder.ui.section.active')}
                  </span>
                  <div className="flex-1 border-t border-border-subtle" />
                </div>
                <div className="space-y-3">
                  {filteredReminders
                    .filter((r) => r.status !== 'completed')
                    .map((reminder) => (
                      <ReminderCard key={reminder.id} reminder={reminder} {...cardProps} />
                    ))}
                </div>
              </div>
            )}

            {/* Completed section */}
            {filteredReminders.filter((r) => r.status === 'completed').length > 0 && (
              <div className={filteredReminders.filter((r) => r.status !== 'completed').length > 0 ? 'mt-5' : ''}>
                <div className="flex items-center gap-2 mb-1.5">
                  <CheckCircle size={11} className="text-text-muted" />
                  <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">
                    {t('modules.reminder.ui.section.completed')}
                  </span>
                  <div className="flex-1 border-t border-border-subtle" />
                </div>
                <div className="space-y-3">
                  {filteredReminders
                    .filter((r) => r.status === 'completed')
                    .map((reminder) => (
                      <ReminderCard key={reminder.id} reminder={reminder} {...cardProps} />
                    ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            {filteredReminders.map((reminder) => (
              <ReminderCard key={reminder.id} reminder={reminder} {...cardProps} />
            ))}
          </div>
        )}
      </div>

      {/* Shortcut hint */}
      <div className="shrink-0 flex items-center justify-end gap-1 px-6 py-3 text-text-disabled">
        <Keyboard size={11} />
        <span className="text-[11px]">{t('modules.reminder.ui.shortcutHint', { keys: shortcutText })}</span>
      </div>

      {/* ── Drawer ── */}
      <Drawer
        open={drawerMode !== 'closed'}
        onClose={closeDrawer}
        title={drawerTitle}
        footer={
          (drawerMode === 'create' || drawerMode === 'edit') ? formFooter
          : drawerMode === 'detail' && selectedReminder ? (
            <ReminderDetailFooter
              reminder={selectedReminder}
              onEdit={switchToEdit}
              onDelete={() => handleDelete(selectedReminder.id)}
              onDone={() => { handleDone(selectedReminder.id); closeDrawer() }}
              onRestore={() => handleRestore(selectedReminder.id)}
            />
          ) : undefined
        }
      >
        <div ref={formContainerRef}>
          {/* Create / Edit form */}
          {(drawerMode === 'create' || drawerMode === 'edit') && (
            <ReminderForm
              initial={drawerMode === 'edit' && selectedReminder ? {
                title: selectedReminder.title,
                note: selectedReminder.note ?? '',
                triggerAt: selectedReminder.triggerAt,
                repeat: selectedReminder.repeat,
              } : undefined}
              onDataChange={handleFormDataChange}
            />
          )}

          {/* Detail view */}
          {drawerMode === 'detail' && selectedReminder && (
            <ReminderDetail
              reminder={selectedReminder}
              onEdit={switchToEdit}
              onDelete={() => handleDelete(selectedReminder.id)}
              onDone={() => { handleDone(selectedReminder.id); closeDrawer() }}
              onRestore={() => handleRestore(selectedReminder.id)}
            />
          )}
        </div>
      </Drawer>
    </div>
  )
}
