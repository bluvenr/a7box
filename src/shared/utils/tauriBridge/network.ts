/**
 * A7Box Tauri IPC — Network Details
 */

import { getInvoke } from './common'
import type { NetworkDetails } from './types'

export async function getNetworkDetails(): Promise<NetworkDetails | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<NetworkDetails>('get_network_details')
  } catch { return null }
}
