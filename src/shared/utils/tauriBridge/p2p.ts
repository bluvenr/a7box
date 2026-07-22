/**
 * A7Box Tauri IPC — P2P LAN Transfer
 */

import { getInvoke, getListen } from './common'
import type { P2PIdentity, P2PPeer, P2PTransferInfo, P2PDirFile, P2PSharedInfo, P2PAccessLogEntry } from './types'

export async function p2pGetIdentity(): Promise<P2PIdentity | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<P2PIdentity>('p2p_get_identity')
  } catch { return null }
}

export async function p2pSetAlias(alias: string): Promise<void> {
  const invoke = await getInvoke()
  if (invoke) await invoke('p2p_set_alias', { alias })
}

export async function p2pGetPeers(): Promise<P2PPeer[]> {
  const invoke = await getInvoke()
  if (!invoke) return []
  try {
    return await invoke<P2PPeer[]>('p2p_get_peers')
  } catch { return [] }
}

export async function p2pStartService(): Promise<number | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<number>('p2p_start_service')
  } catch (e) {
    console.error('[A7Box] P2P start failed:', e)
    return null
  }
}

export async function p2pGetRunningPort(): Promise<number> {
  const invoke = await getInvoke()
  if (!invoke) return 0
  try {
    return await invoke<number>('p2p_get_running_port')
  } catch { return 0 }
}

export async function p2pSendFile(peerCode: string, filePath: string): Promise<string | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<string>('p2p_send_file', { peerCode, filePath })
  } catch (e) {
    console.error('[A7Box] P2P send file failed:', e)
    return null
  }
}

export async function p2pRequestDir(peerCode: string): Promise<P2PDirFile[]> {
  const invoke = await getInvoke()
  if (!invoke) return []
  try {
    return await invoke<P2PDirFile[]>('p2p_request_dir', { peerCode })
  } catch (e) {
    console.error('[A7Box] P2P request dir failed:', e)
    return []
  }
}

export async function p2pDownloadFile(peerCode: string, remotePath: string, localDir: string): Promise<string | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<string>('p2p_download_file', { peerCode, remotePath, localDir })
  } catch (e) {
    console.error('[A7Box] P2P download failed:', e)
    return null
  }
}

export async function p2pSetSharedDir(dir: string, enabled: boolean): Promise<void> {
  const invoke = await getInvoke()
  if (invoke) await invoke('p2p_set_shared_dir', { dir, enabled })
}

export async function p2pGetSharedInfo(): Promise<P2PSharedInfo | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<P2PSharedInfo>('p2p_get_shared_info')
  } catch { return null }
}

export async function p2pGetTransfers(): Promise<P2PTransferInfo[]> {
  const invoke = await getInvoke()
  if (!invoke) return []
  try {
    return await invoke<P2PTransferInfo[]>('p2p_get_transfers')
  } catch { return [] }
}

export async function p2pGetLocalIps(): Promise<string[]> {
  const invoke = await getInvoke()
  if (!invoke) return []
  try {
    return await invoke<string[]>('p2p_get_local_ips')
  } catch { return [] }
}

export async function p2pManualConnect(addr: string): Promise<P2PPeer | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<P2PPeer>('p2p_manual_connect', { addr })
  } catch (e) {
    console.error('[P2P] Manual connect failed:', e)
    return null
  }
}

export async function p2pRetryTransfer(transferId: string): Promise<string | null> {
  const invoke = await getInvoke()
  if (!invoke) return null
  try {
    return await invoke<string>('p2p_retry_transfer', { transferId })
  } catch (e) {
    console.error('[P2P] Retry failed:', e)
    return null
  }
}

export async function p2pStopService(): Promise<void> {
  const invoke = await getInvoke()
  if (!invoke) return
  try {
    await invoke('p2p_stop_service')
  } catch (e) {
    console.error('[P2P] Stop service failed:', e)
  }
}

export async function p2pValidateDir(dir: string): Promise<boolean> {
  const invoke = await getInvoke()
  if (!invoke) return false
  try {
    return await invoke<boolean>('p2p_validate_dir', { dir })
  } catch { return false }
}

export async function p2pAcceptTransfer(transferId: string): Promise<boolean> {
  const invoke = await getInvoke()
  if (!invoke) return false
  try {
    return await invoke<boolean>('p2p_accept_transfer', { transferId })
  } catch { return false }
}

export async function p2pRejectTransfer(transferId: string): Promise<boolean> {
  const invoke = await getInvoke()
  if (!invoke) return false
  try {
    return await invoke<boolean>('p2p_reject_transfer', { transferId })
  } catch { return false }
}

export async function p2pCancelTransfer(transferId: string): Promise<boolean> {
  const invoke = await getInvoke()
  if (!invoke) return false
  try {
    return await invoke<boolean>('p2p_cancel_transfer', { transferId })
  } catch { return false }
}

export async function p2pSetDownloadDir(dir: string): Promise<void> {
  const invoke = await getInvoke()
  if (!invoke) return
  try {
    await invoke('p2p_set_download_dir', { dir })
  } catch (e) {
    console.error('[P2P] Set download dir failed:', e)
  }
}

export async function p2pGetDownloadDir(): Promise<string> {
  const invoke = await getInvoke()
  if (!invoke) return ''
  try {
    return await invoke<string>('p2p_get_download_dir')
  } catch { return '' }
}

// ============ P2P Event Listeners ============

export async function onP2PPeerDiscovered(callback: (peer: P2PPeer) => void): Promise<(() => void) | null> {
  const listen = await getListen()
  if (!listen) return null
  const unlisten = await listen<P2PPeer>('p2p-peer-discovered', (e) => callback(e.payload))
  return unlisten
}

export async function onP2PPeerLost(callback: (code: string) => void): Promise<(() => void) | null> {
  const listen = await getListen()
  if (!listen) return null
  const unlisten = await listen<string>('p2p-peer-lost', (e) => callback(e.payload))
  return unlisten
}

export async function onP2PTransferProgress(callback: (data: { transfer_id: string; progress: number; status: string; path?: string }) => void): Promise<(() => void) | null> {
  const listen = await getListen()
  if (!listen) return null
  const unlisten = await listen<{ transfer_id: string; progress: number; status: string; path?: string }>('p2p-transfer-progress', (e) => callback(e.payload))
  return unlisten
}

export async function onP2PIncomingFile(callback: (data: { transfer_id: string; filename: string; size: number; peer_code: string; peer_alias: string }) => void): Promise<(() => void) | null> {
  const listen = await getListen()
  if (!listen) return null
  const unlisten = await listen<{ transfer_id: string; filename: string; size: number; peer_code: string; peer_alias: string }>('p2p-incoming-file', (e) => callback(e.payload))
  return unlisten
}

export async function onP2PAccessLog(callback: (data: P2PAccessLogEntry) => void): Promise<(() => void) | null> {
  const listen = await getListen()
  if (!listen) return null
  const unlisten = await listen<P2PAccessLogEntry>('p2p-access-log', (e) => callback(e.payload))
  return unlisten
}
