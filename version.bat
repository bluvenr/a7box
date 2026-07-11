@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

:: A7Box 版本管理脚本
:: 用法: version.bat [patch|minor|major|x.y.z]
::
:: 示例:
::   version.bat           显示当前版本信息 + 同步状态
::   version.bat patch     自增补丁号  0.1.1 → 0.1.2
::   version.bat minor     自增次版本号 0.1.1 → 0.2.0
::   version.bat major     自增主版本号 0.1.1 → 1.0.0
::   version.bat 2.0.0     直接指定版本号
::   version.bat sync      仅同步（将当前 package.json 版本同步到 Cargo.toml）

set "MODE=%~1"
set "PROJECT_ROOT=%~dp0"

cd /d "%PROJECT_ROOT%"

:: sync 子命令：强制触发同步（先改 Cargo.toml 版本为旧值再同步）
if "%MODE%"=="sync" (
    echo.
    echo   [INFO] Force syncing version across all files...
    echo.
    node scripts/sync-version.mjs
    goto :eof
)

:: 正常调用 sync-version.mjs
node scripts/sync-version.mjs %MODE%

if %errorlevel% neq 0 (
    echo.
    echo   [ERROR] Version operation failed.
    exit /b 1
)

:: 如果有参数（执行了版本变更），提示 git 操作
if not "%MODE%"=="" (
    echo   Run: version.bat commit [message]  to auto-commit
    echo.
)

:: commit 子命令：自动提交版本变更
if "%MODE%"=="commit" (
    set "MSG=%~2"
    if "!MSG!"=="" set "MSG=chore: bump version"
    git add -A
    git commit -m "!MSG!"
    echo.
    echo   [OK] Version bump committed.
    echo.
)
