# بررسی پشتیبان‌گیری و بازیابی از فاجعه (Backup & Disaster Recovery)

**پروژه:** Afagh ERP (`D:\afagh` / `afagh-next`)  
**محدودهٔ بررسی:** `src/app/admin/settings/backup-actions.ts`، `scripts/hardening.mjs`، `scripts/phase3/README.md`، `scripts/backup-db.mjs`، `scripts/verify-backup.mjs`، `Dockerfile`، `docker-compose.yml`، `deploy-debian.sh`  
**تاریخ:** 2026-10-19  
**زبان:** فارسی

---

## ۱) خلاصهٔ اجرایی

سامانهٔ پشتیبان‌گیری دو لایه دارد:

1. **پشتیبان‌گیری پیش از استقرار (host-level):** `scripts/backup-db.mjs` با `pg_dump -Fc` یک آرشیو PostgreSQL در `/backups` (volume ماندگار `afagh_backups`) می‌سازد، `sha256` کنارآمد ذخیره می‌کند و retention (پیش‌فرض ۱۴ نسخه) اعمال می‌کند. راستی‌آزمایی با `scripts/verify-backup.mjs` و drill بازگردانی روی دیتابیس جدا انجام می‌شود.
2. **پشتیبان/بازیابی درون‌برنامه‌ای (admin):** `backup-actions.ts` دامپ SQL امضاشدهٔ HMAC می‌سازد، رازها را redact می‌کند و بازیابی فقط فایل‌های امضاشده را می‌پذیرد. در حالت کم‌مجوز (`DATABASE_URL_BACKUP`) از نقش `afagh_backup` (NOBYPASSRLS، بدون DDL) استفاده می‌کند.

**نتیجهٔ کلی:** کنترل‌های امنیتی خوبی (HMAC، redaction، role separation، RLS) وجود دارد، اما چند شکاف در «دریافت شیء»، «رمزگذاری در حالت rest» و «کپی خارج از میزبان» باقی است. یک اصلاح کوچک اعمال شد (اعتبارسنجی کلید + محدودیت حجم در `downloadMinioObjectAction`).

---

## ۲) ایمنی بازیابی (Restore Safety)

### ۲.۱) SQL دلخواه (Arbitrary SQL)

- `restoreDatabaseAction` **هرگز SQL خام کاربر را اجرا نمی‌کند**؛ ورودی باید با `verifyBackup` امضاشده باشد (HMAC-SHA256 با `AFAGH_BACKUP_SIGNING_KEY`، حداقل ۳۲ بایت).
- `verifyBackup`:
  - محدودیت حجم `50MB` (Buffer.byteLength).
  - امضای ۶۴ hex در انتهای فایل، تطبیق با `timingSafeEqual`.
  - فایل‌های قدیمی/امضانشده رد می‌شوند (fail-closed).
- در حالت کم‌مجوز، فقط دستورات `INSERT INTO` اجرا می‌شوند؛ `DROP/CREATE` رد می‌شوند.
- در حالت پیش‌فرض (مالک)، کل دامپ (DDL+DML) اجرا می‌شود؛ این همان ریسک باقی‌ماندهٔ مستند در `scripts/phase3/README.md` است.

**یافته‌ها:**
- ✅ HMAC و timing-safe compare درست پیاده‌سازی شده‌اند.
- ⚠️ در حالت مالک، بازیابی DDL کامل را اجرا می‌کند؛ اگر کلید امضا لو برود، SQL دلخواه اجرا می‌شود. کاهش: فعال‌سازی نقش `afagh_backup` + `DATABASE_URL_BACKUP` (فاز ۳).
- ⚠️ تجزیهٔ statements با تقسیم خطوط و `;` ساده است؛ دادهٔ حاوی newline/semicolon در رشته می‌تواند parser را گمراه کند (احتمال شکست، نه injection، چون SQL امضاشده و قابل‌اعتماد است).

### ۲.۲) اعتبارسنجی کلید شیء (Object Key)

