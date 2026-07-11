/**
 * Text Diff — Types, algorithms, and formatting utilities
 */

export const MAX_DIFF_LINES = 2000

export type DiffLine = {
  type: 'same' | 'added' | 'removed'
  text: string
  leftLineNo: number | null
  rightLineNo: number | null
}

export type ViewMode = 'unified' | 'split'

// === Word-level LCS diff ===

export function wordDiff(oldText: string, newText: string): { oldParts: string[]; newParts: string[] } {
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

export function computeDiff(oldText: string, newText: string): DiffLine[] {
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

// === Statistics ===

/** Indices of 'added' entries that follow a 'removed' entry (modified pairs) */
export function computeModifiedPairs(diffs: DiffLine[]): Set<number> {
  const s = new Set<number>()
  for (let i = 0; i < diffs.length - 1; i++) {
    if (diffs[i].type === 'removed' && diffs[i + 1].type === 'added') {
      s.add(i + 1)
      i++
    }
  }
  return s
}

export function computeStats(diffs: DiffLine[]) {
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

// === Format functions ===

export function formatUnified(diffs: DiffLine[]): string {
  return diffs
    .map(d => {
      const ln = String(d.leftLineNo ?? '').padStart(4)
      const rn = String(d.rightLineNo ?? '').padStart(4)
      const m = d.type === 'added' ? '+' : d.type === 'removed' ? '-' : ' '
      return `${ln} ${rn} ${m} ${d.text}`
    })
    .join('\n')
}

export function formatSplit(diffs: DiffLine[]): string {
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
