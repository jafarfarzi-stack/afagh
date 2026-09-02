#Requires -Version 5.1
<#
  بروز کردن سامانه آفاق از گیت‌هاب + بیلد + اجرای دوباره (ویندوز)
      .\update.ps1              دریافت آخرین کد، بیلد و اجرا
      .\update.ps1 -SkipBuild   فقط دریافت کد (بدون بیلد/اجرا)
#>
param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$Root   = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Next   = Join-Path $Root 'afagh-next'
$Branch = 'arena/01a05c13-afagh'

function Ok($t)   { Write-Host "  [OK]  $t" -ForegroundColor Green }
function Warn($t) { Write-Host "  [!]   $t" -ForegroundColor Yellow }
function Step($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Port-Up($p) {
  try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $p); $c.Close(); return $true }
  catch { return $false }
}

# ۱) دریافت آخرین تغییرات
Step "۱/۴ دریافت آخرین تغییرات از گیت‌هاب"
git -C $Root fetch origin
git -C $Root checkout $Branch 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { git -C $Root checkout -b $Branch "origin/$Branch" }
git -C $Root pull origin $Branch
Ok "آخرین commit: $(git -C $Root log --oneline -1)"

if ($SkipBuild) { Warn "رد شد (-SkipBuild)"; exit 0 }

# ۲) توقف سرور قبلی و اطمینان از Docker
Step "۲/۴ توقف سرور قبلی و روشن‌کردن Docker"
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
& docker compose -p afagh-dev -f (Join-Path $Next 'docker-compose.yml') up -d
$dbUp = $false
for ($i = 0; $i -lt 30; $i++) { Start-Sleep -Seconds 1; if (Port-Up 5432) { $dbUp = $true; break } }
if (-not $dbUp) {
  Warn "PostgreSQL روی 5432 بالا نیامد — ابتدا Docker Desktop را کامل روشن کنید و دوباره .\update.cmd بزنید"
  exit 1
}
Ok "PostgreSQL آماده است"

# ۳) نصب وابستگی‌ها و بیلد
Step "۳/۴ نصب وابستگی‌ها و بیلد پروداکشن"
Push-Location $Next
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Pop-Location; Warn "npm install ناموفق بود — وابستگی‌ها کامل نصب نشدند. بدون آن‌ها بیلد با خطای گمراه‌کنندهٔ «Can't resolve» می‌شکند. اینترنت/دسترسی پوشه را بررسی کنید و دوباره .\update.cmd بزنید."; exit 1 }
# اعمال تغییرات ساختار پایگاه داده (ستون‌های جدید) — افزودنی و غیرمخرب
npx drizzle-kit push --force
# تست‌های منطق خالص (بدون نیاز به دیتابیس) — پیش از بیلد اجرا می‌شوند تا
# رگرسیون موتور شهریه پیش از استقرار گرفته شود.
# این تست‌ها با type-stripping خودِ Node اجرا می‌شوند که از Node ۲۲.۶ در دسترس است،
# ولی install-docker.ps1 هنوز Node ۱۸+ را می‌پذیرد. پس نبودِ این قابلیت نباید
# استقرار را بشکند؛ در آن صورت فقط هشدار می‌دهیم و رد می‌شویم.
node --experimental-strip-types -e "" 2>$null
if ($LASTEXITCODE -eq 0) {
  npm test
  if ($LASTEXITCODE -ne 0) { Pop-Location; Warn "تست‌ها ناموفق بودند — استقرار متوقف شد"; exit 1 }
} else {
  Warn "Node $(node -v) از type-stripping پشتیبانی نمی‌کند (نیاز به ۲۲.۶ یا بالاتر) — تست‌ها رد شدند"
}
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; Warn "بیلد ناموفق بود"; exit 1 }
Pop-Location
Ok "بیلد موفق"

# ۴) اجرا
Step "۴/۴ اجرای سرور روی پورت ۸۰۸۰"
if (Port-Up 8080) { Warn "پورت ۸۰۸۰ از قبل مشغول است" }
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$Next'; npm start" | Out-Null
$up = $false
for ($i = 0; $i -lt 40; $i++) { Start-Sleep -Seconds 1; if (Port-Up 8080) { $up = $true; break } }
if ($up) { Ok "سرور اجرا شد → http://localhost:8080" }
else { Warn "سرور بالا نیامد — پنجرهٔ جدید را ببینید" }
