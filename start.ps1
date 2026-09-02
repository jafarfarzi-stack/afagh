#Requires -Version 5.1
<#
  راه‌اندازی سامانه جامع آفاق روی ویندوز — پس از install-docker.ps1
      .\start.ps1            سرویس‌های Docker و سرور Next.js را بالا می‌آورد
      .\start.ps1 -Stop      سرور و کانتینرها را متوقف می‌کند
#>
param([switch]$Stop)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$Root    = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Next    = Join-Path $Root 'afagh-next'
$Compose = Join-Path $Next 'docker-compose.yml'
$Project = 'afagh-dev'

function Ok($t)   { Write-Host "  [OK]  $t" -ForegroundColor Green }
function Warn($t) { Write-Host "  [!]   $t" -ForegroundColor Yellow }
function Step($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Port-Up($p) {
  try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $p); $c.Close(); return $true }
  catch { return $false }
}

if ($Stop) {
  Step "توقف سرور و سرویس‌ها"
  Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq '' } | Stop-Process -Force -ErrorAction SilentlyContinue
  & docker compose -p $Project -f $Compose stop
  Ok "متوقف شد."
  exit 0
}

# ۱) سرویس‌های Docker (PostgreSQL / Redis / MinIO)
Step "سرویس‌های Docker"
& docker compose -p $Project -f $Compose up -d
Start-Sleep -Seconds 3
if (Port-Up 5432) { Ok "PostgreSQL :5432" } else { Warn "PostgreSQL بالا نیست — خروجی docker compose را ببینید" }
if (Port-Up 6379) { Ok "Redis :6379" } else { Warn "Redis بالا نیست" }

# ۲) سرور Next.js روی ۸۰۸۰
Step "سرور Next.js (پورت ۸۰۰)"
if (Port-Up 8080) {
  Ok "سرور از قبل روی :8080 در حال اجراست"
} else {
  if (-not (Test-Path (Join-Path $Next '.next'))) {
    Warn "بیلد (.next) پیدا نشد — اول install-docker.ps1 یا npm run build را اجرا کنید"
    exit 1
  }
  Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$Next'; npm start" | Out-Null
  $up = $false
  for ($i = 0; $i -lt 40; $i++) { Start-Sleep -Seconds 1; if (Port-Up 8080) { $up = $true; break } }
  if ($up) { Ok "سرور اجرا شد" } else { Warn "سرور بالا نیامد — پنجرهٔ جدید را بررسی کنید" }
}

Write-Host ""
Write-Host "  سامانه : http://localhost:8080" -ForegroundColor White
Write-Host "  ورود   : 0000000001 (مدیر) / 0011111111 (استاد) / 31412001 (دانشجو) — رمز: 123456" -ForegroundColor Gray
Write-Host "  MinIO  : http://localhost:9001 (afagh / afagh-secret)" -ForegroundColor Gray
