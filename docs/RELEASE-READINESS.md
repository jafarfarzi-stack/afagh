# آماده‌سازی انتشار (Release Hardening) — RC-1 → RC-2

این سند، مسیر عملیاتی پروداکشن را ثابت می‌کند: چه چیزی تغییر کرد، با چه دستوری
آزموده می‌شود، و چه چیزی هنوز باز است. (بررسی مهندسی ۱۳۸۵/۰۶/۱۸ — چهار P0 و پنج P1.)

> ⚙ **یادداشت اجرایی CI**: تغییر `​.github/workflows/ci.yml` (گام DR drill و job
> «دروازهٔ انتشار») به‌دلیل مجوز `workflows` ربات در این مخزن **push نشده** و به‌صورت
> پچ کنارِ آن است:  `git apply deploy/ci-release-gate.patch` — یک‌بار توسط کسی که
> روی مخزن حق ویرایش workflow دارد اجرا و commit شود. تا زمانی که اعمال نشده،
> DR drill و دروازهٔ سخت‌گیر اجرا نمی‌شوند (بقیهٔ تغییرات همین حالا در مخزن‌اند).

وضعیت: **RC-1** → پس از «DR drill موفق روی سرور واقعی + UAT دانشگاه» → **RC-2** → پس از
تست نصب واقعی و Dry‑Run → **v1.0.0**. تا پیش از RC-2 برچسب `v1.0.0` نزنیم.

---

## ۱) چهار P0 — وضعیت و نحوهٔ اثبات

| مورد | چه شد | چطور اثبات می‌شود |
|---|---|---|
| **P0-1** رمز پیش‌فرض `afagh-app-pass` | compose دیگر هیچ `:-` برای `POSTGRES_PASSWORD`/`AFAGH_APP_DB_PASSWORD` ندارد (`${VAR:?…}`)؛ سیاست رمز در **یک فایل** (`afagh-next/scripts/lib/secret-policy.mjs`) تعریف شده و سه لایه آن را می‌زنند: `make check-env`، `hardening.mjs` (پیش از `ALTER ROLE`)، و `src/lib/secret-guard.ts` (پیش از ساختن هر استخر اتصال در اپ) | `make check-env` · `node afagh-next/scripts/lib/secret-policy.mjs --check .env` · `tsx tests/release-hardening.test.ts` · job «دروازهٔ انتشار» در CI که ثابت می‌کند `docker compose config` بدون `.env` **رد می‌شود** |
| **P0-2** پشتیبان ماندگار نبود | `afagh_backups:/backups` روی `migrator` (قبلاً داخل فایل‌سیستم کانتینر یک‌بارمصرف بود)؛ `backup-db.mjs` حالا خروجی را **راستی‌آزمایی** می‌کند (`pg_restore --list` + حداقل حجم) و `sha256` + `LATEST` می‌نویسد و retention دارد (`AFAGH_BACKUP_KEEP`، پیش‌فرض ۱۴)؛ گام ۵ migrator: `verify-backup.mjs` | `make backup` · `make verify-backup` · **`make drill`** (بازگردانی در دیتابیس موقت + مقایسهٔ شمار ردیف‌ها + بررسی RLS) · `make copy-backups-to-host DEST=/mnt/nas` · در CI: step «DR drill» |
| **P0-3** `drizzle-kit push --force` در پروداکشن | migrator حالا همان `scripts/migrate-db.mjs` را می‌زند که CI می‌زند: پشتیبان → `drizzle/*.sql` با دفتر مهاجرت → پچ‌ها → seed → hardening → verify. دیتابیس‌های قدیمی که با push ساخته شده‌اند، در نخستین اجرا **baseline خودکار** می‌شوند (فقط ثبت hash) | `docker compose logs migrator` (پنج گام) · `node scripts/migrate-db.mjs` روی دیتابیس موجود · تست استاتیک: «`drizzle-kit push` در Dockerfile نیست» |
| **P0-4** رمز ثابت `123456` در خروجی نصب | خلاصهٔ `deploy-debian.sh` دیگر هیچ رمز ثابتی چاپ نمی‌کند؛ انتهای نصب `scripts/create-admin.mjs` اجرا می‌شود: رمز **تصادفی**، `mustChangePassword=1`، باطل‌کردن نشست‌های قبلی، نوشتن در `bootstrap-credential.txt` (۰۶۰۰) و **بدون چاپ در ترمینال** (مگر `--show` با اجرای دستی). قفل دمو هم از ENV به **build‑arg** تبدیل شد (`AFAGH_DEMO_LOCK`، پیش‌فرض قفل) | `make admin` · `sudo cat bootstrap-credential.txt` · تست استاتیک: «هیچ خط چاپِ `123456` در اسکریپت نصب نیست» |

## ۲) سیاست رمز (متن واحد)

- `POSTGRES_PASSWORD` و `AFAGH_APP_DB_PASSWORD`: حداقل **۲۴** کاراکتر، نه مقدار نمونه
  (`CHANGE_ME*`)، نه یکی از پیش‌فرض‌های شناخته‌شده، بدون چهار تکرار پشت‌سرهم.
- `MINIO_ROOT_PASSWORD`: حداقل **۱۶**.
- رمز تصادفی: `node afagh-next/scripts/lib/secret-policy.mjs --gen` — یا `./deploy-debian.sh`
  که خودش سه رمز ۳۲تایی را در `.env` با `chmod 600` می‌نویسد و برای نصب‌های قدیمی backfill می‌کند.
