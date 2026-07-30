/**
 * A7Box Tauri IPC — System Stats
 */

import { getInvoke } from './common'
import type { SystemStats } from './types'

export async function getSystemStats(): Promise<SystemStats | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<SystemStats>('get_system_stats')
  } catch { return null }
}
