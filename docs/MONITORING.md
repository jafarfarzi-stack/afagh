# پایش و هشدار (Monitoring & Alerting)

> **نسخهٔ سند:** 1.0 — **تاریخ:** 2026-10-19  
> **دامنهٔ اعمال:** استقرارهای پروداکشن سامانهٔ آفاق  
> **مکمل:** `INCIDENT-RESPONSE-RUNBOOK.md` · `DEPLOY-SECURITY-CHECKLIST.md` · `BACKUP-DR-REVIEW.md` · `SECURITY-POLICY.md`

این سند تعریف می‌کند **چه چیزی** را پایش کنیم، **با چه آستانه‌ای** هشدار بدهیم، و **چگونه** سلامت‌سنجی را به load-balancer و سیستم هشدار وصل کنیم. هدف: تشخیص پیش از آنکه کاربران متوجه شوند.

---

## ۱) نمای کلی اجزا

| جزء | کانتینر | نقش در سلامت سامانه |
|---|---|---|
| اپ Next.js | `afagh_app` | سرویس وب (`:8080`) — تنها ورودی کاربران |
| PostgreSQL | `afagh_pg` | منبع اصلی داده (نمرات، مالی، اسناد) |
| Redis | `afagh_redis` | نرخ‌محدودسازی، قفل نشست، اتاق انتظار انتخاب واحد |
| MinIO / Object Storage | `afagh_minio` | بایگانی فایل و اسناد (`S3_BUCKET`) |
| زمان‌بند | `afagh_scheduler` | فراخوانی `/api/cron/*` (یادآوری چک، فارغ‌التحصیلی، BI، هشدارها) |

نقطهٔ تجمیع وضعیت، endpoint **`GET /api/health`** است (بدون احراز هویت، بدون افشای سکرت).

---

## ۲) چه چیزی را پایش کنیم

| # | شاخص | روش پایش | بازهٔ پیشنهادی |
|---|---|---|---|
| ۱ | دسترس‌پذیری اپ | `GET /api/health` → `ok:true` و کد `200` | ۳۰ ثانیه |
| ۲ | دیتابیس | فیلد `checks.db` در خروجی health | ۳۰ ثانیه |
| ۳ | Redis | فیلد `checks.redis` (اگر `REDIS_URL` تنظیم است) | ۶۰ ثانیه |
| ۴ | Object Storage | فیلد `checks.minio` (اگر `S3_ENDPOINT`/`S3_BUCKET` تنظیم است) | ۶۰ ثانیه |
| ۵ | نرخ خطای ۵xx | لاگ JSON؛ `level:"error"` و `route` | ۱–۵ دقیقه |
| ۶ | خطاهای امنیتی | تگ‌های `[csrf]`، `[scope]`، `auth_*` در لاگ | ۵ دقیقه |
| ۷ | زمان‌بند (cron) | خطوط `[ALERT]` / `[CRITICAL]` در لاگ `afagh_scheduler` | ۵ دقیقه |
| ۸ | فضای دیسک | volumeهای `afagh_pg`، `afagh_minio`، `afagh_uploads`، `afagh_backups` | ۵ دقیقه |
| ۹ | تازگی پشتیبان | فایل `LATEST` و سن آخرین dump در `afagh_backups` | ۱ ساعت |
| ۱۰ | منابع کانتینر | CPU/حافظهٔ `afagh_app` (و `restart` مکرر) | ۱ دقیقه |
| ۱۱ | ارتباطات DB | تعداد اتصال‌های فعال نسبت به سقف (pool: `max:20` + `appPool: max:10`) | ۱ دقیقه |
| ۱۲ | گواهی TLS | روزهای باقی‌مانده تا انقضای دامنه (پشت Caddy/Nginx) | روزانه |
| ۱۳ | ورود ناموفق / قفل حساب | شمارش رویدادهای `auth` و rate-limit | ۵ دقیقه |

---

## ۳) آستانه‌های هشدار

