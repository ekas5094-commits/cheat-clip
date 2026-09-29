@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
echo [Cheat Clip] Starting application...
npm run dev
if errorlevel 1 (
    echo.
    echo [Cheat Clip] Encountered an issue starting the application.
    pause
)
