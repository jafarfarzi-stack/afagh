# چک‌لیست امنیت استقرار (Deploy Security Checklist) — اپراتور

> **نسخهٔ سند:** 1.0 — **تاریخ:** 2026-10-19  
> **دامنه:** استقرار پروداکشن سامانهٔ آفاق  
> **مکمل:** `SECURITY-POLICY.md` · `INCIDENT-RESPONSE-RUNBOOK.md` · `SECRETS-ROTATION-PROCEDURE.md`

این چک‌لیست برای **اپراتور استقرار** است. هر بخش را پیش از go-live و پس از هر تغییر عمده تکمیل کنید.  
علامت ☐ = انجام نشده، ☑ = انجام شده و تأیید شده.

---

## ۰) پیش‌نیازها (Pre-flight)

- [ ] سرور Debian 13 (یا معادل) با پچ‌های امنیتی به‌روز  
- [ ] Docker + Docker Compose نصب و به‌روز  
- [ ] فایروال (ufw) فعال: فقط 22/80/443 باز؛ بقیه بسته  
- [ ] SSH با کلید (نه رمز)، `PermitRootLogin no`، `PasswordAuthentication no`  
- [ ] کاربر غیر-root با sudo برای عملیات  
- [ ] NTP/ساعت سرور همگام (برای TLS/لاگ)  
- [ ] swap کافی برای بیلد (`make swap` در صورت RAM کم)  
- [ ] پشتیبان‌گیری از دادهٔ قبلی (در صورت upgrade)  

---

## ۱) فایل‌ها و مجوزها (Files & Permissions)

- [ ] `.env` از `.env.prod.example` ساخته شده: `make env`  
- [ ] مجوز `.env` برابر `600` (`chmod 600 .env`)  
- [ ] `.env` در `.gitignore` (commit نشده)  
- [ ] `bootstrap-credential.txt` (در صورت وجود) مجوز `600`  
- [ ] دایرکتوری پشتیبان‌های host مجوز مناسب (`700`)  
- [ ] هیچ سکرتی در کد/commit/git history نیست (`git log -p | grep -i password` manual)  

---

## ۲) سکرت‌ها (Secrets)

- [ ] `make check-env` بدون خطا عبور می‌کند  
- [ ] `POSTGRES_PASSWORD` ≥ ۲۴ کاراکتر، نه مقدار نمونه  
- [ ] `AFAGH_APP_DB_PASSWORD` ≥ ۲۴ کاراکتر  
- [ ] `REDIS_PASSWORD` ≥ ۲۴ کاراکتر  
- [ ] `MINIO_ROOT_PASSWORD` ≥ ۱۶ کاراکتر  
- [ ] `MINIO_ROOT_USER` ≠ `afagh` (پیش‌فرض توسعه) در production  
- [ ] `ALLOW_WEAK_SECRETS` در production ست نشده (یا صریحاً `0`)  
- [ ] `AFAGH_DEMO_MODE=0`  
- [ ] `AFAGH_DEMO_LOCK=1` (پیش‌فرض ایمیج تولید)  
- [ ] `AFAGH_OBJECT_SCOPE=department` (یا تصمیم مستند برای `all`)  
- [ ] کلیدهای اختیاری (S3, SAMIN, OTP pepper, ticket token, backup signing, cert salt) در صورت استفاده ست شده‌اند  
- [ ] `AFAGH_APP_DB_PASSWORD` فقط در migrator تزریق می‌شود (نه app) — تأیید در compose  

دستور بررسی:
```bash
make check-env
node afagh-next/scripts/lib/secret-policy.mjs --check .env
```

---

## ۳) شبکه و TLS (Network & TLS)

- [ ] `APP_BIND=127.0.0.1` (مگر آنکه خودتان TLS را مدیریت کنید)  
- [ ] پروکسی معکوس (Caddy/Nginx) با HTTPS و گواهی معتبر  
- [ ] HSTS فعال در پروکسی  
- [ ] `AFAGH_COOKIE_SECURE=true` (یا `auto` با تشخیص صحیح)  
- [ ] `AFAGH_PUBLIC_BASE_URL` با دامنهٔ HTTPS واقعی  
- [ ] پورت‌های DB/Redis/MinIO فقط روی `127.0.0.1` (نه `0.0.0.0`)  
- [ ] `dbnet` داخلی (بدون اینترنت) — تأیید در compose  
- [ ] فایروال host: پورت‌های 5432/6379/9000/9001 بسته از بیرون  

دستور بررسی:
```bash
docker compose config | grep -E "ports|APP_BIND"   # manual review
ss -tlnp | grep -E "5432|6379|9000|9001|8080"
```

---

## ۴) پایگاه‌داده (Database)

- [ ] مهاجرت نسخه‌دار اجرا شده: `make migrate` (نه `drizzle-kit push`)  
- [ ] hardening اجرا شده (RLS، نقش `afagh_app`)  
- [ ] نقش `afagh_app` دارای `BYPASSRLS` نیست  
- [ ] `DATABASE_URL` (مالک) فقط در migrator/app (طبق وضعیت فعلی) — تأیید  
- [ ] RLS فعال و fail-closed در production (بدون escape hatch)  
- [ ] ایندکس‌ها و constraintهای یکتا اعمال شده (مهاجرت 0103 و غیره)  
- [ ] پشتیبان پیش از مهاجرت گرفته شده (migrator خودکار)  

دستور بررسی:
```bash
make migrate
make drill
# بررسی RLS (دستی):
docker compose exec postgres psql -U afagh -d afagh_db -c "SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname IN ('afagh','afagh_app');"
```

