/**
 * A7Box Code Share Module
 * Share code snippets via paste service (dpaste.org)
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Share2, Copy, ExternalLink, RefreshCw, Code2 } from 'lucide-react'

const LANGUAGES = [
  'plaintext', 'javascript', 'typescript', 'python', 'rust', 'go', 'java',
  'c', 'cpp', 'csharp', 'ruby', 'php', 'html', 'css', 'json', 'yaml',
  'sql', 'bash', 'markdown', 'xml',
]

const EXPIRY_OPTIONS = [
  { label: '1 day', value: 86400 },
  { label: '7 days', value: 604800 },
  { label: '30 days', value: 2592000 },
  { label: 'Never', value: 0 },
]

async function createPaste(content: string, language: string, expiry: number): Promise<string> {
  const body = new URLSearchParams({
    content,
    syntax: language === 'plaintext' ? 'text' : language,
    title: 'A7Box Code Share',
    expiry_days: String(expiry > 0 ? Math.ceil(expiry / 86400) : 0),
  })

  const res = await fetch('https://dpaste.org/api/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  const url = await res.text()
  return url.trim()
}

export default function CodeShare() {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('plaintext')
  const [expiry, setExpiry] = useState(86400)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [history, setHistory] = useState<{ url: string; lang: string; time: string }[]>([])

  const handleShare = async () => {
    if (!code.trim()) {
      setError(t('modules.codeShare.ui.enterCode'))
      return
    }
    setError(null)
    setLoading(true)
    setShareUrl(null)

    try {
      const url = await createPaste(code, language, expiry)
      setShareUrl(url)
      setHistory((prev) => [
        { url, lang: language, time: new Date().toLocaleTimeString() },
        ...prev,
      ].slice(0, 10))
    } catch (e) {
      setError(String(e))
    }
    setLoading(false)
  }

  const copyUrl = async () => {
    if (shareUrl) {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const openUrl = () => {
    if (shareUrl) window.open(shareUrl, '_blank')
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Share2 size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            {t('modules.codeShare.name')}
          </h1>
          <p className="text-sm text-text-secondary">
            {t('modules.codeShare.description')}
          </p>
        </div>
      </div>

      {/* Config */}
      <div className="mb-4 flex flex-wrap gap-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
            {t('modules.codeShare.ui.language')}
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="rounded-lg border border-border-base bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-primary transition cursor-pointer"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
            {t('modules.codeShare.ui.expiry')}
          </label>
          <select
            value={expiry}
            onChange={(e) => setExpiry(Number(e.target.value))}
            className="rounded-lg border border-border-base bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-primary transition cursor-pointer"
          >
            {EXPIRY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={handleShare}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
          >
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Share2 size={14} />}
            {t('modules.codeShare.ui.share')}
          </button>
        </div>
      </div>

      {/* Code Editor */}
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={t('modules.codeShare.ui.codePlaceholder')}
        rows={16}
        className="mb-4 w-full rounded-xl border border-border-subtle bg-bg-elevated p-4 font-mono text-sm text-text-primary outline-none transition focus:border-primary resize-none"
      />

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Share Result */}
      {shareUrl && (
        <div className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Code2 size={14} className="text-green-400" />
            <span className="text-sm font-semibold text-green-400">
              {t('modules.codeShare.ui.shared')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-bg-base px-3 py-2 text-sm text-primary select-all">
              {shareUrl}
            </code>
            <button
              onClick={copyUrl}
              className="rounded-lg bg-bg-base px-3 py-2 text-sm text-text-secondary transition hover:text-primary cursor-pointer"
            >
              <Copy size={14} />
              {copied && <span className="ml-1 text-green-400">✓</span>}
            </button>
            <button
              onClick={openUrl}
              className="rounded-lg bg-bg-base px-3 py-2 text-sm text-text-secondary transition hover:text-primary cursor-pointer"
            >
              <ExternalLink size={14} />
            </button>
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="rounded-xl border border-border-subtle bg-bg-elevated overflow-hidden">
          <div className="border-b border-border-subtle px-4 py-3">
            <h3 className="text-sm font-semibold text-text-primary">
              {t('modules.codeShare.ui.history')} ({history.length})
            </h3>
          </div>
          <div className="divide-y divide-border-subtle">
            {history.map((h, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <code className="rounded bg-bg-base px-2 py-0.5 text-xs text-text-muted">{h.lang}</code>
                  <span className="text-xs text-text-muted">{h.time}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={async () => { await navigator.clipboard.writeText(h.url) }}
                    className="rounded p-1 text-text-muted transition hover:text-primary cursor-pointer"
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    onClick={() => window.open(h.url, '_blank')}
                    className="rounded p-1 text-text-muted transition hover:text-primary cursor-pointer"
                  >
                    <ExternalLink size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
