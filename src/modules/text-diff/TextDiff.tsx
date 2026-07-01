/**
 * A7Box Text Diff Module
 * Compares two texts with Unified/Split views and word-level highlighting
 */
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FileDiff, Copy, Check, ArrowRightLeft, X, FileUp, Trash2,
} from 'lucide-react'
import { useToast } from '../../components/Toast'
import { usePageActive } from '../../app/layouts/CachedOutlet'

const MAX_DIFF_LINES = 2000

// === Types ===

type DiffLine = {
  type: 'same' | 'added' | 'removed'
  text: string
  leftLineNo: number | null
  rightLineNo: number | null
}

type ViewMode = 'unified' | 'split'

// === Word-level LCS diff ===

function wordDiff(oldText: string, newText: string): { oldParts: string[]; newParts: string[] } {
  const oldWords = oldText.split(/(\s+)/)
  const newWords = newText.split(/(\s+)/)
  const m = oldWords.length
  const n = newWords.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = oldWords[i - 1] === newWords[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
  const oldParts: string[] = []
  const newParts: string[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      oldParts.unshift(oldWords[i - 1]); newParts.unshift(newWords[j - 1]); i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      newParts.unshift(newWords[j - 1]); j--
    } else {
      oldParts.unshift(oldWords[i - 1]); i--
    }
  }
  return { oldParts, newParts }
}

// === Line-level diff with line number tracking ===

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const m = oldLines.length
  const n = newLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = oldLines[i - 1] === newLines[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])

  const result: DiffLine[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: 'same', text: oldLines[i - 1], leftLineNo: m - i + 1, rightLineNo: n - j + 1 })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', text: newLines[j - 1], leftLineNo: null, rightLineNo: n - j + 1 })
      j--
    } else {
      result.unshift({ type: 'removed', text: oldLines[i - 1], leftLineNo: m - i + 1, rightLineNo: null })
      i--
    }
  }
  return result
}

// === Utilities ===

/** Indices of 'added' entries that follow a 'removed' entry (modified pairs) */
function computeModifiedPairs(diffs: DiffLine[]): Set<number> {
  const s = new Set<number>()
  for (let i = 0; i < diffs.length - 1; i++) {
    if (diffs[i].type === 'removed' && diffs[i + 1].type === 'added') {
      s.add(i + 1)
      i++
    }
  }
  return s
}

function computeStats(diffs: DiffLine[]) {
  let added = 0, removed = 0, same = 0, modified = 0
  const mp = computeModifiedPairs(diffs)
  for (let i = 0; i < diffs.length; i++) {
    if (diffs[i].type === 'same') same++
    else if (diffs[i].type === 'added' && !mp.has(i)) added++
    else if (diffs[i].type === 'removed' && !(i < diffs.length - 1 && mp.has(i + 1))) removed++
    else if (mp.has(i)) { modified++; i++ }
  }
  return { added, removed, same, modified }
}

function formatUnified(diffs: DiffLine[]): string {
  return diffs
    .map(d => {
      const ln = String(d.leftLineNo ?? '').padStart(4)
      const rn = String(d.rightLineNo ?? '').padStart(4)
      const m = d.type === 'added' ? '+' : d.type === 'removed' ? '-' : ' '
      return `${ln} ${rn} ${m} ${d.text}`
    })
    .join('\n')
}

function formatSplit(diffs: DiffLine[]): string {
  const lines: string[] = []
  for (let i = 0; i < diffs.length; i++) {
    const d = diffs[i]
    if (d.type === 'same') {
      lines.push(`${d.leftLineNo} | ${d.rightLineNo} |   ${d.text}`)
    } else if (d.type === 'removed' && i < diffs.length - 1 && diffs[i + 1].type === 'added') {
      lines.push(`${d.leftLineNo} |      | - ${d.text}`)
      lines.push(`      | ${diffs[i + 1].rightLineNo} | + ${diffs[i + 1].text}`)
      i++
    } else if (d.type === 'removed') {
      lines.push(`${d.leftLineNo} |      | - ${d.text}`)
    } else {
      lines.push(`      | ${d.rightLineNo} | + ${d.text}`)
    }
  }
  return lines.join('\n')
}

