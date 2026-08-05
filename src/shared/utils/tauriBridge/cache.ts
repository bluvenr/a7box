/**
 * A7Box Tauri IPC — Cache Management
 */

import { getInvoke } from './common'
import type { CacheSizes } from './types'

export async function getCacheSizes(): Promise<CacheSizes | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<CacheSizes>('get_cache_sizes')
  } catch { return null }
}

export async function clearCache(category: 'p2pDownloads' | 'screenshots' | 'transferHistory' | 'clipboardImages' | 'clipboardHistory'): Promise<boolean> {
  const invoke = await getInvoke()
  if (!invoke) return false
  try {
    return await invoke<boolean>('clear_cache', { category })
  } catch { return false }
}

export async function openCacheDir(category: 'p2pDownloads' | 'screenshots' | 'clipboardImages'): Promise<boolean> {
  const invoke = await getInvoke()
  if (!invoke) return false
  try {
    return await invoke<boolean>('open_cache_dir', { category })
  } catch { return false }
}
