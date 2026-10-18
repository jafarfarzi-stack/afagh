# CI baseline — what the pipeline actually reports

این سند «عکس لحظه‌ای» وضعیت واقعی دروازه‌های CI روی شاخهٔ `FINAL` است.
هدفش این است که وقتی یک PR قرمز شد، بدانیم «قرمزِ جدید» است یا «قرمزِ از قبل موجود».

- **کامیت پایه:** `cf3922b` (`fix(scheduling): fail-closed university scope…`)
- **تاریخ اجرا:** ۱۸ اکتبر ۲۰۲۶
- **محیط اجرا:** کپی تمیز مخزن روی سرور، `node:22-bookworm-slim`، بدون فایل `.env`
  (همان چیزی که GitHub Actions و ایمیج Docker می‌بیند).

## ⚠️ پیش‌نیاز سخت: Node 22 برای `next build`

`next build` با **Node 20** به‌طور تصادفی می‌شکند:

```
Error [InvariantError]: Invariant: Expected workStore to be initialized.
Error occurred prerendering page "/change-password"   (یا /group-manager، یا /_global-error)
```

نکتهٔ مهم: صفحهٔ شکست‌خورده در هر اجرا **تغییر می‌کند** (`/change-password` یک بار،
`/group-manager` بار دیگر). یعنی مشکل در یک صفحهٔ خاص نیست؛ خودِ مرحلهٔ prerender
با Node 20 خراب است. با **Node 22** همان کامیت، همان درخت، ۳۰/۳۰ صفحه را می‌سازد.

- CI روی `node-version: 22` است ✅
- `Dockerfile` هم Node 22 دارد ✅
- **فقط سیستم توسعه/سرور محلی ممکن است Node 20 داشته باشد** (روی سرور `v20.19.2`).
  اگر بیلد محلی گرفتید، از Node 22 استفاده کنید یا داخل کانتینر بیلد بگیرید.

## نتیجهٔ دروازه‌ها — قبل و بعد

| دروازه | دستور | `cf3922b` (قبل) | الان |
|---|---|---|---|
| تایپ‌چک | `tsc --noEmit` | ✅ | ✅ صفر خطا |
| تست واحد | `npm test` (۴۵ فایل) | ✅ | ✅ exit 0 (`release-hardening 18✓/0✗`) |
| گارد اکشن‌ها | `node scripts/audit-actions.mjs` | ❌ ۱۲ مورد | ✅ ۳۸۱ اکشن، صفر بدون گارد |
| بیلد | `next build` روی Node 22 | ❌ (TS2344) | ✅ ۳۰/۳۰ صفحه |
| ممیزی وابستگی | `node scripts/ci-audit.mjs` | ❌ ۱ critical + ۳ high | ✅ صفر high/critical |

**هر پنج دروازه سبز است.** ششمین دروازه (`rls-integration`) هم پس از رفع علت ریشه‌ای
(بخش بعدی) روی سرویس‌های دورریز سبز شد.

## رفع `rls-integration` — علت ریشه‌ای: نقش `afagh_app` پیش از مهاجرت‌ها وجود ندارد

`migrate-db.mjs` روی دیتابیس **خالی** (CI یا نخستین استقرار) در مهاجرت
`0058_staff_term_roles_rls.sql` می‌شکست:

```
error: role "afagh_app" does not exist
  code: '42704'   routine: 'get_role_oid'
  at async migrate (…/migrator.js:4:3)
```

**چرا:** چهار مهاجرت سیاست RLS را با `CREATE POLICY … TO afagh_app` می‌سازند
(`0058`, `0061`, `0063`, `0099`)، ولی نقش `afagh_app` را `src/db/pg-hardening.sql`
می‌سازد که در پایپ‌لاین **بعد از** مهاجرت‌ها اجرا می‌شود
(`migrate → patches → seed → hardening`). در پروداکشن هرگز دیده نمی‌شد چون نقش
از قبل موجود بود؛ فقط محیط خالی می‌شکست.

**اصلاح:** یک گام پیش از مهاجرت در جاب `rls-integration` که نقش را idempotent
می‌سازد (`.github/workflows/ci.yml`). `hardening.mjs` بعداً رمز/گرنت‌ها را تنظیم
می‌کند و نسبت به وجود نقش idempotent است (`pg-hardening.sql:40-46`).

