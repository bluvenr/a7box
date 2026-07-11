/**
 * P2P Transfer — utility functions, constants, and CSS
 */

export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

export function formatSpeed(pctPerSec: number): string {
  if (pctPerSec < 0.01) return ''
  if (pctPerSec < 1) return pctPerSec.toFixed(1) + '%/s'
  return pctPerSec.toFixed(0) + '%/s'
}

export function formatEta(seconds: number): string {
  if (seconds < 1 || !isFinite(seconds)) return ''
  if (seconds < 60) return Math.ceil(seconds) + 's'
  if (seconds < 3600) return Math.ceil(seconds / 60) + 'm'
  return (seconds / 3600).toFixed(1) + 'h'
}

export const ALIAS_MAX = 20
export const GUIDE_KEY = 'a7box-p2p-guide-seen'
export const FAVORITES_KEY = 'a7box-p2p-favorites'
export const SCAN_TIMEOUT = 15_000

// ---- Scanning animation (CSS keyframes) ----
export const scanningStyle = `
@keyframes p2p-scan-ring {
  0% { transform: scale(0.5); opacity: 0.8; }
  100% { transform: scale(1.5); opacity: 0; }
}
.p2p-scan-ring { animation: p2p-scan-ring 2s ease-out infinite; }
.p2p-scan-ring:nth-child(2) { animation-delay: 0.6s; }
.p2p-scan-ring:nth-child(3) { animation-delay: 1.2s; }
`
