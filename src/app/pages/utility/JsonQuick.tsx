/**
 * JSON Quick Format Utility Window
 * Floating window that reads clipboard JSON and formats/compresses it.
 * Triggered by global shortcut (Ctrl+Shift+J).
 */
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Copy, X, Sparkles, Minimize2, Check, AlertCircle, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { useSettingsStore } from '../../../core'
import { isTauri } from '../../../shared/utils'

// ─── Collapsible JSON Tree — Monaco-matching color palettes ────────────

type JsonColors = { key: string; str: string; num: string; bool: string; nil: string; bracket: string; muted: string; bg: string; guideline: string }

const COLORS: { dark: JsonColors; light: JsonColors } = {
  dark: {
    key: '#9cdcfe',
    str: '#ce9178',
    num: '#b5cea8',
    bool: '#569cd6',
    nil: '#569cd6',
    bracket: '#d4d4d4',
    muted: '#808080',
    bg: '#1e1e1e',
    guideline: '#404040',
  },
  light: {
    key: '#0451a5',
    str: '#a31515',
    num: '#098658',
    bool: '#0000ff',
    nil: '#0000ff',
    bracket: '#000000',
    muted: '#808080',
    bg: '#ffffff',
    guideline: '#d3d3d3',
  },
}

/** Simple JSON syntax highlighter — returns React elements with theme colors */
function JsonHighlight({ text, colors }: { text: string; colors: JsonColors }) {
  const tokens: React.ReactNode[] = []
  const re = /"(?:[^"\\]|\\.)*"(\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push(<span key={i++}>{text.slice(last, m.index)}</span>)
    const val = m[0]
    let color: string
    if (val.startsWith('"')) {
      color = m[1] ? colors.key : colors.str // key if followed by ':'
    } else if (val === 'true' || val === 'false') {
      color = colors.bool
    } else if (val === 'null') {
      color = colors.nil
    } else {
      color = colors.num
    }
    tokens.push(<span key={i++} style={{ color }}>{val}</span>)
    last = m.index + val.length
  }
  if (last < text.length) tokens.push(<span key={i++}>{text.slice(last)}</span>)
  return <>{tokens}</>
}