**اثبات:** کل زنجیره روی پستگرس ۱۶ و ردیس ۷ دورریز (پورت‌های ۵۵۴۳۲/۵۶۳۷۹، جدا از
پروداکشن) اجرا شد:

| گام | نتیجه |
|---|---|
| `migrate-db.mjs` | ✅ ۱۰۷/۱۰۷ مهاجرت ثبت شد |
| `apply-patches.mjs` | ✅ exit 0 |
| `seed-base.mjs` | ✅ exit 0 |
| `hardening.mjs` | ✅ exit 0 |
| `rls-test.mjs` | ✅ exit 0 (UPDATE/DELETE/INSERT دانشجوی دیگر همه رد شدند؛ گرنت ستونی نمره اعمال شد) |
| `concurrency-test.mjs` | ✅ exit 0 (تأیید/وصول/تخصیص: دقیقاً یک برنده) |
| `waiting-room-zset.test.mts` | ✅ ۱۱ موفق / ۰ ناموفق |

کامیت: `dab3291`.


## ارتقای وابستگی‌ها (پس از رفع مسدودکننده‌ها)

| بسته | قبل | بعد | دلیل |
|---|---|---|---|
| `next` | `16.3.4` | **`16.4.2`** | CVE بحرانی: RCE در `next/og` + نشت محتوای Draft Mode |
| `xlsx` | `^0.18.5` (npm) | **`0.20.3` از CDN رسمی SheetJS** | Prototype Pollution + ReDoS |
| `source-map-js` | `1.2.1` (وابستهٔ postcss) | **`1.2.2`** با `overrides` | ReDoS در offset بخش‌های source-map |

نکتهٔ `xlsx`: نسخهٔ npm این بسته از ۰.۱۸.۵ جلوتر نرفته و خودِ SheetJS انتشار را به
CDN خودش منتقل کرده. بنابراین در `package.json` به‌صورت URL آمده:

```json
"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
```

پیامد عملی: بیلد Docker و `npm ci` در CI باید به `cdn.sheetjs.com` دسترسی داشته باشند.
اگر روزی این دامنه در دسترس نبود، بیلد می‌شکند — این یک وابستگی خارجی آگاهانه است.
(جایگزین: ماندن روی ۰.۱۸.۵ و پذیرش ریسک. کد ما فقط مسیر **نوشتن** اکسل را دارد —
`aoa_to_sheet` + `write` در `src/lib/export-utils.ts` — و هیچ فایل ورودی کاربر را
**نمی‌خواند**؛ پس هر دو CVE عملاً قابل بهره‌برداری نبودند. با این حال ارتقا تمیزتر است.)

**تصحیح مهم (بررسی ۱۸ اکتبر):** `generateXLSX` در `src/lib/export-utils.ts` **هیچ
فراخوانی‌ای در `src/` ندارد** — یعنی امروز هیچ مسیر اجرایی، فایل XLSX تولید نمی‌کند:

| مسیر | خروجی واقعی |
|---|---|
| دکمهٔ «خروجی Excel» در `admin/reports` | **CSV** سمت کلاینت (BOM + خنثی‌سازی تزریق فرمول، `ReportsClient.tsx:193-203`) |
| `GET /api/admin/finance/export` | **HTML/DOCX** از `src/lib/export-doc.ts` |
| `generateXLSX` | کد مرده (بدون مصرف‌کننده) |

بنابراین ریسک ارتقای `xlsx` در عمل صفر است، و صحت خودِ بستهٔ ۰.۲۰.۳ روی مسیر بیلد
سرور با یک رفت‌وبرگشت نوشتن/خواندن فارسی تأیید شد (۱۵٬۹۵۵ بایت، خواندن برگشتی درست).


## چه چیزی در همین بررسی اصلاح شد

