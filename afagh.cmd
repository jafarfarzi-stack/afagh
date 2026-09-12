@echo off
REM ================================================================
REM  Afagh launcher - just double-click this file
REM ================================================================
chcp 65001 >nul 2>&1
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0afagh.ps1" %*
if errorlevel 1 (
  echo.
  echo An error occurred. Press any key to close.
  pause >nul
)
