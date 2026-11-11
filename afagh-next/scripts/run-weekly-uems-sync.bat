@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem UTF-8 console so the Persian text in the Node log is readable.
chcp 65001 >nul 2>&1
rem ===================================================================
rem  Afagh weekly UEMS -> Postgres sync : manual launcher
rem  No Task Scheduler is registered by this file. Run it by hand first.
rem  Secrets are read from a local config file, never stored in the repo.
rem  Usage: run-weekly-uems-sync.bat [path\to\uems-sync.env]
rem ===================================================================

set "ROOT=%~dp0.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
set "SCRIPT=%ROOT%\scripts\weekly-uems-sync.mjs"

set "CONFIG=%~1"
if not defined CONFIG set "CONFIG=%USERPROFILE%\.afagh\uems-sync.env"

if not exist "%SCRIPT%" (
  echo [ERROR] orchestrator not found: %SCRIPT%
  exit /b 2
)
if not exist "%CONFIG%" (
  echo [ERROR] config not found: %CONFIG%
  echo Copy scripts\weekly-uems-sync.env.example to that path and fill it in.
  exit /b 2
)

for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%CONFIG%") do (
  if not "%%A"=="" set "%%A=%%B"
)

if not defined UEMS_SERVER echo [ERROR] UEMS_SERVER missing in config & exit /b 2
if not defined UEMS_DB echo [ERROR] UEMS_DB missing in config & exit /b 2
if not defined TARGET_HOST echo [ERROR] TARGET_HOST missing in config & exit /b 2
if not defined AFAGH_TARGET_PASSWORD echo [ERROR] AFAGH_TARGET_PASSWORD missing in config & exit /b 2
if not defined TARGET_PORT set "TARGET_PORT=5432"
if not defined TARGET_DB set "TARGET_DB=afagh_db"
if not defined TARGET_USER set "TARGET_USER=afagh"
if not defined UNI set "UNI=1"
if not defined FIN_DIR set "FIN_DIR=D:\backups\fin_export"

set "PLANFLAG="
if /i "%UEMS_SYNC_PLAN%"=="1" set "PLANFLAG=--plan"
set "SKIPFLAG="
if /i "%UEMS_SYNC_SKIP_EXTRACT%"=="1" set "SKIPFLAG=--skip-extract"
set "WDFLAG="
if defined UEMS_SYNC_WORK_DIR set "WDFLAG=--work-dir "%UEMS_SYNC_WORK_DIR%""

set "LOGDIR=%TEMP%\afagh-uems-sync"
if not exist "%LOGDIR%" mkdir "%LOGDIR%" >nul 2>&1
set "STAMP=manual"
for /f "delims=" %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%T"
set "LOG=%LOGDIR%\uems-sync-%STAMP%.log"

echo [INFO] config : %CONFIG%
echo [INFO] log    : %LOG%
echo [INFO] mode   : plan=%PLANFLAG% skip-extract=%SKIPFLAG%
echo [INFO] target : %TARGET_HOST%:%TARGET_PORT%/%TARGET_DB%
echo [INFO] source : %UEMS_SERVER%/%UEMS_DB%
echo.

if /i "%UEMS_TRUSTED%"=="1" goto RUN_TRUSTED

if not defined UEMS_USER echo [ERROR] UEMS_USER missing in config & exit /b 2
if not defined UEMS_PASS echo [ERROR] UEMS_PASS missing in config & exit /b 2
node "%SCRIPT%" --yes %PLANFLAG% %SKIPFLAG% %WDFLAG% --uems-server "%UEMS_SERVER%" --uems-user "%UEMS_USER%" --uems-pass "%UEMS_PASS%" --uems-db "%UEMS_DB%" --target-host "%TARGET_HOST%" --target-port "%TARGET_PORT%" --target-db "%TARGET_DB%" --target-user "%TARGET_USER%" --uni "%UNI%" --fin-dir "%FIN_DIR%" > "%LOG%" 2>&1
goto FINISHED

:RUN_TRUSTED
node "%SCRIPT%" --yes %PLANFLAG% %SKIPFLAG% %WDFLAG% --uems-trusted --uems-server "%UEMS_SERVER%" --uems-db "%UEMS_DB%" --target-host "%TARGET_HOST%" --target-port "%TARGET_PORT%" --target-db "%TARGET_DB%" --target-user "%TARGET_USER%" --uni "%UNI%" --fin-dir "%FIN_DIR%" > "%LOG%" 2>&1

:FINISHED
set "EC=%ERRORLEVEL%"
type "%LOG%"
echo.
if "%EC%"=="0" (
  echo [OK] weekly sync finished successfully.
) else (
  echo [FAIL] weekly sync failed. exit code %EC%. Full log: %LOG%
)
exit /b %EC%