| فایل | مشکل | اصلاح |
|---|---|---|
| `.github/workflows/ci.yml` | `push` فقط روی `main` بود، در حالی که همهٔ کار روی `FINAL` است → CI هرگز اجرا نشده بود | `push: { branches: [main, FINAL] }` |
| `scripts/audit-actions.mjs` | سه نقص: (۱) `requireRoleOrPermission` در فهرست گاردها نبود؛ (۲) واگذاری به اکشن گارددار را دنبال نمی‌کرد؛ (۳) فایل‌هایی که واژهٔ `'use server'` فقط در **کامنتشان** بود را هم ممیزی می‌کرد | تشخیص دقیق دایرکتیو + افزودن گارد + دنبال‌کردن زنجیرهٔ واگذاری تا ثبات |
| `src/app/admin/manual-enroll/actions.ts` | `isTermActive()` در فایل `'use server'` بدون گارد و **بدون هیچ مصرف‌کننده‌ای** اکسپورت شده بود → یک اندپوینت عمومی برای خواندن وضعیت ترم هر دانشجو | حذف شد (کد مرده) |
| `src/app/admin/tuition/tariff/page.tsx` | `export const MALI_TYPE_LABELS` در فایل `page.tsx` → Next 16 نوع تولیدی می‌سازد که هر اکسپورت اضافه را رد می‌کند و build با `TS2344` می‌شکند | `export` حذف شد (فقط داخل همان فایل استفاده می‌شد) |
| `package.json` + `package-lock.json` | ۱ critical + ۳ high | ارتقای `next`، `xlsx`؛ override برای `source-map-js` |

نکتهٔ آموزنده دربارهٔ مورد `page.tsx`: **`tsc --noEmit` این خطا را نمی‌بیند**، چون
`.next/types` فقط هنگام `next build` ساخته می‌شود. پس «تایپ‌چک سبز» به‌تنهایی
ثابت نمی‌کند بیلد سالم است — و همین دقیقاً یکی از قواعد
`docs/CODE-REVIEW.md` است: برای تغییرهای P0، شاهدِ اجرا لازم است، نه فقط diff.

## چیزهایی که این محیط (کپی سرور) نمی‌تواند اجرا کند

- `rls-integration` روی **همان** دیتابیس پروداکشن — نه به‌خاطر ابزار، بلکه به‌خاطر
  اصل «هرگز مهاجرت/تست روی دادهٔ زنده». با سرویس‌های دورریز اجرا شد (بالا).
  دستور بازتولیدش:

  ```bash
  docker run -d --name scratch_pg -e POSTGRES_USER=afagh -e POSTGRES_PASSWORD=test-password \
    -e POSTGRES_DB=afagh_db -p 127.0.0.1:55432:5432 postgres:16-alpine
  docker run -d --name scratch_redis -p 127.0.0.1:56379:6379 redis:7-alpine
  # نقش باید پیش از مهاجرت‌ها باشد (همان علت ریشه‌ای بالا):
  docker exec scratch_pg psql -U afagh -d afagh_db -c \
    "CREATE ROLE afagh_app LOGIN PASSWORD 'test-app-password' NOSUPERUSER NOBYPASSRLS"
  export DATABASE_URL=postgres://afagh:test-password@127.0.0.1:55432/afagh_db
  export DATABASE_URL_APP=postgres://afagh_app:test-app-password@127.0.0.1:55432/afagh_db
  export REDIS_URL=redis://127.0.0.1:56379 AFAGH_BACKUP_DIR=/tmp/ci-backups
  node scripts/migrate-db.mjs && node scripts/apply-patches.mjs && node scripts/seed-base.mjs
  AFAGH_APP_DB_PASSWORD=test-app-password node scripts/hardening.mjs
  node scripts/rls-test.mjs && node scripts/concurrency-test.mjs
  npx tsx scripts/waiting-room-zset.test.mts
  docker rm -f scratch_pg scratch_redis
  ```

## دستور بازتولید همین نتیجه

```bash
# روی ماشینی با Docker
git checkout cf3922b
cd afagh-next && npm ci
npx tsc --noEmit
npm test
node scripts/audit-actions.mjs
node scripts/ci-audit.mjs
# بیلد باید داخل Node 22 اجرا شود، نه Node 20:
docker run --rm -v "$PWD/..:/repo" -w /repo/afagh-next \
  -e NODE_OPTIONS=--max-old-space-size=3072 -e NODE_ENV=production \
  node:22-bookworm-slim ./node_modules/.bin/next build
```
