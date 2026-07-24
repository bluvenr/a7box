/**
 * CountdownTab - Countdown timer tab content
 * Includes: smart input, quick presets, recents, and active timer list.
 */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Timer, Check, ChevronDown, ChevronUp, Play, Clock, Pin, PinOff, Lightbulb } from 'lucide-react'
import { parseTimerInput } from './parseTimerInput'
import { useTimerStore, defaultTitle } from './timerStore'
import { formatDurationLabel } from './utils'
import CountdownCard from './CountdownCard'
import { isTauri } from '../../shared/utils'

/** Quick preset durations in ms */
const PRESETS = [
  { ms: 60_000, label: '1m' },
  { ms: 180_000, label: '3m' },
  { ms: 300_000, label: '5m' },
  { ms: 600_000, label: '10m' },
  { ms: 900_000, label: '15m' },
  { ms: 1_500_000, label: '25m', icon: '🍅' },
]

interface Props {
  now: number
}

export default function CountdownTab({ now }: Props) {
  const { t } = useTranslation()
  const addCountdown = useTimerStore((s) => s.addCountdown)
  const countdowns = useTimerStore((s) => s.countdowns)
  const recents = useTimerStore((s) => s.recents)
  const cdAutoSpawn = useTimerStore((s) => s.cdAutoSpawn)
  const setCdAutoSpawn = useTimerStore((s) => s.setCdAutoSpawn)
  const cdItemPinned = useTimerStore((s) => s.cdItemPinned)
  const addCdItemPinned = useTimerStore((s) => s.addCdItemPinned)

  // ── First-time tooltip for auto-float button ──
  const [showFloatTip, setShowFloatTip] = useState(() => {
    return !localStorage.getItem('a7box-float-tip-seen')
  })
  const handleFloatHover = useCallback(() => {
    if (showFloatTip) {
      localStorage.setItem('a7box-float-tip-seen', '1')
      // Hide after 3 seconds
      setTimeout(() => setShowFloatTip(false), 3000)
    }
  }, [showFloatTip])

  // Toggle global auto-spawn: spawn or close all individual countdown cards
  const toggleAutoSpawn = useCallback(async () => {
    if (!isTauri()) return
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      if (cdAutoSpawn) {
        // Turn off: close all item cards and clear pinned list
        await invoke('close_cd_item_windows')
        useTimerStore.setState({ cdItemPinned: [] })
        setCdAutoSpawn(false)
      } else {
        // Turn on: spawn cards for all active countdowns
        const active = useTimerStore.getState().countdowns.filter(
          (c) => c.status === 'running' || c.status === 'paused'
        )
        const newIds: string[] = []
        for (let i = 0; i < active.length; i++) {
          await invoke('show_cd_item_widget', { timerId: active[i].id, index: i })
          newIds.push(active[i].id)
        }
        newIds.forEach((id) => addCdItemPinned(id))
        setCdAutoSpawn(active.length > 0)
      }
    } catch { /* ignore */ }
  }, [cdAutoSpawn, setCdAutoSpawn, addCdItemPinned])

  // ── Smart input ──
  const [input, setInput] = useState('')
  const parsed = useMemo(() => parseTimerInput(input), [input])

  // ── Custom panel ──
  const [showCustom, setShowCustom] = useState(false)
  const [customH, setCustomH] = useState(0)
  const [customM, setCustomM] = useState(5)
  const [customS, setCustomS] = useState(0)
  const [customTitle, setCustomTitle] = useState('')

  // Separate active and completed
  const active = countdowns.filter((c) => c.status !== 'completed')
  const completed = countdowns.filter((c) => c.status === 'completed')

  // ── Create from input ──
  const handleCreateFromInput = useCallback(() => {
    if (!parsed.valid || parsed.duration <= 0) return
    const title = parsed.title || defaultTitle(parsed.duration, t)
    addCountdown(parsed.duration, title)
    setInput('')
  }, [parsed, addCountdown, t])

  // ── Create from preset ──
  const handleCreateFromPreset = useCallback((ms: number, _label: string) => {
    const title = defaultTitle(ms, t)
    addCountdown(ms, title)
  }, [addCountdown, t])

  // ── Create from custom panel ──
  const handleCreateFromCustom = useCallback(() => {
    const durationMs = (customH * 3600 + customM * 60 + customS) * 1000
    if (durationMs <= 0) return
    const title = customTitle.trim() || defaultTitle(durationMs, t)
    addCountdown(durationMs, title)
    setShowCustom(false)
    setCustomH(0)
    setCustomM(5)
    setCustomS(0)
    setCustomTitle('')
  }, [customH, customM, customS, customTitle, addCountdown, t])

  // ── Create from recent ──
  const handleCreateFromRecent = useCallback((durationMs: number, title: string) => {
    addCountdown(durationMs, title || defaultTitle(durationMs, t))
  }, [addCountdown, t])

  // ── Auto-spawn card when new countdown created while auto-spawn is active ──
  const prevIdsRef = useRef(new Set(countdowns.map((c) => c.id)))
  useEffect(() => {
    if (!cdAutoSpawn || !isTauri()) return
    const currentIds = new Set(countdowns.map((c) => c.id))
    const newIds = [...currentIds].filter((id) => !prevIdsRef.current.has(id))
    prevIdsRef.current = currentIds
    if (newIds.length === 0) return
    // Spawn cards for new running/paused countdowns
    const activeNow = countdowns.filter((c) => c.status === 'running' || c.status === 'paused')
    import('@tauri-apps/api/core').then(({ invoke }) => {
      newIds.forEach((id) => {
        const idx = activeNow.findIndex((c) => c.id === id)
        if (idx >= 0 && !cdItemPinned.includes(id)) {
          invoke('show_cd_item_widget', { timerId: id, index: idx }).then(() => {
            addCdItemPinned(id)
          }).catch(() => {})
        }
      })
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdowns, cdAutoSpawn])

  return (
    <div className="flex flex-col gap-4 h-full relative">
      {/* ── Auto-spawn toggle (top-right) ── */}
      <div className="absolute top-0 right-0 z-10" onMouseEnter={handleFloatHover}>
        <button
          onClick={toggleAutoSpawn}
          className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors cursor-pointer ${
            cdAutoSpawn
              ? 'bg-primary/15 text-primary'
              : 'text-text-muted hover:text-primary hover:bg-primary/5'
          }`}
          title={cdAutoSpawn ? t('timerWidget.autoSpawnOn') : t('timerWidget.autoSpawnOff')}
        >
          {cdAutoSpawn ? <PinOff size={11} /> : <Pin size={11} />}
          {cdAutoSpawn ? t('timerWidget.autoSpawnOn') : t('timerWidget.autoSpawnOff')}
        </button>
        {/* First-time enhanced tooltip */}
        {showFloatTip && (
          <div className="absolute top-full right-0 mt-1 w-48 p-2 rounded-lg bg-bg-elevated border border-border-base shadow-lg text-[10px] text-text-secondary animate-in fade-in slide-in-from-top-1">
            {t('timerWidget.autoSpawnHint')}
          </div>
        )}
      </div>

      {/* ── Smart Input ── */}
      <div className="shrink-0 pr-[120px]">
        <div className="flex items-center gap-2 rounded-xl border border-border-base bg-bg-overlay px-3 py-2.5 focus-within:border-border-focus transition-colors">
          <Timer size={14} className="text-text-muted shrink-0" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleCreateFromInput()
              }
            }}
            placeholder={t('modules.timer.ui.inputPlaceholder')}
            className="flex-1 min-w-0 bg-transparent text-sm text-text-primary placeholder:text-text-disabled outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center rounded border border-border-subtle bg-bg-base px-1.5 py-0.5 text-[9px] text-text-disabled">
            Enter
          </kbd>
        </div>

        {/* Parse result badge */}
        {input.trim() && parsed.valid && (
          <div className="mt-1.5 flex items-center gap-2 rounded-md bg-success/5 border border-success/20 px-3 py-1.5">
            <Check size={11} className="text-success shrink-0" />
            <span className="text-xs text-text-primary font-medium">
              {formatDurationLabel(parsed.duration)}
            </span>
            {parsed.title && (
              <span className="text-[10px] text-info truncate">· &ldquo;{parsed.title}&rdquo;</span>
            )}
          </div>
        )}

        {/* Parse failed hint */}
        {input.trim() && !parsed.valid && (
          <p className="mt-1 text-[10px] text-text-disabled pl-1">
            {t('modules.timer.ui.parseHint')}
          </p>
        )}
      </div>

      {/* ── Quick Presets ── */}
      <div className="shrink-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-text-muted shrink-0 mr-0.5">
            {t('modules.timer.ui.quickPresets')}:
          </span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => handleCreateFromPreset(p.ms, p.label)}
              className="rounded-lg border border-border-base bg-bg-overlay px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors cursor-pointer"
            >
              {p.icon && <span className="mr-0.5">{p.icon}</span>}
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setShowCustom(!showCustom)}
            className="flex items-center gap-1 rounded-lg border border-dashed border-border-base px-3 py-1.5 text-xs text-text-muted hover:text-text-secondary hover:border-border-hover transition-colors cursor-pointer"
          >
            {showCustom ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {t('modules.timer.ui.custom')}
          </button>
        </div>

        {/* Custom duration panel */}
        {showCustom && (
          <div className="mt-2 rounded-xl border border-border-base bg-bg-overlay p-3 space-y-3">
            <div className="flex items-center gap-2">
              <NumInput value={customH} onChange={setCustomH} max={23} label={t('modules.timer.ui.units.h')} />
              <span className="text-text-muted text-lg font-mono mt-4">:</span>
              <NumInput value={customM} onChange={setCustomM} max={59} label={t('modules.timer.ui.units.m')} />
              <span className="text-text-muted text-lg font-mono mt-4">:</span>
              <NumInput value={customS} onChange={setCustomS} max={59} label={t('modules.timer.ui.units.s')} />
            </div>
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder={t('modules.timer.ui.titleOptional')}
              maxLength={100}
              className="w-full rounded-lg border border-border-base bg-bg-base px-3 py-2 text-xs text-text-primary placeholder:text-text-disabled outline-none focus:border-border-focus transition-colors"
            />
            <button
              onClick={handleCreateFromCustom}
              disabled={customH === 0 && customM === 0 && customS === 0}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <Play size={12} />
              {t('modules.timer.ui.start')}
            </button>
          </div>
        )}
      </div>

      {/* ── Recents ── */}
      {recents.length > 0 && (
        <div className="shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-text-muted shrink-0 mr-0.5">
              {t('modules.timer.ui.recents')}:
            </span>
            {recents.map((r, i) => (
              <button
                key={`${r.duration}-${r.title}-${i}`}
                onClick={() => handleCreateFromRecent(r.duration, r.title)}
                className="rounded-lg border border-border-subtle bg-bg-base/50 px-2.5 py-1 text-[11px] text-text-muted hover:text-text-secondary hover:border-border-base transition-colors cursor-pointer truncate max-w-[120px]"
                title={`${formatDurationLabel(r.duration)}${r.title ? ` · ${r.title}` : ''}`}
              >
                {formatDurationLabel(r.duration)}
                {r.title && <span className="ml-1 text-text-disabled">{r.title}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Active countdowns ── */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-3" style={{ scrollbarGutter: 'stable' }}>
        {active.length === 0 && completed.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border-subtle bg-bg-elevated/30 py-16 text-text-muted">
            <Clock size={36} className="mb-4 text-text-disabled" />
            <p className="text-sm mb-2">{t('modules.timer.ui.empty')}</p>
            <p className="text-[10px] text-text-disabled">{t('modules.timer.ui.emptyHint')}</p>
            {isTauri() && (
              <div className="mt-4 flex items-center gap-1.5 text-[10px] text-text-muted">
                <Lightbulb size={11} className="text-warning" />
                <span>{t('timerWidget.emptyTip')}</span>
              </div>
            )}
          </div>
        ) : (
          <>
            {active.map((timer) => (
              <CountdownCard key={timer.id} timer={timer} now={now} />
            ))}

            {/* Completed section */}
            {completed.length > 0 && (
              <div className={active.length > 0 ? 'pt-2' : ''}>
                <div className="flex items-center gap-2 mb-1.5">
                  <Check size={11} className="text-text-muted" />
                  <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">
                    {t('modules.timer.ui.section.completed')}
                  </span>
                  <div className="flex-1 border-t border-border-subtle" />
                </div>
                <div className="space-y-3">
                  {completed.map((timer) => (
                    <CountdownCard key={timer.id} timer={timer} now={now} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** Number input with +/- buttons for custom duration panel */
function NumInput({ value, onChange, max, label }: {
  value: number
  onChange: (v: number) => void
  max: number
  label: string
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        className="rounded-md p-1 text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
      >
        <ChevronUp size={14} />
      </button>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => {
          const v = parseInt(e.target.value)
          onChange(isNaN(v) ? 0 : Math.min(max, Math.max(0, v)))
        }}
        className="w-14 rounded-lg border border-border-base bg-bg-base px-2 py-2 text-center text-lg font-mono font-bold text-text-primary outline-none focus:border-border-focus tabular-nums"
      />
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        className="rounded-md p-1 text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
      >
        <ChevronDown size={14} />
      </button>
      <span className="text-[10px] text-text-disabled">{label}</span>
    </div>
  )
}
