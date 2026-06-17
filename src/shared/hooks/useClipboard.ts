/**
 * A7Box useClipboard Hook
 * Unified clipboard read/write utilities
 */

import { useCallback } from 'react'

export function useClipboard() {
  /** Copy text to clipboard */
  const copyText = useCallback(async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      console.warn('[A7Box] Failed to copy text to clipboard')
      return false
    }
  }, [])

  /** Read text from clipboard */
  const readText = useCallback(async (): Promise<string | null> => {
    try {
      return await navigator.clipboard.readText()
    } catch {
      return null
    }
  }, [])

  /** Copy an image blob to clipboard */
  const copyImage = useCallback(async (blob: Blob): Promise<boolean> => {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ])
      return true
    } catch {
      console.warn('[A7Box] Failed to copy image to clipboard')
      return false
    }
  }, [])

  return { copyText, readText, copyImage }
}
