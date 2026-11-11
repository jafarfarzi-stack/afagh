@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem UTF-8 console so the Persian text in the Node log is readable.
chcp 65001 >nul 2>&1
rem ===================================================================
rem  Afagh weekly UEMS -> Postgres sync launcher
rem  Config : %USERPROFILE%\.afagh\uems-sync.env  (never commit secrets)
rem  Usage  : run-weekly-uems-sync.bat [path\to\uems-sync.env]
rem
rem  Optional config switches:
rem    UEMS_SYNC_SSH_TUNNEL=1         open/close an SSH tunnel to server PG
rem    UEMS_SYNC_FETCH_DB_PASSWORD=1  read POSTGRES_PASSWORD from the server
rem                                   over SSH; the temp file is removed at
rem                                   once, no secret is stored permanently
rem    UEMS_SYNC_FIN_REFRESH=1        also write the freshly extracted finance
rem                                   TSVs into FIN_DIR (old files are backed
rem                                   up to FIN_DIR.bak-<stamp> first)
rem    UEMS_SYNC_FIN_STATIC=1         ignore fresh finance extraction and keep
rem                                   reading the static FIN_DIR TSVs
rem    UEMS_SYNC_FIN_UPSERT=1        also propagate source-side amount/text
rem                                   corrections to student_ledger. A JSONL
rem                                   backup of affected rows is written to the
rem                                   work-dir; restore with
rem                                   migrate-legacy-finance.mjs --restore
rem ===================================================================

set "ROOT=%~dp0.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
set "SCRIPT=%ROOT%\scripts\weekly-uems-sync.mjs"

set "CONFIG=%~1"
if not defined CONFIG set "CONFIG=%USERPROFILE%\.afagh\uems-sync.env"

if not exist "%SCRIPT%" echo [ERROR] orchestrator not found: %SCRIPT% & exit /b 2
if not exist "%CONFIG%" echo [ERROR] config not found: %CONFIG% & exit /b 2

for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%CONFIG%") do (
  if not "%%A"=="" set "%%A=%%B"
)

if not defined UEMS_SERVER echo [ERROR] UEMS_SERVER missing in config & exit /b 2
if not defined UEMS_DB echo [ERROR] UEMS_DB missing in config & exit /b 2
if not defined TARGET_HOST set "TARGET_HOST=127.0.0.1"
if not defined TARGET_PORT set "TARGET_PORT=15432"
if not defined TARGET_DB set "TARGET_DB=afagh_db"
if not defined TARGET_USER set "TARGET_USER=afagh"
if not defined UNI set "UNI=1"
if not defined FIN_DIR set "FIN_DIR=D:\backups\fin_export"
if not defined SSH_KEY set "SSH_KEY=%USERPROFILE%\.ssh\afagh_ed25519"
if not defined SSH_HOST set "SSH_HOST=root@100.70.187.120"
if not defined PG_INTERNAL_HOST set "PG_INTERNAL_HOST=172.20.0.5"
if not defined TUNNEL_LOCAL_PORT set "TUNNEL_LOCAL_PORT=%TARGET_PORT%"

set "PLANFLAG="
if /i "%UEMS_SYNC_PLAN%"=="1" set "PLANFLAG=--plan"
set "SKIPFLAG="
if /i "%UEMS_SYNC_SKIP_EXTRACT%"=="1" set "SKIPFLAG=--skip-extract"
set "WDFLAG="
if defined UEMS_SYNC_WORK_DIR set "WDFLAG=--work-dir "%UEMS_SYNC_WORK_DIR%""
rem FIN_DIR is now the offline/mirror folder: the orchestrator extracts fresh
rem finance TSVs into <work-dir>\fin_export unless UEMS_SYNC_FIN_STATIC=1.
set FINFLAG=--fin-dir "%FIN_DIR%"
if /i "%UEMS_SYNC_FIN_REFRESH%"=="1" set FINFLAG=%FINFLAG% --fin-refresh
if /i "%UEMS_SYNC_FIN_STATIC%"=="1" set FINFLAG=%FINFLAG% --fin-static
if /i "%UEMS_SYNC_FIN_UPSERT%"=="1" set FINFLAG=%FINFLAG% --fin-upsert

set "LOGDIR=%TEMP%\afagh-uems-sync"
if not exist "%LOGDIR%" mkdir "%LOGDIR%" >nul 2>&1
set "STAMP=run"
for /f "delims=" %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%T"
set "LOG=%LOGDIR%\uems-sync-%STAMP%.log"
set "TUNNEL_PID="
set "EC=0"

if /i "%UEMS_SYNC_SSH_TUNNEL%"=="1" call :OPEN_TUNNEL
if errorlevel 1 goto FAIL_TUNNEL
if /i "%UEMS_SYNC_FETCH_DB_PASSWORD%"=="1" call :FETCH_PASSWORD
if errorlevel 1 goto FAIL_PASSWORD
if not defined AFAGH_TARGET_PASSWORD if /i not "%UEMS_SYNC_PLAN%"=="1" goto FAIL_PASSWORD_MISSING

