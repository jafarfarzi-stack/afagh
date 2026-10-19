# ران‌بوک استقرار نهایی (FINAL) — سامانهٔ جامع آفاق

> **نسخهٔ سند:** 1.0 — **تاریخ:** 2026-10-19
> **شاخه:** `FINAL` · **کامیت مبنا:** `9047ccb` (ادغام فازهای ۱ تا ۴ امنیتی)
> **سرور مقصد:** Debian (Docker Compose)، مسیر `/root/afagh`، کاربر `root`، IP تِیل‌اسکیل `100.70.187.120`
> **پروژهٔ Compose:** `afagh` (از `name: afagh` در `docker-compose.yml`)
> **مکمل:** `docs/DEPLOY-SECURITY-CHECKLIST.md` · `docs/SECRETS-ROTATION-PROCEDURE.md` · `docs/BACKUP-DR-REVIEW.md` · `docs/INCIDENT-RESPONSE-RUNBOOK.md`

این سند **دقیق و کپی‌پیست‌شدنی** است. هر بلوک کد را می‌توانید عیناً در ترمینال سرور اجرا کنید.
مقدارهای داخل `<>` را جایگزین کنید.

> ⚠️ **قاعدهٔ طلایی:** هرگز `drizzle/schema.ts` را دست نزنید و اسکیما را با `drizzle-kit push` جلو نبرید.
> مسیر صحیح فقط سرویس `migrator` است (مهاجرت‌های نسخه‌دار `drizzle/*.sql`).
> فایل‌های کارِ کاربر (مثل `SESSION-COMPRESSED.md` و `.github/dependabot.yml`) را تغییر ندهید.

---

## ۰) نمای یک‌نگاه

| نام سرویس (compose) | نام کانتینر | ایمیج | نقش | پورت روی هاست |
|---|---|---|---|---|
| `postgres` | `afagh_pg` | `postgres:16-alpine` | پایگاه‌داده | `127.0.0.1:5432` |
| `redis` | `afagh_redis` | `redis:7-alpine` | کش/نرخ‌محدودسازی (**با AUTH اجباری**) | `127.0.0.1:6379` |
| `minio` | `afagh_minio` | `minio/minio` | بایگانی اشیا | `127.0.0.1:9000` / `9001` |
| `migrator` | `afagh_migrator` | `afagh-migrator:latest` | یک‌بار: پشتیبان → مهاجرت → پچ → seed → hardening → verify | — |
| `app` | `afagh_app` | `afagh-app:latest` | Next.js (پورت داخلی 8080) | `${APP_BIND}:${APP_PORT}` |
| `scheduler` | `afagh_scheduler` | `alpine:3.20` | پویش‌های `/api/cron/*` | — |

ترتیب کامل استقرار (خلاصهٔ اجرایی):

```bash
cd /root/afagh
git pull --ff-only origin FINAL              # ۱) کد
docker compose config -q                     # ۲) اعتبارسنجی compose + سکرت‌های اجباری
docker compose run --rm migrator node scripts/backup-db.mjs   # ۳) پشتیبان پیش از استقرار
docker compose build                         # ۴) بیلد ایمیج‌ها
docker compose up -d                         # ۵) اجرا (migrator خودکار اجرا می‌شود)
docker compose ps && docker inspect -f '{{.State.ExitCode}}' afagh_migrator   # ۶) سلامت
```

---

## ۱) پیش‌پرواز (Pre-flight)

### ۱.۱) بستر و منابع

```bash
# روی سرور، به‌عنوان root
cd /root/afagh
tailscale ip -4                     # باید 100.70.187.120 را نشان دهد
date -u                             # ساعت همگام (NTP) — برای TLS/لاگ
docker --version && docker compose version
docker info >/dev/null && echo "docker daemon OK"
free -h; df -h /root                # بیلد ~۳GB و RAM آزاد لازم دارد
```

اگر RAM کم است (`< 2.5G`) و بیلد با `exit code: 137` می‌میرد:

```bash
sudo bash scripts/ensure-build-memory.sh      # ساخت swap (idempotent)
# و در .env:  NODE_MAX_OLD_SPACE=1536
```

### ۱.۲) به‌روزرسانی کد و تأیید نسخه

```bash
cd /root/afagh
git fetch --prune origin
git status --short                  # نباید تغییر ثبت‌نشدهٔ مهمی وجود داشته باشد
git rev-parse --short HEAD          # کامیت فعلی (لنگر بازگشت شما)
git rev-parse --short origin/FINAL  # کامیت هدف
STAMP="$(date +%Y%m%d-%H%M)"
printf 'deploy=%s\nprev=%s\nbranch=%s\n' "$STAMP" "$(git rev-parse HEAD)" "$(git branch --show-current)" \
  | tee "/root/afagh-deploy-$STAMP.txt"
git pull --ff-only origin FINAL
git log --oneline -3                # باید سر آن 9047ccb (merge FINAL) باشد
```

اگر `git pull` با «local changes would be overwritten» شکست خورد:

```bash
git stash push -m "pre-deploy-$STAMP"   # سپس pull و در پایان: git stash list
```

### ۱.۳) تأیید ایمیج (verify image)

پیش از هر بیلد، **ایمیج قبلی را تگ کنید** تا بازگشت سریع ممکن باشد؛ سپس بیلد کنید و تأیید کنید ایمیج حاوی کد FINAL است:

```bash
cd /root/afagh
docker image inspect afagh-app:latest --format '{{index .RepoTags 0}} {{.Id}}' 2>/dev/null \
  && docker tag afagh-app:latest afagh-app:prev || echo "اپ نصب‌شدهٔ قبلی وجود ندارد (استقرار تازه)"

# اعتبارسنجی compose + اجباری‌بودن سکرت‌ها (بدون بالا آوردن چیزی)
docker compose config -q && echo "compose OK"

# بیلد (پیش‌فرض؛ روی سرور کم‌حافظه ابتدا swap و NODE_MAX_OLD_SPACE=1536 در .env)
docker compose build

# تأیید اینکه ایمیج‌های ساخته‌شده از همان کد تازه ساخته شده‌اند
docker image inspect afagh-app:latest afagh-migrator:latest \
  --format '{{index .RepoTags 0}} → {{.Id}}  (ساخته‌شده: {{.Created}})'

# تأیید محتوا: ایمیج migrator باید مهاجرت‌ها و اسکریپت مهاجرت FINAL را داشته باشد
docker compose run --rm --no-deps --entrypoint sh migrator -c \
  'ls /app/drizzle/*.sql | wc -l; ls -l /app/scripts/migrate-db.mjs /app/scripts/hardening.mjs /app/scripts/verify-backup.mjs'
```

> اگر `docker compose config -q` خطای فارسی دربارهٔ `POSTGRES_PASSWORD` / `AFAGH_APP_DB_PASSWORD` / `REDIS_PASSWORD` / `MINIO_ROOT_PASSWORD` داد، یعنی `.env` ناقص است → بخش ۲.

### ۱.۴) بررسی فایل `.env` و سکرت‌ها

```bash
cd /root/afagh
[ -f .env ] && ls -l .env            # باید «-rw------- (600)» و مالک root باشد
chmod 600 .env
```

بررسی سریعِ حضور/طول سکرت‌ها (بدون نیاز به Node روی هاست):

```bash
cd /root/afagh
set -a; . ./.env; set +a
check() { # $1=name $2=min $3=value
  if [ -z "$3" ]; then echo "[X] $1 غایب"; return 1; fi
  case "$3" in CHANGE_ME*|change_me*|changeme*) echo "[X] $1 مقدار نمونه است"; return 1;; esac
  if [ "${#3}" -lt "$2" ]; then echo "[X] $1 کوتاه است (${#3}<$2)"; return 1; fi
  if printf '%s' "$3" | grep -Eq '(.)\1{3,}'; then echo "[X] $1 تکرار چهارتایی دارد"; return 1; fi
  echo "[OK] $1"; return 0
}
FAIL=0
check POSTGRES_PASSWORD 24 "$POSTGRES_PASSWORD" || FAIL=1
check AFAGH_APP_DB_PASSWORD 24 "$AFAGH_APP_DB_PASSWORD" || FAIL=1
check REDIS_PASSWORD 24 "$REDIS_PASSWORD" || FAIL=1
check MINIO_ROOT_PASSWORD 16 "$MINIO_ROOT_PASSWORD" || FAIL=1
check AFAGH_BACKUP_SIGNING_KEY 32 "$AFAGH_BACKUP_SIGNING_KEY" || FAIL=1
check AFAGH_CERT_SALT 32 "$AFAGH_CERT_SALT" || FAIL=1
check AFAGH_PII_KEY 32 "$AFAGH_PII_KEY" || FAIL=1
[ "$FAIL" = 0 ] && echo "✔ سکرت‌ها آماده‌اند" || echo "✖ سکرت‌های بالا را اصلاح کنید"
```

ساخت مقادیر تصادفی:

```bash
# رمزهای دیتابیس/Redis/MinIO (حداقل ۲۴ کاراکتر، الفبا-عددی)
tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32; echo
# کلیدهای hex (pii / cert salt / backup signing / samin)
openssl rand -hex 32
```

> اگر Node.js روی هاست نصب است، می‌توانید همان سیاست رسمی پروژه را هم بزنید:
> `node afagh-next/scripts/lib/secret-policy.mjs --check .env` (و `--gen` برای تولید).
> روی هاست‌هایی که فقط Docker دارند، از همان بررسی بالا + `docker compose config -q` استفاده کنید.

### ۱.۵) پشتیبان دیتابیس پیش از استقرار (اجباری)

دو لایه پشتیبان داریم:

1. **خودکار:** نخستین گام `migrator` پشتیبان `pg_dump -Fc` می‌گیرد و **fail-closed** است (بدون `pg_dump` استقرار متوقف می‌شود). پشتیبان در volume ماندگار `afagh_backups` روی مسیر `/backups` می‌ماند.
2. **دستی (توصیه‌شده، پیش از بیلد):** همان بلوک زیر.

```bash
cd /root/afagh
mkdir -p /var/backups/afagh-host && chmod 700 /var/backups/afagh-host

# گرفتن پشتیبان (اگر استک خواب است، «--no-deps» را بردارید تا postgres بالا بیاید)
docker compose run --rm --no-deps -e AFAGH_BACKUP_DIR=/backups -e AFAGH_BACKUP_KEEP=14 \
  migrator node scripts/backup-db.mjs

# راستی‌آزمایی (sha256 + pg_restore --list)
docker compose run --rm --no-deps -e AFAGH_BACKUP_DIR=/backups migrator node scripts/verify-backup.mjs

# بردن نسخه به بیرون از volume/سرور (NAS یا دیسک جداگانه)
docker compose run --rm --no-deps migrator sh -c 'cd /backups && tar cf - .' | tar xf - -C /var/backups/afagh-host
ls -lh /var/backups/afagh-host
```

