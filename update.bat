@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
echo [Cheat Clip] Starting update...
node scripts/update.js
if errorlevel 1 (
    echo.
    echo [Cheat Clip] Update encountered an error.
    pause
) else (
    echo.
    echo [Cheat Clip] Update finished! Press any key to exit.
    pause >nul
)
