/**
 * A7Box UUID/ID Generator Module
 * Generates UUID v4, NanoID, and other unique identifiers
 */
import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Binary, Copy, RefreshCw, Hash } from 'lucide-react'

// UUID v4 generator
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// NanoID generator (alphanumeric)
const NANOID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
function generateNanoID(length: number = 21): string {
  let id = ''
  for (let i = 0; i < length; i++) {
    id += NANOID_ALPHABET[Math.floor(Math.random() * NANOID_ALPHABET.length)]
  }
  return id
}

// Short hex ID
function generateShortHex(len: number = 12): string {
  return Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

// Numeric ID
function generateNumeric(len: number = 8): string {
  return Array.from({ length: len }, () => Math.floor(Math.random() * 10)).join('')
}

type IDType = 'uuid' | 'nanoid' | 'hex' | 'numeric'

export default function UuidGenerator() {
  const { t } = useTranslation()
  const [idType, setIdType] = useState<IDType>('uuid')
  const [count, setCount] = useState(5)
  const [nanoidLen, setNanoidLen] = useState(21)
  const [ids, setIds] = useState<string[]>([])
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)

  const generate = useCallback(() => {
    const newIds: string[] = []
    for (let i = 0; i < count; i++) {
      switch (idType) {
        case 'uuid': newIds.push(generateUUID()); break
        case 'nanoid': newIds.push(generateNanoID(nanoidLen)); break
        case 'hex': newIds.push(generateShortHex(nanoidLen)); break
        case 'numeric': newIds.push(generateNumeric(nanoidLen)); break
      }
    }
    setIds(newIds)
  }, [idType, count, nanoidLen])

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
    { key: 'hex', label: 'Hex' },
    { key: 'numeric', label: t('modules.uuidGenerator.numeric') },
  ]

  return (
    <div className="h-full overflow-y-auto p-6">
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
        <div className="flex flex-wrap items-end gap-4">
          {/* Type selector */}
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
              {t('modules.uuidGenerator.type')}
            </label>
            <div className="flex gap-1 rounded-lg bg-bg-base p-1">
              {types.map((tp) => (
                <button
                  key={tp.key}
                  onClick={() => { setIdType(tp.key); }}
                  className={`cursor-pointer rounded-md px-3 py-1.5 text-sm transition ${
                    idType === tp.key
                      ? 'bg-primary text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {tp.label}
                </button>
              ))}
            </div>
          </div>

          {/* Count */}
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
              {t('modules.uuidGenerator.count')}
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(Math.min(100, Math.max(1, Number(e.target.value))))}
              className="w-20 rounded-lg border border-border-base bg-bg-base px-3 py-1.5 text-sm text-text-primary outline-none focus:border-primary transition"
            />
          </div>

          {/* Length (for nanoid/hex/numeric) */}
          {idType !== 'uuid' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
                {t('modules.uuidGenerator.length')}
              </label>
              <input
                type="number"
                min={4}
                max={64}
                value={nanoidLen}
                onChange={(e) => setNanoidLen(Math.min(64, Math.max(4, Number(e.target.value))))}
                className="w-20 rounded-lg border border-border-base bg-bg-base px-3 py-1.5 text-sm text-text-primary outline-none focus:border-primary transition"
              />
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={generate}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary/90 cursor-pointer"
          >
            <RefreshCw size={14} />
            {t('modules.uuidGenerator.generate')}
          </button>
        </div>
      </div>

      {/* Results */}
      {ids.length > 0 && (
        <div className="rounded-xl border border-border-subtle bg-bg-elevated overflow-hidden">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Hash size={14} />
              {ids.length} {t('modules.uuidGenerator.generated')}
            </h3>
            <button
              onClick={copyAll}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-text-secondary transition hover:text-primary cursor-pointer"
            >
              <Copy size={12} />
              {copiedAll ? '✓ ' + t('common.copied') : t('modules.uuidGenerator.copyAll')}
            </button>
          </div>
          <div className="divide-y divide-border-subtle">
            {ids.map((id, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5 group">
                <code className="select-all font-mono text-sm text-text-primary">{id}</code>
                <button
                  onClick={() => copyOne(i, id)}
                  className="ml-2 rounded p-1 text-text-muted opacity-0 transition hover:text-primary group-hover:opacity-100 cursor-pointer"
                >
                  {copiedIdx === i ? <span className="text-xs text-green-400">✓</span> : <Copy size={12} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
