# رویهٔ چرخش سکرت‌ها (Secrets Rotation Procedure)

> **نسخهٔ سند:** 1.0 — **تاریخ:** 2026-10-19  
> **دامنه:** استقرار پروداکشن سامانهٔ آفاق  
> **مکمل:** `SECURITY-POLICY.md` · `INCIDENT-RESPONSE-RUNBOOK.md` · `DEPLOY-SECURITY-CHECKLIST.md`

این سند، **چه سکرت‌هایی** در سامانهٔ آفاق وجود دارند، **چه زمانی** باید چرخیده شوند، و **چگونه** به‌صورت امن چرخش داده شوند را تعریف می‌کند.  
سیاست طول/ساختار سکرت‌ها در `afagh-next/scripts/lib/secret-policy.mjs` (تنها منبع حقیقت) تعریف شده است.

---

## ۱) فهرست سکرت‌ها (Inventory)

| # | سکرت | محل استفاده | حداقل طول | تولید | دورهٔ چرخش پیشنهادی |
|---|---|---|---|---|---|
| 1 | `POSTGRES_PASSWORD` (رمز مالک DB) | `postgres` container, `DATABASE_URL` | ۲۴ | `secret-policy --gen` | ۹۰ روز یا پس از حادثه |
| 2 | `AFAGH_APP_DB_PASSWORD` (نقش `afagh_app`) | migrator hardening, `DATABASE_URL_APP` | ۲۴ | `secret-policy --gen` | ۹۰ روز یا پس از حادثه |
| 3 | `REDIS_PASSWORD` | redis container, `REDIS_URL` | ۲۴ | `secret-policy --gen` | ۹۰ روز |
| 4 | `MINIO_ROOT_PASSWORD` | minio container, `S3_SECRET_KEY` | ۱۶ | `secret-policy --gen` | ۹۰ روز |
| 5 | `MINIO_ROOT_USER` | minio container, `S3_ACCESS_KEY` | — (نام کاربری) | دستی (نه پیش‌فرض `afagh`) | در صورت نیاز |
| 6 | `AFAGH_BACKUP_SIGNING_KEY` | امضای HMAC پشتیبان‌ها | ۳۲ | `openssl rand -hex 32` | **تغییر ندهید** مگر در حادثه (پشتیبان‌های قدیمی بی‌اعتبار می‌شوند) |
| 7 | `SAMIN_MASTER_KEY` | رمزنگاری AES-256-GCM اسرار ثمین | ۶۴ hex | `openssl rand -hex 32` | **تغییر ندهید** مگر در حادثه (دادهٔ رمزنگاری‌شدهٔ قبلی غیرقابل رمزگشایی) |
| 8 | `AFAGH_CERT_SALT` | هش اعتبارسنجی گواهی‌ها | بلند (≥ ۳۲) | `openssl rand -hex 32` | **تغییر ندهید** (گواهی‌های صادرشدهٔ قبلی بی‌اعتبار می‌شوند) |
| 9 | `AFAGH_OTP_PEPPER` | امضای OTP الکترونیک | بلند | `openssl rand -hex 32` | ۱۸۰ روز یا پس از حادثه |
| 10 | `TICKET_TOKEN_SECRET` | امضای HMAC توکن کارت/انتخاب حساب | بلند | `openssl rand -hex 32` | ۹۰ روز (با `PREVIOUS_TICKET_TOKEN_SECRET` برای گذار) |
| 11 | `PREVIOUS_TICKET_TOKEN_SECRET` | گذار چرخش token | بلند | مقدار قبلی `TICKET_TOKEN_SECRET` | موقت (یک دورهٔ نشست) |
| 12 | `BI_CRON_SECRET`, `GRADUATION_SCAN_CRON_SECRET`, `WORKFLOW_EVENTS_CRON_SECRET`, `GREETINGS_CRON_SECRET`, `MSG_LINK_CRON_SECRET`, `SCHED_WARN_CRON_SECRET`, `FINANCE_CRON_SECRET` | cron endpointها | ۴۸ hex (خودکار) | migrator (خودکار) یا ENV | ۱۸۰ روز یا پس از نشت |
| 13 | کلیدهای بیرونی (SMS, Payment, BBB, Moodle, Irandoc, KYC, Shaparak, Sajjad) | سرویس‌های third-party | بسته به provider | provider | طبق سیاست provider |
| 14 | `AFAGH_SESSION_MAX_HOURS` (نه سکرت، اما کنترل امنیتی) | سقف نشست | عدد | دستی | در صورت نیاز |

