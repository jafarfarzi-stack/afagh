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
      -Doctor     گزارش وضعیت و عیب‌یابی (بدون اجرای سرور)

  این اسکریپت خودش:
    ۱) Docker Desktop را در صورت خاموش بودن اجرا و منتظر آماده شدنش می‌ماند
    ۲) مشکل پورت رزروشدهٔ ویندوز برای PostgreSQL را تشخیص و اصلاح می‌کند
    ۳) کانتینرهای PostgreSQL / Redis / MinIO را بالا می‌آورد
    ۴) در صورت نیاز npm install، db:migrate، db:hardening و build را می‌زند
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
  [switch]$Fresh,
  [switch]$Doctor
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
    try {
      $s = Get-Content $State -Raw | ConvertFrom-Json
      # سازگاری با نسخه‌های قدیمی‌تر فایل وضعیت
      if (-not ($s.PSObject.Properties.Name -contains 'src')) {
        Add-Member -InputObject $s -NotePropertyName 'src' -NotePropertyValue '' -Force
      }
      return $s
    } catch {}
  }
  return [pscustomobject]@{ lock=''; schema=''; hardening=''; src=''; built=$false }
}

# اثر انگشت کل درخت سورس — تا هر تغییری در کد باعث بیلد دوباره شود
function SourceFingerprint([string]$dir) {
  $sb = New-Object System.Text.StringBuilder
  $targets = @('src', 'public')
  foreach ($t in $targets) {
    $p = Join-Path $dir $t
    if (-not (Test-Path $p)) { continue }
    Get-ChildItem -Path $p -Recurse -File -ErrorAction SilentlyContinue |
      Sort-Object FullName |
      ForEach-Object { [void]$sb.Append($_.FullName).Append('|').Append($_.Length).Append('|').Append($_.LastWriteTimeUtc.Ticks).Append("`n") }
  }
  foreach ($f in 'package.json','next.config.mjs','tailwind.config.ts','postcss.config.js','tsconfig.json','.env') {
    $p = Join-Path $dir $f
    if (Test-Path $p) {
      $fi = Get-Item $p
      [void]$sb.Append($f).Append('|').Append($fi.Length).Append('|').Append($fi.LastWriteTimeUtc.Ticks).Append("`n")
    }
  }
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($sb.ToString())
  $sha   = [System.Security.Cryptography.SHA256]::Create()
  return [System.BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','')
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

# ── حالت عیب‌یابی ─────────────────────────────────────────────────
if ($Doctor) {
  Step "گزارش وضعیت"
  Write-Host "  Node    : $(try { node -v } catch { 'نصب نیست' })"
  Write-Host "  npm     : $(try { npm -v } catch { 'نصب نیست' })"
  Write-Host "  مسیر    : $Root"
  Write-Host ""
  Write-Host "  --- کانتینرها ---" -ForegroundColor Cyan
  Run { docker ps -a --filter "name=afagh_" --format "  {{.Names}}  {{.Status}}  {{.Ports}}" } | Out-Null
  Write-Host ""
  Write-Host "  --- پورت دیتابیس در docker-compose ---" -ForegroundColor Cyan
  (Select-String -Path $Compose -Pattern "5432" | ForEach-Object { "  " + $_.Line.Trim() })
  Write-Host ""
  Write-Host "  --- اتصال‌های دیتابیس در .env ---" -ForegroundColor Cyan
  if (Test-Path $EnvFile) { (Select-String -Path $EnvFile -Pattern "^\s*DATABASE_URL" | ForEach-Object { "  " + $_.Line.Trim() }) }
  else { Write-Host "  فایل .env وجود ندارد!" -ForegroundColor Red }
  Write-Host ""
  Write-Host "  --- اتصال به PostgreSQL ---" -ForegroundColor Cyan
  Run { docker exec afagh_pg_dev pg_isready -U afagh -d afagh_db } | Out-Null
  Write-Host ""
  Write-Host "  --- تعداد جدول‌ها ---" -ForegroundColor Cyan
  Run { docker exec afagh_pg_dev psql -U afagh -d afagh_db -c "select count(*) as tables from information_schema.tables where table_schema='public';" } | Out-Null
  Write-Host ""
  Write-Host "  --- وضعیت گیت ---" -ForegroundColor Cyan
  Run { git -C $Root --no-pager log --oneline -3 } | Out-Null
  Run { git -C $Root status --short } | Out-Null
  Write-Host ""
  Write-Host "  --- نقش afagh_app (برای RLS) ---" -ForegroundColor Cyan
  Run { docker exec afagh_pg_dev psql -U afagh -d afagh_db -c "select rolname from pg_roles where rolname='afagh_app';" } | Out-Null
  Write-Host ""
  Write-Host "  --- آخرین لاگ PostgreSQL ---" -ForegroundColor Cyan
  Run { docker logs --tail 15 afagh_pg_dev } | Out-Null
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
if ($null -eq $envText) { $envText = '' }

# هر دو اتصال دیتابیس باید با پورت واقعی هماهنگ باشند:
#   DATABASE_URL     → اتصال اصلی اپ
#   DATABASE_URL_APP → اتصال نقش فقط-خواندنی afagh_app برای RLS (صفحات دانشجو)
$pairs = @(
  @{ key = 'DATABASE_URL';     val = "postgres://afagh:afagh@localhost:$hostPgPort/afagh_db" },
  @{ key = 'DATABASE_URL_APP'; val = "postgres://afagh_app:afagh_app@127.0.0.1:$hostPgPort/afagh_db" }
)
$envChanged = $false
foreach ($p in $pairs) {
  $k = $p.key; $v = $p.val
  $rx = "(?m)^\s*$k\s*=\s*(.+?)\s*$"
  $m = [regex]::Match($envText, $rx)
  if ($m.Success) {
    $cur = $m.Groups[1].Value
    if ($cur -match ':(\d+)/' -and [int]$matches[1] -ne $hostPgPort) {
      $envText = [regex]::Replace($envText, "(?m)^\s*$k\s*=.*$", "$k=$v")
      $envChanged = $true
      Ok "$k با پورت $hostPgPort هماهنگ شد"
    }
  } else {
    if ($envText.Length -gt 0 -and -not $envText.EndsWith("`n")) { $envText += "`r`n" }
    $envText += "$k=$v`r`n"
    $envChanged = $true
    Ok "$k به .env اضافه شد"
  }
}
if ($envChanged) { Set-Content -Path $EnvFile -Value $envText -Encoding UTF8 -NoNewline }
else { Ok "تنظیمات اتصال دیتابیس درست است" }

# ── ۴) به‌روزرسانی از گیت (اختیاری) ───────────────────────────────
if ($Update) {
  Step "به‌روزرسانی از گیت"
  if (Get-Command git -ErrorAction SilentlyContinue) {
    Run { git -C $Root fetch origin } -Quiet | Out-Null
    $branch = (& git -C $Root rev-parse --abbrev-ref HEAD).Trim()
    Write-Host ""
    Write-Host "  تغییرات پیشِ‌رو روی برنچ $branch :" -ForegroundColor White
    Run { git -C $Root --no-pager log --oneline "HEAD..origin/$branch" } | Out-Null
    Run { git -C $Root --no-pager diff --stat "HEAD..origin/$branch" } | Out-Null
    Write-Host ""

    # پشتیبان دیتابیس پیش از هر به‌روزرسانی (اگر کانتینر بالا باشد)
    if ((Run { docker exec afagh_pg_dev pg_isready -U afagh -d afagh_db } -Quiet) -eq 0) {
      $bkDir = Join-Path $Root 'backups'
      New-Item -ItemType Directory -Force -Path $bkDir | Out-Null
      $bk = Join-Path $bkDir ("afagh_" + (Get-Date -Format 'yyyy-MM-dd_HHmm') + ".sql")
      $ErrorActionPreference = 'Continue'
      & docker exec afagh_pg_dev pg_dump -U afagh afagh_db 2>$null | Out-File -FilePath $bk -Encoding UTF8
      $ErrorActionPreference = 'Stop'
      if ((Test-Path $bk) -and ((Get-Item $bk).Length -gt 1024)) { Ok "پشتیبان دیتابیس: backups\$(Split-Path $bk -Leaf)" }
      else { Warn "پشتیبان‌گیری کامل نشد — با احتیاط ادامه دهید" }
    }

    # تغییرات محلی را کنار می‌گذاریم تا pull گیر نکند، بعد برمی‌گردانیم
    $dirty = (& git -C $Root status --porcelain)
    $stashed = $false
    if ($dirty) {
      Info "تغییرات محلی موقتاً کنار گذاشته شد (git stash)"
      if ((Run { git -C $Root stash push -u -m "afagh-auto-update" } -Quiet) -eq 0) { $stashed = $true }
    }
    if ((RunIn $Root { git pull --ff-only }) -ne 0) {
      Warn "git pull ناموفق بود — تاریخچه واگرا شده است. دستی بررسی کنید: git status"
    } else { Ok "کد به‌روز شد" }
    if ($stashed) {
      if ((Run { git -C $Root stash pop } -Quiet) -ne 0) {
        Warn "بازگرداندن تغییرات محلی تداخل داشت — با 'git status' بررسی کنید (تغییرات در git stash list محفوظ است)"
      } else { Info "تغییرات محلی بازگردانده شد" }
    }
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
$lockHash  = (HashOf (Join-Path $Next 'package-lock.json')) + '|' + (HashOf (Join-Path $Next 'package.json'))
$schemaHash= HashOf (Join-Path $Next 'src\db\schema.ts')
$hardHash  = HashOf (Join-Path $Next 'src\db\pg-hardening.sql')

Step "۴/۶ وابستگی‌ها"
# آیا همهٔ وابستگی‌های package.json واقعاً داخل node_modules هستند؟
$missing = @()
$nm = Join-Path $Next 'node_modules'
try {
  $pkg = Get-Content (Join-Path $Next 'package.json') -Raw | ConvertFrom-Json
  $names = @()
  foreach ($grp in 'dependencies','devDependencies') {
    if ($pkg.PSObject.Properties.Name -contains $grp -and $pkg.$grp) {
      $names += $pkg.$grp.PSObject.Properties.Name
    }
  }
  foreach ($n in $names) { if (-not (Test-Path (Join-Path $nm $n))) { $missing += $n } }
} catch {}

if ((-not (Test-Path $nm)) -or ($st.lock -ne $lockHash) -or ($missing.Count -gt 0)) {
  if ($missing.Count -gt 0) { Info ("وابستگی‌های نصب‌نشده: " + ($missing -join ', ')) }
  Must $Next { npm install } "npm install ناموفق بود"
  $st.lock = $lockHash
  $st.built = $false
  Ok "وابستگی‌ها نصب شد"
} else { Ok "وابستگی‌ها به‌روز است — رد شد" }

Step "۵/۶ دیتابیس"
if ($st.schema -ne $schemaHash) {
  # همان پایپ‌لاین تولیدی migrator (Dockerfile/CI): مهاجرت نسخه‌دار → پچ‌ها → دادهٔ پایه.
  # ⚠ به‌جای «drizzle-kit push» که مخرب است، db:migrate اول بکاپ می‌گیرد بعد migrate و verify.
  Must $Next { npm run db:migrate } "اعمال مهاجرت‌های دیتابیس ناموفق بود"
  Must $Next { node scripts/apply-patches.mjs } "اعمال پچ‌های اسکیما ناموفق بود"
  if ((RunIn $Next { npm run db:base }) -ne 0) { Warn "دادهٔ پایه اعمال نشد (ادامه می‌دهیم)" }
  $st.schema = $schemaHash
  Ok "جدول‌ها اعمال شد"
} else { Ok "schema بدون تغییر — رد شد" }
if ($st.hardening -ne $hardHash) {
  if ((RunIn $Next { npm run db:hardening }) -ne 0) { Warn "db:hardening با خطا مواجه شد (ادامه می‌دهیم)" }
  else { $st.hardening = $hardHash; Ok "ایندکس‌ها و RLS اعمال شد" }
} else { Ok "hardening بدون تغییر — رد شد" }

Step "۶/۶ بیلد"
$srcHash = SourceFingerprint $Next
if ($Dev) {
  Ok "حالت توسعه — بیلد لازم نیست"
} elseif ($Rebuild -or (-not $st.built) -or ($st.src -ne $srcHash) -or (-not (Test-Path (Join-Path $Next '.next')))) {
  # اگر سورس عوض شده، خروجی قدیمی را پاک می‌کنیم تا با کد جدید قاطی نشود
  $nextDir = Join-Path $Next '.next'
  if ((Test-Path $nextDir) -and ($Rebuild -or ($st.src -ne $srcHash))) {
    Info "پاک کردن بیلد قبلی (.next)"
    Remove-Item -Recurse -Force $nextDir -ErrorAction SilentlyContinue
  }
  Must $Next { npm run build } "بیلد ناموفق بود. اگر بعد از به‌روزرسانی است، node_modules و .next را پاک کرده و دوباره اجرا کنید."
  $st.built = $true
  $st.src   = $srcHash
  Ok "بیلد موفق"
} else { Ok "سورس بدون تغییر — بیلد قبلی معتبر است" }
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
