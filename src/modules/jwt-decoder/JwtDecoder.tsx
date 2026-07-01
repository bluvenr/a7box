/**
 * A7Box JWT Decoder Module
 * Decodes and inspects JWT tokens (header, payload, expiry, signature)
 */
import { useState, useMemo, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyRound, Copy, AlertTriangle, CheckCircle2, Clock, ShieldCheck, ClipboardPaste, Fingerprint, X } from 'lucide-react'
import { usePageActive } from '../../app/layouts/CachedOutlet'

function decodeBase64Url(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) base64 += '='
  try {
    return decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
  } catch {
    try {
      return atob(base64)
    } catch {
      return ''
    }
  }
}

interface JwtParts {
  header: Record<string, unknown> | null
  payload: Record<string, unknown> | null
  signature: string | null
  error: string | null
}

function decodeJwt(token: string): JwtParts {
  const trimmed = token.trim().replace(/^Bearer\s+/i, '')
  const parts = trimmed.split('.')
  if (parts.length !== 3) {
    return { header: null, payload: null, signature: null, error: '__INVALID_FORMAT__' }
  }
  try {
    const header = JSON.parse(decodeBase64Url(parts[0]))
    const payload = JSON.parse(decodeBase64Url(parts[1]))
    const signature = parts[2] || null
    return { header, payload, signature, error: null }
  } catch (e) {
    return { header: null, payload: null, signature: null, error: `__DECODE_ERROR__:${e}` }
  }
}

interface ExpiryInfo {
  expired: boolean
  remaining: string
  expDate: string
  expMs: number
}

function computeExpiry(expMs: number): ExpiryInfo {
  const now = Date.now()
  const expired = now > expMs
  const diff = Math.abs(expMs - now)
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  let remaining: string
  if (days > 0) remaining = `${days}d ${hours % 24}h`
  else if (hours > 0) remaining = `${hours}h ${minutes % 60}m`
  else if (minutes > 0) remaining = `${minutes}m ${seconds % 60}s`
  else remaining = `${seconds}s`

  return { expired, remaining, expDate: new Date(expMs).toLocaleString(), expMs }
}

function formatClaimValue(claim: string, val: unknown): string {
  if (['exp', 'nbf', 'iat'].includes(claim) && typeof val === 'number') {
    return new Date(val * 1000).toLocaleString()
  }
  if (Array.isArray(val)) return val.join(', ')
  return String(val)
}

