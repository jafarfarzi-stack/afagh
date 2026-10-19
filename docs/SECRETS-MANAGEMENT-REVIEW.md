# گزارش بازبینی مدیریت سکرت‌ها (Secrets Management Review)

> **تاریخ:** 2026-10-19  
> **دامنه:** `src/lib/secret-guard.ts`, `scripts/lib/secret-policy.mjs`, `.env.example`, `.env.prod.example`, `docker-compose*.yml`, `deploy-debian.sh`, `install-docker.sh/.ps1`, `scripts/seed-base.mjs`, `scripts/hardening.mjs`  
> **نوع خروجی:** گزارش فارسی + اصلاحات کوچک و امن (بدون تغییر schema/drizzle/فایل‌های محافظت‌شده)

---

## ۱) خلاصهٔ اجرایی

سامانهٔ آفاق پیش از این یک «سیاست یکدست سکرت‌ها» (`secret-policy.mjs` به‌عنوان تنها منبع حقیقت) و یک گارد startup (`secret-guard.ts`) داشته است. استقرار پروداکشن با رمزهای اجباری (`:?` در compose)، volume ماندگار پشتیبان، cron secretها در volume مشترک (نه ENV) و RLS فعال شده است. با این حال چند شکاف در **چرخش سکرت‌ها، یکپارچگی اجرای سیاست، افشای سکرت در لاگ‌ها و پشتیبانی از keyring/Vault** وجود دارد که در این گزارش مستند و در بخش «اصلاحات اعمال‌شده» بخشی از آن‌ها به‌صورت امن بسته شده‌اند.

---

## ۲) نقاط قوت موجود

- **یک منبع حقیقت:** `scripts/lib/secret-policy.mjs` و `src/lib/secret-guard.ts` هر دو فهرست پیش‌فرض‌های ضعیف یکسان دارند (تست `tests/release-hardening.test.ts` واگرایی را می‌گیرد).
- **fail-closed در پروداکشن:** compose برای `POSTGRES_PASSWORD`, `AFAGH_APP_DB_PASSWORD`, `REDIS_PASSWORD`, `MINIO_ROOT_PASSWORD` از `${VAR:?…}` استفاده می‌کند؛ `assertProdSecrets()` در startup اجرا می‌شود.
- **cron secretها خارج از `docker inspect`:** کلیدهای پویش در volume `afagh_cron_secrets` (`/secrets/cron.env`, mode 0600) ذخیره می‌شوند و scheduler آن‌ها را از فایل می‌خواند، نه از ENV.
- **چرخش نرم توکن:** `PREVIOUS_TICKET_TOKEN_SECRET` برای گذار بدون قطع سرویس پشتیبانی می‌شود (`src/lib/verification.ts`).
- **رویهٔ چرخش مستند:** `docs/SECRETS-ROTATION-PROCEDURE.md` فهرست، دورهٔ چرخش، گذار و ثبت را تعریف کرده است.
- **رمزهای «پایدار» مشخص:** `AFAGH_BACKUP_SIGNING_KEY`, `SAMIN_MASTER_KEY`, `AFAGH_CERT_SALT` به‌عنوان high-impact شناسایی شده‌اند.

---

## ۳) یافته‌ها

### ۳.۱) چرخش سکرت‌ها (Rotation)

| # | یافته | شدت | توضیح |
|---|---|---|---|
| R1 | چرخش `POSTGRES_PASSWORD` نیازمند `ALTER USER` دستی است؛ migrator خودکار رمز مالک را روی نقش اعمال نمی‌کند (فقط `afagh_app` را می‌سازد/به‌روز می‌کند). | متوسط | در رویهٔ سند آمده، اما اگر اپراتور مرحلهٔ ۸ را فراموش کند، app با رمز جدید وصل نمی‌شود. |
| R2 | `SAMIN_MASTER_KEY` در `src/lib/samin/crypto.ts` پیش از این به `TICKET_TOKEN_SECRET` fallback داشت (استفادهٔ مجدد از یک سکرت برای دو هدف). | بالا | رفع شد (بخش ۴). |
| R3 | کلیدهای cron در `system_settings` به‌صورت **متن ساده** ذخیره می‌شوند و در volume فایل نیز متن ساده‌اند (بدون رمزنگاری at-rest). | متوسط | برای ERP آموزشی قابل قبول است اگر دسترسی volume محدود باشد (root-only). |
| R4 | چرخش کلیدهای cron به volume propagation وابسته است؛ حذف volume (`docker volume rm`) endpointها را برای یک دوره از کار می‌اندازد. | پایین | در سند مستند شده؛ توصیه می‌شود ENV override استفاده شود. |