**سکرت‌های «پایدار» (تغییر آن‌ها اثر جانبی بزرگ دارد):** `AFAGH_BACKUP_SIGNING_KEY`, `SAMIN_MASTER_KEY`, `AFAGH_CERT_SALT`. این‌ها را **فقط در حادثه یا با برنامهٔ مهاجرت** چرخش دهید.

---

## ۲) اصول کلی چرخش (General Principles)

1. **هرگز** سکرت را در commit، issue، لاگ یا کانال عمومی قرار ندهید.  
2. **پشتیبان بگیرید** پیش از چرخش (پشتیبان DB + snapshot .env).  
3. **پنجرهٔ تغییر** را انتخاب کنید (ترجیحاً خارج از ساعات اوج).  
4. **گذار (grace period)** را پیش‌بینی کنید (مثلاً `PREVIOUS_TICKET_TOKEN_SECRET`).  
5. **تأیید** پس از چرخش: `make check-env`, `make health`, تست عملیات حساس.  
6. **ثبت** در دفتر چرخش سکرت (بخش ۸).  
7. **ابطال** سکرت قدیمی پس از تأیید (نه قبل از آن).  

---

## ۳) رویهٔ عمومی چرخش (Generic Rotation Steps)

```text
1. اعلام پنجرهٔ تغییر + فرماندهٔ حادثه (در صورت حادثه)
2. پشتیبان: make backup && make copy-backups-to-host
3. snapshot .env: cp .env .env.bak.<date> (chmod 600)
4. تولید سکرت جدید
5. به‌روزرسانی .env
6. make check-env
7. اعمال (restart/rebuild/migrate) 
8. تأیید (health + تست)
9. ابطال سکرت قدیمی (در صورت نیاز)
10. ثبت در دفتر چرخش
11. حذف snapshot .env.bak پس از ۷ روز (امن)
```

---

## ۴) چرخش سکرت‌های دیتابیس (DB Passwords)

### ۴.۱) `POSTGRES_PASSWORD` (مالک)

1. تولید: `node afagh-next/scripts/lib/secret-policy.mjs --gen`  
2. پشتیبان DB: `make backup`  
3. به‌روزرسانی `.env`: `POSTGRES_PASSWORD=<جدید>`  
4. `make check-env`  
5. اجرای مهاجرت/هاردنینگ (migrator رمز مالک را از `.env` می‌گیرد):  
   ```bash
   make migrate
   ```
6. ری‌استارت app (DATABASE_URL از .env می‌آید):  
   ```bash
   make restart   # یا docker compose up -d app
   ```
7. تأیید: `make health`, ورود, عملیات DB.  
8. تغییر رمز در PostgreSQL (در صورتی که migrator خودکار انجام نداد):  
   ```bash
   docker compose exec postgres psql -U afagh -d afagh_db -c "ALTER USER afagh WITH PASSWORD '<جدید>';"
   ```
9. حذف snapshot `.env.bak`.

### ۴.۲) `AFAGH_APP_DB_PASSWORD` (نقش محدود)

1. تولید سکرت جدید.  
2. `.env` را به‌روزرسانی کنید.  
3. `make check-env`  
4. migrator رمز را روی نقش `afagh_app` اعمال می‌کند:  
   ```bash
   make migrate
   ```
5. app `DATABASE_URL_APP` را از .env می‌گیرد → ری‌استارت app:  
   ```bash
   docker compose up -d app
   ```
6. تأیید: عملیاتی که RLS دارند (مثلاً کارنامه) کار می‌کنند.

---

## ۵) چرخش Redis

1. تولید سکرت جدید.  
2. `.env`: `REDIS_PASSWORD=<جدید>`  
3. `make check-env`  
4. ری‌استارت redis + app:  
   ```bash
   docker compose up -d redis app
   ```