/** Collect all object/array paths for expand-all */
function collectPaths(val: unknown, path: string): string[] {
  if (val === null || typeof val !== 'object') return []
  const entries = Array.isArray(val)
    ? (val as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(val as Record<string, unknown>)
  const paths = [path]
  for (const [k, v] of entries) paths.push(...collectPaths(v, `${path}.${k}`))
  return paths
}

/** Default expand: root node only */
function defaultExpand(_data: unknown): Set<string> {
  return new Set(['$'])
}

function JsonTree({ data, expandAll, colors }: {
  data: unknown
  expandAll: boolean
  colors: JsonColors
}) {
  // Base expanded set — recomputed when expandAll or data changes
  const baseExpanded = useMemo<Set<string>>(
    () => expandAll ? new Set(collectPaths(data, '$')) : defaultExpand(data),
    [data, expandAll]
  )

  // Local overrides from individual node clicks
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map())

  // Effective expanded: base + overrides
  const expanded = useMemo(() => {
    if (overrides.size === 0) return baseExpanded
    const result = new Set(baseExpanded)
    for (const [path, isExp] of overrides) {
      isExp ? result.add(path) : result.delete(path)
    }
    return result
  }, [baseExpanded, overrides])

  // Clear overrides when expandAll changes
  useEffect(() => {
    setOverrides(new Map())
  }, [expandAll])

  const toggle = useCallback((p: string) => {
    setOverrides((prev) => {
      const next = new Map(prev)
      next.set(p, !expanded.has(p))
      return next
    })
  }, [expanded])

  // renderVal: renders a value with optional trailing separator (comma)
  // For collapsible objects/arrays, the separator is attached to the closing bracket
  const renderVal = useCallback(
    (val: unknown, path: string, depth: number, trailing?: string): React.ReactNode => {
      if (val === null)
        return <><span style={{ color: colors.nil }}>null</span>{trailing && <span style={{ color: colors.bracket }}>{trailing}</span>}</>
      const t = typeof val
      if (t === 'string')
        return <><span style={{ color: colors.str }}>"{val as string}"</span>{trailing && <span style={{ color: colors.bracket }}>{trailing}</span>}</>
      if (t === 'number')
        return <><span style={{ color: colors.num }}>{String(val)}</span>{trailing && <span style={{ color: colors.bracket }}>{trailing}</span>}</>
      if (t === 'boolean')
        return <><span style={{ color: colors.bool }}>{String(val)}</span>{trailing && <span style={{ color: colors.bracket }}>{trailing}</span>}</>

      const isArr = Array.isArray(val)
      const entries = isArr
        ? (val as unknown[]).map((v, i) => [String(i), v] as const)
        : Object.entries(val as Record<string, unknown>)
      const len = entries.length
      const isExp = expanded.has(path)
      const open = isArr ? '[' : '{'
      const close = isArr ? ']' : '}'
      const label = isArr ? `${len} item${len !== 1 ? 's' : ''}` : `${len} key${len !== 1 ? 's' : ''}`

      if (len === 0)
        return <span style={{ color: colors.bracket }}>{open}{close}{trailing}</span>

      if (!isExp) {
        // Collapsed inline: ▶ { 3 keys },
        return (
          <span className="inline-flex items-baseline">
            <span
              className="inline-flex cursor-pointer items-baseline gap-1 rounded px-0.5 -mx-0.5 transition-colors hover:bg-white/[0.06]"
              onClick={(e) => { e.stopPropagation(); toggle(path) }}
            >
              <ChevronRight
                size={14}
                className="shrink-0 transition-transform duration-150 relative top-[3px]"
                style={{ color: colors.muted }}
              />
              <span style={{ color: colors.bracket }}>{open}</span>
              <span className="text-[11px]" style={{ color: colors.muted }}>{label}</span>
              <span style={{ color: colors.bracket }}>{close}</span>
            </span>
            {trailing && <span style={{ color: colors.bracket }}>{trailing}</span>}
          </span>
        )
      }

      // Expanded:
      //   ▶ {
      //   │  "key": value,
      //   │  "nested": ▶ { 2 keys },
      //   },
      return (
        <span>
          <span
            className="inline-flex cursor-pointer items-baseline gap-1 rounded px-0.5 -mx-0.5 transition-colors hover:bg-white/[0.06]"
            onClick={(e) => { e.stopPropagation(); toggle(path) }}
          >
            <ChevronRight
              size={14}
              className="shrink-0 rotate-90 transition-transform duration-150 relative top-[3px]"
              style={{ color: colors.muted }}
            />
            <span style={{ color: colors.bracket }}>{open}</span>
          </span>
          <div className="pl-5" style={{ borderLeft: `1px solid ${colors.guideline}`, marginLeft: 7 }}>
            {entries.map(([k, v], i) => {
              const comma = i < len - 1 ? ',' : undefined
              return (
                <div key={k}>
                  {!isArr && (
                    <>
                      <span style={{ color: colors.key }}>"{k}"</span>
                      <span style={{ color: colors.bracket }}>{': '}</span>
                    </>
                  )}
                  {renderVal(v, `${path}.${k}`, depth + 1, comma)}
                </div>
              )
            })}
          </div>
          <span style={{ color: colors.bracket }}>{close}{trailing}</span>
        </span>
      )
    },
    [expanded, toggle, colors]
  )

  return (
    <div className="text-[13px] leading-[22px] select-text" style={{ fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace', color: colors.bracket }}>
      {renderVal(data, '$', 0)}
    </div>
  )
}

export default function JsonQuick() {
  const { t } = useTranslation()

  // Resolve theme to match Monaco editor colors
  const appTheme = useSettingsStore((s) => s.theme)
  const jsonColors = useMemo(() => {
    if (appTheme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? COLORS.dark : COLORS.light
    }
    return appTheme === 'dark' ? COLORS.dark : COLORS.light
  }, [appTheme])
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<'format' | 'compress'>('format')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Read clipboard on mount
  useEffect(() => {
    (async () => {
      try {
        let clipText = ''
        if (isTauri()) {
          const { invoke } = await import('@tauri-apps/api/core')
          clipText = await invoke<string>('get_clipboard_text')
        } else {
          clipText = await navigator.clipboard.readText()
        }
        const trimmed = clipText.trim()
        if (!trimmed) {
          setError(t('jsonQuick.clipboardEmpty', { defaultValue: 'Clipboard is empty' }))
          return
        }
        setInput(trimmed)
        // Try to parse as JSON
        try {
          JSON.parse(trimmed)
          setError(null)
        } catch (e) {
          setError((e as Error).message)
        }
      } catch {
        setError(t('jsonQuick.clipboardError', { defaultValue: 'Failed to read clipboard' }))
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closeWindow = useCallback(async () => {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('close_utility_window', { label: 'json-quick' })
      } catch { /* ignore */ }
    }
  }, [])

  // Double-click title bar to maximize/restore
  const toggleMaximize = useCallback(async () => {
    try {
      const win = getCurrentWindow()
      if (await win.isMaximized()) {
        await win.unmaximize()
      } else {
        await win.maximize()
      }
    } catch { /* ignore in non-Tauri env */ }
  }, [])

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeWindow()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [closeWindow])

  // Compute output
  const output = useMemo(() => {
    if (!input || error) return ''
    try {
      const data = JSON.parse(input)
      if (mode === 'format') {
        return JSON.stringify(data, null, 2)
      }
      return JSON.stringify(data)
    } catch (e) {
      return ''
    }
  }, [input, mode, error])

  // Parsed data for tree view
  const parsedData = useMemo(() => {
    if (!input || error) return null
    try {
      return JSON.parse(input) as unknown
    } catch {
      return null
    }
  }, [input, error])

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    if (!output) return
    try {
      await navigator.clipboard.writeText(output)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }, [output])

  // Toggle all expand/collapse for tree view
  const [expandAll, setExpandAll] = useState(false)

  const handleExpandAll = useCallback(() => {
    setExpandAll((prev) => !prev)
  }, [])

  // Stats
  const stats = useMemo(() => {
    if (!input || error) return null
    try {
      const data = JSON.parse(input)
      const formatted = JSON.stringify(data, null, 2)
      const compressed = JSON.stringify(data)
      return {
        formattedLines: formatted.split('\n').length,
        compressedLen: compressed.length,
      }
    } catch {
      return null
    }
  }, [input, error])

  return (
    <div className="flex h-screen flex-col bg-bg-elevated text-text-primary select-none">
      {/* Header (draggable) */}
      <div
        className="flex cursor-pointer items-center justify-between px-4 py-2.5 border-b border-border-subtle"
      >
        <div className="flex flex-1 items-center gap-2" data-tauri-drag-region onDoubleClick={toggleMaximize}>
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            {t('jsonQuick.title', { defaultValue: 'JSON Quick Format' })}
          </span>
        </div>
        <button
          onClick={closeWindow}
          className="rounded p-1 text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {error ? (
          /* Error state */
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
            <AlertCircle className="h-10 w-10 text-error/60" />
            <p className="text-sm text-text-secondary text-center">
              {error}
            </p>
            <p className="text-xs text-text-muted">
              {t('jsonQuick.invalidHint', { defaultValue: 'Clipboard content is not valid JSON' })}
            </p>
          </div>
        ) : (
          <>
            {/* Mode toggle + actions */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border-subtle">
              <div className="flex overflow-hidden rounded-md border border-border-subtle">
                <button
                  onClick={() => setMode('format')}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors ${
                    mode === 'format'
                      ? 'bg-primary/10 text-primary'
                      : 'text-text-muted hover:bg-bg-hover'
                  }`}
                >
                  <Sparkles className="h-3 w-3" />
                  {t('jsonQuick.format', { defaultValue: 'Format' })}
                </button>
                <button
                  onClick={() => setMode('compress')}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors ${
                    mode === 'compress'
                      ? 'bg-primary/10 text-primary'
                      : 'text-text-muted hover:bg-bg-hover'
                  }`}
                >
                  <Minimize2 className="h-3 w-3" />
                  {t('jsonQuick.compress', { defaultValue: 'Compress' })}
                </button>
              </div>

              {stats && (
                <span className="text-[11px] text-text-muted">
                  {mode === 'format'
                    ? `${stats.formattedLines} ${t('jsonQuick.lines', { defaultValue: 'lines' })}`
                    : `${stats.compressedLen} ${t('jsonQuick.chars', { defaultValue: 'chars' })}`}
                </span>
              )}

              <div className="flex-1" />

              {mode === 'format' && parsedData !== null && (
                <button
                  onClick={handleExpandAll}
                  className="flex items-center gap-1 rounded px-1.5 py-1 text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
                  title={expandAll
                    ? t('jsonQuick.collapseAll', { defaultValue: 'Collapse All' })
                    : t('jsonQuick.expandAll', { defaultValue: 'Expand All' })}
                >
                  {expandAll ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />}
                  <span className="text-[11px]">
                    {expandAll
                      ? t('jsonQuick.collapseAll', { defaultValue: 'Collapse' })
                      : t('jsonQuick.expandAll', { defaultValue: 'Expand' })}
                  </span>
                </button>
              )}

              <button
                onClick={handleCopy}
                disabled={!output}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  copied
                    ? 'bg-success/10 text-success'
                    : 'bg-primary/10 text-primary hover:bg-primary/20'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {copied ? (
                  <><Check className="h-3.5 w-3.5" /> {t('jsonQuick.copied', { defaultValue: 'Copied' })}</>
                ) : (
                  <><Copy className="h-3.5 w-3.5" /> {t('jsonQuick.copy', { defaultValue: 'Copy' })}</>
                )}
              </button>
            </div>

            {/* Output */}
            <div className="flex-1 overflow-auto select-text" style={{ backgroundColor: jsonColors.bg }}>
              <div className="p-4">
                {mode === 'format' && parsedData !== null ? (
                  <JsonTree data={parsedData} expandAll={expandAll} colors={jsonColors} />
                ) : (
                  <pre className="whitespace-pre-wrap text-[13px] leading-[22px] break-all" style={{ fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace', color: jsonColors.bracket }}>
                    <JsonHighlight text={output} colors={jsonColors} />
                  </pre>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