export default function JwtDecoder() {
  const { t } = useTranslation()
  const pageActive = usePageActive()
  const [token, setToken] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  const decoded = useMemo(() => (token.trim() ? decodeJwt(token) : null), [token])

  // Tick every second for live expiry countdown — only when token has exp and page is active
  const hasExp = decoded?.payload?.exp !== undefined
  useEffect(() => {
    if (!hasExp || !pageActive) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [hasExp, pageActive])

  const expiry = useMemo(() => {
    if (!decoded?.payload) return null
    const exp = decoded.payload.exp
    if (typeof exp !== 'number') return null
    return computeExpiry(exp * 1000)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decoded, now])

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 1200)
    } catch {
      /* clipboard write failed */
    }
  }

  const paste = useCallback(async () => {
    try {
      let text = ''
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const { invoke } = await import('@tauri-apps/api/core')
        text = await invoke<string>('get_clipboard_text')
      } else {
        text = await navigator.clipboard.readText()
      }
      if (text.trim()) setToken(text.trim())
    } catch {
      /* clipboard permission denied or empty */
    }
  }, [])

  const errorMessage = decoded?.error
    ? decoded.error === '__INVALID_FORMAT__'
      ? t('modules.jwtDecoder.invalidFormat')
      : `${t('modules.jwtDecoder.decodeError')}: ${decoded.error.replace('__DECODE_ERROR__:', '')}`
    : null

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <KeyRound size={20} />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-text-primary">
            {t('modules.jwtDecoder.name')}
          </h1>
          <p className="text-sm text-text-secondary">
            {t('modules.jwtDecoder.description')}
          </p>
        </div>
      </div>

      {/* Token Input */}
      <div className="relative mb-6">
        <textarea
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={t('modules.jwtDecoder.placeholder')}
          rows={4}
          className="w-full rounded-xl border border-border-subtle bg-bg-elevated p-4 pr-[120px] font-mono text-sm text-text-primary outline-none transition focus:border-primary resize-none"
        />
        <div className="absolute right-3 bottom-3 flex items-center gap-1.5">
          {token && (
            <button
              onClick={() => setToken('')}
              className="flex items-center gap-1.5 rounded-lg bg-bg-base/80 px-2.5 py-1 text-xs text-text-muted backdrop-blur-sm transition hover:text-red-400 cursor-pointer"
            >
              <X size={12} />
              {t('modules.jwtDecoder.clear')}
            </button>
          )}
          <button
            onClick={paste}
            className="flex items-center gap-1.5 rounded-lg bg-bg-base/80 px-2.5 py-1 text-xs text-text-secondary backdrop-blur-sm transition hover:text-primary cursor-pointer"
          >
            <ClipboardPaste size={12} />
            {t('modules.jwtDecoder.paste')}
          </button>
        </div>
      </div>

      {/* Empty state */}
      {!token.trim() && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-text-disabled">
          <KeyRound size={32} strokeWidth={1.2} />
          <p className="text-sm">
            {t('modules.jwtDecoder.emptyHint')}
          </p>
        </div>
      )}

      {/* Error */}
      {errorMessage && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle size={16} />
          {errorMessage}
        </div>
      )}

      {/* Expiry Status */}
      {expiry && (
        <div className={`mb-4 flex items-center gap-3 rounded-xl border px-4 py-3 ${
          expiry.expired
            ? 'border-red-500/30 bg-red-500/10 text-red-400'
            : 'border-green-500/30 bg-green-500/10 text-green-400'
        }`}>
          {expiry.expired ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          <div className="flex-1 text-sm">
            <span className="font-medium">
              {expiry.expired
                ? t('modules.jwtDecoder.expired')
                : t('modules.jwtDecoder.valid')}
            </span>
            <span className="ml-2 text-text-muted">
              {expiry.expired
                ? t('modules.jwtDecoder.expiredAgo', { time: expiry.remaining })
                : t('modules.jwtDecoder.expiresIn', { time: expiry.remaining })}
            </span>
            <span className="ml-2 text-text-muted">({expiry.expDate})</span>
          </div>
        </div>
      )}

      {/* Decoded Sections */}
      {decoded && !decoded.error && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Header */}
          {decoded.header && (
            <div className="rounded-xl border border-border-subtle bg-bg-elevated overflow-hidden">
              <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <ShieldCheck size={14} className="text-blue-400" />
                  Header
                </h3>
                <button
                  onClick={() => copy('header', JSON.stringify(decoded.header, null, 2))}
                  className="rounded p-1 text-text-muted transition hover:text-primary cursor-pointer"
                >
                  {copied === 'header' ? <CheckCircle2 size={12} className="text-green-400" /> : <Copy size={12} />}
                </button>
              </div>
              <pre className="max-h-[400px] overflow-auto p-4 text-sm text-text-primary">
                {JSON.stringify(decoded.header, null, 2)}
              </pre>
            </div>
          )}

          {/* Payload */}
          {decoded.payload && (
            <div className="rounded-xl border border-border-subtle bg-bg-elevated overflow-hidden">
              <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <Clock size={14} className="text-amber-400" />
                  Payload
                </h3>
                <button
                  onClick={() => copy('payload', JSON.stringify(decoded.payload, null, 2))}
                  className="rounded p-1 text-text-muted transition hover:text-primary cursor-pointer"
                >
                  {copied === 'payload' ? <CheckCircle2 size={12} className="text-green-400" /> : <Copy size={12} />}
                </button>
              </div>
              <pre className="max-h-[400px] overflow-auto p-4 text-sm text-text-primary">
                {JSON.stringify(decoded.payload, null, 2)}
              </pre>
            </div>
          )}

          {/* Signature */}
          {decoded.signature && (
            <div className="rounded-xl border border-border-subtle bg-bg-elevated overflow-hidden lg:col-span-2">
              <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <Fingerprint size={14} className="text-purple-400" />
                  {t('modules.jwtDecoder.signature')}
                </h3>
                <button
                  onClick={() => copy('signature', decoded.signature!)}
                  className="rounded p-1 text-text-muted transition hover:text-primary cursor-pointer"
                >
                  {copied === 'signature' ? <CheckCircle2 size={12} className="text-green-400" /> : <Copy size={12} />}
                </button>
              </div>
              <div className="px-4 py-3">
                <code className="block break-all font-mono text-sm text-text-primary">{decoded.signature}</code>
                <p className="mt-2 text-xs text-text-muted">
                  {t('modules.jwtDecoder.signatureDesc')}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Standard claims reference */}
      {decoded?.payload && (
        <div className="mt-4 rounded-xl border border-border-subtle bg-bg-elevated p-4">
          <h3 className="mb-3 text-sm font-semibold text-text-primary">
            {t('modules.jwtDecoder.standardClaims')}
          </h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
            {(['iss', 'sub', 'aud', 'exp', 'nbf', 'iat', 'jti'] as const).map((claim) => {
              const val = decoded.payload![claim]
              if (val === undefined) return null
              return (
                <div key={claim} className="flex items-center gap-2">
                  <code className="shrink-0 rounded bg-bg-base px-2 py-0.5 text-xs text-primary">{claim}</code>
                  <span className="truncate text-text-secondary">
                    {formatClaimValue(claim, val)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