- `restoreMinioObjectAction`: regex سخت‌گیرانه فقط کلیدهای `archive/{studentId}/{typeId}-{timestamp}-{rand}.{ext}` با پسوندهای مجاز.
- `downloadMinioObjectAction`: **پیش از اصلاح، هیچ اعتبارسنجی نداشت** → هر کلید (شامل traversal یا مسیرهای دیگر bucket) قابل دریافت بود.  
  **اصلاح اعمال‌شده:** اعتبارسنجی طول/کاراکتر/پیشوند `archive/` و رد `..`، بک‌اسلش، null، و محدودیت حجم ۵۰MB در حین stream.

### ۲.۳) محدودیت حجم

- `verifyBackup`: ۵۰MB.
- `restoreMinioObjectAction`: `dataBase64.length > 28_000_000` و `buf.length > 20MB`.
- `downloadMinioObjectAction`: پس از اصلاح، ۵۰MB.
- `backupDatabaseAction`: محدودیت صریح ندارد (خروجی رشتهٔ SQL)؛ برای دیتابیس‌های بزرگ می‌تواند حافظه را پر کند. توصیه: صفحه‌بندی/استریم یا محدودیت.

### ۲.۴) HMAC

- کلید از `AFAGH_BACKUP_SIGNING_KEY`، حداقل ۳۲ بایت، رد مقادیر `CHANGE_ME_`.
- marker دقیقاً در انتهای فایل؛ `body` بدون marker امضا می‌شود.
- `timingSafeEqual` با بررسی طول قبلی.

---

## ۳) صحت نقش کم‌مجوز (Least-Privilege Role)

`scripts/hardening.mjs` نقش `afagh_backup` را با ویژگی‌های زیر می‌سازد:

- `LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`.
- گرنت‌ها: `CONNECT`، `USAGE`، `SELECT/INSERT/TRUNCATE` روی همهٔ جداول، `ALTER DEFAULT PRIVILEGES`.
- `REVOKE UPDATE, DELETE, REFERENCES, TRIGGER`.
- RLS: دو policy فقط `TO afagh_backup`: `afagh_backup_read (SELECT USING true)` و `afagh_backup_insert (INSERT WITH CHECK true)`.
- `GRANT SET ON PARAMETER session_replication_role` (PG15+) برای بازیابی داده‌به‌جای-DDL.
- اعتبارسنجی پس از اعمال: بررسی ویژگی‌های نقش و نبود UPDATE/DELETE.

**یافته‌ها:**
- ✅ طراحی کم‌مجوز و idempotent است.
- ✅ سقوط بی‌صدا به استخر مالک وجود ندارد (all-or-nothing).
- ⚠️ policyهای RLS با `USING (true)` دسترسی کامل خواندن/درج را به نقش backup می‌دهند؛ این برای یک نقش backup لازم است اما به معنی «هر کسی که رمز afagh_backup را دارد، کل داده را می‌خواند». مدیریت رمز و چرخش آن ضروری است.
- ⚠️ نقش جدید جدول‌ها (پس از مهاجرت) فقط در اجرای بعدی `hardening.mjs` policy می‌گیرند؛ در غیر این صورت دامپ آن جدول‌ها خالی می‌ماند (مستند در README).
- ⚠️ `TRUNCATE ... CASCADE` همهٔ جداول وابسته را خالی می‌کند؛ دامپ باید از همان اسکیما باشد.

---

## ۴) رمزگذاری در حالت rest (Encryption at Rest)

- **پشتیبان‌گیری درون‌برنامه‌ای:** خروجی SQL امضاشدهٔ HMAC است، اما **رمزگذاری نشده** است. رازها redact می‌شوند، اما PII و دادهٔ کسب‌وکار در متن واضح قرار دارند.
- **پشتیبان‌گیری host-level (`pg_dump -Fc`):** فرمت custom PostgreSQL؛ **رمزگذاری نشده** است. فایل `.sha256` فقط integrity را تضمین می‌کند، نه محرمانگی.
- **MinIO:** اشیاء آرشیو بدون رمزگذاری سمت سرور ذخیره می‌شوند (MinIO SSE در این پیکربندی فعال نیست).

**توصیه‌ها:**
- فعال‌سازی MinIO SSE (KMS) یا رمزگذاری سمت کلاینت برای اشیاء حساس.
- برای پشتیبان‌های SQL/pg_dump، استفاده از `gpg`/`age` با کلید مدیریت‌شده در secret manager.
- محدود کردن دسترسی به volume `/backups` و NAS (chmod 600، کاربر غیر-root).

