#Requires -Version 5.1
<#
════════════════════════════════════════════════════════════════════
  نصب کامل سامانه جامع آفاق روی ویندوز — دیتابیس و سرویس‌ها روی Docker
      PostgreSQL + Redis + MinIO  →  Docker
      Next.js (afagh-next)        →  همین سیستم (Node)

  اجرا (در ریشهٔ پروژه):
      powershell -ExecutionPolicy Bypass -File .\install-docker.ps1

  سوییچ‌ها:
      -WithDemoData   ساخت دادهٔ دمو (فاز صفر SQLite) و انتقال به PostgreSQL
      -Fresh          حذف کانتینرها و کل داده، نصب از صفر
      -SkipBuild      رد کردن npm run build
      -Start          پس از نصب، سرور را روی http://localhost:3100 اجرا کن
════════════════════════════════════════════════════════════════════
#>
[CmdletBinding()]
param(
  [switch]$WithDemoData,
  [switch]$Fresh,
  [switch]$SkipBuild,
  [switch]$Start
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$Root    = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Next    = Join-Path $Root 'afagh-next'
$Erp     = Join-Path $Root 'afagh-erp'
$Compose = Join-Path $Next 'docker-compose.yml'
$Project = 'afagh'

function Step($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Ok($t)   { Write-Host "  [OK]  $t" -ForegroundColor Green }
function Warn($t) { Write-Host "  [!]   $t" -ForegroundColor Yellow }
function Fail($t) { Write-Host "  [X]   $t" -ForegroundColor Red; exit 1 }

# اجرای دستور بومی (node/npm/docker) و برگرداندن exit code — بدون پرتاب استثنا
function Run([scriptblock]$sb, [switch]$Quiet) {
  $ErrorActionPreference = 'Continue'
  $global:LASTEXITCODE = 0
  if ($Quiet) { & $sb *> $null } else { & $sb 2>&1 | Out-Host }
  return $LASTEXITCODE
}

function RunIn([string]$cwd, [scriptblock]$sb, [switch]$Quiet) {
  Push-Location $cwd
  try { return (Run $sb -Quiet:$Quiet) } finally { Pop-Location }
}

# اجرای اجباری: در صورت خطا نصب متوقف می‌شود
function Must([string]$cwd, [scriptblock]$sb, [string]$msg) {
  if ((RunIn $cwd $sb) -ne 0) { Fail $msg }
}

function Import-DotEnv([string]$path) {
  if (-not (Test-Path $path)) { return }
  foreach ($line in (Get-Content $path)) {
    if ($line -match '^\s*#') { continue }
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
      $val = $matches[2].Trim('"').Trim("'")
      [Environment]::SetEnvironmentVariable($matches[1], $val, 'Process')
    }
  }
}

Write-Host ""
Write-Host "======== نصب سامانه جامع آفاق (Docker) ========" -ForegroundColor White

# ── ۰) پیش‌نیازها ─────────────────────────────────────────────────
Step "۰/۷ بررسی پیش‌نیازها"

if (-not (Test-Path $Next)) { Fail "پوشهٔ afagh-next پیدا نشد — این اسکریپت باید در ریشهٔ پروژه اجرا شود." }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "Node.js نصب نیست — نسخهٔ ۲۰ یا بالاتر از nodejs.org نصب کنید." }

$nodeMajor = 0
try { $nodeMajor = [int](node -e "console.log(process.versions.node.split('.')[0])") } catch {}
if ($nodeMajor -lt 18) { Fail "نسخهٔ Node باید ۱۸ یا بالاتر باشد (فعلی: $(node -v))" }
Ok "Node $(node -v) + npm $(npm -v)"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail "Docker پیدا نشد — Docker Desktop را نصب کنید: https://www.docker.com/products/docker-desktop" }
if ((Run { docker info } -Quiet) -ne 0) { Fail "Docker نصب است ولی اجرا نمی‌شود — Docker Desktop را باز کنید و صبر کنید وضعیتش Running شود." }
Ok "Docker آمادهٔ کار است"

try {
  foreach ($p in 5432, 6379, 9000, 3100) {
    if (Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue) {
      Warn "پورت $p از قبل اشغال است — اگر مربوط به این پروژه نیست، سرویس مزاحم را ببندید."
    }
  }
} catch {}