// === Component ===

export default function TextDiff() {
  const { t } = useTranslation()
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('unified')
  const [copiedDiff, setCopiedDiff] = useState(false)
  const [dragSide, setDragSide] = useState<'left' | 'right' | null>(null)
  const toast = useToast()
  const pageActive = usePageActive()
  const leftFileRef = useRef<HTMLInputElement>(null)
  const rightFileRef = useRef<HTMLInputElement>(null)
  const leftPanelRef = useRef<HTMLDivElement>(null)
  const rightPanelRef = useRef<HTMLDivElement>(null)

  const diffs = useMemo(
    () => (left || right ? computeDiff(left, right) : []),
    [left, right],
  )
  const stats = useMemo(() => computeStats(diffs), [diffs])
  const modifiedPairIndices = useMemo(() => computeModifiedPairs(diffs), [diffs])
  const leftLineCount = left ? left.split('\n').length : 0
  const rightLineCount = right ? right.split('\n').length : 0
  const tooLarge = leftLineCount > MAX_DIFF_LINES || rightLineCount > MAX_DIFF_LINES

  const swapTexts = () => { const tmp = left; setLeft(right); setRight(tmp) }
  const clearAll = () => { setLeft(''); setRight('') }

  const copyResult = async () => {
    const text = viewMode === 'unified' ? formatUnified(diffs) : formatSplit(diffs)
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('set_clipboard_text', { text })
      } else {
        await navigator.clipboard.writeText(text)
      }
    } catch { /* clipboard error */ }
    setCopiedDiff(true)
    setTimeout(() => setCopiedDiff(false), 1500)
  }

  const handlePaste = useCallback(async (side: 'left' | 'right') => {
    try {
      let text: string
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const { invoke } = await import('@tauri-apps/api/core')
        text = await invoke<string>('get_clipboard_text')
      } else {
        text = await navigator.clipboard.readText()
      }
      if (side === 'left') setLeft(text)
      else setRight(text)
    } catch { /* clipboard error */ }
  }, [])

  const TEXT_FILE_RE = /\.(txt|md|json|js|jsx|ts|tsx|css|html|xml|yaml|yml|csv|log|py|java|c|cpp|h|hpp|rs|go|rb|sh|bat|sql|ini|cfg|toml|env)$/i

  const isTextFile = useCallback((name: string) => TEXT_FILE_RE.test(name), [])

  const handleFileImport = (file: File, side: 'left' | 'right') => {
    if (!file.type.startsWith('text/') && !isTextFile(file.name)) {
      toast(t('modules.textDiff.binaryError', { defaultValue: 'Unsupported file type' }), 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      side === 'left' ? setLeft(text) : setRight(text)
    }
    reader.readAsText(file)
  }

  const handleTauriFileImport = useCallback(async (filePath: string, side: 'left' | 'right') => {
    const fileName = filePath.split(/[\\/]/).pop() || ''
    if (!isTextFile(fileName)) {
      toast(t('modules.textDiff.binaryError', { defaultValue: 'Unsupported file type' }), 'error')
      return
    }
    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs')
      const text = await readTextFile(filePath)
      side === 'left' ? setLeft(text) : setRight(text)
    } catch { /* file read error */ }
  }, [toast, t, isTextFile])

  const handleDrop = (e: React.DragEvent, side: 'left' | 'right') => {
    e.preventDefault()
    e.stopPropagation()
    setDragSide(null)
    const file = e.dataTransfer.files[0]
    if (file) handleFileImport(file, side)
  }

  const handleDragOver = (e: React.DragEvent, side: 'left' | 'right') => {
    e.preventDefault()
    e.stopPropagation()
    setDragSide(side)
  }

  const handleDragLeave = () => {
    setDragSide(null)
  }

  // Determine drop side from Tauri position (falls back to nearest panel)
  const getDropSide = useCallback((x: number, _y: number): 'left' | 'right' => {
    const leftRect = leftPanelRef.current?.getBoundingClientRect()
    const rightRect = rightPanelRef.current?.getBoundingClientRect()
    if (leftRect && rightRect) {
      const midX = (leftRect.right + rightRect.left) / 2
      return x < midX ? 'left' : 'right'
    }
    if (leftRect && x <= leftRect.right) return 'left'
    if (rightRect && x >= rightRect.left) return 'right'
    return 'left'
  }, [])

  // Tauri native file drag-and-drop
  useEffect(() => {
    if (!pageActive || typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return
    let unlistenFn: (() => void) | undefined
    let cleanedUp = false

    ;(async () => {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview')
        if (cleanedUp) return
        unlistenFn = await getCurrentWebview().onDragDropEvent((event) => {
          if (cleanedUp) return
          const ev = event.payload
          if (ev.type === 'enter') {
            const side = getDropSide(ev.position.x, ev.position.y)
            setDragSide(side)
          } else if (ev.type === 'over') {
            const side = getDropSide(ev.position.x, ev.position.y)
            setDragSide(side)
          } else if (ev.type === 'leave') {
            setDragSide(null)
          } else if (ev.type === 'drop') {
            const side = getDropSide(ev.position.x, ev.position.y)
            setDragSide(null)
            const filePath = ev.paths[0]
            if (filePath) handleTauriFileImport(filePath, side)
          }
        })
        if (cleanedUp) { unlistenFn?.(); unlistenFn = undefined }
      } catch { /* Tauri API not available */ }
    })()

    return () => {
      cleanedUp = true
      if (unlistenFn) { unlistenFn(); unlistenFn = undefined }
    }
  }, [getDropSide, handleTauriFileImport, pageActive])

  return (
    <div className="flex h-full flex-col overflow-hidden p-6">
      {/* Tauri drag overlay – differentiated drop zone indicators */}
      {dragSide && (
        <div className="fixed inset-0 z-50 flex pointer-events-none">
          <div className="flex-1 flex items-center justify-center">
            <div className={`flex flex-col items-center gap-2 rounded-2xl px-8 py-6 transition-all ${
              dragSide === 'left'
                ? 'border-2 border-dashed border-primary bg-primary/10 text-primary scale-105'
                : 'text-text-disabled'
            }`}>
              <FileUp size={28} strokeWidth={1.5} />
              <span className="text-sm font-medium">{t('modules.textDiff.original')}</span>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className={`flex flex-col items-center gap-2 rounded-2xl px-8 py-6 transition-all ${
              dragSide === 'right'
                ? 'border-2 border-dashed border-primary bg-primary/10 text-primary scale-105'
                : 'text-text-disabled'
            }`}>
              <FileUp size={28} strokeWidth={1.5} />
              <span className="text-sm font-medium">{t('modules.textDiff.modified')}</span>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileDiff size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">{t('modules.textDiff.name')}</h1>
            <p className="text-sm text-text-secondary">{t('modules.textDiff.description')}</p>
          </div>
        </div>
        {(left || right) && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 rounded-lg bg-bg-hover px-3 py-2 text-sm text-text-secondary transition hover:bg-bg-elevated hover:text-text-primary cursor-pointer"
          >
            <X size={14} />
            {t('modules.textDiff.clear')}
          </button>
        )}
      </div>

      {/* Input panels */}
      <div className="mb-4 flex flex-wrap gap-2">
        {/* Left panel */}
        <div className="flex min-w-[280px] flex-1 flex-col">
          <div className="mb-2 flex items-center gap-2">
            <label className="text-xs font-medium uppercase tracking-wider text-text-muted">
              {t('modules.textDiff.original')}
              {left && <span className="ml-1.5 normal-case tracking-normal text-text-disabled">({leftLineCount} {t('modules.textDiff.charCount', { defaultValue: 'lines', count: leftLineCount })})</span>}
            </label>
            <div className="ml-auto flex gap-1">
              <button onClick={() => leftFileRef.current?.click()} className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-text-muted transition hover:text-primary cursor-pointer">
                <FileUp size={10} /> {t('modules.textDiff.import', { defaultValue: 'Import' })}
              </button>
              <button onClick={() => handlePaste('left')} className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-text-muted transition hover:text-primary cursor-pointer">
                <Copy size={10} /> {t('modules.textDiff.paste')}
              </button>
              <button onClick={() => setLeft('')} className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-text-muted transition hover:text-primary cursor-pointer">
                <Trash2 size={10} /> {t('modules.textDiff.clearBtn', { defaultValue: 'Clear' })}
              </button>
            </div>
          </div>
          <div
            ref={leftPanelRef}
            onDrop={(e) => handleDrop(e, 'left')}
            onDragOver={(e) => handleDragOver(e, 'left')}
            onDragLeave={handleDragLeave}
            className={`flex-1 min-h-[160px] rounded-xl border bg-bg-elevated transition ${
              dragSide === 'left' ? 'border-primary border-dashed bg-primary/5' : 'border-border-subtle'
            }`}
          >
            <textarea
              value={left}
              onChange={(e) => setLeft(e.target.value)}
              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragSide('left'); }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDragLeave={() => setDragSide(null)}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(e, 'left'); }}
              placeholder={t('modules.textDiff.fileDrop', { defaultValue: 'Paste, type, or drop file here...' })}
              className="h-full min-h-[160px] w-full rounded-xl bg-transparent p-4 font-mono text-sm text-text-primary outline-none resize-y"
            />
          </div>
          <input ref={leftFileRef} type="file" className="hidden" accept="text/*,.txt,.md,.json,.js,.ts,.css,.html,.xml,.yaml,.yml,.csv,.log,.py,.java,.c,.cpp,.rs,.go,.rb,.sh,.bat,.sql,.ini,.cfg,.toml,.env" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileImport(f, 'left'); e.target.value = '' }} />
        </div>

        {/* Swap button (centered) */}
        <div className="flex items-center self-center">
          <button
            onClick={swapTexts}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border-subtle text-text-muted transition hover:border-primary hover:text-primary cursor-pointer"
            title={t('modules.textDiff.swap')}
          >
            <ArrowRightLeft size={14} />
          </button>
        </div>

        {/* Right panel */}
        <div className="flex min-w-[280px] flex-1 flex-col">
          <div className="mb-2 flex items-center gap-2">
            <label className="text-xs font-medium uppercase tracking-wider text-text-muted">
              {t('modules.textDiff.modified')}
              {right && <span className="ml-1.5 normal-case tracking-normal text-text-disabled">({rightLineCount} {t('modules.textDiff.charCount', { defaultValue: 'lines', count: rightLineCount })})</span>}
            </label>
            <div className="ml-auto flex gap-1">
              <button onClick={() => rightFileRef.current?.click()} className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-text-muted transition hover:text-primary cursor-pointer">
                <FileUp size={10} /> {t('modules.textDiff.import', { defaultValue: 'Import' })}
              </button>
              <button onClick={() => handlePaste('right')} className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-text-muted transition hover:text-primary cursor-pointer">
                <Copy size={10} /> {t('modules.textDiff.paste')}
              </button>
              <button onClick={() => setRight('')} className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-text-muted transition hover:text-primary cursor-pointer">
                <Trash2 size={10} /> {t('modules.textDiff.clearBtn', { defaultValue: 'Clear' })}
              </button>
            </div>
          </div>
          <div
            ref={rightPanelRef}
            onDrop={(e) => handleDrop(e, 'right')}
            onDragOver={(e) => handleDragOver(e, 'right')}
            onDragLeave={handleDragLeave}
            className={`flex-1 min-h-[160px] rounded-xl border bg-bg-elevated transition ${
              dragSide === 'right' ? 'border-primary border-dashed bg-primary/5' : 'border-border-subtle'
            }`}
          >
            <textarea
              value={right}
              onChange={(e) => setRight(e.target.value)}
              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragSide('right'); }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDragLeave={() => setDragSide(null)}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(e, 'right'); }}
              placeholder={t('modules.textDiff.fileDrop', { defaultValue: 'Paste, type, or drop file here...' })}
              className="h-full min-h-[160px] w-full rounded-xl bg-transparent p-4 font-mono text-sm text-text-primary outline-none resize-y"
            />
          </div>
          <input ref={rightFileRef} type="file" className="hidden" accept="text/*,.txt,.md,.json,.js,.ts,.css,.html,.xml,.yaml,.yml,.csv,.log,.py,.java,.c,.cpp,.rs,.go,.rb,.sh,.bat,.sql,.ini,.cfg,.toml,.env" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileImport(f, 'right'); e.target.value = '' }} />
        </div>
      </div>

      {/* Too large warning */}
      {tooLarge && (
        <div className="mb-4 rounded-lg bg-yellow-500/10 px-4 py-2 text-sm text-yellow-500">
          {t('modules.textDiff.tooLarge', { defaultValue: `Input exceeds ${MAX_DIFF_LINES} lines. Performance may be affected.` })}
        </div>
      )}

      {/* Stats */}
      {diffs.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-text-muted">{t('modules.textDiff.stats')}:</span>
          {stats.modified > 0 && (
            <span className="rounded bg-yellow-500/10 px-2 py-0.5 text-yellow-500">
              ~{stats.modified} {t('modules.textDiff.linesModified', { defaultValue: 'modified' })}
            </span>
          )}
          {stats.added > 0 && (
            <span className="rounded bg-green-500/10 px-2 py-0.5 text-green-400">
              +{stats.added} {t('modules.textDiff.linesAdded')}
            </span>
          )}
          {stats.removed > 0 && (
            <span className="rounded bg-red-500/10 px-2 py-0.5 text-red-400">
              -{stats.removed} {t('modules.textDiff.linesRemoved')}
            </span>
          )}
          {stats.added === 0 && stats.removed === 0 && stats.modified === 0 && (
            <span className="text-green-400">{t('modules.textDiff.identical')}</span>
          )}
        </div>
      )}

      {/* Diff output */}
      {diffs.length > 0 && (stats.added > 0 || stats.removed > 0 || stats.modified > 0) && (
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated">
          {/* View toggle + copy */}
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2">
            <div className="flex overflow-hidden rounded-md border border-border-subtle w-fit">
              <button
                onClick={() => setViewMode('unified')}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  viewMode === 'unified' ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-bg-hover'
                }`}
              >
                {t('modules.textDiff.viewUnified', { defaultValue: 'Unified' })}
              </button>
              <button
                onClick={() => setViewMode('split')}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  viewMode === 'split' ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-bg-hover'
                }`}
              >
                {t('modules.textDiff.viewSplit', { defaultValue: 'Split' })}
              </button>
            </div>
            <button
              onClick={copyResult}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted transition hover:text-primary cursor-pointer"
            >
              {copiedDiff ? <Check size={12} className="text-success" /> : <Copy size={12} />}
              {t('modules.textDiff.copyDiff', { defaultValue: 'Copy' })}
            </button>
          </div>

          {/* Diff table */}
          <div className="flex-1 overflow-auto">
            {viewMode === 'unified' ? (
              <table className="w-full">
                <tbody>
                  {diffs.map((d, i) => {
                    const isModified = modifiedPairIndices.has(i)
                    return (
                      <tr
                        key={i}
                        className={`border-b border-border-subtle/30 ${
                          d.type === 'added' ? 'bg-green-500/8' : d.type === 'removed' ? 'bg-red-500/8' : ''
                        }`}
                      >
                        <td className="w-10 select-none px-2 py-1 text-right font-mono text-xs text-text-disabled">
                          {d.leftLineNo ?? ''}
                        </td>
                        <td className="w-10 select-none px-2 py-1 text-right font-mono text-xs text-text-disabled">
                          {d.rightLineNo ?? ''}
                        </td>
                        <td className="w-6 select-none px-1 py-1 text-center text-xs">
                          {d.type === 'added' ? <span className="text-green-400">+</span> : d.type === 'removed' ? <span className="text-red-400">-</span> : <span className="text-text-disabled"> </span>}
                        </td>
                        <td className="px-4 py-1 font-mono text-sm whitespace-pre-wrap">
                          {isModified ? (
                            <span className="text-text-primary">
                              {(() => {
                                const prev = diffs[i - 1]
                                const { newParts } = prev ? wordDiff(prev.text, d.text) : { newParts: [] }
                                const changed = new Set(newParts.filter(p => p.trim()))
                                return d.text.split(/(\s+)/).map((part, pi) => (
                                  <span key={pi} className={changed.has(part) ? 'bg-green-500/20 rounded-sm' : ''}>{part}</span>
                                ))
                              })()}
                            </span>
                          ) : (
                            <span className={
                              d.type === 'added' ? 'text-green-300'
                                : d.type === 'removed' ? 'text-red-300'
                                : 'text-text-secondary'
                            }>{d.text || ' '}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[700px]">
                <tbody>
                  {diffs.map((d, i) => {
                    if (d.type === 'same') {
                      return (
                        <tr key={i} className="border-b border-border-subtle/30">
                          <td className="w-10 select-none px-2 py-1 text-right font-mono text-xs text-text-disabled">{d.leftLineNo}</td>
                          <td className="w-1/2 px-4 py-1 font-mono text-sm text-text-secondary whitespace-pre-wrap overflow-hidden">{d.text || ' '}</td>
                          <td className="w-10 select-none px-2 py-1 text-right font-mono text-xs text-text-disabled">{d.rightLineNo}</td>
                          <td className="w-1/2 px-4 py-1 font-mono text-sm text-text-secondary whitespace-pre-wrap overflow-hidden">{d.text || ' '}</td>
                        </tr>
                      )
                    }
                    if (d.type === 'removed' && i < diffs.length - 1 && diffs[i + 1].type === 'added') {
                      const next = diffs[i + 1]
                      const { oldParts, newParts } = wordDiff(d.text, next.text)
                      const oldChanged = new Set(oldParts.filter(p => p.trim()))
                      const newChanged = new Set(newParts.filter(p => p.trim()))
                      return (
                        <tr key={i} className="border-b border-border-subtle/30">
                          <td className="w-10 select-none bg-red-500/8 px-2 py-1 text-right font-mono text-xs text-text-disabled">{d.leftLineNo}</td>
                          <td className="w-1/2 bg-red-500/8 px-4 py-1 font-mono text-sm whitespace-pre-wrap overflow-hidden">
                            <span className="text-red-300">
                              {d.text.split(/(\s+)/).map((p, pi) => <span key={pi} className={oldChanged.has(p) ? 'bg-red-500/20 rounded-sm' : ''}>{p}</span>)}
                            </span>
                          </td>
                          <td className="w-10 select-none bg-green-500/8 px-2 py-1 text-right font-mono text-xs text-text-disabled">{next.rightLineNo}</td>
                          <td className="w-1/2 bg-green-500/8 px-4 py-1 font-mono text-sm whitespace-pre-wrap overflow-hidden">
                            <span className="text-green-300">
                              {next.text.split(/(\s+)/).map((p, pi) => <span key={pi} className={newChanged.has(p) ? 'bg-green-500/20 rounded-sm' : ''}>{p}</span>)}
                            </span>
                          </td>
                        </tr>
                      )
                    }
                    if (d.type === 'removed') {
                      return (
                        <tr key={i} className="border-b border-border-subtle/30 bg-red-500/8">
                          <td className="w-10 select-none px-2 py-1 text-right font-mono text-xs text-text-disabled">{d.leftLineNo}</td>
                          <td className="w-1/2 px-4 py-1 font-mono text-sm text-red-300 whitespace-pre-wrap">{d.text || ' '}</td>
                          <td className="w-10 px-2 py-1 bg-bg-base/50" />
                          <td className="w-1/2 px-4 py-1 bg-bg-base/50" />
                        </tr>
                      )
                    }
                    if (d.type === 'added' && !modifiedPairIndices.has(i)) {
                      return (
                        <tr key={i} className="border-b border-border-subtle/30 bg-green-500/8">
                          <td className="w-10 px-2 py-1 bg-bg-base/50" />
                          <td className="w-1/2 px-4 py-1 bg-bg-base/50" />
                          <td className="w-10 select-none px-2 py-1 text-right font-mono text-xs text-text-disabled">{d.rightLineNo}</td>
                          <td className="w-1/2 px-4 py-1 font-mono text-sm text-green-300 whitespace-pre-wrap">{d.text || ' '}</td>
                        </tr>
                      )
                    }
                    return null
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {diffs.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-text-disabled">
          <FileDiff size={32} strokeWidth={1.2} />
          <p className="text-sm">{t('modules.textDiff.emptyState', { defaultValue: 'Input or drop text on both sides to compare' })}</p>
        </div>
      )}
    </div>
  )
}