---

## ۵) retention و کپی خارج از میزبان (Off-host Copy)

- `backup-db.mjs`: retention پیش‌فرض ۱۴ نسخه (`AFAGH_BACKUP_KEEP`)؛ حذف نسخه‌های قدیمی با `rmSync`.
- `AFAGH_BACKUP_DIR` امکان هدایت به مسیر میزبان/NAS را می‌دهد.
- `docker-compose.yml`: volume ماندگار `afagh_backups`؛ مسیر میزبان با bind-mount قابل تنظیم.
- `deploy-debian.sh`: دستور `copy-backups-to-host` برای کپی به NAS ذکر شده.

**یافته‌ها:**
- ✅ retention پیاده‌سازی شده و fail-closed در صورت نبود pg_dump در ایمیج migrator.
- ⚠️ کپی خارج از میزبان **خودکار نیست**؛ به اپراتور وابسته است. توصیه: cron/systemd timer برای کپی به S3/NAS + تست بازگردانی دوره‌ای.
- ⚠️ retention فقط فایل‌های `.dump` را حذف می‌کند؛ `.sha256` و `LATEST` هم حذف می‌شوند (خوب)، اما در صورت شکست میان‌کار، فایل‌های orphan می‌مانند.

---

## ۶) آزمون بازگردانی و راستی‌آزمایی (Test Restore Drills)

- `verify-backup.mjs`:
  - سطح ۱: بررسی sha256 + `pg_restore --list` + شمارش جدول/ایندکس/قید.
  - سطح ۲ (drill): ساخت DB موقت، `pg_restore`، مقایسهٔ شمار ردیف جدول‌های حساس، بررسی RLS پس از بازگردانی.
  - در CI سطح ۱ اجرا می‌شود؛ سطح ۲ با `RUN_RESTORE_DRILL=1`.
- `docker-entrypoint`/migrator: verify-backup در گام ۶ اجرا می‌شود (خطا غیربحرانی).

**یافته‌ها:**
- ✅ drill واقعی با مقایسهٔ داده و RLS پیاده‌سازی شده.
- ⚠️ درون‌برنامه‌ای، هیچ «drill» خودکار برای بازیابی SQL امضاشده وجود ندارد (فقط verify-backup برای pg_dump). توصیه: افزودن تست یکپارچهٔ restore روی دیتابیس ephemeral در CI.
- ⚠️ verify-backup در migrator با `|| echo` غیربحرانی است؛ در production توصیه می‌شود شکست آن هشدار جدی (نه توقف) باشد، اما لاگ شود.

---

## ۷) اصلاحات اعمال‌شده (Safe Small Fixes)

1. **`downloadMinioObjectAction`** (`backup-actions.ts`):
   - اعتبارسنجی کلید: طول ۱..۵۱۲، پیشوند `archive/`، مجموعهٔ کاراکتر امن، رد `..`/`\`/null/leading `/`.
   - محدودیت حجم ۵۰MB در حین stream (جلوگیری از OOM).
   - هیچ تغییر schema/drizzle/protected file انجام نشد.

---

## ۸) موارد باقی‌مانده / توصیه‌های آینده

- فعال‌سازی نقش `afagh_backup` در production (`AFAGH_BACKUP_DB_PASSWORD` + `DATABASE_URL_BACKUP`) برای حذف ریسک DDL/RLS bypass.
- رمزگذاری پشتیبان‌ها در حالت rest (MinIO SSE یا gpg/age).
- خودکارسازی کپی خارج از میزبان + تست بازگردانی دوره‌ای.
- افزودن drill خودکار برای بازیابی SQL امضاشده در CI.
- مستندسازی RTO/RPO و سناریوهای فاجعه در `docs/INCIDENT-RESPONSE-RUNBOOK.md`.

---

## ۹) گیت‌های اجراشده

- `git diff --check`: بدون خطای whitespace (فقط هشدار CRLF/LF پیش‌موجود).
- هیچ build/test/commit انجام نشد.