5. تأیید: `make ps`, لاگ app بدون خطای اتصال Redis.  
   ```bash
   docker compose exec redis sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ping'
   ```

---

## ۶) چرخش MinIO (Object Storage)

1. تولید رمز جدید (`MINIO_ROOT_PASSWORD`).  
2. `.env` به‌روزرسانی.  
3. `make check-env`  
4. ری‌استارت minio + app:  
   ```bash
   docker compose up -d minio app
   ```
5. تأیید: آپلود/دانلود مدرک در اپ.  
6. **توجه:** تغییر `MINIO_ROOT_USER` نیاز به ایجاد کاربر جدید در MinIO دارد؛ ترجیحاً فقط رمز را چرخش دهید.

---

## ۷) چرخش کلیدهای Cron (پویش‌ها)

کلیدهای cron به دو صورت مدیریت می‌شوند:

- **ENV override:** اگر در `.env` ست شوند، migrator آن‌ها را در DB ثبت و در volume `/secrets/cron.env` می‌نویسد (ENV مقدم است).  
- **خودکار:** اگر خالی باشند، migrator مقدار تصادفی ۴۸-hex می‌سازد.

**رویهٔ چرخش:**

1. برای هر کلید، مقدار جدید را در `.env` بگذارید (یا برای چرخش خودکار، volume را پاک کنید — توصیه نمی‌شود).  
   ```bash
   # مثال
   BI_CRON_SECRET=<جدید 48-hex>
   ```
2. اجرای migrator (به‌روزرسانی DB + volume):  
   ```bash
   make migrate
   ```
3. ری‌استارت scheduler (فایل `/secrets/cron.env` را در startup می‌خواند):  
   ```bash
   docker compose restart scheduler
   ```
4. تأیید: لاگ scheduler بدون `[CRITICAL]` و volleys موفق.  
   ```bash
   docker compose logs --tail=30 scheduler
   ```

**نکته:** اگر volume `afagh_cron_secrets` را حذف کنید (`docker volume rm`), migrator همهٔ کلیدها را از نو می‌سازد؛ اما این کار endpointهای cron را برای یک دوره از کار می‌اندازد تا volume جدید propagate شود. ترجیحاً ENV override استفاده کنید.

---

## ۸) چرخش `TICKET_TOKEN_SECRET` (گذار بدون قطع سرویس)

1. مقدار فعلی را در `PREVIOUS_TICKET_TOKEN_SECRET` قرار دهید.  
2. مقدار جدید را در `TICKET_TOKEN_SECRET` قرار دهید.  
3. `.env` به‌روزرسانی + `make check-env`.  
4. ری‌استارت app: `docker compose up -d app`  
5. پس از یک دورهٔ نشست (مثلاً ۴ ساعت / `AFAGH_SESSION_MAX_HOURS`), `PREVIOUS_TICKET_TOKEN_SECRET` را خالی کنید و دوباره ری‌استارت.  
6. تأیید: ورود/انتخاب حساب کار می‌کند.

---

## ۹) چرخش `AFAGH_OTP_PEPPER`

1. تولید سکرت جدید.  
2. `.env` به‌روزرسانی.  
3. ری‌استارت app.  
4. **توجه:** OTPهای صادرشدهٔ قبلی با pepper قدیمی معتبر نخواهند بود؛ کاربران باید OTP جدید بگیرند.  
5. اطلاع‌رسانی به کاربران در صورت نیاز.

---

## ۱۰) چرخش سکرت‌های «پایدار» (High-Impact)

### ۱۰.۱) `AFAGH_BACKUP_SIGNING_KEY`

- **اثر:** پشتیبان‌های قدیمی با کلید قدیمی امضا شده‌اند؛ با کلید جدید بی‌اعتبار می‌شوند.  
- **رویه:**  
  1. پشتیبان تازه با کلید قدیمی بگیرید (`make backup`).  
  2. کلید جدید را در `.env` بگذارید.  
  3. `make backup` (پشتیبان جدید با کلید جدید).  
  4. پشتیبان‌های قدیمی را در آرشیو جداگانه نگه دارید (برای بازیابی تاریخی با کلید قدیمی).  
  5. ثبت در دفتر چرخش.

