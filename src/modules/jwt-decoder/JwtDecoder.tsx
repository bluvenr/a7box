/**
 * A7Box JWT Decoder Module
 * Decodes and inspects JWT tokens (header, payload, expiry)
 */
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyRound, Copy, AlertTriangle, CheckCircle2, Clock, ShieldCheck } from 'lucide-react'

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
    return atob(base64)
  }
}

interface JwtParts {
  header: Record<string, unknown> | null
  payload: Record<string, unknown> | null
  error: string | null
}

function decodeJwt(token: string): JwtParts {
  const trimmed = token.trim().replace(/^Bearer\s+/i, '')
  const parts = trimmed.split('.')
  if (parts.length !== 3) {
    return { header: null, payload: null, error: 'Invalid JWT format (expected 3 parts)' }
  }
  try {
    const header = JSON.parse(decodeBase64Url(parts[0]))
    const payload = JSON.parse(decodeBase64Url(parts[1]))
    return { header, payload, error: null }
  } catch (e) {
    return { header: null, payload: null, error: `Decode error: ${e}` }
  }
}

function getExpiryInfo(payload: Record<string, unknown>): { expired: boolean; remaining: string; expDate: string } | null {
  const exp = payload.exp
  if (typeof exp !== 'number') return null
  const expMs = exp * 1000
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

  return { expired, remaining, expDate: new Date(expMs).toLocaleString() }
}

export default function JwtDecoder() {
  const { t } = useTranslation()
  const [token, setToken] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  const decoded = useMemo(() => (token.trim() ? decodeJwt(token) : null), [token])
  const expiry = useMemo(() => (decoded?.payload ? getExpiryInfo(decoded.payload) : null), [decoded])

  const copy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1200)
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <KeyRound size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            {t('modules.jwtDecoder.name')}
          </h1>
          <p className="text-sm text-text-secondary">
            {t('modules.jwtDecoder.description')}
          </p>
        </div>
      </div>

      {/* Token Input */}
      <div className="mb-6">
        <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted">
          JWT Token
        </label>
        <textarea
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ..."
          rows={4}
          className="w-full rounded-xl border border-border-subtle bg-bg-elevated p-4 font-mono text-sm text-text-primary outline-none transition focus:border-primary resize-none"
        />
      </div>

      {/* Error */}
      {decoded?.error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle size={16} />
          {decoded.error}
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
              {t('modules.jwtDecoder.expiresIn')}: {expiry.remaining}
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
                  {copied === 'header' ? <span className="text-xs text-green-400">✓</span> : <Copy size={12} />}
                </button>
              </div>
              <pre className="overflow-x-auto p-4 text-sm text-text-primary">
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
                  {copied === 'payload' ? <span className="text-xs text-green-400">✓</span> : <Copy size={12} />}
                </button>
              </div>
              <pre className="max-h-[400px] overflow-auto p-4 text-sm text-text-primary">
                {JSON.stringify(decoded.payload, null, 2)}
              </pre>
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
            {(['iss','sub','aud','exp','nbf','iat','jti'] as const).map((claim) => {
              const val = decoded.payload![claim]
              if (val === undefined) return null
              const isTime = ['exp','nbf','iat'].includes(claim)
              return (
                <div key={claim} className="flex items-center gap-2">
                  <code className="rounded bg-bg-base px-2 py-0.5 text-xs text-primary">{claim}</code>
                  <span className="text-text-secondary">
                    {isTime && typeof val === 'number'
                      ? new Date(val * 1000).toLocaleString()
                      : String(val)}
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
