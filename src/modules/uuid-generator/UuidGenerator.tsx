/**
 * A7Box UUID/ID Generator Module
 * Generates UUID v4, NanoID, and other unique identifiers
 */
import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Binary, Copy, Check, RefreshCw, Hash } from 'lucide-react'

// ── Crypto-secure helpers ───────────────────────────────────────────────────────

function secureRandomInt(max: number): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0] % max
}

// UUID v4 generator
function generateUUID(): string {
  if (crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = secureRandomInt(16)
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Build NanoID alphabet from character set options
function buildAlphabet(upper: boolean, lower: boolean, digits: boolean, symbols: boolean): string {
  let a = ''
  if (upper) a += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  if (lower) a += 'abcdefghijklmnopqrstuvwxyz'
  if (digits) a += '0123456789'
  if (symbols) a += '_-~!@#$%&'
  return a
}

function generateNanoID(length: number, alphabet: string): string {
  let id = ''
  for (let i = 0; i < length; i++) {
    id += alphabet[secureRandomInt(alphabet.length)]
  }
  return id
}

// Short hex ID (crypto-secure)
// 32-char pool for mixed case: each hex digit randomly upper or lower
const HEX_MIXED = '0123456789ABCDEFabcdef'
function generateShortHex(len: number = 12): string {
  return Array.from({ length: len }, () => HEX_MIXED[secureRandomInt(HEX_MIXED.length)]).join('')
}

// Numeric ID (crypto-secure)
function generateNumeric(len: number = 8): string {
  return Array.from({ length: len }, () => secureRandomInt(10)).join('')
}

// ── Types ───────────────────────────────────────────────────────────────────────

type IDType = 'uuid' | 'nanoid' | 'hex' | 'numeric'
type CaseMode = 'mixed' | 'lower' | 'upper'

// ── Component ───────────────────────────────────────────────────────────────────

export default function UuidGenerator() {
  const { t } = useTranslation()
  const [idType, setIdType] = useState<IDType>('uuid')
  const [count, setCount] = useState(10)
  const [nanoidLen, setNanoidLen] = useState(21)
  const [caseMode, setCaseMode] = useState<CaseMode>('mixed')
  const [csUpper, setCsUpper] = useState(true)
  const [csLower, setCsLower] = useState(true)
  const [csDigits, setCsDigits] = useState(true)
  const [csSymbols, setCsSymbols] = useState(false)
  const [ids, setIds] = useState<string[]>([])
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)

  const generate = useCallback(() => {
    const raw: string[] = []
    for (let i = 0; i < count; i++) {
      switch (idType) {
        case 'uuid': raw.push(generateUUID()); break
        case 'nanoid': raw.push(generateNanoID(nanoidLen, buildAlphabet(csUpper, csLower, csDigits, csSymbols))); break
        case 'hex': raw.push(generateShortHex(nanoidLen)); break
        case 'numeric': raw.push(generateNumeric(nanoidLen)); break
      }
    }
    const transformed =
      caseMode === 'upper' ? raw.map((s) => s.toUpperCase())
      : caseMode === 'lower' ? raw.map((s) => s.toLowerCase())
      : raw
    setIds(transformed)
  }, [idType, count, nanoidLen, caseMode, csUpper, csLower, csDigits, csSymbols])

  // Auto-generate on mount
  useEffect(() => { generate() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-regenerate when params change
  useEffect(() => { generate() }, [idType, count, nanoidLen, caseMode, csUpper, csLower, csDigits, csSymbols]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-enable lowercase if all character sets unchecked
  useEffect(() => {
    if (!csUpper && !csLower && !csDigits && !csSymbols) setCsLower(true)
  }, [csUpper, csLower, csDigits, csSymbols])

  // Keyboard shortcut: Enter to regenerate
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        generate()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [generate])

  const copyOne = async (idx: number, val: string) => {
    await navigator.clipboard.writeText(val)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 1200)
  }

  const copyAll = async () => {
    await navigator.clipboard.writeText(ids.join('\n'))
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 1500)
  }

  const types: { key: IDType; label: string }[] = [
    { key: 'uuid', label: 'UUID v4' },
    { key: 'nanoid', label: 'NanoID' },
    { key: 'hex', label: t('modules.uuidGenerator.hex', { defaultValue: 'Hex' }) },
    { key: 'numeric', label: t('modules.uuidGenerator.numeric') },
  ]

  const supportsCase = (idType === 'nanoid' && (csUpper || csLower)) || idType === 'hex'

  return (
    <div className="flex h-full flex-col">
      {/* Header + Config (fixed) */}
      <div className="shrink-0 px-6 pt-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Binary size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            {t('modules.uuidGenerator.name')}
          </h1>
          <p className="text-sm text-text-secondary">
            {t('modules.uuidGenerator.description')}
          </p>
        </div>
      </div>

      {/* Config Panel */}
      <div className="mb-6 rounded-xl border border-border-subtle bg-bg-elevated p-4">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          {/* Type */}
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
              {t('modules.uuidGenerator.type')}
            </label>
            <div className="h-9 flex items-center">
              <div className="flex overflow-hidden rounded-md border border-border-subtle w-fit">
                {types.map((tp) => (
                  <button
                    key={tp.key}
                    onClick={() => setIdType(tp.key)}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                      idType === tp.key
                        ? 'bg-primary/10 text-primary'
                        : 'text-text-muted hover:bg-bg-hover'
                    }`}
                  >
                    {tp.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Count */}
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
              {t('modules.uuidGenerator.count')}
            </label>
            <div className="h-9 flex items-center">
              <input
                type="number"
                min={1}
                max={100}
                value={count}
                onChange={(e) => setCount(Number(e.target.value) || 1)}
                onBlur={() => setCount(Math.min(100, Math.max(1, count)))}
                className="w-20 rounded-lg border border-border-base bg-bg-base px-3 py-1.5 text-sm text-text-primary outline-none focus:border-primary transition"
              />
            </div>
          </div>

          {/* Length */}
          {idType !== 'uuid' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
                {t('modules.uuidGenerator.length')}
              </label>
              <div className="h-9 flex items-center">
                <input
                  type="number"
                  min={4}
                  max={64}
                  value={nanoidLen}
                  onChange={(e) => setNanoidLen(Number(e.target.value) || 4)}
                  onBlur={() => setNanoidLen(Math.min(64, Math.max(4, nanoidLen)))}
                  className="w-20 rounded-lg border border-border-base bg-bg-base px-3 py-1.5 text-sm text-text-primary outline-none focus:border-primary transition"
                />
              </div>
            </div>
          )}

          {/* Case */}
          {supportsCase && (
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
                {t('modules.uuidGenerator.case', { defaultValue: 'Case' })}
              </label>
              <div className="h-9 flex items-center">
                <div className="flex overflow-hidden rounded-md border border-border-subtle w-fit">
                  <button
                    onClick={() => setCaseMode('mixed')}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                      caseMode === 'mixed'
                        ? 'bg-primary/10 text-primary'
                        : 'text-text-muted hover:bg-bg-hover'
                    }`}
                  >
                    {t('modules.uuidGenerator.mixed', { defaultValue: 'Mixed' })}
                  </button>
                  <button
                    onClick={() => setCaseMode('lower')}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                      caseMode === 'lower'
                        ? 'bg-primary/10 text-primary'
                        : 'text-text-muted hover:bg-bg-hover'
                    }`}
                  >
                    {t('modules.uuidGenerator.lowercase', { defaultValue: 'Lowercase' })}
                  </button>
                  <button
                    onClick={() => setCaseMode('upper')}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                      caseMode === 'upper'
                        ? 'bg-primary/10 text-primary'
                        : 'text-text-muted hover:bg-bg-hover'
                    }`}
                  >
                    {t('modules.uuidGenerator.uppercase', { defaultValue: 'Uppercase' })}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Character set */}
          {idType === 'nanoid' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
                {t('modules.uuidGenerator.charset', { defaultValue: 'Character Set' })}
              </label>
              <div className="h-9 flex items-center gap-x-3">
                {[
                  { key: 'upper', checked: csUpper, set: setCsUpper, label: t('modules.uuidGenerator.csUpper', { defaultValue: 'A-Z' }) },
                  { key: 'lower', checked: csLower, set: setCsLower, label: t('modules.uuidGenerator.csLower', { defaultValue: 'a-z' }) },
                  { key: 'digits', checked: csDigits, set: setCsDigits, label: t('modules.uuidGenerator.csDigits', { defaultValue: '0-9' }) },
                  { key: 'symbols', checked: csSymbols, set: setCsSymbols, label: t('modules.uuidGenerator.csSymbols', { defaultValue: '_-~!@#$%' }) },
                ].map(({ key, checked, set, label }) => (
                  <label key={key} className="flex items-center gap-1.5 text-sm text-text-secondary cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => set(!checked)}
                      className="accent-primary h-3.5 w-3.5 rounded cursor-pointer"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Generate */}
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-transparent select-none">.</label>
            <div className="h-9 flex items-center">
              <button
                onClick={generate}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary/90 cursor-pointer"
              >
                <RefreshCw size={14} />
                {t('modules.uuidGenerator.generate')}
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Results header (fixed) */}
      {ids.length > 0 && (
        <div className="shrink-0 px-6">
          <div className="flex items-center justify-between rounded-t-xl border border-border-subtle bg-bg-elevated px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Hash size={14} />
              {ids.length} {t('modules.uuidGenerator.generated')}
            </h3>
            <button
              onClick={copyAll}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-text-secondary transition hover:text-primary cursor-pointer"
            >
              {copiedAll ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              {copiedAll ? t('common.copied') : t('modules.uuidGenerator.copyAll')}
            </button>
          </div>
        </div>
      )}

      {/* Results list (scrollable) */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {ids.length > 0 ? (
        <div className="rounded-b-xl border-x border-b border-border-subtle bg-bg-elevated overflow-hidden">
          <div className="divide-y divide-border-subtle">
            {ids.map((id, i) => (
              <div key={id + i} className="flex items-center justify-between px-4 py-2.5 group hover:bg-bg-hover transition-colors">
                <code className="select-all font-mono text-sm text-text-primary">{id}</code>
                <button
                  onClick={() => copyOne(i, id)}
                  className="ml-2 rounded p-1 text-text-muted opacity-0 transition hover:text-primary group-hover:opacity-100 cursor-pointer"
                >
                  {copiedIdx === i
                    ? <Check size={12} className="text-green-400" />
                    : <Copy size={12} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Empty state */
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-text-disabled">
          <Hash size={28} strokeWidth={1.2} />
          <p className="text-sm">
            {t('modules.uuidGenerator.emptyHint', { defaultValue: 'Press Enter or click Generate to create IDs' })}
          </p>
        </div>
      )}
      </div>
    </div>
  )
}