---

## ۵) اپلیکیشن (Application)

- [ ] بیلد موفق: `docker compose build`  
- [ ] `typecheck` عبور: `npm run typecheck` (در afagh-next)  
- [ ] تست‌های امنیتی عبور: `release-hardening` و سایر  
- [ ] حساب مدیر اولیه ساخته شده: `make admin`  
- [ ] `bootstrap-credential.txt` خوانده شده و رمز در اولین ورود تغییر کرده  
- [ ] حساب‌های دمو در production وجود ندارند (یا قفل‌اند)  
- [ ] `NEXT_PHASE`/build بدون `ALLOW_WEAK_SECRETS`  
- [ ] session max hours تنظیم شده (پیش‌فرض ۴)  

دستور بررسی:
```bash
make build
make up
make health
make admin
```

---

## ۶) پشتیبان و بازیابی (Backup & DR)

- [ ] `make backup` موفق  
- [ ] `make verify-backup` موفق (sha256 + pg_restore --list)  
- [ ] `make drill` موفق (بازگردانی + مقایسه + RLS)  
- [ ] حداقل یک پشتیبان به بیرون از سرور کپی شده (`make copy-backups-to-host`)  
- [ ] `AFAGH_BACKUP_KEEP` تنظیم شده (پیش‌فرض ۱۴)  
- [ ] `AFAGH_BACKUP_SIGNING_KEY` ست شده (در صورت استفاده از پشتیبان امضاشده)  
- [ ] برنامهٔ دوره‌ای پشتیبان (cron) تنظیم شده  
- [ ] برنامهٔ دوره‌ای `make drill` (ماهی یک‌بار) ثبت شده  

دستور بررسی:
```bash
make backup
make verify-backup
make drill
make copy-backups-to-host DEST=/mnt/nas/afagh
```

---

## ۷) پویش‌ها و زمان‌بند (Scheduler & Cron)

- [ ] سرویس `scheduler` فعال است  
- [ ] کلیدهای cron تولید شده (volume `afagh_cron_secrets` یا ENV)  
- [ ] `make ps` نشان می‌دهد scheduler healthy  
- [ ] لاگ scheduler بدون `[CRITICAL]`/`[ALERT]` پایدار  
- [ ] endpointهای cron با کلید صحیح پاسخ می‌دهند (تست دستی)  

دستور بررسی:
```bash
docker compose logs --tail=50 scheduler
```

---

## ۸) پایش و لاگ (Monitoring & Logging)

- [ ] لاگ‌ها به JSON (در production)  
- [ ] `LOG_LEVEL` مناسب (info/warn)  
- [ ] جمع‌آوری لاگ‌ها به SIEM/Loki/ELK (در صورت وجود)  
- [ ] هشدار برای `[CRITICAL]`/`[ALERT]`/`[csrf]`/`[scope]`  
- [ ] پایش uptime (health endpoint)  
- [ ] پایش استفادهٔ دیسک/RAM/CPU  
- [ ] retention لاگ‌ها تنظیم شده (max-size 10m, max-file 5)  

---

## ۹) کنترل دسترسی (Access Control)

- [ ] نقش‌ها و مجوزها seed شده (`make` seed permissions)  
- [ ] `AFAGH_OBJECT_SCOPE` مستند و تأیید شده  
- [ ] حساب‌های دمو غیرفعال  
- [ ] حساب مدیر اولیه رمز را تغییر داده  
- [ ] کاربران اضافی/قدیمی حذف شده  
- [ ] ممیزی دسترسی (RBAC matrix) بازبینی شده (تصویر `docs/images/screenshot_5_rbac_matrix.png`)  

---

## ۱۰) پس از استقرار (Post-deploy Verification)

- [ ] `make health` → HTTP 200 روی `/login`  
- [ ] ورود با حساب مدیر موفق  
- [ ] تغییر رمز اجباری انجام شد  
- [ ] یک سناریوی کاربری کلیدی (مثلاً ثبت‌نام/نمره) تست شد  
- [ ] RLS تست شد (کارشناس گروه A، دانشجوی گروه B → رد)  
- [ ] CSRF تست شد (درخواست cross-origin → 403)  
- [ ] پشتیبان پس از استقرار گرفته شد  
- [ ] لاگ‌ها بدون خطای بحرانی  

---

## ۱۱) بررسی‌های دوره‌ای (Periodic)

| فعالیت | دوره | دستور |
|---|---|---|
| `make check-env` | هر تغییر .env | `make check-env` |
| پشتیبان + verify | روزانه/هفتگی | `make backup && make verify-backup` |
| DR drill | ماهی یک‌بار | `make drill` |
| کپی پشتیبان بیرون | هفتگی | `make copy-backups-to-host` |
| بررسی لاگ‌های امنیتی | هفتگی | `docker compose logs` |
| چرخش سکرت‌ها | طبق `SECRETS-ROTATION-PROCEDURE.md` | — |
| به‌روزرسانی پایهٔ OS/Docker | ماهی یک‌بار | `apt upgrade`, docker update |
| `npm audit` / حسابرسی وابستگی | هر release | `npm audit` (CI) |

---

## ۱۲) امضا (Sign-off)

| نقش | نام | تاریخ | امضا |
|---|---|---|---|
| اپراتور استقرار | | | |
| مسئول امنیت | | | |
| مسئول دانشگاه (ذی‌نفع) | | | |

> **یادداشت:** این چک‌لیست باید در دفتر استقرار بایگانی شود. هر مورد «نه» باید با دلیل و تأیید مسئول امنیت همراه باشد.