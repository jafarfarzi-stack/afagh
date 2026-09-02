#Requires -Version 5.1
<#
════════════════════════════════════════════════════════════════════════
  راه‌انداز خودکار سامانه جامع آفاق — ویندوز

  ساده‌ترین استفاده:  روی فایل  afagh.cmd  دابل‌کلیک کنید.

  یا در PowerShell:
      powershell -ExecutionPolicy Bypass -File .\afagh.ps1

  سوییچ‌ها:
      -Update     ابتدا git pull و سپس به‌روزرسانی وابستگی‌ها/دیتابیس/بیلد
      -Rebuild    بیلد اجباری دوباره (حتی اگر تغییری نبوده)
      -Dev        اجرا در حالت توسعه (npm run dev) به‌جای پروداکشن
      -Stop       فقط خاموش کردن سرویس‌های داکر و خروج
      -NoBrowser  مرورگر را خودکار باز نکن
      -Fresh      ⚠️ حذف کامل داده‌ها و نصب از صفر

  این اسکریپت خودش:
    ۱) Docker Desktop را در صورت خاموش بودن اجرا و منتظر آماده شدنش می‌ماند
    ۲) مشکل پورت رزروشدهٔ ویندوز برای PostgreSQL را تشخیص و اصلاح می‌کند
    ۳) کانتینرهای PostgreSQL / Redis / MinIO را بالا می‌آورد
    ۴) در صورت نیاز npm install، db:push، db:hardening و build را می‌زند
    ۵) سرور را روی http://localhost:8080 اجرا و مرورگر را باز می‌کند