# ── ۱) کانتینرهای زیرساخت ────────────────────────────────────────
Step "۱/۷ راه‌اندازی PostgreSQL + Redis + MinIO روی Docker"

if ($Fresh) {
  Warn "حالت -Fresh: حذف کانتینرها و کل دادهٔ دیتابیس…"
  Run { docker compose -p $Project -f $Compose down -v } -Quiet | Out-Null
}

# کانتینرهای نصب‌های قدیمی (پروژهٔ پیش‌فرض afagh-next) پورت‌ها را اشغال می‌کنند
$legacy = (& docker ps -aq --filter "label=com.docker.compose.project=afagh-next" 2>$null)
if ($legacy) {
  Warn "کانتینرهای نصب قبلی پیدا شد — حذف می‌شوند (volume دادهٔ قدیمی دست‌نخورده می‌ماند)"
  Run { docker compose -p 'afagh-next' -f $Compose down } -Quiet | Out-Null
}

if ((Run { docker compose -p $Project -f $Compose up -d }) -ne 0) {
  Fail "docker compose up ناموفق بود (بار اول دانلود ایمیج‌ها چند دقیقه طول می‌کشد؛ اتصال اینترنت را بررسی کنید)"
}
Ok "کانتینرها بالا آمدند (docker project: $Project)"

Write-Host "  ... در انتظار آماده‌شدن PostgreSQL" -NoNewline
$pgReady = $false
for ($i = 0; $i -lt 90; $i++) {
  if ((Run { docker exec afagh_pg pg_isready -U afagh -d afagh_db } -Quiet) -eq 0) { $pgReady = $true; break }
  Write-Host "." -NoNewline
  Start-Sleep -Seconds 2
}
Write-Host ""
if (-not $pgReady) { Fail "PostgreSQL آماده نشد — لاگ: docker compose -p $Project -f afagh-next\docker-compose.yml logs postgres" }
Ok "PostgreSQL :5432  (کاربر afagh / دیتابیس afagh_db)"

if ((Run { docker exec afagh_redis redis-cli ping } -Quiet) -eq 0) { Ok "Redis :6379" } else { Warn "Redis پاسخ نداد — انتخاب واحد کند می‌شود" }

$minioOk = $false
for ($i = 0; $i -lt 30; $i++) {
  try { Invoke-WebRequest -Uri 'http://127.0.0.1:9000/minio/health/live' -UseBasicParsing -TimeoutSec 3 | Out-Null; $minioOk = $true; break }
  catch { Start-Sleep -Seconds 2 }
}
if ($minioOk) { Ok "MinIO :9000  (کنسول :9001 — afagh / afagh-secret)" } else { Warn "MinIO آماده نشد — بایگانی مدارک کار نمی‌کند" }

# ── ۲) فایل تنظیمات ──────────────────────────────────────────────
Step "۲/۷ فایل تنظیمات .env"
$envFile = Join-Path $Next '.env'
if (-not (Test-Path $envFile)) {
  Copy-Item (Join-Path $Next '.env.example') $envFile
  Add-Content -Path $envFile -Value 'S3_ACCESS_KEY=afagh'
  Add-Content -Path $envFile -Value 'S3_SECRET_KEY=afagh-secret'
  Ok "ساخته شد: afagh-next\.env"
} else {
  Ok "از قبل موجود بود: afagh-next\.env (دست‌نخورده ماند)"
}
Import-DotEnv $envFile
if (-not $env:DATABASE_URL) { $env:DATABASE_URL = 'postgres://afagh:afagh@127.0.0.1:5432/afagh_db' }
if (-not $env:REDIS_URL)    { $env:REDIS_URL    = 'redis://127.0.0.1:6379' }

# ── ۳) وابستگی‌های Node ──────────────────────────────────────────
Step "۳/۷ نصب وابستگی‌های Node (بار اول چند دقیقه)"
$nm    = Join-Path $Next 'node_modules'
$stamp = Join-Path $nm '.afagh-lock-hash'
$lockHash = (Get-FileHash (Join-Path $Next 'package-lock.json') -Algorithm SHA256).Hash
if ((Test-Path $stamp) -and ((Get-Content $stamp -Raw).Trim() -eq $lockHash)) {
  Ok "وابستگی‌ها به‌روزند — نصب مجدد لازم نشد"
} else {
  if (Test-Path $nm) {
    Warn "package-lock تغییر کرده — پاک‌سازی node_modules و .next"
    Remove-Item $nm -Recurse -Force
    $dotNext = Join-Path $Next '.next'
    if (Test-Path $dotNext) { Remove-Item $dotNext -Recurse -Force }
  }
  Must $Next { npm install --no-audit --no-fund } "npm install ناموفق بود"
  Set-Content -Path $stamp -Value $lockHash
  Ok "afagh-next نصب شد"
}