| شاخص | هشدار (Warning) | بحرانی (Critical) | اقدام |
|---|---|---|---|
| `/api/health` کد پاسخ | یک بار `503` | ۳ بار پیاپی `503` در ۹۰ ثانیه | `INCIDENT-RESPONSE-RUNBOOK` — بررسی `checks` |
| `checks.db` | — | `down` در ۲ بررسی پیاپی | بررسی `afagh_pg`، فضای دیسک، قفل‌ها |
| `checks.redis` | `down` موقت (< ۵ دقیقه) | `down` بیش از ۵ دقیقه | Redis بالا نیست؛ انتخاب واحد/ورود کند می‌شود |
| `checks.minio` | — | `down` بیش از ۱۰ دقیقه | بایگانی اسناد و پیش‌نمایش فایل از کار می‌افتد |
| خطای ۵xx اپ | نرخ > ۱٪ درخواست‌ها | نرخ > ۵٪ یا انفجار ناگهانی | لاگ `level:"error"` را با `rid` ردگیری کنید |
| خط `[ALERT]` زمان‌بند | ۱ بار | ۲ بار یا تکرار در دو بازهٔ پیاپی | کلید پویش/endpoint را بررسی کنید |
| خط `[CRITICAL]` زمان‌بند | — | هر بار | `401/403/404` یعنی کلید یا مسیر غلط است |
| فضای دیسک | > ۷۵٪ | > ۹۰٪ | پاکسازی/آرشیو؛ پشتیبان‌ها را بیرون ببرید |
| سن آخرین پشتیبان | > ۲۶ ساعت | > ۵۰ ساعت | `make backup` را بررسی کنید |
| گواهی TLS | < ۲۱ روز | < ۷ روز | تمدید گواهی |

> **قاعدهٔ کلی:** «بحرانی» یعنی کاربر اثر می‌بیند؛ «هشدار» یعنی روند بد است ولی سرویس هنوز سالم است.

---

## ۴) اتصال healthcheck به Load-Balancer / Reverse-Proxy

### شکل پاسخ `/api/health`

```json
{
  "ok": true,
  "checks": { "db": "ok", "redis": "ok", "minio": "ok" },
  "version": "1.0.0"
}
```

- مقادیر هر جزء: `ok` | `down` | `skipped`.
- `skipped` یعنی آن زیرساخت پیکربندی نشده است (مثلاً `REDIS_URL` تنظیم نیست) و در قضاوت سلامت دخالت ندارد.
- کد پاسخ: `200` وقتی `ok:true`؛ در غیر این صورت `503`.
- **بدون احراز هویت** — LB باید بدون کوکی/توکن به آن دسترسی داشته باشد. هیچ رمز، رشتهٔ اتصال یا پیام خطای خامی برنمی‌گردد.

### آزمون دستی

```bash
curl -fsS http://127.0.0.1:8080/api/health | jq .
# فقط کد وضعیت:
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/api/health
```

### نمونهٔ healthcheck داکر (برای سرویس app)

در `docker-compose.yml` می‌توانید به سرویس `app` اضافه کنید:

```yaml
healthcheck:
  test: ['CMD-SHELL', 'wget -q -O /dev/null http://127.0.0.1:8080/api/health || exit 1']
  interval: 15s
  timeout: 5s
  retries: 3
  start_period: 40s
```

### نمونهٔ Nginx (upstream فعال/غیرفعال)

```nginx
location = /api/health {
  proxy_pass http://127.0.0.1:8080;
  access_log off;
}
```

```bash
curl -fsS http://127.0.0.1:8080/api/health || exit 1
```

اگر پشت Caddy/Nginx از failover استفاده می‌کنید، مسیر `/api/health` را **بدون ورود** و **بدون کش** نگه دارید (پاسخ با `cache-control: no-store` می‌آید).

### توصیه‌های پارامتر

| پارامتر | مقدار پیشنهادی | توضیح |
|---|---|---|
| `interval` | ۱۰–۳۰ ثانیه | هر بررسی شامل پینگ DB و به‌صورت اختیاری Redis/MinIO است |
| `timeout` | ۳–۵ ثانیه | داخلی هر بررسی ۳ ثانیه مهلت دارد؛ مقدار بیرونی را بزرگ‌تر بگیرید |
| `retries` / threshold | ۳ | از هشدار نویزیِ لرزش‌های گذرا جلوگیری می‌کند |
| کاربرد در LB | فقط `/api/health` | صفحات کاربر را healthcheck نکنید (ورود/ریدایرکت لازم دارند) |

