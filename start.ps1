# A7Box 快速启动脚本
# 用法: .\start.ps1 [-Mode dev|build|kill]
#
# 示例:
#   .\start.ps1           # 启动完整桌面开发模式
#   .\start.ps1 -Mode dev # 仅启动前端（浏览器调试）
#   .\start.ps1 -Mode build # 生产构建
#   .\start.ps1 -Mode kill  # 杀掉占用端口的 node 进程

param(
    [ValidateSet("dev", "build", "kill")]
    [string]$Mode = "dev"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

Write-Host ""
Write-Host "  A7Box - Desktop Tactical Efficiency Weapon" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor DarkCyan
Write-Host ""

switch ($Mode) {
    "dev" {
        Write-Host "  [INFO] Starting full desktop mode (Tauri + Vite)..." -ForegroundColor Yellow
        Write-Host "  [INFO] This will compile Rust backend (~30s first time)" -ForegroundColor DarkGray
        Write-Host ""

        # Kill any stale node processes first
        $nodeProcs = Get-Process -Name "node" -ErrorAction SilentlyContinue
        if ($nodeProcs) {
            Write-Host "  [WARN] Killing stale node processes..." -ForegroundColor DarkYellow
            $nodeProcs | Stop-Process -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
        }

        Set-Location $ProjectRoot
        npx tauri dev
    }

    "build" {
        Write-Host "  [INFO] Building production bundle..." -ForegroundColor Yellow
        Write-Host ""

        Set-Location $ProjectRoot
        npx tauri build

        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "  [OK] Build complete! Installer in: src-tauri\target\release\bundle" -ForegroundColor Green
        }
    }

    "kill" {
        Write-Host "  [INFO] Killing node processes..." -ForegroundColor Yellow
        Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Write-Host "  [OK] Port 1420 freed." -ForegroundColor Green
    }
}