> برای استقرار **تازه** (دیتابیس وجود ندارد) این گام لازم نیست؛ فقط به یاد داشته باشید `migrator` در اجرای اول هم `AFAGH_REQUIRE_BACKUP=1` است.

### ۱.۶) دریچهٔ ورود (Tailscale) و کوکی

اپ به‌طور پیش‌فرض فقط روی `127.0.0.1:8080` منتشر می‌شود. برای دسترسی از شبکهٔ تِیل‌اسکیل (`100.70.187.120`) یکی را انتخاب کنید:

**گزینهٔ الف — گره‌کردن فقط به IP تِیل‌اسکیل (تنگ‌ترین؛ توصیه‌شده):**

```bash
cd /root/afagh
grep -q '^APP_BIND=' .env && sed -i 's|^APP_BIND=.*|APP_BIND=100.70.187.120|' .env || echo 'APP_BIND=100.70.187.120' >> .env
grep -q '^APP_PORT=' .env || echo 'APP_PORT=8080' >> .env
```

**گزینهٔ ب — انتشار روی همهٔ اینترفیس‌ها + محدودسازی با فایروال روی `tailscale0`:**

```bash
cd /root/afagh
sed -i 's|^APP_BIND=.*|APP_BIND=0.0.0.0|' .env
ufw allow in on tailscale0 to any port 8080 proto tcp
ufw deny 8080/tcp          # بستن از اینترفیس عمومی (اگر سیاست ufw همین را می‌خواهد)
```

> ⚠️ **دام کوکی (مهم):** در `production` کوکی نشست **همیشه `Secure=true`** است مگر آنکه صریحاً `AFAGH_COOKIE_SECURE=false` بدهید.
> چون دسترسی روی Tailscale با `http://` است (نه HTTPS)، اگر `Secure=true` بماند مرورگر کوکی را ذخیره نمی‌کند و **ورود بی‌پایان تکراری می‌شود**.
> پس در حالت HTTP-over-Tailscale این خط را در `.env` بگذارید (رمزنگاری در لایهٔ WireGuard تأمین می‌شود):
>
> ```bash
> grep -q '^AFAGH_COOKIE_SECURE=' .env && sed -i 's|^AFAGH_COOKIE_SECURE=.*|AFAGH_COOKIE_SECURE=false|' .env || echo 'AFAGH_COOKIE_SECURE=false' >> .env
> ```
>
> اگر به‌جای آن HTTPS با دامنه (Caddy) می‌خواهید، `AFAGH_COOKIE_SECURE=true` را نگه دارید و `make up-https` را بزنید (به `DOMAIN` در `.env` و بازبودن ۸۰/۴۴۳ نیاز دارد).

همچنین نشانی عمومی را با همان روش دسترسی هم‌تراز کنید (مبنای QR گواهی و لینک‌های استعلام):

```bash
sed -i 's|^AFAGH_PUBLIC_BASE_URL=.*|AFAGH_PUBLIC_BASE_URL=http://100.70.187.120:8080|' .env
```

---

## ۲) متغیرهای لازم در `/root/afagh/.env`

### ۲.۱) اجباری‌هایی که Compose خودش می‌خواند (بدون آن‌ها `up` رد می‌شود)

| متغیر | حداقل | مصرف‌کننده | نکته |
|---|---|---|---|
| `POSTGRES_PASSWORD` | ۲۴ کاراکتر | سرویس `postgres` + `DATABASE_URL` | بدون آن compose رد می‌شود |
| `AFAGH_APP_DB_PASSWORD` | ۲۴ کاراکتر | `migrator` (ساخت/سخت‌سازی نقش `afagh_app`) و درون `DATABASE_URL_APP` برای اپ | به‌صورت متغیر مستقل فقط به `migrator` تزریق می‌شود؛ `hardening.mjs` آن را روی نقش اعمال می‌کند |
| **`REDIS_PASSWORD`** | **۲۴ کاراکتر** | سرویس `redis` (`--requirepass`) + `REDIS_URL` اپ | **اجباری و بحرانی**؛ بدون آن Redis بالا نمی‌آید |
| `MINIO_ROOT_PASSWORD` | ۱۶ کاراکتر | `minio` + `S3_SECRET_KEY` اپ | — |
| `APP_BIND` | — | نگاشت پورت `app` | پیش‌فرض `127.0.0.1`؛ برای Tailscale همان بخش ۱.۶ |
| `APP_PORT` | — | نگاشت پورت `app` | پیش‌فرض `8080` |

### ۲.۲) سکرت‌ها/متغیرهای فازهای امنیتی — ⚠️ نیازمند «تزریق» به کانتینر

این‌ها در `.env` **باید باشند**، اما نکتهٔ کلیدی این است که `docker-compose.yml` **پایه آن‌ها را به سرویس `app` عبور نمی‌دهد**
(چون فقط از طریق `x-common-env` تزریق می‌شوند و این کلیدها در آن لنگر نیستند). یعنی صرفِ گذاشتن‌شان در `.env` کافی نیست.