echo [INFO] config : %CONFIG%
echo [INFO] log    : %LOG%
echo [INFO] mode   : plan=%PLANFLAG% skip-extract=%SKIPFLAG%
echo [INFO] target : %TARGET_HOST%:%TARGET_PORT%/%TARGET_DB%
echo [INFO] source : %UEMS_SERVER%/%UEMS_DB%
if defined TUNNEL_PID echo [INFO] tunnel : pid %TUNNEL_PID%
echo.

if /i "%UEMS_TRUSTED%"=="1" goto RUN_TRUSTED
if not defined UEMS_USER echo [ERROR] UEMS_USER missing in config & goto FAIL_USER
if not defined UEMS_PASS echo [ERROR] UEMS_PASS missing in config & goto FAIL_USER
node "%SCRIPT%" --yes %PLANFLAG% %SKIPFLAG% %WDFLAG% --uems-server "%UEMS_SERVER%" --uems-user "%UEMS_USER%" --uems-pass "%UEMS_PASS%" --uems-db "%UEMS_DB%" --target-host "%TARGET_HOST%" --target-port "%TARGET_PORT%" --target-db "%TARGET_DB%" --target-user "%TARGET_USER%" --uni "%UNI%" %FINFLAG% > "%LOG%" 2>&1
goto RAN

:RUN_TRUSTED
node "%SCRIPT%" --yes %PLANFLAG% %SKIPFLAG% %WDFLAG% --uems-trusted --uems-server "%UEMS_SERVER%" --uems-db "%UEMS_DB%" --target-host "%TARGET_HOST%" --target-port "%TARGET_PORT%" --target-db "%TARGET_DB%" --target-user "%TARGET_USER%" --uni "%UNI%" %FINFLAG% > "%LOG%" 2>&1

:RAN
set "EC=%ERRORLEVEL%"
goto CLEANUP

:FAIL_TUNNEL
set "EC=2"
goto CLEANUP
:FAIL_PASSWORD
set "EC=2"
goto CLEANUP
:FAIL_PASSWORD_MISSING
echo [ERROR] AFAGH_TARGET_PASSWORD missing and fetch disabled.
set "EC=2"
goto CLEANUP
:FAIL_USER
set "EC=2"
goto CLEANUP

:CLEANUP
if defined TUNNEL_PID taskkill /PID %TUNNEL_PID% /F /T >nul 2>&1
if exist "%LOG%" type "%LOG%"
echo.
if "%EC%"=="0" (
  echo [OK] weekly sync finished successfully.
) else (
  echo [FAIL] weekly sync failed. exit code %EC%. Full log: %LOG%
)
exit /b %EC%

rem -------------------------------------------------------------------
:OPEN_TUNNEL
netstat -ano | findstr /c:"127.0.0.1:%TUNNEL_LOCAL_PORT%" | findstr /c:"LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo [INFO] tunnel port %TUNNEL_LOCAL_PORT% already listening - reusing it.
  exit /b 0
)
if not exist "%SSH_KEY%" echo [ERROR] SSH key not found: %SSH_KEY% & exit /b 1
set "TUNNEL_ARGS=-i %SSH_KEY% -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -N -L %TUNNEL_LOCAL_PORT%:%PG_INTERNAL_HOST%:5432 %SSH_HOST%"
for /f "delims=" %%P in ('powershell -NoProfile -Command "$p=Start-Process ssh -ArgumentList $env:TUNNEL_ARGS -WindowStyle Hidden -PassThru; $p.Id"') do set "TUNNEL_PID=%%P"
if not defined TUNNEL_PID echo [ERROR] could not start SSH tunnel & exit /b 1
echo [INFO] SSH tunnel started, pid %TUNNEL_PID%
exit /b 0

rem -------------------------------------------------------------------
:FETCH_PASSWORD
set "PWTMP=%LOGDIR%\pgpass-%STAMP%.tmp"
del /f /q "%PWTMP%" >nul 2>&1
ssh -i "%SSH_KEY%" -o BatchMode=yes %SSH_HOST% "grep POSTGRES_PASSWORD= /root/afagh/.env" > "%PWTMP%" 2>nul
if errorlevel 1 (
  echo [ERROR] ssh failed while reading POSTGRES_PASSWORD from server.
  del /f /q "%PWTMP%" >nul 2>&1
  exit /b 1
)
rem Skip comment lines: only a line whose first token is exactly POSTGRES_PASSWORD counts.
for /f "usebackq tokens=1,* delims==" %%P in ("%PWTMP%") do (
  if "%%P"=="POSTGRES_PASSWORD" set "AFAGH_TARGET_PASSWORD=%%Q"
)
del /f /q "%PWTMP%" >nul 2>&1
if not defined AFAGH_TARGET_PASSWORD echo [ERROR] could not read POSTGRES_PASSWORD from server & exit /b 1
echo [INFO] target password fetched over SSH - temp file removed.
exit /b 0