# ── ۴) اسکیمای دیتابیس ───────────────────────────────────────────
Step "۴/۷ ساخت جدول‌ها روی PostgreSQL (Drizzle)"
Must $Next { npx drizzle-kit push --force } "drizzle-kit push ناموفق بود"
Ok "جدول‌ها ساخته/به‌روز شدند (شامل migration_runs و ستون‌های هدف‌گیری ارائه)"

if ((RunIn $Next { npm run db:hardening } -Quiet) -eq 0) {
  Ok "سخت‌سازی: ایندکس‌ها + RLS + نقش فقط‌خواندنی afagh_app"
} else {
  Warn "سخت‌سازی دیتابیس ناموفق بود — سامانه کار می‌کند ولی RLS فعال نشد"
}

# ── ۵) دادهٔ دمو (اختیاری) ───────────────────────────────────────
Step "۵/۷ دادهٔ نمونه"
if ($WithDemoData) {
  $sqlite = Join-Path $Erp 'data\afagh.db'
  if (-not (Test-Path $sqlite)) {
    Warn "دیتابیس دموی فاز صفر موجود نیست — در حال ساخت…"
    if ((RunIn $Erp { npm install --no-audit --no-fund } -Quiet) -eq 0) {
      if ((RunIn $Erp { npm run seed } -Quiet) -ne 0) { Warn "seed فاز صفر ناموفق بود" }
    } else {
      Warn "نصب وابستگی‌های afagh-erp ناموفق بود (better-sqlite3 در ویندوز به Build Tools نیاز دارد)"
    }
  }
  if (Test-Path $sqlite) {
    if ((RunIn $Next { node scripts\migrate-sqlite-to-pg.mjs } -Quiet) -eq 0) {
      Ok "دادهٔ دمو به PostgreSQL منتقل شد (idempotent)"
    } else { Warn "انتقال دادهٔ دمو ناموفق بود" }
  } else {
    Warn "بدون دادهٔ دمو ادامه می‌دهیم — حساب‌های دمو هنگام اولین ورود خودکار ساخته می‌شوند"
  }
} else {
  Warn "رد شد — برای دادهٔ نمونه دوباره با سوییچ -WithDemoData اجرا کنید"
}

if ((RunIn $Next { node scripts\warm-redis.mjs } -Quiet) -eq 0) { Ok "ظرفیت کلاس‌ها در Redis گرم شد" }

# ── ۶) بیلد ──────────────────────────────────────────────────────
Step "۶/۷ بیلد پروداکشن Next.js"
if ($SkipBuild) {
  Warn "رد شد (-SkipBuild) — با npm run dev اجرا کنید"
} else {
  Must $Next { npm run build } "بیلد ناموفق بود"
  Ok "بیلد موفق"
}

# ── ۷) جمع‌بندی ──────────────────────────────────────────────────
Step "۷/۷ نصب تمام شد"
Write-Host ""
Write-Host "  اجرا:" -ForegroundColor White
Write-Host "      cd afagh-next ; npm start        →  http://localhost:3100"
Write-Host "      (حالت توسعه: npm run dev)"
Write-Host ""
Write-Host "  حساب‌های دمو — رمز همه: 123456" -ForegroundColor White
Write-Host "      مدیر    0000000001   →  /admin"
Write-Host "      استاد   0011111111   →  /professor"
Write-Host "      دانشجو  31412001     →  /student"
Write-Host ""
Write-Host "  سرویس‌های Docker:" -ForegroundColor White
Write-Host "      وضعیت : docker compose -p $Project -f afagh-next\docker-compose.yml ps"
Write-Host "      توقف  : .\stop-docker.ps1            (با -RemoveData کل داده پاک می‌شود)"
Write-Host "      MinIO : http://localhost:9001        (afagh / afagh-secret)"
Write-Host ""

if ($Start) {
  Step "اجرای سرور روی پورت ۳۱۰۰ (توقف با Ctrl+C)"
  Must $Next { npm start } "اجرای سرور ناموفق بود"
}