| متغیر | اجباری؟ | مصرف‌کننده | رفتار در نبودِ مقدار | ثبات |
|---|---|---|---|---|
| `REDIS_PASSWORD` | ✅ | Redis + اپ | compose رد می‌کند | چرخش دوره‌ای |
| `AFAGH_BACKUP_SIGNING_KEY` | ✅ (برای پشتیبان/بازیابی درون‌برنامه‌ای) | `backup-actions.ts` (اپ) | پشتیبان/بازیابی امضاشده **fail-closed** رد می‌شود | **تغییر ندهید** (پشتیبان‌های قدیمی بی‌اعتبار می‌شوند) |
| `AFAGH_CERT_SALT` | ✅ (برای صدور/اعتبارسنجی گواهی) | `certificate-engine.ts` (اپ) | در production صدور گواهی **fail-closed** متوقف می‌شود | **تغییر ندهید** (هش گواهی‌های صادرشده بی‌اعتبار می‌شود) |
| `AFAGH_PII_KEY` | ✅ (سیاست production) | `lib/pii.ts` | در production هر مسیر PII **fail-closed** خطا می‌دهد (۶۴ hex یا عبارت عبور بلند) | **تغییر ندهید** (کلید رمزنگاری کد ملی) |
| `AFAGH_PII_KEY_PREVIOUS` | اختیاری | `lib/pii.ts` | فقط در دورهٔ گردش کلید لازم است | موقت |
| `AFAGH_SESSION_MAX_HOURS` | اختیاری | `lib/auth.ts` | پیش‌فرض ۴ ساعت؛ بازهٔ مجاز ۱..۲۴ | در صورت نیاز |
| `AFAGH_BACKUP_DB_PASSWORD` | اختیاری (توصیه‌شده) | `hardening.mjs` (**migrator**) | نقش کم‌مجوز `afagh_backup` ساخته نمی‌شود (فقط هشدار) | ۹۰ روز |
| `DATABASE_URL_BACKUP` | اختیاری (توصیه‌شده) | `backup-actions.ts` (اپ) | پشتیبان/بازیابی با **استخر مالک** اجرا می‌شود (ریسک DDL) | هم‌گام با رمز بالا |
| `MOODLE_PULL_TOKENS` | اختیاری | `lib/lms-api.ts` (اپ) | اندپوینت `/api/lms` غیرفعال (۵۰۳) | provider |
| `MOODLE_PULL_UNIVERSITY` | اختیاری | `lib/lms-api.ts` (اپ) | فقط برای توکن تکیِ قدیمی لازم است | provider |

قالب `MOODLE_PULL_TOKENS`: `"tokA:AFAGH,tokB:ZARINE"` (هر توکن → یک کد دانشگاه). برای چند دانشگاه فعال، حتماً از این حالت استفاده کنید (وگرنه `/api/lms` با ۴۰۰ «چند دانشگاه فعال» رد می‌کند).

### ۲.۳) راه‌حل دقیق: فایل overlay فقط-میزبان

**`docker-compose.yml` را ویرایش نکنید** (فایل ردیابی‌شده است و با `git pull` از دست می‌رود). به‌جای آن، Compose را با یک overlay محلی تزریق کنید:

```bash
cd /root/afagh
cat > docker-compose.override.yml <<'YAML'
# ════════════════════════════════════════════════════════════════════
#  فایل فقط-میزبان (untracked) — نباید commit شود.
#  چرا؟ docker-compose.yml پایه این کلیدهای فاز ۱–۴ را به سرویس‌ها
#  تزریق نمی‌کند و صرفِ بودن‌شان در .env کافی نیست (جایگزینی ${VAR}
#  فقط جایی رخ می‌دهد که در environment سرویس تعریف شده باشد).
#  Compose این فایل را خودکار کنار docker-compose.yml می‌خواند.
# ════════════════════════════════════════════════════════════════════
services:
  app:
    environment:
      # با «:?» نبودِ مقدار = توقف استقرار با پیام روشن (fail-fast)
      AFAGH_BACKUP_SIGNING_KEY: ${AFAGH_BACKUP_SIGNING_KEY:?AFAGH_BACKUP_SIGNING_KEY در .env تنظیم نشده}
      AFAGH_CERT_SALT: ${AFAGH_CERT_SALT:?AFAGH_CERT_SALT در .env تنظیم نشده}
      AFAGH_PII_KEY: ${AFAGH_PII_KEY:?AFAGH_PII_KEY در .env تنظیم نشده}
      # اختیاری‌ها (خالی‌بودن یعنی «غیرفعال»)
      AFAGH_PII_KEY_PREVIOUS: ${AFAGH_PII_KEY_PREVIOUS:-}
      AFAGH_SESSION_MAX_HOURS: ${AFAGH_SESSION_MAX_HOURS:-4}
      DATABASE_URL_BACKUP: ${DATABASE_URL_BACKUP:-}
      MOODLE_PULL_TOKENS: ${MOODLE_PULL_TOKENS:-}
      MOODLE_PULL_UNIVERSITY: ${MOODLE_PULL_UNIVERSITY:-}
  migrator:
    environment:
      # نقش کم‌مجوز پشتیبان را می‌سازد (afagh_backup، NOBYPASSRLS و بدون DDL)
      AFAGH_BACKUP_DB_PASSWORD: ${AFAGH_BACKUP_DB_PASSWORD:-}
      AFAGH_BACKUP_DIR: /backups
YAML

# تا اشتباهی commit نشود (فقط تنظیم محلی، فایل ردیابی‌شده را تغییر نمی‌دهد)
grep -qxF 'docker-compose.override.yml' .git/info/exclude 2>/dev/null \
  || echo 'docker-compose.override.yml' >> .git/info/exclude
```

اگر می‌خواهید مسیر پشتیبان به‌جای volume روی دیسک میزبان باشد (توصیه برای نگه‌داری بیرون از داکر)، این بلوک را به همان overlay اضافه کنید:

```yaml
# این بلوک، جایگزین همان بلوک «migrator» در docker-compose.override.yml شود
  migrator:
    environment:
      AFAGH_BACKUP_DB_PASSWORD: ${AFAGH_BACKUP_DB_PASSWORD:-}
      AFAGH_BACKUP_DIR: /backups
    volumes:                                  # ← این خط به بلوک migrator اضافه می‌شود
      - /var/backups/afagh-host:/backups      # جایگزین volume «afagh_backups» برای مسیر /backups
```

> اگر عمداً نمی‌خواهید یکی از سه کلید fail-fast اجباری باشد (مثلاً قابلیت گواهی استفاده نمی‌شود)، در overlay آن را از `:?` به `:-` تغییر دهید؛ اما این تصمیم باید در `docs/DEPLOY-SECURITY-CHECKLIST.md` مستند شود.

### ۲.۴) نمونهٔ کامل مقادیر جدید برای `.env`

```bash
cd /root/afagh
cat >> .env <<EOF

# ── فازهای امنیتی FINAL (تزریق با docker-compose.override.yml) ──
AFAGH_BACKUP_SIGNING_KEY=$(openssl rand -hex 32)
AFAGH_CERT_SALT=$(openssl rand -hex 32)
AFAGH_PII_KEY=$(openssl rand -hex 32)
AFAGH_SESSION_MAX_HOURS=4
# نقش کم‌مجوز پشتیبان (اختیاری ولی توصیه‌شده)
AFAGH_BACKUP_DB_PASSWORD=$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)
DATABASE_URL_BACKUP=postgres://afagh_backup:PLACEHOLDER@postgres:5432/afagh_db
# Moodle pull (اختیاری — در صورت استفاده، نگه‌دارندهٔ PLACEHOLDER را با رمز واقعی و کدها را با مقادیر واقعی عوض کنید)
# MOODLE_PULL_TOKENS="tokA:AFAGH,tokB:ZARINE"
# MOODLE_PULL_UNIVERSITY=AFAGH
EOF
chmod 600 .env

# مقدار PLACEHOLDER بالا را با همان رمز AFAGH_BACKUP_DB_PASSWORD هم‌تراز کنید (بدون چاپ در تاریخچهٔ shell):
BK_PASS="$(grep '^AFAGH_BACKUP_DB_PASSWORD=' .env | cut -d= -f2-)"
sed -i "s|^DATABASE_URL_BACKUP=.*|DATABASE_URL_BACKUP=postgres://afagh_backup:${BK_PASS}@postgres:5432/afagh_db|" .env
unset BK_PASS
```

> ⚠️ **کلید PII را بعداً تغییر ندهید.** اگر پیش‌تر کدهای ملی به شکل پاکت `v1:<iv>:<tag>:<data>` ذخیره شده‌اند، با کلید جدید رمزگشایی نمی‌شوند. برای گردش کلید، ابتدا `AFAGH_PII_KEY_PREVIOUS` را با کلید قدیم ست کنید (در overlay)، سپس backfill و در پایان کلید قبلی را بردارید. اگر دادهٔ فعلی **متن ساده** است، پیش از ورود کلید جدید باید یک گام backfill یک‌باره (idempotent، `WHERE nationalCodeEnc IS NULL`) اجرا شود؛ این گام در `lib/pii.ts` طراحی شده و مستند نشده است — در صورت نیاز با تیم توسعه هماهنگ کنید و **در همین استقرار انجام ندهید**.

### ۲.۵) تأیید نهایی تزریق

```bash
cd /root/afagh
# بررسی حضور و غیرخالی‌بودن کلیدهای تزریقی — بدون چاپ مقدار سکرت‌ها
docker compose config | grep -E '^ +(AFAGH_CERT_SALT|AFAGH_PII_KEY|AFAGH_BACKUP_SIGNING_KEY|DATABASE_URL_BACKUP): .+' \
  && echo "✔ تزریق overlay برقرار است" || echo "✖ تزریق overlay ناقص است (بخش ۲.۳)"
docker compose config -q && echo "✔ compose + overlay بدون خطا"
```

---

## ۳) دستورهای دقیق استقرار

```bash
cd /root/afagh

# ۳.۱) بیلد ایمیج‌ها (app + migrator)
docker compose build
# روی سرور کم‌حافظه: NODE_MAX_OLD_SPACE=1536 در .env باشد، یا:
#   NODE_MAX_OLD_SPACE=1536 docker compose build
# بیلد بدونه‌کش (فقط وقتی لازم است):
#   docker compose build --no-cache

# ۳.۲) بالا آوردن کل سامانه
# ترتیب خودکار: postgres/redis/minio (healthy) → migrator (یک‌بار، باید exit 0) → app → scheduler
docker compose up -d

# ۳.۳) دیدن لاگ زندهٔ مهاجرت‌ها (۶ گام: پشتیبان → مهاجرت → پچ → seed → seed-saham → hardening → verify)
docker compose logs -f migrator
# خروجی موفق باید با «=== ✅ migrator با موفقیت تمام شد ===» بپوشد.
```

اجرای **صریح** migrator (اختیاری؛ فقط اگر می‌خواهید مهاجرت‌ها را جدا از `up` ببینید):

```bash
cd /root/afagh
docker compose up -d postgres redis minio
docker compose run --rm migrator          # معادل: make migrate
```

بررسی وضعیت و کد خروج migrator:

```bash
docker compose ps
docker inspect -f 'exitCode={{.State.ExitCode}}  status={{.State.Status}}' afagh_migrator   # باید exitCode=0
docker compose logs --tail=40 migrator
docker compose logs --tail=20 app
docker compose logs --tail=20 scheduler
```

سرویس‌های مورد انتظار در `docker compose ps`: `afagh_pg` (healthy)، `afagh_redis` (healthy)، `afagh_minio` (healthy)، `afagh_app` (healthy)، `afagh_scheduler` (running)، و `afagh_migrator` (**Exited (0)**).

> **دربارهٔ `up -d` و `migrator`:** سرویس `migrator` یک‌بارمصرف است و در هر `up -d` (و هر `--build`) دوباره اجرا می‌شود؛ اجرای آن idempotent است و هر بار پیش از مهاجرت یک پشتیبان تازه می‌گیرد.

---

## ۴) تأیید سلامت (Health Verification)

```bash
cd /root/afagh

# ۴.۱) اپ از روی خود سرور (loopback)
curl -sS -o /dev/null -w 'localhost   /login → %{http_code}\n' http://127.0.0.1:8080/login

# ۴.۲) اپ از مسیر تِیل‌اسکیل (اگر APP_BIND=100.70.187.120 یا 0.0.0.0 باشد)
curl -sS -o /dev/null -w 'tailscale   /login → %{http_code}\n' http://100.70.187.120:8080/login
# از یک ماشین دیگر در شبکهٔ تِیل‌اسکیل:  curl -sS -I http://100.70.187.120:8080/login

# ۴.۳) زیرساخت
docker compose exec -T postgres pg_isready -U afagh -d afagh_db
docker compose exec -T redis sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ping'   # PONG
curl -sS -o /dev/null -w 'minio       /health/live → %{http_code}\n' http://127.0.0.1:9000/minio/health/live

# ۴.۴) نقش‌های دیتابیس (RLS — باید afagh_app و afagh_backup بدون BYPASSRLS باشند)
docker compose exec -T postgres psql -U afagh -d afagh_db -tAc \
  "select rolname, rolbypassrls from pg_roles where rolname in ('afagh','afagh_app','afagh_backup') order by 1;"

# ۴.۵) تأیید تزریق متغیرهای کلیدی داخل کانتینر اپ (نباید «MISSING» ببینید)
docker compose exec -T app node -e "for (const k of ['REDIS_PASSWORD','AFAGH_BACKUP_SIGNING_KEY','AFAGH_CERT_SALT','AFAGH_PII_KEY','AFAGH_SESSION_MAX_HOURS','DATABASE_URL_BACKUP','MOODLE_PULL_TOKENS']) console.log(k.padEnd(28), process.env[k] ? 'set' : 'MISSING')"

# ۴.۶) نبود خطای بحرانی در لاگ‌ها
docker compose logs --since=10m app | grep -iE 'critical|fail-closed|AFAGH_CERT_SALT|AFAGH_PII_KEY|ECONNREFUSED' || echo "بدون خطای بحرانی"
docker compose logs --tail=50 scheduler | grep -iE '\[CRITICAL\]|\[ALERT\]' || echo "scheduler بدون هشدار بحرانی"
```

معیارهای پذیرش: `/login` روی loopback و Tailscale هر دو **200**، `exitCode=0` برای migrator، `PONG` از Redis، متغیرهای اجباری (به‌ویژه `AFAGH_CERT_SALT`، `AFAGH_PII_KEY`، `AFAGH_BACKUP_SIGNING_KEY`) همگی **set**، و هیچ خطای بحرانی در لاگ. (خالی‌بودن اختیاری‌ها مثل `MOODLE_PULL_TOKENS` عادی است.)

---

## ۵) بازگشت (Rollback)

### ۵.۱) جدول تصمیم

| وضعیت | اقدام |
|---|---|
| بیلد شکست خورد (`137`/OOM) | فقط منابع را اصلاح کنید (`scripts/ensure-build-memory.sh` + `NODE_MAX_OLD_SPACE=1536`)، دوباره بیلد کنید. چیزی تغییر نکرده. |
| `up -d` بالا نیامد و **migrator exitCode≠0** | اپ به‌خاطر `depends_on: service_completed_successfully` استارت **نخواهد** شد ⇒ بازگشت ۵.۲ (کد) و در صورت نیاز ۵.۳ (داده). |
| اپ بالا آمد ولی قابلیت‌ها خطا می‌دهند | ابتدا خطا را در لاگ بخوانید؛ معمولاً تزریق env ناقص است (بخش ۲). این «جلو-اصلاح» است، نه بازگشت. |
| داده بعد از مهاجرت ناسازگار/خراب شد | بازگشت ۵.۳ (بازیابی پشتیبان پیش‌از‌مهاجرت). |

### ۵.۲) بازگشت کد و ایمیج

```bash
cd /root/afagh
PREV="$(grep '^prev=' /root/afagh-deploy-*.txt | tail -1 | cut -d= -f2)"   # یا کامیت دلخواه
echo "بازگشت به: $PREV"
git checkout "$PREV"

# اگر هنگام پیش‌پرواز ایمیج قبلی را تگ کرده بودید، سریع و بدون بیلد برگردید:
docker image inspect afagh-app:prev >/dev/null 2>&1 \
  && { docker tag afagh-app:prev afagh-app:latest; docker compose up -d --no-build; } \
  || docker compose up -d --build
```

### ۵.۳) بازگشت داده (بازگشت از پشتیبان پیش از استقرار) — ⚠️ مخرب

