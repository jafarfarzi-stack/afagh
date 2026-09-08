# آزمون‌های سنگین تثبیت (محیط Linux موقت)

**روی دیتابیس یا سرویس واقعی اجرا نکنید.** این تست‌ها fixture می‌سازند، trigger خطا تزریق می‌کنند، اتصال PostgreSQL را می‌بندند و انتظار دارند ذخیره‌ساز/Redis آزمایشی در مراحل مشخص متوقف شود. داده‌های fixture عمداً برای مراحل بعدی نگه داشته می‌شوند؛ کل DB و باکت باید یک‌بارمصرف باشند.

## زیرساخت لازم
Node 20+، npm ci، PostgreSQL 16/17 + pg_dump/pg_restore، Redis، MinIO، Caddy، و برای مرورگر Python Playwright + Chromium و کتابخانه‌های سیستم. اسکریپت‌ها از ریشهٔ afagh-next اجرا می‌شوند. برای CI عادی تست‌های سبک و adversarial کافی‌اند؛ این مجموعه وابسته به زیرساخت اختصاصی است.

متغیرهای مورد استفاده (همه صرفاً نمونهٔ محیط محلی):

```bash
export HEAVY_TEST_ACK=isolated-local-only
export DATABASE_URL=postgres://test_user:test_password@127.0.0.1:55432/afagh_db
export DATABASE_URL_APP=postgres://afagh_app:test_app_password@127.0.0.1:55432/afagh_db
export AUDIT_TEST_DATABASE_URL=postgres://test_user:test_password@127.0.0.1:55432/postgres
export AFAGH_APP_DB_PASSWORD=test_app_password
export REDIS_URL=redis://127.0.0.1:56379
export S3_ENDPOINT=127.0.0.1 S3_PORT=59000 S3_ACCESS_KEY=test_access
export S3_SECRET_KEY=test_storage_password S3_BUCKET=afagh-heavy-new-bucket
export AFAGH_TRUST_PROXY=true
export AFAGH_PROXY_SECRET='<راز تصادفی حداقل ۳۲ کاراکتری یکسان در اپ و Caddy>'
export AFAGH_PUBLIC_BASE_URL=http://127.0.0.1:58081
export AFAGH_DEMO_MODE=0 NODE_ENV=production
export HEAVY_FIXTURE_FILE=/path/to/private/temporary/heavy-fixtures.json
```

کاربر owner دیتابیس آزمایشی باید اجازهٔ ساخت schema/role و pg_terminate_backend داشته باشد. نام afagh_db به‌دلیل پیش‌فرض ثابت SQL سخت‌سازی موجود استفاده شده است؛ این محدودیت در گزارش ثبت شده است.

## آماده‌سازی
1. سرویس‌ها را با storage مستقل و فقط روی loopback بالا بیاورید. PostgreSQL خالی با نام afagh_db بسازید.
2. `node scripts/migrate-db.mjs`، `node scripts/apply-patches.mjs`، `node scripts/seed-base.mjs` و `node scripts/hardening.mjs` را اجرا کنید. AFAGH_BACKUP_DIR را به مسیر موقت قابل‌نوشتن تنظیم کنید.
3. `npm run build` و سپس `npx next start --hostname 127.0.0.1 -p 58080` را در ترمینال جدا اجرا کنید.
4. از Caddyfile مخزن نسخهٔ موقت بسازید: DOMAIN را به `http://127.0.0.1:58081` و upstream را به `127.0.0.1:58080` تغییر دهید؛ header_upها و headerهای امنیتی را دست‌نخورده نگه دارید. با global `admin off` و `auto_https off` اجرا کنید.

## ترتیب تست

```bash
npm test
npm run test:adversarial
npm run test:audit-integration
npm run test:heavy:audit
HEAVY_UPLOAD_COUNT=1000 HEAVY_READ_COUNT=3000 npm run test:heavy:archive
npx tsx scripts/heavy/archive-large.ts
npx tsx scripts/heavy/proxy-quota.ts
```

برای تکرار race اولیه، هر بار با S3_BUCKET تازه و restart اپ شروع کنید. archive-http حساب‌ها/نشست‌های مصنوعی می‌سازد و شناسه‌ها را در HEAVY_FIXTURE_FILE می‌نویسد. این فایل راز آزمایشی دارد و نباید commit شود.

### تزریق خرابی
- فقط MinIO آزمایشی را متوقف کنید؛ `npx tsx scripts/heavy/storage-outage.ts --down` را اجرا کنید. همان MinIO را با همان data directory راه‌اندازی و فرمان را بدون --down تکرار کنید.
- فقط Redis آزمایشی را متوقف کنید؛ `node scripts/heavy/redis-outage.mjs` را اجرا کنید، سپس Redis را برگردانید. این تست به fallback حافظهٔ تازه نیاز دارد؛ اگر قبلاً اجرا شده، اپ را پیش از دور جدید restart کنید.
- `npx tsx scripts/heavy/db-disconnect.ts` اتصال‌های بی‌نام همین دیتابیس را قطع می‌کند و سلامت اپ را می‌سنجد. هیچ سرویس دیگری نباید از DB آزمایشی استفاده کند.
- برای backup/restore از اسکریپت backup-db.mjs و pg_restore روی **دیتابیس تازه و جدا** استفاده کنید؛ سپس `AUDIT_DATABASE_URL=... TZ=America/New_York npm run audit:verify`.

### مرورگر و کوکی
- `node scripts/heavy/prepare-browser.mjs` حساب مصنوعی را برای ورود واقعی آماده می‌کند.
- اپ را با AFAGH_PUBLIC_BASE_URL=https://localhost:58443 restart کنید.
- Caddy موقت روی https://localhost:58443 با `tls internal` و globalهای `admin off`، `skip_install_trust` و `auto_https disable_redirects` اجرا شود. قوانین header_up از مخزن حفظ شوند.
- `python3 scripts/heavy/browser-smoke.py`؛ Playwright و Chromium باید نصب باشند. ignore_https_errors صرفاً برای CA محلی آزمایشی استفاده می‌شود، نه راهنمای production.

در پایان تمام سرویس‌های موقت را خاموش و fixture/باکت/DB موقت را طبق سیاست محیط تست پاک کنید. این مجموعه جای load test توزیع‌شده، soak طولانی، pentest مستقل یا E2E همهٔ ماژول‌های ERP را نمی‌گیرد.
