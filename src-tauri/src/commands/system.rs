// A7Box System Stats Commands
// Provides CPU, memory, temperature, disks, uptime and OS information
// via the `sysinfo` crate (already in the dependency tree via tauri-plugin-device-info).

use serde::Serialize;
use sysinfo::{Components, Disks, System};

#[derive(Serialize)]
pub struct CpuStats {
    pub brand: String,
    pub cores: usize,
    /// Overall CPU usage percentage (0–100)
    pub usage: f32,
}

#[derive(Serialize)]
pub struct MemoryStats {
    pub total: u64,
    pub used: u64,
}

#[derive(Serialize)]
pub struct DiskStats {
    pub name: String,
    pub mount_point: String,
    pub total: u64,
    pub available: u64,
    /// "SSD" | "HDD" | "Unknown"
    pub kind: String,
}

#[derive(Serialize)]
pub struct OsStats {
    pub name: String,
    pub version: String,
    pub kernel: String,
    pub arch: String,
    pub hostname: String,
    /// Seconds since system boot
    pub uptime: u64,
}

#[derive(Serialize)]
pub struct SystemStats {
    pub cpu: CpuStats,
    pub memory: MemoryStats,
    /// Highest CPU temperature in °C, null if sensors unavailable
    pub temperature: Option<f32>,
    pub disks: Vec<DiskStats>,
    pub os: OsStats,
    /// Number of running processes
    pub processes: usize,
}

fn disk_kind_label(kind: sysinfo::DiskKind) -> &'static str {
    match kind {
        sysinfo::DiskKind::SSD => "SSD",
        sysinfo::DiskKind::HDD => "HDD",
        _ => "Unknown",
    }
}

fn collect_stats() -> SystemStats {
    // First refresh establishes the CPU usage baseline
    let mut sys = System::new_all();
    // Short pause so the second sample yields a meaningful usage delta
    std::thread::sleep(std::time::Duration::from_millis(200));
    sys.refresh_cpu_usage();

    let cpus = sys.cpus();
    let usage = if cpus.is_empty() {
        0.0
    } else {
        cpus.iter().map(|c| c.cpu_usage()).sum::<f32>() / cpus.len() as f32
    };
    let brand = cpus.first().map(|c| c.brand().trim().to_string()).unwrap_or_default();

    // Temperature: pick the highest reading across all sensors
    let components = Components::new_with_refreshed_list();
    let temperature = components
        .iter()
        .filter_map(|c| c.temperature())
        .filter(|t| *t > 0.0)
        .max_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    // All mounted disks
    let disk_list = Disks::new_with_refreshed_list();
    let disks: Vec<DiskStats> = disk_list
        .iter()
        .filter(|d| d.total_space() > 0)
        .map(|d| DiskStats {
            name: d.name().to_string_lossy().to_string(),
            mount_point: d.mount_point().to_string_lossy().to_string(),
            total: d.total_space(),
            available: d.available_space(),
            kind: disk_kind_label(d.kind()).to_string(),
        })
        .collect();

    SystemStats {
        cpu: CpuStats { brand, cores: cpus.len(), usage: (usage * 10.0).round() / 10.0 },
        memory: MemoryStats { total: sys.total_memory(), used: sys.used_memory() },
        temperature: temperature.map(|t| (t * 10.0).round() / 10.0),
        disks,
        os: OsStats {
            name: System::name().unwrap_or_default(),
            version: System::os_version().unwrap_or_default(),
            kernel: System::kernel_version().unwrap_or_default(),
            arch: System::cpu_arch(),
            hostname: System::host_name().unwrap_or_default(),
            uptime: System::uptime(),
        },
        processes: sys.processes().len(),
    }
}

/// Returns comprehensive system statistics (CPU, memory, temperature, disks, OS, uptime).
/// Runs in a blocking thread pool to avoid stalling the main thread (WMI queries can be slow).
#[tauri::command]
pub async fn get_system_stats() -> Result<SystemStats, String> {
    tokio::task::spawn_blocking(collect_stats)
        .await
        .map_err(|e| e.to_string())
}