```bash
cd /root/afagh
ls -l /var/backups/afagh-host                 # نام فایل: afagh-<YYYY-MM-DDTHH-MM-SS>.dump
STAMP_FILE=/var/backups/afagh-host/afagh-<STAMP>.dump    # ← نام دقیق را از ls بردارید

# ۱) اپ را از ترافیک بیرون بکشید (تا بازیابی با نوشتن هم‌زمان تلاقی نکند)
docker compose stop app scheduler

# ۲) بازیابی («--clean --if-exists» اشیای موجود را جایگزین می‌کند)
docker compose exec -T postgres pg_restore -U afagh -d afagh_db --clean --if-exists --no-owner < "$STAMP_FILE"

# ۳) برگرداندن کد/ایمیج سازگار (بخش ۵.۲) و بالا آوردن دوباره
docker compose up -d
docker compose logs --tail=40 migrator
curl -sS -o /dev/null -w '/login → %{http_code}\n' http://127.0.0.1:8080/login
```

سپس **فوراً** یک پشتیبان تازه بگیرید و رویداد را در `docs/INCIDENT-RESPONSE-RUNBOOK.md` ثبت کنید:

```bash
cd /root/afagh
docker compose run --rm --no-deps -e AFAGH_BACKUP_DIR=/backups migrator node scripts/backup-db.mjs
docker compose run --rm --no-deps -e AFAGH_BACKUP_DIR=/backups migrator node scripts/verify-backup.mjs
```

> ℹ️ اگر سرویس اپ در چرخهٔ بازگشت ری‌استارت خورد و پشتیبان/بازیابی از پنل مدیر لازم شد، به یاد داشته باشید در role جدید `afagh_backup` بازیابی از راه UI هم با همان `DATABASE_URL_BACKUP` کار می‌کند.
> برای غیرفعال‌کردن موقتی این مسیر، `DATABASE_URL_BACKUP` را از overlay بردارید (بلافاصله به استخر مالک برمی‌گردد).

---

## ۶) بررسی‌های پس از استقرار (Post-deploy)

```bash
cd /root/afagh

# ۶.۱) حساب مدیر اولیه (در استقرار تازه؛ رمز در فایل و در ترمینال چاپ نمی‌شود)
ls -l bootstrap-credential.txt 2>/dev/null && sed -n '1,3p' bootstrap-credential.txt
# اگر لازم شد یا چرخش رمز خواستید:
docker compose run --rm --no-deps migrator node scripts/create-admin.mjs --show   # = make admin
```

- [ ] ورود با حساب مدیر موفق؛ **تغییر رمز اجباری** در نخستین ورود انجام شد.
- [ ] `bootstrap-credential.txt` پس از تغییر رمز **پاک** شد: `rm -f /root/afagh/bootstrap-credential.txt`
- [ ] حساب‌های دمو در production وجود ندارند (`AFAGH_DEMO_MODE=0` و ایمیج با `AFAGH_DEMO_LOCK=1` بیلد شده).
- [ ] RLS تست شد (کارشناس مالی گروه A → دانشجوی گروه B باید رد شود). اجرای آزمون آماده:
      `docker compose run --rm --no-deps migrator node scripts/rls-test.mjs`
      و بررسی `AFAGH_OBJECT_SCOPE=department` (پیش‌فرض فاز ۲).
- [ ] CSRF تست شد (درخواست cross-origin → 403).
- [ ] قابلیت گواهی/تأیید مدرک کار می‌کند (نیازمند `AFAGH_CERT_SALT`): صفحهٔ `/verify-degree/<code>` بارگذاری می‌شود.
- [ ] پشتیبان/بازیابی درون‌برنامه‌ای از پنل مدیر کار می‌کند (نیازمند `AFAGH_BACKUP_SIGNING_KEY`؛ در نبودش خطای صریح می‌دهد).
- [ ] پویش‌ها فعال‌اند: `docker compose logs --tail=50 scheduler` بدون خطای بحرانی.
- [ ] کلیدهای پویش همان‌جایی تولید شده‌اند که scheduler می‌خواند (فقط در صورت نیاز به بازرسی؛ حساس است):
      `docker compose run --rm --no-deps migrator sh -c 'cat /secrets/cron.env'`
- [ ] پشتیبان تازه پس از استقرار گرفته و بیرون برده شد:
      `docker compose run --rm --no-deps -e AFAGH_BACKUP_DIR=/backups migrator node scripts/backup-db.mjs && docker compose run --rm --no-deps migrator sh -c 'cd /backups && tar cf - .' | tar xf - -C /var/backups/afagh-host`
- [ ] زمان‌بند روزانهٔ پشتیبان روی هاست ثبت شد (نمونه، خارج از کانتینر):

```bash
cat >/etc/cron.d/afagh-backup <<'CRON'
# پشتیبان روزانهٔ آفاق (۲:۳۰ بامداد) + کپی بیرون از داکر در ۳:۰۰
30 2 * * * root cd /root/afagh && docker compose run --rm --no-deps -e AFAGH_BACKUP_DIR=/backups migrator node scripts/backup-db.mjs >/var/log/afagh-backup.log 2>&1
0  3 * * * root cd /root/afagh && docker compose run --rm --no-deps migrator sh -c 'cd /backups && tar cf - .' | tar xf - -C /var/backups/afagh-host
CRON
chmod 644 /etc/cron.d/afagh-backup
```

- [ ] `make drill` (آزمون بازیابی) ماهی یک‌بار در تقویم ثبت شد:
      `docker compose run --rm --no-deps -e AFAGH_BACKUP_DIR=/backups migrator node scripts/verify-backup.mjs --restore-db afagh_drill`

