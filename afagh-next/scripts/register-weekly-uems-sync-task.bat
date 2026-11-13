@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem ===================================================================
rem  Register the Afagh UEMS weekly sync as a Windows Scheduled Task.
rem
rem  IMPORTANT: run this file YOURSELF (double click, or from a normal
rem  cmd / PowerShell window). The agent is not allowed to run
rem  schtasks.exe - it is on the host Program Blacklist (Command
rem  Security). This file is a handoff, not a bypass of that policy.
rem
rem  Override defaults with environment variables before running:
rem    TASK_NAME, TASK_DAY, TASK_TIME, TASK_USER, UEMS_TASK_DRYRUN
rem ===================================================================

set "ROOT=%~dp0.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
set "LAUNCHER=%ROOT%\scripts\run-weekly-uems-sync.bat"
set "CONFIG=%USERPROFILE%\.afagh\uems-sync.env"

if not defined TASK_NAME set "TASK_NAME=Afagh UEMS Weekly Sync"
if not defined TASK_DAY set "TASK_DAY=SAT"
if not defined TASK_TIME set "TASK_TIME=02:00"
if not defined TASK_USER set "TASK_USER=%USERDOMAIN%\%USERNAME%"

if not exist "%LAUNCHER%" echo [ERROR] launcher not found: %LAUNCHER% & exit /b 2
if not exist "%CONFIG%" (
  echo [WARN] config not found: %CONFIG%
  echo [WARN] copy weekly-uems-sync.env.example to that path and fill it first.
)

rem schtasks expects escaped quotes around the action path.
set "TR=\"%LAUNCHER%\""

echo [INFO] task name : %TASK_NAME%
echo [INFO] schedule  : weekly on %TASK_DAY% at %TASK_TIME%
echo [INFO] run as    : %TASK_USER%  ^(interactive token /IT^)
echo [INFO] action    : %TR%
echo.

if /i "%UEMS_TASK_DRYRUN%"=="1" (
  echo [DRYRUN] no task was created. Command that would run:
  echo schtasks /Create /TN "%TASK_NAME%" /TR "%TR%" /SC WEEKLY /D %TASK_DAY% /ST %TASK_TIME% /RU "%TASK_USER%" /IT /F
  exit /b 0
)

net session >nul 2>&1
if errorlevel 1 echo [WARN] not elevated - if access is denied, right-click and choose Run as administrator.

schtasks /Create /TN "%TASK_NAME%" /TR "%TR%" /SC WEEKLY /D %TASK_DAY% /ST %TASK_TIME% /RU "%TASK_USER%" /IT /F
if errorlevel 1 (
  echo.
  echo [FAIL] schtasks /Create failed.
  echo [HINT] Either remove schtasks.exe from Security Center - Command Security - Program Blacklist,
  echo [HINT] or run this file from an elevated cmd window, then retry.
  exit /b 1
)

echo.
echo [OK] task registered. Current settings:
schtasks /Query /TN "%TASK_NAME%" /FO LIST /V | findstr /c:"TaskName" /c:"Status" /c:"Next Run Time" /c:"Task To Run" /c:"Run As User" /c:"Schedule Type" /c:"Start Time" /c:"Days"
echo.
echo [INFO] test now : schtasks /Run /TN "%TASK_NAME%"
echo [INFO] remove   : schtasks /Delete /TN "%TASK_NAME%" /F
exit /b 0
