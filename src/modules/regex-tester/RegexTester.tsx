/**
 * A7Box Regex Tester Module
 * Tests and debugs regular expressions with live matching, capture groups, and replace
 */
import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Regex, Copy, CheckCircle2, AlertTriangle, X,
  ArrowLeftRight, ClipboardPaste, Replace, AlertCircle, Search, ChevronDown, ChevronUp,
} from 'lucide-react'
import { isTauri } from '../../shared/utils'

// ── Types ────────────────────────────────────────────────────────────────────

interface MatchResult {
  full: string
  index: number
  length: number
  groups: (string | undefined)[]
  namedGroups: Record<string, string | undefined> | null
}

interface RegexResult {
  matches: MatchResult[]
  error: string | null
  truncated: boolean
}

const MAX_MATCHES = 1000

// ── Helpers ──────────────────────────────────────────────────────────────────

function runRegex(pattern: string, flags: string, text: string): RegexResult {
  if (!pattern.trim()) return { matches: [], error: null, truncated: false }
  try {
    const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g')
    const matches: MatchResult[] = []
    let m: RegExpExecArray | null
    let safety = 0
    let truncated = false
    while ((m = re.exec(text)) !== null) {
      if (safety >= MAX_MATCHES) { truncated = true; break }
      matches.push({
        full: m[0],
        index: m.index,
        length: m[0].length,
        groups: m.slice(1),
        namedGroups: m.groups ? { ...m.groups } : null,
      })
      if (m[0].length === 0) re.lastIndex++
      safety++
    }
    return { matches, error: null, truncated }
  } catch (e) {
    return { matches: [], error: String(e), truncated: false }
  }
}

const FLAG_OPTIONS = [
  { key: 'g', descKey: 'modules.regexTester.flags.global' },
  { key: 'i', descKey: 'modules.regexTester.flags.caseInsensitive' },
  { key: 'm', descKey: 'modules.regexTester.flags.multiline' },
  { key: 's', descKey: 'modules.regexTester.flags.dotall' },
  { key: 'u', descKey: 'modules.regexTester.flags.unicode' },
]

const COMMON_PATTERNS = [
  // Text basics
  { nameKey: 'modules.regexTester.patterns.email', pattern: '[\\w.-]+@[\\w.-]+\\.\\w{2,}' },
  { nameKey: 'modules.regexTester.patterns.word', pattern: '\\b\\w+\\b' },
  { nameKey: 'modules.regexTester.patterns.mention', pattern: '@[\\w.-]+' },
  { nameKey: 'modules.regexTester.patterns.number', pattern: '-?\\d+(?:\\.\\d+)?' },
  // Contact
  { nameKey: 'modules.regexTester.patterns.phone', pattern: '\\+?\\d[\\d ()-]{7,}\\d' },
  // Web & Network
  { nameKey: 'modules.regexTester.patterns.url', pattern: 'https?://[\\w.-]+(?:/[\\w./?%&=-]*)?' },
  { nameKey: 'modules.regexTester.patterns.htmlTag', pattern: '<([a-z][a-z0-9]*)\\b[^>]*>.*?</\\1>' },
  { nameKey: 'modules.regexTester.patterns.ipv4', pattern: '\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b' },
  { nameKey: 'modules.regexTester.patterns.mac', pattern: '([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}' },
  // Date & Time
  { nameKey: 'modules.regexTester.patterns.date', pattern: '\\d{4}-\\d{2}-\\d{2}' },
  { nameKey: 'modules.regexTester.patterns.time', pattern: '\\d{1,2}:\\d{2}(?::\\d{2})?' },
  // Dev tools
  { nameKey: 'modules.regexTester.patterns.hexColor', pattern: '#(?:[0-9a-fA-F]{3}){1,2}\\b' },
  { nameKey: 'modules.regexTester.patterns.uuid', pattern: '\\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\b' },
  { nameKey: 'modules.regexTester.patterns.semver', pattern: '\\d+\\.\\d+\\.\\d+(?:-[\\w.]+)?' },
  { nameKey: 'modules.regexTester.patterns.creditCard', pattern: '\\b\\d{4}[- ]?\\d{4,6}[- ]?\\d{4,5}[- ]?\\d{1,4}\\b' },
  { nameKey: 'modules.regexTester.patterns.fileExt', pattern: '\\.\\w{2,5}$' },
  // Dev & Programming
  { nameKey: 'modules.regexTester.patterns.base64', pattern: '[A-Za-z0-9+/]+={0,2}' },
  { nameKey: 'modules.regexTester.patterns.jwt', pattern: 'eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+' },
  { nameKey: 'modules.regexTester.patterns.hash', pattern: '\\b[a-fA-F0-9]{32}\\b|\\b[a-fA-F0-9]{64}\\b' },
  { nameKey: 'modules.regexTester.patterns.hexNumber', pattern: '0x[0-9a-fA-F]+' },
  { nameKey: 'modules.regexTester.patterns.cssRgb', pattern: 'rgba?\\(\\d{1,3},\\s*\\d{1,3},\\s*\\d{1,3}(?:,\\s*[\\d.]+)?\\)' },
  { nameKey: 'modules.regexTester.patterns.ipPort', pattern: '\\d{1,3}(?:\\.\\d{1,3}){3}:\\d{1,5}' },
  { nameKey: 'modules.regexTester.patterns.gitHash', pattern: '\\b[a-fA-F0-9]{7,40}\\b' },
  { nameKey: 'modules.regexTester.patterns.sqlComment', pattern: '--.*$|/\\*[\\s\\S]*?\\*/' },
]