### ۱۰.۲) `SAMIN_MASTER_KEY`

- **اثر:** اسرار ثمین رمزنگاری‌شده با کلید قدیمی غیرقابل رمزگشایی می‌شوند.  
- **رویه:**  
  1. **پیش از چرخش:** تمام اتصال‌های ثمین را رمزگشایی و با کلید جدید رمزگذاری کنید (نیاز به ابزار/اسکریپت مهاجرت — در صورت وجود).  
  2. اگر چنین ابزاری نیست، **چرخش نکنید** مگر در حادثهٔ بحرانی (در آن صورت دادهٔ ثمین قبلی از دست می‌رود).  
  3. کلید جدید را در `.env` بگذارید + ری‌استارت app.  
  4. ثبت.

### ۱۰.۳) `AFAGH_CERT_SALT`

- **اثر:** هش همهٔ گواهی‌های صادرشدهٔ قبلی بی‌اعتبار می‌شود.  
- **رویه:**  
  1. **تغییر ندهید** در حالت عادی.  
  2. فقط در حادثهٔ بحرانی (نشت salt).  
  3. پس از چرخش، گواهی‌های قبلی باید با salt جدید بازصدور شوند (نیاز به عملیات دستی/اسکریپت).  
  4. ثبت.

---

## ۱۱) چرخش کلیدهای بیرونی (Third-party)

- طبق سیاست provider (SMS, Payment, BBB, Moodle, Irandoc, KYC, Shaparak, Sajjad).  
- مراحل:  
  1. کلید جدید را از پنل provider بگیرید.  
  2. در `.env` یا پنل مدیر (پیکربندی سامانه) به‌روزرسانی کنید.  
  3. تست endpoint مربوطه.  
  4. کلید قدیمی را در provider لغو کنید.  
  5. ثبت.

---

## ۱۲) تأیید پس از چرخش (Post-rotation Verification)

```bash
# بررسی سیاست سکرت
make check-env

# سلامت سرویس
make health

# پشتیبان تازه
make backup && make verify-backup

# تست عملیات حساس (دستی):
# - ورود مدیر
# - مشاهدهٔ کارنامه (RLS)
# - آپلود/دانلود مدرک (MinIO)
# - یک cron endpoint (با کلید جدید)
```

**در صورت شکست:**  
- بازگردانی `.env` از snapshot `.env.bak.<date>`  
- ری‌استارت سرویس‌ها  
- بررسی لاگ‌ها  
- ثبت incident  

---

## ۱۳) دفتر چرخش سکرت (Rotation Log Template)

| # | تاریخ | سکرت(ها) | دلیل | مسئول | وضعیت | یادداشت |
|---|---|---|---|---|---|---|
| 1 | | | scheduled / incident | | done/rolled-back | |

**نگهداری:** این دفتر را در مسیر امن (نه در git) نگه دارید. در صورت نشت، دفتر چرخش نیز باید به‌عنوان شاهد حفظ شود.

---

## ۱۴) چک‌لیست سریع چرخش (Quick Card)

- [ ] پشتیبان گرفته شد  
- [ ] snapshot .env گرفته شد  
- [ ] سکرت جدید تولید شد  
- [ ] `.env` به‌روزرسانی شد  
- [ ] `make check-env` عبور کرد  
- [ ] اعمال (restart/migrate) انجام شد  
- [ ] `make health` عبور کرد  
- [ ] تست عملیات حساس انجام شد  
- [ ] ثبت در دفتر چرخش انجام شد  
- [ ] snapshot .env پس از ۷ روز حذف شد  

---

## ۱۵) ارجاعات

- سیاست سکرت: `afagh-next/scripts/lib/secret-policy.mjs`  
- گارد startup: `afagh-next/src/lib/secret-guard.ts`  
- نمونهٔ .env: `.env.prod.example`  
- گیت: `make check-env`  
- Runbook حادثه: `docs/INCIDENT-RESPONSE-RUNBOOK.md`  
- چک‌لیست استقرار: `docs/DEPLOY-SECURITY-CHECKLIST.md`