### ۳.۲) پشتیبانی از keyring

| # | یافته | شدت | توضیح |
|---|---|---|---|
| K1 | **هیچ پشتیبانی از keyring/credential store** (Linux keyring, Windows Credential Manager, Docker secrets) وجود ندارد. همهٔ سکرت‌ها در `.env` متن ساده (chmod 600) نگهداری می‌شوند. | متوسط | برای استقرارهای bare-metal/VM با دسترسی root محدود، chmod 600 کافی است؛ برای محیط‌های چندکاربره/audited توصیه می‌شود Docker Secrets یا Vault اضافه شود. |
| K2 | `.env` snapshotهای دستی (`.env.bak.<date>`) که در رویهٔ چرخش ایجاد می‌شوند، در صورت عدم حذف پس از ۷ روز، سکرت قدیمی را روی دیسک نگه می‌دارند. | پایین | `.gitignore` آن‌ها را exclude کرده؛ نیاز به پاک‌سازی دوره‌ای دارد. |

### ۳.۳) عدم افشای سکرت در `docker inspect` / process args / لاگ‌ها

| # | یافته | شدت | توضیح |
|---|---|---|---|
| D1 | کانتینر `app` همچنان `DATABASE_URL` (شامل رمز مالک) و `DATABASE_URL_APP` را در `environment` دریافت می‌کند ⇒ این مقادیر در `docker inspect` قابل مشاهده‌اند. | متوسط | compose comment این را به‌عنوان «کار باقی‌مانده» مستند کرده (استخر اختصاصی فقط برای backup). |
| D2 | `install-docker.sh/.ps1` در خروجی نهایی **رمز کنسول MinIO (`afagh / afagh-secret`)** را چاپ می‌کردند. | پایین | رفع شد (بخش ۴). |
| D3 | `deploy-debian.sh` در مهاجرت دادهٔ دمو، `DATABASE_URL` را با رمز صریح به `docker run -e` می‌دهد ⇒ در `ps` میزبان لحظه‌ای دیده می‌شود. | پایین | پیشنهاد: از ارث‌بری env یا `--env-file` استفاده شود. |
| D4 | scheduler کلیدهای cron را دیگر در ENV ندارد (خوب). redis password همچنان در ENV کانتینر redis است (اجتناب‌ناپذیر با `--requirepass`). | پایین | قابل قبول. |

### ۳.۴) یکپارچگی اجرای سیاست قدرت سکرت

| # | یافته | شدت | توضیح |
|---|---|---|---|
| S1 | `secret-guard.ts` بررسی تکرار چهارتایی کاراکتر (`/(.)\1{3,}/`) را نداشت، در حالی که `secret-policy.mjs` داشت. | پایین | رفع شد (بخش ۴). |
| S2 | `assertProdSecrets()` برای کلیدهای S3 از `checkDbSecret` (کف ۲۴ کاراکتر) استفاده می‌کرد، در حالی که سیاست object storage حداقل ۱۶ کاراکتر دارد و کلید دسترسی یک شناسه است. | پایین | رفع شد: رمز S3 با کف ۱۶ بررسی می‌شود؛ کلید دسترسی فقط پیش‌فرض توسعه رد می‌شود. |
| S3 | `hardening.mjs` از `failOnShort: false` استفاده می‌کند (کوتاه اما غیرقابل‌حدس = هشدار) — عمدی و با تست محافظت شده. | اطلاعاتی | تغییر ندهید؛ CI روی همین تکیه دارد. |
| S4 | `.env.example` (توسعه) مقادیر `CHANGE_ME_*` دارد که سیاست آن‌ها را «نمونه» می‌شناسد؛ در توسعه با `ALLOW_WEAK_SECRETS=1` قابل عبور است. | اطلاعاتی | قابل قبول. |

### ۳.۵) امکان یکپارچگی با Vault / Secret Manager خارجی

| # | یافته | شدت | توضیح |
|---|---|---|---|
| V1 | هیچ انتزاع (abstraction) برای «منبع سکرت» وجود ندارد: کد مستقیماً `process.env` را می‌خواند (`src/lib/secret-guard.ts`, `src/lib/objectStore.ts`, `src/lib/settings.ts`). | متوسط | پیشنهاد: یک لایهٔ `SecretProvider` (env → file → vault) با cache کوتاه‌مدت و hot-reload اختیاری. |
| V2 | تنظیمات بخش «پیکربندی سامانه» (settings) سکرت‌ها را در DB (`system_settings`, type `secret`) ذخیره می‌کند؛ این سکرت‌ها رمزنگاری at-rest ندارند. | متوسط | پیشنهاد: رمزنگاری ستونی با کلید اصلی (KEK) یا انتقال سکرت‌های حساس به ENV/Vault. |
| V3 | Docker Secrets (`/run/secrets/*`) پشتیبانی نمی‌شود؛ compose از `${VAR}` استفاده می‌کند. | پایین | افزودن پشتیبانی از `*_FILE` (مثل Postgres official image) امکان‌پذیر است اما نیاز به refactor متوسط دارد. |