const MORE_PATTERNS = [
  { nameKey: 'modules.regexTester.patterns.cnPhone', pattern: '(?:\\+86)?1[3-9]\\d{9}' },
  { nameKey: 'modules.regexTester.patterns.idCard', pattern: '\\b\\d{17}[\\dXx]\\b' },
  { nameKey: 'modules.regexTester.patterns.chinese', pattern: '[\\u4e00-\\u9fa5]+' },
  { nameKey: 'modules.regexTester.patterns.dateSlash', pattern: '\\d{1,2}/\\d{1,2}/\\d{4}' },
]

// ── Component ────────────────────────────────────────────────────────────────

export default function RegexTester() {
  const { t } = useTranslation()
  const [pattern, setPattern] = useState('')
  const [flags, setFlags] = useState('gi')
  const [text, setText] = useState('')
  const [replacePattern, setReplacePattern] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [mode, setMode] = useState<'match' | 'replace'>('match')
  const [showMorePatterns, setShowMorePatterns] = useState(false)
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null)

  // ── Core computation ──
  const result = useMemo<RegexResult>(
    () => runRegex(pattern, flags, text),
    [pattern, flags, text],
  )

  const toggleFlag = useCallback((flag: string) => {
    setFlags((prev) => (prev.includes(flag) ? prev.replace(flag, '') : prev + flag))
  }, [])

  // ── Highlighted text (non-overlapping only) ──
  const highlightedText = useMemo(() => {
    if (result.error) return null
    const valid = result.matches
    if (!valid.length) return null
    const parts: { text: string; match: boolean; zeroLen: boolean; matchIdx: number }[] = []
    let lastEnd = 0
    for (const m of valid) {
      if (m.index < lastEnd) continue // skip overlapping
      if (m.index > lastEnd) parts.push({ text: text.slice(lastEnd, m.index), match: false, zeroLen: false, matchIdx: -1 })
      if (m.length === 0) {
        parts.push({ text: '', match: true, zeroLen: true, matchIdx: m.index })
      } else {
        parts.push({ text: m.full, match: true, zeroLen: false, matchIdx: m.index })
      }
      lastEnd = m.index + m.length
    }
    if (lastEnd < text.length) parts.push({ text: text.slice(lastEnd), match: false, zeroLen: false, matchIdx: -1 })
    return parts
  }, [result, text])

  // ── Replace result ──
  const replaceResult = useMemo(() => {
    if (mode !== 'replace' || !pattern.trim() || result.error) return null
    try {
      const globalFlags = flags.includes('g') ? flags : flags + 'g'
      return text.replace(new RegExp(pattern, globalFlags), replacePattern)
    } catch { return null }
  }, [mode, pattern, flags, text, replacePattern, result.error])

  // ── Clipboard ──
  const handleCopy = useCallback(async (id: string, content: string) => {
    try {
      if (isTauri()) {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('set_clipboard_text', { text: content })
      } else {
        await navigator.clipboard.writeText(content)
      }
      setCopied(id)
      setTimeout(() => setCopied(null), 1200)
    } catch { /* clipboard error */ }
  }, [])

  const handleCopyAll = useCallback(async () => {
    const content = result.matches.map((m, i) =>
      `Match ${i + 1}: "${m.full}" @${m.index}` +
      (m.groups.length
        ? `\n  Groups: ${m.groups.map((g, j) => {
            const name = m.namedGroups ? Object.keys(m.namedGroups)[j] : null
            return name ? `${name}=${g ?? '(none)'}` : `$${j + 1}=${g ?? '(none)'}`
          }).join(', ')}`
        : ''),
    ).join('\n')
    await handleCopy('__all__', content)
  }, [result.matches, handleCopy])

  const handlePaste = useCallback(async () => {
    try {
      let clipText: string
      if (isTauri()) {
        const { invoke } = await import('@tauri-apps/api/core')
        clipText = await invoke<string>('get_clipboard_text')
      } else {
        clipText = await navigator.clipboard.readText()
      }
      if (clipText.trim()) setText(clipText)
    } catch { /* clipboard error */ }
  }, [])

  const handleClear = useCallback(() => {
    setPattern('')
    setText('')
    setReplacePattern('')
    setMode('match')
    setActiveTemplate(null)
  }, [])

  const hasInput = pattern.trim() || text.trim()

  // ── Render ──
  return (
    <div className="relative flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-elevated px-4 py-2">
        <Regex className="h-4 w-4 text-text-muted" />
        <span className="text-sm font-medium text-text-primary">{t('modules.regexTester.name')}</span>
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border-subtle bg-bg-elevated/50 px-4 py-2">
        {/* Mode tabs */}
        <button
          onClick={() => setMode('match')}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
            mode === 'match' ? 'bg-primary/10 text-primary' : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          <span className="flex items-center gap-1"><Search className="h-3.5 w-3.5" /> {t('modules.regexTester.mode.match', { defaultValue: 'Match' })}</span>
        </button>
        <button
          onClick={() => setMode('replace')}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
            mode === 'replace' ? 'bg-primary/10 text-primary' : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          <span className="flex items-center gap-1"><Replace className="h-3.5 w-3.5" /> {t('modules.regexTester.mode.replace', { defaultValue: 'Replace' })}</span>
        </button>

        <div className="h-5 w-px bg-border-base" />

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={handleClear}
            disabled={!hasInput}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-text-muted transition-colors hover:text-red-400 disabled:opacity-40 disabled:hover:text-text-muted disabled:cursor-not-allowed cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
            {t('modules.regexTester.ui.clear', { defaultValue: 'Clear' })}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Regex Pattern Input */}
        <div className="mb-4 rounded-xl border border-border-subtle bg-bg-elevated p-4 transition-all focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20">
          {/* Input row */}
          <div className="flex items-center gap-2 rounded-lg bg-bg-base/60 px-3 py-2.5">
            <span className="text-xl text-primary/70 font-mono font-light shrink-0 select-none">/</span>
            <input
              type="text"
              value={pattern}
              onChange={(e) => { setPattern(e.target.value); setActiveTemplate(null) }}
              placeholder={t('modules.regexTester.patternPlaceholder')}
              className="flex-1 min-w-0 bg-transparent font-mono text-sm text-text-primary outline-none placeholder:text-text-disabled/70"
            />
            <span className="text-xl text-primary/70 font-mono font-light shrink-0 select-none">/</span>
            <span className="font-mono text-sm text-amber-400 shrink-0 min-w-[2ch] font-semibold">{flags || '\u00A0'}</span>
          </div>

          {/* Flags (below input, compact row) */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {FLAG_OPTIONS.map((f) => (
              <button
                key={f.key}
                onClick={() => toggleFlag(f.key)}
                className={`cursor-pointer inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-mono transition-all ${
                  flags.includes(f.key)
                    ? 'bg-primary/15 text-primary border border-primary/30 font-semibold'
                    : 'text-text-muted/60 border border-border-subtle hover:text-text-secondary hover:border-border-base'
                }`}
              >
                <span className="font-bold">{f.key}</span>
                <span className="text-[10px] font-sans">{t(f.descKey)}</span>
              </button>
            ))}
          </div>

          {/* Replace Pattern (inline in replace mode) */}
          {mode === 'replace' && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-base/50 px-3 py-2">
              <ArrowLeftRight className="h-3.5 w-3.5 text-text-muted shrink-0" />
              <span className="text-xs font-medium text-text-muted shrink-0">
                {t('modules.regexTester.ui.replaceWith', { defaultValue: 'Replace with' })}
              </span>
              <input
                type="text"
                value={replacePattern}
                onChange={(e) => setReplacePattern(e.target.value)}
                placeholder={t('modules.regexTester.replacePlaceholder', { defaultValue: '$1, $2, or replacement text...' })}
                className="flex-1 min-w-0 bg-transparent font-mono text-sm text-text-primary outline-none placeholder:text-text-disabled"
              />
            </div>
          )}

          {/* Common Patterns */}
          <div className="mt-3 border-t border-border-subtle pt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-text-disabled">{t('modules.regexTester.ui.quickRef', { defaultValue: 'Templates:' })}</span>
            {COMMON_PATTERNS.map((cp) => (
              <button
                key={cp.nameKey}
                onClick={() => { setPattern(cp.pattern); setActiveTemplate(cp.nameKey) }}
                className={`cursor-pointer rounded-md px-2 py-0.5 text-xs transition ${
                  activeTemplate === cp.nameKey
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'bg-bg-base text-text-muted hover:text-primary border border-transparent'
                }`}
              >
                {t(cp.nameKey)}
              </button>
            ))}
            {showMorePatterns && MORE_PATTERNS.map((cp) => (
              <button
                key={cp.nameKey}
                onClick={() => { setPattern(cp.pattern); setActiveTemplate(cp.nameKey) }}
                className={`cursor-pointer rounded-md px-2 py-0.5 text-xs transition ${
                  activeTemplate === cp.nameKey
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'bg-bg-base text-text-muted hover:text-primary border border-transparent'
                }`}
              >
                {t(cp.nameKey)}
              </button>
            ))}
            <button
              onClick={() => setShowMorePatterns(!showMorePatterns)}
              className="cursor-pointer inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs text-text-disabled transition hover:text-text-muted"
            >
              {showMorePatterns
                ? <><ChevronUp className="h-3 w-3" />{t('modules.regexTester.ui.showLess', { defaultValue: 'Less' })}</>
                : <><ChevronDown className="h-3 w-3" />{t('modules.regexTester.ui.showMore', { defaultValue: 'More' })}</>
              }
            </button>
          </div>
        </div>

        {/* Error */}
        {result.error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertTriangle size={16} className="shrink-0" />
            <span className="break-all">{result.error}</span>
          </div>
        )}

        {/* Truncation warning */}
        {result.truncated && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
            <AlertCircle size={16} className="shrink-0" />
            {t('modules.regexTester.ui.truncated', { defaultValue: 'Display limited to first {{count}} matches.', count: MAX_MATCHES })}
          </div>
        )}

        {/* Test Text */}
        <div className="mb-4 rounded-xl border border-border-subtle bg-bg-elevated p-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium uppercase tracking-wider text-text-muted">
              {t('modules.regexTester.testText')}
            </label>
            <button
              onClick={handlePaste}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-text-muted transition-colors hover:text-text-secondary cursor-pointer"
              title={t('modules.regexTester.ui.paste', { defaultValue: 'Paste from clipboard' })}
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
              {t('modules.regexTester.ui.paste', { defaultValue: 'Paste' })}
            </button>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('modules.regexTester.textPlaceholder')}
            rows={6}
            className="w-full bg-transparent font-mono text-sm text-text-primary outline-none resize-none placeholder:text-text-disabled"
          />
        </div>

        {/* Status: match count or no matches */}
        {pattern.trim() && text.trim() && !result.error && (
          <div className="mb-4 flex items-center gap-2 px-1">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              result.matches.length > 0
                ? 'bg-primary/10 text-primary'
                : 'bg-bg-elevated text-text-muted'
            }`}>
              {result.matches.length} {t('modules.regexTester.matches')}
            </span>
            {result.matches.length === 0 && (
              <span className="text-xs text-text-muted">
                {t('modules.regexTester.ui.noMatches', { defaultValue: 'No matches found' })}
              </span>
            )}
          </div>
        )}

        {/* Highlighted Text */}
        {highlightedText && (
          <div className="mb-4 rounded-xl border border-border-subtle bg-bg-elevated p-4">
            <h3 className="mb-2 text-sm font-semibold text-text-primary">
              {t('modules.regexTester.highlighted')}
            </h3>
            <div className="rounded-lg bg-bg-base p-3 font-mono text-sm leading-relaxed whitespace-pre-wrap">
              {highlightedText.map((part, i) =>
                part.zeroLen ? (
                  <span key={i} className="relative inline-block w-0">
                    <span className="absolute -left-px top-0 h-full w-0.5 bg-primary rounded" />
                  </span>
                ) : part.match ? (
                  <mark key={i} className="rounded bg-primary/30 text-primary px-0.5">
                    {part.text}
                  </mark>
                ) : (
                  <span key={i} className="text-text-secondary">{part.text}</span>
                ),
              )}
            </div>
          </div>
        )}

        {/* Replace Result */}
        {mode === 'replace' && replaceResult !== null && (
          <div className="mb-4 rounded-xl border border-border-subtle bg-bg-elevated p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <ArrowLeftRight className="h-3.5 w-3.5 text-text-muted" />
                {t('modules.regexTester.ui.replaceResult', { defaultValue: 'Replace Result' })}
              </h3>
              <button
                onClick={() => handleCopy('__replace', replaceResult)}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-text-secondary transition hover:text-primary cursor-pointer"
              >
                {copied === '__replace'
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                  : <Copy size={14} />}
                {t('common.copy')}
              </button>
            </div>
            <div className="rounded-lg bg-bg-base p-3 font-mono text-sm leading-relaxed whitespace-pre-wrap text-text-primary max-h-[300px] overflow-y-auto">
              {replaceResult || <span className="text-text-disabled italic">{t('modules.regexTester.ui.emptyResult', { defaultValue: '(empty)' })}</span>}
            </div>
          </div>
        )}

        {/* Match Details */}
        {result.matches.length > 0 && (
          <div className="rounded-xl border border-border-subtle bg-bg-elevated overflow-hidden">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <h3 className="text-sm font-semibold text-text-primary">
                {t('modules.regexTester.matchDetails')}
              </h3>
              <button
                onClick={handleCopyAll}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-text-secondary transition hover:text-primary cursor-pointer"
              >
                {copied === '__all__'
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                  : <Copy size={14} />}
                {t('common.copy')}
              </button>
            </div>
            <div className="divide-y divide-border-subtle max-h-[400px] overflow-y-auto">
              {result.matches.map((m, i) => {
                const namedKeys = m.namedGroups ? Object.keys(m.namedGroups) : []
                return (
                  <div key={i} className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="rounded bg-bg-base px-2 py-0.5 text-xs text-text-muted">#{i + 1}</span>
                      <code className="font-mono text-sm text-primary break-all">
                        {m.length > 0 ? m.full : '(empty)'}
                      </code>
                      {m.length === 0 && (
                        <span className="inline-block h-3 w-0.5 rounded bg-primary" title="zero-length match" />
                      )}
                      <span className="text-xs text-text-muted shrink-0">@{m.index}</span>
                    </div>
                    {/* Numbered groups */}
                    {m.groups.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-2 pl-8">
                        {m.groups.map((g, j) => {
                          const name = namedKeys[j]
                          return (
                            <span key={j} className="rounded bg-bg-base px-2 py-0.5 text-xs">
                              <span className="text-text-muted">
                                {name ? `(?<${name}>)` : `$${j + 1}`}
                              </span>
                              <span className="ml-1 text-text-secondary">{g ?? '(none)'}</span>
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
