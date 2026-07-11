@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

:: A7Box 快速启动脚本
:: 用法: start.bat [dev^|build^|kill]
::
:: 示例:
::   start.bat           启动完整桌面开发模式
::   start.bat dev       仅启动前端（浏览器调试）
::   start.bat build     生产构建
::   start.bat kill      杀掉占用端口的 node 进程

set "MODE=%~1"
if "%MODE%"=="" set "MODE=dev"

:: Validate mode
if not "%MODE%"=="dev" if not "%MODE%"=="build" if not "%MODE%"=="kill" (
    echo.
    echo   [ERROR] Invalid mode: %MODE%
    echo   Usage: start.bat [dev^|build^|kill]
    exit /b 1
)

set "PROJECT_ROOT=%~dp0"

echo.
echo   A7Box - Desktop Tactical Efficiency Weapon
echo   ============================================
echo.

if "%MODE%"=="dev" goto :dev
if "%MODE%"=="build" goto :build
if "%MODE%"=="kill" goto :kill

:dev
echo   [INFO] Starting full desktop mode (Tauri + Vite)...
echo   [INFO] This will compile Rust backend (~30s first time)
echo.

:: Kill stale node/a7box processes
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /I "node.exe" >nul
if %errorlevel%==0 (
    echo   [WARN] Killing stale node processes...
    taskkill /F /IM node.exe >nul 2>&1
    timeout /t 1 /nobreak >nul
)
tasklist /FI "IMAGENAME eq a7box.exe" 2>nul | find /I "a7box.exe" >nul
if %errorlevel%==0 (
    echo   [WARN] Killing stale a7box processes...
    taskkill /F /IM a7box.exe >nul 2>&1
    timeout /t 1 /nobreak >nul
)

cd /d "%PROJECT_ROOT%"
call npx tauri dev
goto :eof

:build
echo   [INFO] Building production bundle...
echo.

cd /d "%PROJECT_ROOT%"
call npx tauri build

if %errorlevel%==0 (
    echo.
    echo   [OK] Build complete! Installer in: src-tauri\target\release\bundle
)
goto :eof

:kill
echo   [INFO] Killing node processes...
taskkill /F /IM node.exe >nul 2>&1
echo   [OK] Port 1420 freed.
goto :eof
