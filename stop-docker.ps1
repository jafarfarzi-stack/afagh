#Requires -Version 5.1
<#
  توقف سرویس‌های Docker سامانه آفاق
      .\stop-docker.ps1               کانتینرها را نگه می‌دارد و فقط خاموش می‌کند (داده حفظ می‌شود)
      .\stop-docker.ps1 -RemoveData   کانتینرها و کل دادهٔ دیتابیس/MinIO را پاک می‌کند
#>
param([switch]$RemoveData)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$Root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Compose = Join-Path $Root 'afagh-next\docker-compose.yml'

if ($RemoveData) {
  Write-Host "حذف کانتینرها و volumeها (کل داده پاک می‌شود)…" -ForegroundColor Yellow
  & docker compose -p afagh -f $Compose down -v
} else {
  Write-Host "خاموش کردن سرویس‌ها (داده حفظ می‌شود)…" -ForegroundColor Cyan
  & docker compose -p afagh -f $Compose stop
}
Write-Host "[OK] انجام شد." -ForegroundColor Green
