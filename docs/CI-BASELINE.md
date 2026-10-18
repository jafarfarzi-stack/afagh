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

**هر پنج دروازه سبز است.** تنها چیزی که همچنان قرمز می‌ماند `rls-integration` است که
اینجا اجرا نشد (پایین توضیح داده شده).

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
(جایگزین: ماندن روی ۰.۱۸.۵ و پذیرش ریسک. کد ما فقط مسیر **نوشتن** اکسل را استفاده
می‌کند — `aoa_to_sheet` + `write` در `src/lib/export-utils.ts` — و هیچ فایل ورودی
کاربر را **نمی‌خواند**؛ پس هر دو CVE عملاً قابل بهره‌برداری نبودند. با این حال ارتقا
تمیزتر است.)

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

## چیزهایی که این محیط نمی‌تواند اجرا کند

- `rls-integration` (پستگرس + ردیس واقعی) — نیاز به سرویس‌های compose دارد؛
  روی سرور قابل اجراست ولی باید با دیتابیس **جدا** اجرا شود، نه روی دیتابیس
  پروداکشن.
- `concurrency-test` — همان شرط.

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