---

## ۷) پیوست

### ۷.۱) میان‌بُرهای Makefile (اگر `make` روی هاست هست)

| دستور | معادل دقیق |
|---|---|
| `make ps` | `docker compose ps` |
| `make logs` | `docker compose logs -f --tail=100 app` |
| `make health` | `docker compose ps` + `curl /login` |
| `make backup` | `docker compose run --rm --no-deps -e AFAGH_BACKUP_DIR=/backups -e AFAGH_BACKUP_KEEP=14 migrator node scripts/backup-db.mjs` |
| `make verify-backup` | `docker compose run --rm --no-deps -e AFAGH_BACKUP_DIR=/backups migrator node scripts/verify-backup.mjs` |
| `make drill` | `… verify-backup.mjs --restore-db afagh_drill` |
| `make migrate` | `docker compose run --rm migrator` |
| `make admin` | `docker compose run --rm --no-deps migrator node scripts/create-admin.mjs --show` |
| `make copy-backups-to-host DEST=/mnt/nas/afagh` | `docker compose run --rm --no-deps migrator sh -c 'cd /backups && tar cf - .' \| tar xf - -C /mnt/nas/afagh` |
| `make restart` | `docker compose restart app` |

> ⚠️ `make check-env` و `make env` به **Node.js روی هاست** نیاز دارند. روی سرورهای Docker-only از بررسی بخش ۱.۴ و `docker compose config -q` استفاده کنید.

### ۷.۲) عیب‌یابی سریع

| نشانه | ریشهٔ محتمل | راه‌حل |
|---|---|---|
| `docker compose up` با پیام فارسی «… تنظیم نشده» رد می‌شود | `.env` ناقص | بخش ۱.۴ و ۲.۱ |
| بیلد با `exit code: 137` می‌میرد | کمبود RAM/swap | `sudo bash scripts/ensure-build-memory.sh` + `NODE_MAX_OLD_SPACE=1536` |
| `migrator` با کد ۱ تمام می‌شود و پیام «پشتیبان» می‌دهد | `pg_dump` در دسترس نیست یا سرور PG بالا نیست | `docker compose logs migrator`؛ قبل از bypass (`AFAGH_SKIP_BACKUP=1`) با تیم امنیت هماهنگ کنید |
| `afagh_app` بالا نمی‌آید، `up` می‌گوید `dependency failed to start: service migrator` | مهاجرت شکست خورده | `docker compose logs migrator` → رفع خطا → `docker compose run --rm migrator` |
| ورود انجام می‌شود ولی کوکی ذخیره نمی‌شود/حلقهٔ ورود | `AFAGH_COOKIE_SECURE=true` روی `http://` | بخش ۱.۶ → `AFAGH_COOKIE_SECURE=false` (یا HTTPS) و `docker compose up -d` |
| `/api/lms` → ۵۰۳ | `MOODLE_PULL_TOKENS` تزریق نشده | overlay را بررسی و `docker compose up -d app` |
| `/api/lms` → ۴۰۰ «چند دانشگاه فعال» | نبود `MOODLE_PULL_UNIVERSITY` با توکن تکی | از قالب `MOODLE_PULL_TOKENS="tok:UNI,…"` استفاده کنید |
| صدور گواهی خطای fail-closed | `AFAGH_CERT_SALT` تزریق نشده | overlay + `docker compose up -d app` |
| پشتیبان از پنل مدیر رد می‌شود | `AFAGH_BACKUP_SIGNING_KEY` تزریق نشده | overlay + `docker compose up -d app` |
| پورت ۸۰۸۰ اشغال است | سرویس قدیمی | `ss -ltnp \| grep 8080` و کانتینر/سرویس مزاحم را ببندید |
| دسترسی Tailscale برقرار نیست | `APP_BIND=127.0.0.1` | بخش ۱.۶ (گزینهٔ الف یا ب) + بازکردن ufw روی `tailscale0` |

### ۷.۳) پیش/پس از استقرار — چک‌لیست یک‌صفحه‌ای

```
[ ] git pull --ff-only origin FINAL  (HEAD == 9047ccb)
[ ] docker compose config -q
[ ] سکرت‌های ۱.۴ همه OK
[ ] overlay تزریق env ساخته و در .git/info/exclude
[ ] پشتیبان پیش از استقرار + verify + کپی بیرون
[ ] docker compose build
[ ] docker compose up -d
[ ] Migrator exitCode=0
[ ] /login روی loopback و Tailscale = 200
[ ] Redis PONG، MinIO live، نقش‌ها بدون BYPASSRLS
[ ] متغیرهای اپ همه «set»
[ ] ورود مدیر + تغییر رمز + حذف bootstrap-credential.txt
[ ] RLS/CSRF تست شد
[ ] پشتیبان پس از استقرار + بیرون بردن
[ ] cron پشتیبان روزانه ثبت شد
[ ] ثبت رویداد استقرار در دفتر (کامیت، زمان، اپراتور)
```

---

**امضا**

| نقش | نام | تاریخ | امضا |
|---|---|---|---|
| اپراتور استقرار | | | |
| مسئول امنیت | | | |
| مسئول دانشگاه (ذی‌نفع) | | | |

> این سند کنار `docs/DEPLOY-SECURITY-CHECKLIST.md` در دفتر استقرار بایگانی شود. هر انحراف از گام‌ها باید با دلیل و تأیید مسئول امنیت ثبت گردد.