════════════════════════════════════════════════════════════════════════
#>
[CmdletBinding()]
param(
  [switch]$Update,
  [switch]$Rebuild,
  [switch]$Dev,
  [switch]$Stop,
  [switch]$NoBrowser,
  [switch]$Fresh
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
try { $Host.UI.RawUI.WindowTitle = 'سامانه جامع آفاق' } catch {}

$Root    = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Next    = Join-Path $Root 'afagh-next'
$Compose = Join-Path $Next 'docker-compose.yml'
$EnvFile = Join-Path $Next '.env'
$Project = 'afagh-dev'
$State   = Join-Path $Next '.afagh-state.json'
$AppPort = 8080

function Step($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Ok($t)   { Write-Host "  [OK]  $t" -ForegroundColor Green }
function Info($t) { Write-Host "  ....  $t" -ForegroundColor Gray }
function Warn($t) { Write-Host "  [!]   $t" -ForegroundColor Yellow }
function Fail($t) { Write-Host "  [X]   $t" -ForegroundColor Red; exit 1 }

function Run([scriptblock]$sb, [switch]$Quiet) {
  $ErrorActionPreference = 'Continue'
  $global:LASTEXITCODE = 0
  if ($Quiet) { & $sb *> $null } else { & $sb 2>&1 | Out-Host }
  $code = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  return $code
}
function RunIn([string]$cwd, [scriptblock]$sb, [switch]$Quiet) {
  Push-Location $cwd
  try { return (Run $sb -Quiet:$Quiet) } finally { Pop-Location }
}
function Must([string]$cwd, [scriptblock]$sb, [string]$msg) {
  if ((RunIn $cwd $sb) -ne 0) { Fail $msg }
}
function HashOf([string]$path) {
  if (-not (Test-Path $path)) { return '' }
  return (Get-FileHash -Algorithm SHA256 -Path $path).Hash
}
function LoadState() {
  if (Test-Path $State) {
    try { return (Get-Content $State -Raw | ConvertFrom-Json) } catch {}
  }
  return [pscustomobject]@{ lock=''; schema=''; hardening=''; built=$false }
}
function SaveState($s) { $s | ConvertTo-Json | Set-Content -Path $State -Encoding UTF8 }

Write-Host ""
Write-Host "════════ سامانه جامع دانشگاه آفاق ════════" -ForegroundColor White

if (-not (Test-Path $Next)) { Fail "پوشهٔ afagh-next پیدا نشد — این فایل باید در ریشهٔ پروژه باشد." }

# ── حالت خاموش کردن ───────────────────────────────────────────────
if ($Stop) {
  Step "خاموش کردن سرویس‌ها"
  Run { docker compose -p $Project -f $Compose stop } | Out-Null
  Ok "سرویس‌های داکر متوقف شدند (داده‌ها حفظ شد)"
  exit 0
}

# ── ۱) Docker ─────────────────────────────────────────────────────
Step "۱/۶ بررسی Docker"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail "Docker پیدا نشد — Docker Desktop را نصب کنید: https://www.docker.com/products/docker-desktop"
}
if ((Run { docker info } -Quiet) -ne 0) {
  Info "Docker خاموش است — در حال اجرای Docker Desktop..."
  $dd = @(
    "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
    "${env:ProgramFiles(x86)}\Docker\Docker\Docker Desktop.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($dd) { Start-Process $dd | Out-Null } else { Warn "Docker Desktop.exe پیدا نشد — دستی بازش کنید." }

  $ready = $false
  for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 2
    if ((Run { docker info } -Quiet) -eq 0) { $ready = $true; break }
    if ($i % 5 -eq 0) { Info "منتظر آماده شدن Docker... ($($i*2) ثانیه)" }
  }
  if (-not $ready) { Fail "Docker آماده نشد — Docker Desktop را باز کنید تا وضعیتش Running شود و دوباره اجرا کنید." }
}
Ok "Docker آمادهٔ کار است"

# ── ۲) پورت PostgreSQL: رفع خودکار رزرو پورت ویندوز ───────────────
Step "۲/۶ بررسی پورت دیتابیس"
$composeText = Get-Content $Compose -Raw
$hostPgPort = 5432
if ($composeText -match "ports:\s*\[\s*'(\d+):5432'\s*\]") { $hostPgPort = [int]$matches[1] }

# بازه‌های پورتی که ویندوز (Hyper-V/WSL) رزرو کرده و قابل استفاده نیستند
$excluded = @()
try {
  $out = netsh int ipv4 show excludedportrange protocol=tcp 2>$null
  foreach ($line in $out) {
    if ($line -match '^\s*(\d+)\s+(\d+)') { $excluded += ,@([int]$matches[1], [int]$matches[2]) }
  }
} catch {}
function IsExcluded([int]$p) {
  foreach ($r in $script:excluded) { if ($p -ge $r[0] -and $p -le $r[1]) { return $true } }
  return $false
}

if (IsExcluded $hostPgPort) {
  Warn "پورت $hostPgPort توسط ویندوز رزرو شده است — به‌طور خودکار پورت آزاد انتخاب می‌شود."
  $newPort = 0
  foreach ($cand in 15432, 25432, 35432, 45432, 15433) {
    if (-not (IsExcluded $cand)) {
      $busy = (Get-NetTCPConnection -State Listen -LocalPort $cand -ErrorAction SilentlyContinue)
      if (-not $busy) { $newPort = $cand; break }
    }
  }
  if ($newPort -eq 0) { Fail "پورت آزادی برای PostgreSQL پیدا نشد." }

  Copy-Item $Compose "$Compose.bak" -Force
  $composeText = $composeText -replace "ports:\s*\[\s*'\d+:5432'\s*\]", "ports: ['${newPort}:5432']"
  Set-Content -Path $Compose -Value $composeText -Encoding UTF8 -NoNewline
  Run { docker rm -f afagh_pg_dev } -Quiet | Out-Null
  $hostPgPort = $newPort
  Ok "پورت PostgreSQL روی $newPort تنظیم شد (نسخهٔ پشتیبان: docker-compose.yml.bak)"
} else {
  Ok "پورت PostgreSQL: $hostPgPort"
}

# ── ۳) فایل .env ──────────────────────────────────────────────────
if (-not (Test-Path $EnvFile)) {
  $sample = Join-Path $Next '.env.example'
  if (Test-Path $sample) { Copy-Item $sample $EnvFile } else { Set-Content $EnvFile "" -Encoding UTF8 }
  Info "فایل .env ساخته شد"
}
$envText = Get-Content $EnvFile -Raw
$wantUrl = "postgres://afagh:afagh@localhost:$hostPgPort/afagh_db"
if ($envText -match '(?m)^\s*DATABASE_URL\s*=\s*(.+?)\s*$') {
  $cur = $matches[1]
  if ($cur -match '@localhost:(\d+)/' -and [int]$matches[1] -ne $hostPgPort) {
    $envText = $envText -replace '(?m)^\s*DATABASE_URL\s*=.*$', "DATABASE_URL=$wantUrl"
    Set-Content -Path $EnvFile -Value $envText -Encoding UTF8 -NoNewline
    Ok "DATABASE_URL با پورت $hostPgPort هماهنگ شد"
  }
} else {
  Add-Content -Path $EnvFile -Value "`nDATABASE_URL=$wantUrl" -Encoding UTF8
  Ok "DATABASE_URL به .env اضافه شد"
}

# ── ۴) به‌روزرسانی از گیت (اختیاری) ───────────────────────────────
if ($Update) {
  Step "به‌روزرسانی از گیت"
  if (Get-Command git -ErrorAction SilentlyContinue) {
    if ((RunIn $Root { git pull --ff-only }) -ne 0) {
      Warn "git pull ناموفق بود — احتمالاً تغییرات محلی دارید. با git stash امتحان کنید."
    } else { Ok "کد به‌روز شد" }
  } else { Warn "git نصب نیست — از این مرحله عبور شد" }
}

# ── ۵) سرویس‌های داکر ─────────────────────────────────────────────
Step "۳/۶ راه‌اندازی PostgreSQL + Redis + MinIO"
if ($Fresh) {
  Warn "حالت Fresh: حذف کامل کانتینرها و داده‌ها"
  Run { docker compose -p $Project -f $Compose down -v } -Quiet | Out-Null
  if (Test-Path $State) { Remove-Item $State -Force }
}
if ((Run { docker compose -p $Project -f $Compose up -d }) -ne 0) {
  Fail "بالا آوردن کانتینرها ناموفق بود. اگر خطای دانلود ایمیج بود، در Docker Desktop → Settings → Docker Engine یک registry-mirror اضافه کنید."
}

Info "منتظر آماده شدن PostgreSQL..."
$pgReady = $false
for ($i = 0; $i -lt 60; $i++) {
  if ((Run { docker exec afagh_pg_dev pg_isready -U afagh -d afagh_db } -Quiet) -eq 0) { $pgReady = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $pgReady) { Fail "PostgreSQL آماده نشد — لاگ: docker compose -p $Project -f afagh-next\docker-compose.yml logs postgres" }
Ok "PostgreSQL آماده است"
if ((Run { docker exec afagh_redis_dev redis-cli ping } -Quiet) -eq 0) { Ok "Redis آماده است" } else { Warn "Redis پاسخ نداد — انتخاب واحد کند می‌شود" }

# ── ۶) وابستگی‌ها / دیتابیس / بیلد — فقط در صورت نیاز ─────────────
$st = LoadState
$lockHash  = HashOf (Join-Path $Next 'package-lock.json')
$schemaHash= HashOf (Join-Path $Next 'src\db\schema.ts')
$hardHash  = HashOf (Join-Path $Next 'src\db\pg-hardening.sql')

Step "۴/۶ وابستگی‌ها"
if ((-not (Test-Path (Join-Path $Next 'node_modules'))) -or ($st.lock -ne $lockHash)) {
  Must $Next { npm install } "npm install ناموفق بود"
  $st.lock = $lockHash
  $st.built = $false
  Ok "وابستگی‌ها نصب شد"
} else { Ok "وابستگی‌ها به‌روز است — رد شد" }

Step "۵/۶ دیتابیس"
if ($st.schema -ne $schemaHash) {
  Must $Next { npm run db:push } "اعمال schema ناموفق بود"
  $st.schema = $schemaHash
  Ok "جدول‌ها اعمال شد"
} else { Ok "schema بدون تغییر — رد شد" }
if ($st.hardening -ne $hardHash) {
  if ((RunIn $Next { npm run db:hardening }) -ne 0) { Warn "db:hardening با خطا مواجه شد (ادامه می‌دهیم)" }
  else { $st.hardening = $hardHash; Ok "ایندکس‌ها و RLS اعمال شد" }
} else { Ok "hardening بدون تغییر — رد شد" }

Step "۶/۶ بیلد"
if ($Dev) {
  Ok "حالت توسعه — بیلد لازم نیست"
} elseif ($Rebuild -or (-not $st.built) -or (-not (Test-Path (Join-Path $Next '.next')))) {
  Must $Next { npm run build } "بیلد ناموفق بود. اگر بعد از به‌روزرسانی است، node_modules و .next را پاک کنید."
  $st.built = $true
  Ok "بیلد موفق"
} else { Ok "بیلد قبلی معتبر است — رد شد" }
SaveState $st

# ── اجرا ──────────────────────────────────────────────────────────
$busy8080 = Get-NetTCPConnection -State Listen -LocalPort $AppPort -ErrorAction SilentlyContinue
if ($busy8080) {
  Warn "پورت $AppPort از قبل اشغال است — احتمالاً سامانه همین حالا در حال اجراست."
  if (-not $NoBrowser) { Start-Process "http://localhost:$AppPort" }
  Write-Host ""
  Write-Host "  اگر سرور قبلی مال شما نیست، ببندیدش:  netstat -ano | findstr :$AppPort" -ForegroundColor Gray
  exit 0
}

Write-Host ""
Write-Host "════════════════════════════════════════════════════" -ForegroundColor White
Write-Host "  سامانه در حال اجراست:  http://localhost:$AppPort" -ForegroundColor Green
Write-Host ""
Write-Host "  حساب‌های دمو — رمز همه: 123456" -ForegroundColor White
Write-Host "      مدیر    0000000001   ->  /admin"
Write-Host "      استاد   0011111111   ->  /professor"
Write-Host "      دانشجو  31412001     ->  /student"
Write-Host ""
Write-Host "  این پنجره را نبندید. برای خاموش کردن سرور: Ctrl+C" -ForegroundColor Yellow
Write-Host "════════════════════════════════════════════════════" -ForegroundColor White
Write-Host ""

# مرورگر را وقتی سرور واقعاً بالا آمد باز کن
if (-not $NoBrowser) {
  Start-Job -ScriptBlock {
    param($p)
    for ($i = 0; $i -lt 90; $i++) {
      Start-Sleep -Seconds 1
      try {
        $r = Invoke-WebRequest -Uri "http://localhost:$p/login" -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -ge 200) { Start-Process "http://localhost:$p"; break }
      } catch {}
    }
  } -ArgumentList $AppPort | Out-Null
}

Push-Location $Next
try {
  if ($Dev) { & npm run dev } else { & npm start }
} finally {
  Pop-Location
  Get-Job | Remove-Job -Force -ErrorAction SilentlyContinue
}
