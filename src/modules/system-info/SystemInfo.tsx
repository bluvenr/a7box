/**
 * A7Box System Info Module
 * Dashboard for performance, network, storage, display, battery and device diagnostics
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  MonitorSmartphone, Wifi, HardDrive, Monitor, BatteryMedium, Cpu, RefreshCw, Activity, Network,
} from 'lucide-react'
import {
  getDeviceInfo, getBatteryInfo, getNetworkInfo, getStorageInfo, getDisplayInfo,
  type DeviceInfoResponse, type BatteryInfo, type NetworkInfo, type StorageInfo, type DisplayInfo,
} from 'tauri-plugin-device-info-api'
import { getSystemStats, getNetworkDetails, getMonitors, type SystemStats, type NetworkDetails, type MonitorInfo } from '../../shared/utils/tauriBridge'
import { isTauri } from '../../shared/utils'
import { InfoCard, type InfoRow } from './components/InfoCard'

/** Format bytes to human-readable size */
function formatBytes(bytes?: number | null): string {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let val = bytes
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++ }
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/** Format uptime seconds with localized units, e.g. "3d 4h 25m" / "3天 4小时 25分钟" */
function formatUptime(seconds: number | undefined, units: { d: string; h: string; m: string }): string {
  if (!seconds || seconds <= 0) return ''
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (d > 0) parts.push(`${d}${units.d}`)
  if (h > 0) parts.push(`${h}${units.h}`)
  parts.push(`${m}${units.m}`)
  return parts.join(' ')
}

/** Progress bar color by percentage thresholds */
function usageColor(percent: number): string {
  return percent > 90 ? 'bg-error' : percent > 70 ? 'bg-warning' : 'bg-success'
}

/** Detect GPU renderer via WebGL (works in webview, no Rust needed) */
function detectGpu(): string {
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (!gl) return ''
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''
  } catch { return '' }
}

interface AllInfo {
  device: DeviceInfoResponse | null
  battery: BatteryInfo | null
  network: NetworkInfo | null
  storage: StorageInfo | null
  display: DisplayInfo | null
  stats: SystemStats | null
  netDetails: NetworkDetails | null
  monitors: MonitorInfo[]
}

const EMPTY: AllInfo = { device: null, battery: null, network: null, storage: null, display: null, stats: null, netDetails: null, monitors: [] }