- توسعهٔ محلی: `ALLOW_WEAK_SECRETS=1 make up` — فقط مقدار **نمونه/ضعیف** را به هشدار تبدیل می‌کند؛ مقدار خالی یا کوتاه‌تر از حد، حتی در توسعه هم پذیرفته نمی‌شود.

## ۳) پشتیبان و بازیابی — قرارداد عملیاتی

```
make backup                     # pg_dump -Fc + sha256 + LATEST در volume afagh_backups
make verify-backup              # امضا + pg_restore --list (ساختار قابل‌بازگردانی؟)
make drill                      # بازگردانی در afagh_drill + مقایسهٔ ردیف‌ها + RLS پس از بازیابی
make copy-backups-to-host DEST=/mnt/nas/afagh
make restore-dump FILE=backups/afagh-….dump     # بازگردانی روی afagh_db (فاجعه)
```

قاعدهٔ پذیرش: **پشتیبانی که بازگردانی نشده، پشتیبان نیست.** `make drill` باید در هر
انتشار و حداقل ماهی یک‌بار اجرا شود؛ خروجی‌اش در لاگ نگه داشته شود. برای محیط
آفلاین، کپی روی NAS/مقصد بیرونی الزامی است (volume تنها، روی همان سرور است).

## ۴) P1ها — چه شد و چه مانده

| مورد | وضعیت |
|---|---|
| **P1-04** Scheduler خطای HTTP را تشخیص نمی‌داد | ✅ رفع شد: `deploy/scheduler.sh` حالا سه دسته است (`ok` / `retryable` → تلاش مجدد پس از `SCHEDULER_RETRY_MIN` / `permanent` ۴۰۱·۴۰۳·۴۰۴ → `[CRITICAL]` و بازهٔ عادی) و پس از `SCHEDULER_FAIL_ALERT_AT` شکست پیاپی خط `[ALERT]` چاپ می‌کند تا لاگ‌بردار هشدار بدهد. با wget جعلی آزموده شد (۴ سناریو) |
| **P1-03** `npm audit` در قطعی رجیستری fail-open بود | ✅ دو سطح شد: CI معمولی (PR) هشدار می‌دهد؛ job «دروازهٔ انتشار» با `AFAGH_REQUIRE_REAL_AUDIT=1` قطعی رجیستری = **شکست** |
| **P1-05** Restore اثبات‌نشده | ✅ ابزار و CI ساخته شد (بالا). اثبات نهایی روی سرور دانشگاه/یک VM جدا باید انجام و بایگانی شود — هنوز یک مورد باز برای RC-2 |
| **P1-02** E2E مرورگری | ⏳ باز. پیشنهاد: Playwright، سه سناریو (ورود→انتخاب واحد→پرداخت / اصلاح نمره→تأیید مدیر گروه / استعلام مدرک) + `docker compose up` در CI. بدون آن «Feature Complete» را تائید نمی‌کنیم |
| **P1-01** اتصال مالک داخل کانتینر اپ | ⏳ باز و **بزرگ**: ۱۲۵ فایل `import { db } from '@/db'` دارند (کل اتصال مالک). حذف `DATABASE_URL` از سرویس `app` یعنی مهاجرت تدریجی همان فراخوانی‌ها به `appDb`/`withUserRls` و یک استثنای شفاف برای کارهای سروری (cron/import). فعلاً RLS با `withUserRls` و سیاست «fallback در production ممنوع» محافظت می‌شود + گارد استاتیک `audit-actions.mjs` |

P2های باز (مانع Demo نیستند): observability (metriک/الرت)، نسخه‌گذاری انتشار
(`git describe` در `/api/health`)، baseline عملکرد، مستندسازی lint gate.

## ۵) گیت‌های موجود در CI

| job | چه اثباتی |
|---|---|
| کالبد — تایپ، تست و بیلد | `tsc` · ۲۱ مجموعهٔ تست (شامل `release-hardening`) · ممیزی Server Action · `next build` · `ci-audit` |
| RLS — اثبات جداسازی سطری | `migrate-db.mjs` (نسخه‌دار) → پچ‌ها → seed → hardening → `rls-test` · `concurrency-test` · waiting‑room با Redis · **DR drill** (پشتیبان → بازگردانی → مقایسه) |
| فاز صفر — سلامت کد | `afagh-erp` سینتکس |
| دروازهٔ انتشار (فقط push به main) | `npm audit` سخت‌گیر · `docker compose config` با .env قوی (باید رندر شود) و بدون آن (باید **رد** شود) |

## ۶) چک‌لیست RC-2

1. [ ] اجرای `deploy-debian.sh --fresh` روی VM تازه (Debian 13) و ثبت خروجی پنج گام migrator
2. [ ] `make drill` روی همان VM + کپی یک پشتیبان به بیرون از سرور و بازیابی از آن
3. [ ] نصب بدون `bootstrap-credential.txt` قابل ورود نیست و رمز بعد از اولین ورود عوض می‌شود
4. [ ] سه سناریوی E2E (P1-02) حداقل در یک job
5. [ ] `AFAGH_BACKUP_KEEP` و برنامهٔ کپی به NAS در سند عملیات دانشگاه امضا شود
6. [ ] پس از همه: برچسب `v1.0.0-rc.2` (نه `v1.0.0` تا Dry‑Run کامل نشود)
