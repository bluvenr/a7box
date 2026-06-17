/**
 * A7Box Text Diff Module
 * Compares two texts and highlights line-level differences
 */
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { FileDiff, Copy, ArrowRightLeft, X } from 'lucide-react'

// Simple LCS-based diff
type DiffLine = { type: 'same' | 'added' | 'removed'; text: string }

function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const m = oldLines.length
  const n = newLines.length

  // LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  // Backtrack
  const result: DiffLine[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: 'same', text: oldLines[i - 1] })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', text: newLines[j - 1] })
      j--
    } else {
      result.unshift({ type: 'removed', text: oldLines[i - 1] })
      i--
    }
  }
  return result
}

function countChanges(lines: DiffLine[]): { added: number; removed: number; same: number } {
  return lines.reduce(
    (acc, l) => {
      if (l.type === 'added') acc.added++
      else if (l.type === 'removed') acc.removed++
      else acc.same++
      return acc
    },
    { added: 0, removed: 0, same: 0 }
  )
}

export default function TextDiff() {
  const { t } = useTranslation()
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')

  const diffs = useMemo(
    () => (left || right ? diffLines(left, right) : []),
    [left, right]
  )
  const stats = useMemo(() => countChanges(diffs), [diffs])

  const swapTexts = () => {
    const tmp = left
    setLeft(right)
    setRight(tmp)
  }

  const clearAll = () => {
    setLeft('')
    setRight('')
  }

  const pasteLeft = async () => {
    const text = await navigator.clipboard.readText()
    setLeft(text)
  }

  const pasteRight = async () => {
    const text = await navigator.clipboard.readText()
    setRight(text)
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileDiff size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">
              {t('modules.textDiff.name')}
            </h1>
            <p className="text-sm text-text-secondary">
              {t('modules.textDiff.description')}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={swapTexts}
            className="flex items-center gap-1.5 rounded-lg bg-bg-hover px-3 py-2 text-sm text-text-secondary transition hover:bg-bg-elevated hover:text-text-primary cursor-pointer"
          >
            <ArrowRightLeft size={14} />
            {t('modules.textDiff.swap')}
          </button>
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 rounded-lg bg-bg-hover px-3 py-2 text-sm text-text-secondary transition hover:bg-bg-elevated hover:text-text-primary cursor-pointer"
          >
            <X size={14} />
            {t('modules.textDiff.clear')}
          </button>
        </div>
      </div>

      {/* Input Panels */}
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Left (original) */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium uppercase tracking-wider text-text-muted">
              {t('modules.textDiff.original')}
            </label>
            <button
              onClick={pasteLeft}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-text-muted transition hover:text-primary cursor-pointer"
            >
              <Copy size={10} /> {t('modules.textDiff.paste')}
            </button>
          </div>
          <textarea
            value={left}
            onChange={(e) => setLeft(e.target.value)}
            placeholder={t('modules.textDiff.pasteOriginal')}
            rows={12}
            className="w-full rounded-xl border border-border-subtle bg-bg-elevated p-4 font-mono text-sm text-text-primary outline-none transition focus:border-primary resize-none"
          />
        </div>

        {/* Right (modified) */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium uppercase tracking-wider text-text-muted">
              {t('modules.textDiff.modified')}
            </label>
            <button
              onClick={pasteRight}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-text-muted transition hover:text-primary cursor-pointer"
            >
              <Copy size={10} /> {t('modules.textDiff.paste')}
            </button>
          </div>
          <textarea
            value={right}
            onChange={(e) => setRight(e.target.value)}
            placeholder={t('modules.textDiff.pasteModified')}
            rows={12}
            className="w-full rounded-xl border border-border-subtle bg-bg-elevated p-4 font-mono text-sm text-text-primary outline-none transition focus:border-primary resize-none"
          />
        </div>
      </div>

      {/* Stats */}
      {diffs.length > 0 && (
        <div className="mb-4 flex items-center gap-4 text-sm">
          <span className="text-text-muted">
            {t('modules.textDiff.stats')}:
          </span>
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
          {stats.added === 0 && stats.removed === 0 && (
            <span className="text-green-400">{t('modules.textDiff.identical')}</span>
          )}
        </div>
      )}

      {/* Diff Output */}
      {diffs.length > 0 && (
        <div className="rounded-xl border border-border-subtle bg-bg-elevated overflow-hidden">
          <div className="border-b border-border-subtle px-4 py-3">
            <h3 className="text-sm font-semibold text-text-primary">
              {t('modules.textDiff.diffResult')}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <tbody>
                {diffs.map((d, i) => (
                  <tr
                    key={i}
                    className={`border-b border-border-subtle/50 ${
                      d.type === 'added' ? 'bg-green-500/8' : d.type === 'removed' ? 'bg-red-500/8' : ''
                    }`}
                  >
                    <td className="w-8 select-none px-2 py-1 text-right text-xs text-text-disabled">
                      {i + 1}
                    </td>
                    <td className="w-6 select-none px-1 py-1 text-center">
                      {d.type === 'added' ? (
                        <span className="text-green-400">+</span>
                      ) : d.type === 'removed' ? (
                        <span className="text-red-400">-</span>
                      ) : (
                        <span className="text-text-disabled"> </span>
                      )}
                    </td>
                    <td className="px-4 py-1 font-mono text-sm whitespace-pre-wrap">
                      <span
                        className={
                          d.type === 'added'
                            ? 'text-green-300'
                            : d.type === 'removed'
                            ? 'text-red-300'
                            : 'text-text-secondary'
                        }
                      >
                        {d.text || '(empty)'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