export default function SystemInfo() {
  const { t } = useTranslation()
  const [info, setInfo] = useState<AllInfo>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  /** Sequence guard: discard stale responses from rapid refreshes */
  const fetchSeq = useRef(0)

  const fetchAll = useCallback(async () => {
    if (!isTauri()) { setLoading(false); return }
    const seq = ++fetchSeq.current
    const results = await Promise.allSettled([
      getDeviceInfo(), getBatteryInfo(), getNetworkInfo(), getStorageInfo(), getDisplayInfo(), getSystemStats(), getNetworkDetails(), getMonitors(),
    ])
    // A newer fetch was issued while we were waiting — discard this result
    if (seq !== fetchSeq.current) return
    const pick = <T,>(r: PromiseSettledResult<T>): T | null => r.status === 'fulfilled' ? r.value : null
    setInfo({
      device: pick(results[0]),
      battery: pick(results[1]),
      network: pick(results[2]),
      storage: pick(results[3]),
      display: pick(results[4]),
      stats: pick(results[5]),
      netDetails: pick(results[6]),
      monitors: pick(results[7]) ?? [],
    })
    setLastUpdated(new Date())
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Auto-refresh when window regains focus (tray-first: window is hidden/shown, not remounted)
  useEffect(() => {
    const onFocus = () => { fetchAll() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [fetchAll])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchAll()
    setRefreshing(false)
  }

  const { stats } = info

  // GPU renderer is constant for the session — compute once (WebGL context creation is expensive)
  const gpu = useMemo(() => detectGpu(), [])

  // ── Performance card (CPU / Memory / Temperature) ──
  const memPercent = stats?.memory.total ? Math.round((stats.memory.used / stats.memory.total) * 100) : 0
  const perfRows: InfoRow[] = [
    { label: t('modules.systemInfo.ui.cpuModel', { defaultValue: 'CPU' }), value: stats?.cpu.brand ?? '' },
    { label: t('modules.systemInfo.ui.cpuCores', { defaultValue: 'Cores' }), value: stats?.cpu.cores ? String(stats.cpu.cores) : '' },
    {
      label: t('modules.systemInfo.ui.cpuUsage', { defaultValue: 'CPU Usage' }),
      value: stats ? `${stats.cpu.usage}%` : '',
      progress: stats ? stats.cpu.usage : undefined,
      progressColor: usageColor(stats?.cpu.usage ?? 0),
    },
    {
      label: t('modules.systemInfo.ui.memory', { defaultValue: 'Memory' }),
      value: stats?.memory.total ? `${formatBytes(stats.memory.used)} / ${formatBytes(stats.memory.total)} (${memPercent}%)` : '',
      progress: stats ? memPercent : undefined,
      progressColor: usageColor(memPercent),
    },
    {
      label: t('modules.systemInfo.ui.temperature', { defaultValue: 'Temperature' }),
      value: stats?.temperature != null ? `${stats.temperature} °C` : '',
    },
    {
      label: t('modules.systemInfo.ui.processes', { defaultValue: 'Processes' }),
      value: stats?.processes ? String(stats.processes) : '',
    },
  ]

  // ── Network card: connection type + WiFi details ──
  const ifTypeLabels: Record<string, string> = {
    wifi: t('modules.systemInfo.ui.typeWifi', { defaultValue: 'WiFi' }),
    ethernet: t('modules.systemInfo.ui.typeEthernet', { defaultValue: 'Ethernet' }),
    loopback: t('modules.systemInfo.ui.typeLoopback', { defaultValue: 'Loopback' }),
    tunnel: t('modules.systemInfo.ui.typeTunnel', { defaultValue: 'Tunnel' }),
    ppp: 'PPP',
  }
  const defaultIface = info.netDetails?.interfaces.find((i) => i.is_default)
  const connType = defaultIface ? (ifTypeLabels[defaultIface.if_type] ?? defaultIface.if_type) : (info.network?.networkType ?? '')
  const wifi = info.netDetails?.wifi
  // Only render WiFi detail rows when actually on WiFi — avoids four "N/A" rows on Ethernet.
  // `wifi?.ssid` also covers the case where WiFi is connected but isn't the default route.
  const isWifi = defaultIface?.if_type === 'wifi' || Boolean(wifi?.ssid)
  const networkRows: InfoRow[] = [
    { label: t('modules.systemInfo.ui.ipAddress', { defaultValue: 'IP Address' }), value: info.network?.ipAddress ?? '' },
    { label: t('modules.systemInfo.ui.networkType', { defaultValue: 'Connection Type' }), value: connType },
    ...(isWifi
      ? [
          { label: t('modules.systemInfo.ui.wifiSsid', { defaultValue: 'WiFi Name (SSID)' }), value: wifi?.ssid ?? '' },
          {
            label: t('modules.systemInfo.ui.wifiSignal', { defaultValue: 'Signal Strength' }),
            value: wifi?.signal_percent != null ? `${wifi.signal_percent}%` : '',
            progress: wifi?.signal_percent ?? undefined,
            progressColor: (wifi?.signal_percent ?? 100) <= 30 ? 'bg-error' : (wifi?.signal_percent ?? 100) <= 60 ? 'bg-warning' : 'bg-success',
          },
          { label: t('modules.systemInfo.ui.wifiChannel', { defaultValue: 'Channel' }), value: wifi?.channel ?? '' },
          { label: t('modules.systemInfo.ui.wifiRadio', { defaultValue: 'Radio Type' }), value: wifi?.radio_type ?? '' },
        ]
      : []),
    { label: t('modules.systemInfo.ui.macAddress', { defaultValue: 'MAC Address' }), value: info.network?.macAddress ?? '' },
  ]

  // ── Storage card: multi-disk from Rust, fallback to plugin single-disk ──
  let storageRows: InfoRow[]
  if (stats && stats.disks.length > 0) {
    storageRows = stats.disks.map((disk) => {
      const used = disk.total - disk.available
      const percent = Math.round((used / disk.total) * 100)
      return {
        label: `${disk.mount_point} (${disk.kind})`,
        value: `${formatBytes(used)} / ${formatBytes(disk.total)} (${percent}%)`,
        progress: percent,
        progressColor: usageColor(percent),
      }
    })
  } else if (info.storage?.totalSpace) {
    const used = info.storage.totalSpace - (info.storage.freeSpace ?? 0)
    const percent = Math.round((used / info.storage.totalSpace) * 100)
    storageRows = [
      { label: t('modules.systemInfo.ui.totalSpace', { defaultValue: 'Total Space' }), value: formatBytes(info.storage.totalSpace) },
      { label: t('modules.systemInfo.ui.freeSpace', { defaultValue: 'Free Space' }), value: formatBytes(info.storage.freeSpace) },
      {
        label: t('modules.systemInfo.ui.usedSpace', { defaultValue: 'Used' }),
        value: `${formatBytes(used)} (${percent}%)`,
        progress: percent,
        progressColor: usageColor(percent),
      },
      { label: t('modules.systemInfo.ui.storageType', { defaultValue: 'Storage Type' }), value: info.storage.storageType ?? '' },
    ]
  } else {
    storageRows = []
  }

  // ── Display card: multi-monitor aware ──
  const monitors = info.monitors
  const displayRows: InfoRow[] = []
  if (monitors.length > 1) {
    // Multiple monitors: one row per display (resolution @ scale, position)
    monitors.forEach((m, idx) => {
      displayRows.push({
        label: t('modules.systemInfo.ui.displayN', { defaultValue: 'Display {{n}}', n: idx + 1 }),
        value: `${m.width} × ${m.height} @ ${m.scale}x (${m.x}, ${m.y})`,
      })
    })
    displayRows.push({ label: t('modules.systemInfo.ui.refreshRate', { defaultValue: 'Refresh Rate' }), value: info.display?.refreshRate ? `${info.display.refreshRate} Hz` : '' })
  } else {
    displayRows.push(
      {
        label: t('modules.systemInfo.ui.resolution', { defaultValue: 'Resolution' }),
        value: info.display?.width && info.display?.height ? `${info.display.width} × ${info.display.height}` : '',
      },
      { label: t('modules.systemInfo.ui.scaleFactor', { defaultValue: 'Scale Factor' }), value: info.display?.scaleFactor ? `${info.display.scaleFactor}x` : '' },
      { label: t('modules.systemInfo.ui.refreshRate', { defaultValue: 'Refresh Rate' }), value: info.display?.refreshRate ? `${info.display.refreshRate} Hz` : '' },
    )
  }
  displayRows.push({ label: t('modules.systemInfo.ui.gpu', { defaultValue: 'GPU' }), value: gpu })

  // ── Battery card: graceful degradation for desktops without battery ──
  const hasBattery = info.battery && (info.battery.level != null || info.battery.isCharging != null || info.battery.health != null)
  // Hide the whole battery card on desktops (no battery) — a lone "no battery" row is noise.
  // Keep the skeleton during initial load so the grid layout stays stable.
  const showBattery = loading || Boolean(hasBattery)
  const batteryLevel = info.battery?.level
  const batteryRows: InfoRow[] = hasBattery
    ? [
        {
          label: t('modules.systemInfo.ui.batteryLevel', { defaultValue: 'Battery Level' }),
          value: batteryLevel != null ? `${batteryLevel}%` : '',
          progress: batteryLevel ?? undefined,
          progressColor: (batteryLevel ?? 100) <= 20 ? 'bg-error' : (batteryLevel ?? 100) <= 50 ? 'bg-warning' : 'bg-success',
        },
        {
          label: t('modules.systemInfo.ui.chargingStatus', { defaultValue: 'Charging Status' }),
          value: info.battery?.isCharging == null
            ? ''
            : info.battery.isCharging
              ? t('modules.systemInfo.ui.charging', { defaultValue: 'Charging' })
              : t('modules.systemInfo.ui.notCharging', { defaultValue: 'Not Charging' }),
        },
        { label: t('modules.systemInfo.ui.batteryHealth', { defaultValue: 'Battery Health' }), value: info.battery?.health ?? '' },
      ]
    : [{ label: t('modules.systemInfo.ui.noBattery', { defaultValue: 'Status' }), value: t('modules.systemInfo.ui.noBatteryDesc', { defaultValue: 'No battery detected' }) }]

  // ── System card: OS + hardware + uptime ──
  const uptimeUnits = {
    d: t('modules.systemInfo.ui.uptimeDay', { defaultValue: 'd' }),
    h: t('modules.systemInfo.ui.uptimeHour', { defaultValue: 'h' }),
    m: t('modules.systemInfo.ui.uptimeMinute', { defaultValue: 'm' }),
  }
  const systemRows: InfoRow[] = [
    { label: t('modules.systemInfo.ui.osName', { defaultValue: 'OS' }), value: stats?.os.name ? (stats.os.version ? `${stats.os.name} ${stats.os.version}` : stats.os.name) : '' },
    { label: t('modules.systemInfo.ui.arch', { defaultValue: 'Architecture' }), value: stats?.os.arch ?? '' },
    { label: t('modules.systemInfo.ui.hostname', { defaultValue: 'Hostname' }), value: stats?.os.hostname ?? '' },
    { label: t('modules.systemInfo.ui.uptime', { defaultValue: 'Uptime' }), value: formatUptime(stats?.os.uptime, uptimeUnits) },
    { label: t('modules.systemInfo.ui.timezone', { defaultValue: 'Timezone' }), value: Intl.DateTimeFormat().resolvedOptions().timeZone },
    { label: t('modules.systemInfo.ui.deviceName', { defaultValue: 'Device Name' }), value: info.device?.device_name ?? '' },
    { label: t('modules.systemInfo.ui.manufacturer', { defaultValue: 'Manufacturer' }), value: info.device?.manufacturer ?? '' },
    { label: t('modules.systemInfo.ui.model', { defaultValue: 'Model' }), value: info.device?.model ?? '' },
  ]

  // ── Network Interfaces card: one row per adapter ──
  const ifaceRows: InfoRow[] = (info.netDetails?.interfaces ?? [])
    .filter((i) => i.if_type !== 'loopback')
    .map((i) => {
      const parts = [ifTypeLabels[i.if_type] ?? i.if_type, i.ipv4[0], i.speed_mbps ? `${i.speed_mbps} Mbps` : null].filter(Boolean)
      return {
        label: `${i.friendly_name || i.name}${i.is_default ? ' ★' : ''}`,
        value: parts.join(' · '),
      }
    })

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MonitorSmartphone size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">
              {t('modules.systemInfo.name')}
            </h1>
            <p className="text-sm text-text-secondary">
              {t('modules.systemInfo.description')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-text-muted">
              {t('modules.systemInfo.ui.lastUpdated', { defaultValue: 'Updated' })}{' '}
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing || !isTauri()}
            className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-1.5 text-sm text-text-secondary transition hover:border-border-base hover:text-text-primary disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {/* Non-Tauri fallback */}
      {!isTauri() && !loading && (
        <div className="mb-5 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
          {t('modules.systemInfo.ui.tauriOnly', { defaultValue: 'Device information is only available in the desktop app.' })}
        </div>
      )}

      {/* Dashboard grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <InfoCard
          title={t('modules.systemInfo.ui.cardPerformance', { defaultValue: 'Performance' })}
          icon={<Activity size={16} />}
          rows={perfRows}
          loading={loading}
        />
        <InfoCard
          title={t('modules.systemInfo.ui.cardNetwork', { defaultValue: 'Network' })}
          icon={<Wifi size={16} />}
          rows={networkRows}
          loading={loading}
        />
        <InfoCard
          title={t('modules.systemInfo.ui.cardInterfaces', { defaultValue: 'Network Adapters' })}
          icon={<Network size={16} />}
          rows={ifaceRows}
          loading={loading}
        />
        <InfoCard
          title={t('modules.systemInfo.ui.cardSystem', { defaultValue: 'System' })}
          icon={<Cpu size={16} />}
          rows={systemRows}
          loading={loading}
        />
        <InfoCard
          title={t('modules.systemInfo.ui.cardStorage', { defaultValue: 'Storage' })}
          icon={<HardDrive size={16} />}
          rows={storageRows}
          loading={loading}
        />
        <InfoCard
          title={t('modules.systemInfo.ui.cardDisplay', { defaultValue: 'Display' })}
          icon={<Monitor size={16} />}
          rows={displayRows}
          loading={loading}
        />
        {showBattery && (
          <InfoCard
            title={t('modules.systemInfo.ui.cardBattery', { defaultValue: 'Battery' })}
            icon={<BatteryMedium size={16} />}
            rows={batteryRows}
            loading={loading}
          />
        )}
      </div>
    </div>
  )
}