### ۳.۶) مدیریت سکرت‌های cron

| # | یافته | شدت | توضیح |
|---|---|---|---|
| C1 | کلیدهای cron در DB و volume متن ساده‌اند؛ دسترسی volume به migrator (rw) و scheduler (ro) محدود است. | پایین | قابل قبول با chmod 0600. |
| C2 | `seed-base.mjs` هنگام نبود `/secrets` (توسعه) فقط DB را پر می‌کند؛ scheduler در توسعه secrets ندارد ⇒ پویش‌ها اجرا نمی‌شوند (هشدار واضح). | اطلاعاتی | رفتار عمدی. |
| C3 | چرخش کلید cron نیازمند `make migrate` + `docker compose restart scheduler` است؛ اگر فقط `.env` عوض شود و migrate اجرا نشود، DB و scheduler ناهماهنگ می‌مانند. | متوسط | پیشنهاد: اسکریپت چرخش خودکار یا بررسی هماهنگی در startup. |

---

## ۴) اصلاحات اعمال‌شده (Safe Small Fixes)

1. **`src/lib/secret-guard.ts`**  
   - افزودن بررسی تکرار چهارتایی کاراکتر در `checkDbSecret` (هم‌سو با `secret-policy.mjs`).  
   - افزودن پارامتر اختیاری `minLen` به `checkDbSecret`.  
   - افزودن ثابت `MIN_LEN_OBJECT_STORE = 16`.  
   - در `assertProdSecrets`، رمز S3 با کف ۱۶ بررسی می‌شود و کلید دسترسی S3 فقط پیش‌فرض توسعه رد می‌شود (نه کف ۲۴).  
2. **`src/lib/samin/crypto.ts`**  
   - حذف fallback به `TICKET_TOKEN_SECRET`؛ اکنون `SAMIN_MASTER_KEY` به‌صورت مستقل الزامی است (جلوگیری از استفادهٔ مجدد یک سکرت).  
3. **`install-docker.sh` / `install-docker.ps1`**  
   - حذف چاپ رمز کنسول MinIO (`afagh / afagh-secret`) از خروجی نصب؛ ارجاع به `.env`.  

---

## ۵) توصیه‌های پیشنهادی (بدون تغییر کد در این دور)

1. **Docker Secrets / `*_FILE`:** پشتیبانی از خواندن سکرت‌ها از فایل (`POSTGRES_PASSWORD_FILE` و…) برای جلوگیری از افشای در `docker inspect`.  
2. **Vault/Secret Manager:** افزودن یک `SecretProvider` با پشتیبانی از HashiCorp Vault یا AWS Secrets Manager؛ حداقل برای سکرت‌های بیرونی (SMS, Payment).  
3. **رمزنگاری at-rest در DB:** رمزنگاری ستونی `system_settings.value` برای type `secret` با KEK مشتق از `AFAGH_PII_KEY` یا کلید جدا.  
4. **اتوماسیون چرخش cron:** اسکریپت `rotate-cron-secret.mjs` که `.env` + DB + volume را همگام کند.  
5. **پاک‌سازی snapshotها:** cron روزانه برای حذف `.env.bak.*` قدیمی‌تر از ۷ روز.  
6. **محدود کردن دسترسی volume:** اطمینان از chmod 0700 روی `/secrets` و `/backups` در migrator (در حال حاضر فایل 0600 است، دایرکتوری پیش‌فرض root).  

---

## ۶) چک‌لیست تأیید

- [x] `git diff --check` بدون خطای whitespace  
- [x] هیچ فایل schema/drizzle/protected تغییر نکرده  
- [x] هیچ build/test/commit اجرا نشده  
- [ ] بررسی دستی: `make check-env` روی استقرار واقعی  
- [ ] بررسی دستی: `docker compose config` (بدون خطای YAML)  

---

## ۷) فایل‌های تغییریافته

- `afagh-next/src/lib/secret-guard.ts`  
- `afagh-next/src/lib/samin/crypto.ts`  
- `install-docker.sh`  
- `install-docker.ps1`  
- `docs/SECRETS-MANAGEMENT-REVIEW.md` (این گزارش)  
