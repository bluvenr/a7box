/**
 * A7Box Regex Tester Module
 * Tests and debugs regular expressions with live matching and capture groups
 */
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Regex, Copy, AlertTriangle } from 'lucide-react'

interface MatchResult {
  full: string
  index: number
  groups: (string | undefined)[]
}

function runRegex(pattern: string, flags: string, text: string): { matches: MatchResult[]; error: string | null } {
  if (!pattern.trim()) return { matches: [], error: null }
  try {
    const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g')
    const matches: MatchResult[] = []
    let m: RegExpExecArray | null
    // Prevent infinite loop with zero-length matches
    let safety = 0
    while ((m = re.exec(text)) !== null && safety < 1000) {
      matches.push({ full: m[0], index: m.index, groups: m.slice(1) })
      if (m[0].length === 0) re.lastIndex++
      safety++
    }
    return { matches, error: null }
  } catch (e) {
    return { matches: [], error: String(e) }
  }
}

const FLAG_OPTIONS = [
  { key: 'g', label: 'g', desc: 'Global' },
  { key: 'i', label: 'i', desc: 'Case-insensitive' },
  { key: 'm', label: 'm', desc: 'Multiline' },
  { key: 's', label: 's', desc: 'Dotall' },
  { key: 'u', label: 'u', desc: 'Unicode' },
]

const COMMON_PATTERNS = [
  { name: 'Email', pattern: '[\\w.-]+@[\\w.-]+\\.\\w{2,}' },
  { name: 'URL', pattern: 'https?://[\\w.-]+(?:/[\\w./?%&=-]*)?' },
  { name: 'IPv4', pattern: '\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b' },
  { name: 'Phone', pattern: '\\+?\\d[\\d -]{7,}\\d' },
  { name: 'Date (YYYY-MM-DD)', pattern: '\\d{4}-\\d{2}-\\d{2}' },
]

export default function RegexTester() {
  const { t } = useTranslation()
  const [pattern, setPattern] = useState('')
  const [flags, setFlags] = useState('gi')
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)

  const result = useMemo(() => runRegex(pattern, flags, text), [pattern, flags, text])

  const toggleFlag = (flag: string) => {
    setFlags((prev) => (prev.includes(flag) ? prev.replace(flag, '') : prev + flag))
  }

  // Build highlighted text
  const highlightedText = useMemo(() => {
    if (!result.matches.length || result.error) return null
    const parts: { text: string; match: boolean }[] = []
    let lastEnd = 0
    for (const m of result.matches) {
      if (m.index > lastEnd) parts.push({ text: text.slice(lastEnd, m.index), match: false })
      parts.push({ text: m.full, match: true })
      lastEnd = m.index + m.full.length
    }
    if (lastEnd < text.length) parts.push({ text: text.slice(lastEnd), match: false })
    return parts
  }, [result, text])

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Regex size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            {t('modules.regexTester.name')}
          </h1>
          <p className="text-sm text-text-secondary">
            {t('modules.regexTester.description')}
          </p>
        </div>
      </div>

      {/* Regex Input */}
      <div className="mb-4 rounded-xl border border-border-subtle bg-bg-elevated p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg text-primary font-mono">/</span>
          <input
            type="text"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder={t('modules.regexTester.patternPlaceholder')}
            className="flex-1 bg-transparent font-mono text-sm text-text-primary outline-none"
          />
          <span className="text-lg text-primary font-mono">/</span>
          <span className="font-mono text-sm text-amber-400">{flags}</span>
        </div>

        {/* Flags */}
        <div className="flex flex-wrap gap-2">
          {FLAG_OPTIONS.map((f) => (
            <button
              key={f.key}
              onClick={() => toggleFlag(f.key)}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-mono transition ${
                flags.includes(f.key)
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'bg-bg-base text-text-muted border border-border-base hover:text-text-secondary'
              }`}
              title={f.desc}
            >
              {f.label} <span className="ml-1 text-text-muted">{f.desc}</span>
            </button>
          ))}
        </div>

        {/* Common Patterns */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {COMMON_PATTERNS.map((cp) => (
            <button
              key={cp.name}
              onClick={() => setPattern(cp.pattern)}
              className="cursor-pointer rounded-md bg-bg-base px-2 py-0.5 text-xs text-text-muted transition hover:text-primary"
            >
              {cp.name}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {result.error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle size={16} />
          {result.error}
        </div>
      )}

      {/* Test Text */}
      <div className="mb-4">
        <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted">
          {t('modules.regexTester.testText')}
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('modules.regexTester.textPlaceholder')}
          rows={6}
          className="w-full rounded-xl border border-border-subtle bg-bg-elevated p-4 font-mono text-sm text-text-primary outline-none transition focus:border-primary resize-none"
        />
      </div>

      {/* Results */}
      {highlightedText && (
        <div className="mb-4 rounded-xl border border-border-subtle bg-bg-elevated p-4">
          <h3 className="mb-2 text-sm font-semibold text-text-primary">
            {t('modules.regexTester.highlighted')} ({result.matches.length} {t('modules.regexTester.matches')})
          </h3>
          <div className="rounded-lg bg-bg-base p-3 font-mono text-sm leading-relaxed whitespace-pre-wrap">
            {highlightedText.map((part, i) =>
              part.match ? (
                <mark key={i} className="rounded bg-primary/30 text-primary px-0.5">
                  {part.text}
                </mark>
              ) : (
                <span key={i} className="text-text-secondary">{part.text}</span>
              )
            )}
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
              onClick={async () => {
                const text = result.matches.map((m, i) => `Match ${i + 1}: "${m.full}" @${m.index}${m.groups.length ? `\n  Groups: ${m.groups.map((g, j) => `$${j+1}=${g ?? '(none)'}`).join(', ')}` : ''}`).join('\n')
                await navigator.clipboard.writeText(text)
                setCopied(true)
                setTimeout(() => setCopied(false), 1200)
              }}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-text-secondary transition hover:text-primary cursor-pointer"
            >
              <Copy size={12} />
              {copied ? '✓' : t('common.copy')}
            </button>
          </div>
          <div className="divide-y divide-border-subtle max-h-[300px] overflow-y-auto">
            {result.matches.map((m, i) => (
              <div key={i} className="px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="rounded bg-bg-base px-2 py-0.5 text-xs text-text-muted">#{i + 1}</span>
                  <code className="font-mono text-sm text-primary">{m.full || '(empty)'}</code>
                  <span className="text-xs text-text-muted">@{m.index}</span>
                </div>
                {m.groups.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-2 pl-8">
                    {m.groups.map((g, j) => (
                      <span key={j} className="rounded bg-bg-base px-2 py-0.5 text-xs">
                        <span className="text-text-muted">${j + 1}</span>
                        <span className="ml-1 text-text-secondary">{g ?? '(none)'}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