---

## ۵) هشدار خطا (Error Alert Hook) — `LOG_ALERT_WEBHOOK`

اگر متغیر محیطی `LOG_ALERT_WEBHOOK` روی یک URL از نوع `http/https` تنظیم شود، **هر `logger.error()`** یک درخواست POST **آتش-و-فراموش** (بدون بلاک‌کردن درخواست، بدون `await`) به آن می‌فرستد.

بدنهٔ ارسالی (نمونه):

```json
{
  "level": "error",
  "msg": "db_connection_failure",
  "timestamp": "2026-10-19T12:00:00.000Z",
  "fields": { "mod": "db", "code": "CONNECTION_LOST" }
}
```

تضمین‌های امنیتی و عملیاتی:

- بدنه با `maskSecrets`/`maskString` پاک‌سازی می‌شود: رمز، توکن، کوکی، کد ملی، موبایل، ایمیل و مبلغِ کلیددار خارج نمی‌شود.
- هیچ‌وقت `throw` نمی‌کند و هیچ‌وقت پاسخ کاربر را معطل نمی‌کند.
- شکستِ ارسال هشدار، **لاگ نمی‌شود** تا حلقهٔ هشدار-بی‌پایان نسازد.
- مهلت ارسال با `LOG_ALERT_TIMEOUT_MS` قابل تنظیم است (پیش‌فرض ۳۰۰۰ms).
- URL وب‌هوک هرگز در payload یا لاگ ظاهر نمی‌شود.

پیکربندی:

```bash
# .env روی سرور
LOG_ALERT_WEBHOOK=https://hooks.example.com/afagh-errors   # Slack/Teams/ربات دلخواه
# LOG_ALERT_TIMEOUT_MS=3000
```

> اگر سیستم هشدار، خودش با خطای اپ از کار بیفتد، `logger` سالم می‌ماند؛ هشدار فقط یک مزیت افزوده است.

---

## ۶) محل لاگ‌ها و ساختار آن‌ها

- درایور لاگ compose: `json-file` با `max-size: 10m` و `max-file: 5` (چرخش خودکار).
- مسیر روی میزبان: `docker inspect --format '{{.LogPath}}' <container>` (معمولاً زیر `/var/lib/docker/containers/...`).

```bash
make logs          # لاگ زندهٔ سرویس وب
make logs-all      # لاگ همهٔ سرویس‌ها
docker compose logs -f --tail=200 app
docker compose logs -f --tail=200 scheduler
docker inspect --format '{{.LogPath}}' afagh_app
```

ساختار هر خط (پیش‌فرض `json`): `level`، `time`، `app`، `env`، `msg` و فیلدهای زمینه (`rid`، `route`، `method`، `ms`، `status`، `err`).

| ENV | مقدارها | پیش‌فرض |
|---|---|---|
| `LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error` | `info` |
| `LOG_FORMAT` | `json` \| `pretty` | `json` در production |
| `LOG_APP_NAME` | متن | `afagh` |

تگ‌های مهم برای جست‌وجو: `[csrf]`، `[scope]`، `[scheduler]`، `[ALERT]`، `[CRITICAL]`.

### ارسال به Loki/ELK (اختیاری)

چون خروجی «یک خط = یک JSON» است، می‌توانید لاگر داکر را به یک جمع‌کننده وصل کنید بدون تغییر کد:

```bash
# نمونهٔ جست‌وجوی خطاها با jq
docker compose logs --no-color app | jq -c 'select(.level=="error")'
```

---

## ۷) پایش cron و زمان‌بند

سرویس `afagh_scheduler` حلقهٔ فراخوانی پویش‌ها را می‌گرداند. مسیرهای زیر با هدر `x-cron-secret` و متد **POST** صدا زده می‌شوند:

| پویش | مسیر | ENV فاصله (دقیقه) |
|---|---|---|
| یادآوری چک | `/api/cron/cheque-reminders` | `CHEQUE_REMIND_INTERVAL_MIN` (۶۰) |
| پویش فارغ‌التحصیلی | `/api/cron/graduation-scan` | `GRAD_SCAN_INTERVAL_MIN` (۱۴۴۰) |
| تازه‌سازی BI | `/api/cron/bi-refresh` | `BI_REFRESH_INTERVAL_MIN` (۷۲۰) |
| رویدادهای گردش کار | `/api/cron/workflow-events` | `WORKFLOW_EVENTS_INTERVAL_MIN` (۶۰) |
| تبریک‌های خودکار | `/api/cron/greetings` | `GREETINGS_INTERVAL_MIN` (۱۴۴۰) |
| هشدارهای زمان‌بندی‌شده | `/api/cron/scheduled-warnings` | `SCHED_WARNINGS_INTERVAL_MIN` (۱۵) |
| پاکسازی لینک پیام‌رسان | `/api/cron/messenger-link-purge` | `MSG_LINK_PURGE_INTERVAL_MIN` (۱۴۴۰) |

دسته‌بندی خطا در زمان‌بند:

- `ok` → سالم، موعد بعدی جلو می‌رود.
- `retryable` (۵xx/تایم‌اوت) → تلاش دوباره پس از `SCHEDULER_RETRY_MIN`؛ بعد از `SCHEDULER_FAIL_ALERT_AT` شکست پیاپی، خط **`[ALERT]`** چاپ می‌شود.
- `permanent` (`401/403/404/405`) → **`[CRITICAL]`** فوری و صبر تا بازهٔ عادی؛ یعنی کلید پویش یا مسیر غلط است.

### هشدار روی خطوط زمان‌بند

```bash
# هر Tick دنبال ALERT/CRITICAL بگردید
docker compose logs --no-color --since 5m scheduler | grep -E '\[ALERT\]|\[CRITICAL\]'
```

اگر از لاگ‌بردار (Promtail/Filebeat) استفاده می‌کنید، روی الگوهای `[ALERT]` و `[CRITICAL]` هشدار بگذارید. کلید هر پویش در volume `/secrets/cron.env` نگه‌داری می‌شود؛ خالی‌بودن یک کلید در استارت با خط `هشدار:` اعلام می‌شود.

### تعداد و فاصلهٔ پویش‌ها

```bash
docker compose logs --tail=50 scheduler | grep '\[scheduler\]'
```

---

## ۸) چک‌لیست سریع عملیات

- [ ] `GET /api/health` روی میزبان و از بیرون (دامنه) پاسخ `200` می‌دهد.
- [ ] LB فقط روی `/api/health` سلامت‌سنجی می‌کند و `503` را از سرویس بیرون می‌گذارد.
- [ ] هشدار روی ۳ بار پیاپی `503`، `checks.db == down`، و خطوط `[ALERT]/[CRITICAL]` تنظیم است.
- [ ] `LOG_ALERT_WEBHOOK` تنظیم و با یک خطای آزمایشی صحت‌سنجی شده است (بدون دادهٔ واقعی).
- [ ] فضای دیسک، سن پشتیبان، و انقضای TLS پایش می‌شوند.
- [ ] لاگ‌ها به یک مقصد ماندگار (Loki/ELK/NAS) فرستاده می‌شوند، نه فقط دیسک محلی.
- [ ] در هر هشدار، `rid` خطا را در RUNBOOK حادثه ردگیری می‌کنید.

---

## ۹) مرجع متغیرهای محیطی

| ENV | نقش | پیش‌فرض |
|---|---|---|
| `LOG_LEVEL` | حد آستانهٔ لاگ | `info` |
| `LOG_FORMAT` | قالب خروجی | `json` (production) |
| `LOG_APP_NAME` | نام اپ در لاگ | `afagh` |
| `LOG_ALERT_WEBHOOK` | مقصد هشدار خطا (اختیاری) | — |
| `LOG_ALERT_TIMEOUT_MS` | مهلت ارسال هشدار | `3000` |
| `REDIS_URL` | اتصال Redis (فعال‌سازی بررسی `checks.redis`) | — |
| `S3_ENDPOINT` / `S3_BUCKET` | اتصال Object Storage (فعال‌سازی `checks.minio`) | — |
| `AFAGH_VERSION` / `APP_VERSION` | رشتهٔ نسخه در `/api/health` | `npm_package_version` یا `dev` |
