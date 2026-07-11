import { describe, it, expect, beforeEach } from 'vitest'
import { formatShortcut, formatPlainShortcuts } from '../index'

// Mock navigator.platform for platform-specific tests
function mockPlatform(platform: string) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { platform },
    writable: true,
    configurable: true,
  })
}

describe('formatShortcut', () => {
  describe('Windows/Linux (non-mac)', () => {
    beforeEach(() => {
      // jsdom defaults to non-mac platform
      mockPlatform('Win32')
    })

    it('replaces CommandOrControl with Ctrl', () => {
      // Note: _isMac is computed once at module load time in the original code,
      // so we test the actual behavior in jsdom (which defaults to non-mac)
      const result = formatShortcut('CommandOrControl+Shift+A')
      // In jsdom (non-mac), CommandOrControl → Ctrl, Shift stays
      expect(result).toContain('Ctrl')
    })

    it('keeps Shift as text on non-mac', () => {
      const result = formatShortcut('CommandOrControl+Shift+Q')
      expect(result).toContain('Shift')
    })

    it('replaces Alt with Alt text on non-mac', () => {
      const result = formatShortcut('Alt+F')
      expect(result).toContain('Alt')
    })

    it('preserves + separator on non-mac', () => {
      const result = formatShortcut('CommandOrControl+A')
      expect(result).toContain('+')
    })
  })
})

describe('formatPlainShortcuts', () => {
  it('returns text unchanged on non-mac', () => {
    const text = 'Alt+F Format · Alt+M Compress'
    const result = formatPlainShortcuts(text)
    // In jsdom (non-mac), text should be unchanged
    expect(result).toBe(text)
  })
})
