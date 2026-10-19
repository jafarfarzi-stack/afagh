# دیجست فشردهٔ جلسه — QA روند ارائهٔ مدیر گروه + H1/H2/H3 + هاردنینگ

**تاریخ:** ۲۰۲۶-۱۰-۱۹ · **شاخه:** `FINAL` · **ریپو:** `D:\afagh` (اپ در `afagh-next/`)
**هدف:** تحلیل/اصلاح/تست روند ارائهٔ مدیر گروه (اختصاصی و مشترک) و بستن یافته‌های باز.
**این فایل جای خواندن کل سشن را می‌گیرد.** برای ادامه، فقط همین + فایل هدف کافی است.

---

## ۱) وضعیت فعلی (یک نگاه)

| مورد | مقدار |
|---|---|
| کامیت‌های این جلسه | `209e878` (H1/H2/H3) · `3a16445` (نتیجهٔ ۴۵/۴۵) · `56338d9` (H1-hardening) |
| هارنس gm1 روی استیجینگ | **۴۵/۴۵** — دو اجرای متوالی، idempotent |
| `tsc --noEmit` | تمیز |
| `npm test` | هر ۴۴ فایل سبز (`enroll-submit-batch` ۱۲/۱۲) |
| ایندکس استیجینگ | `uq_course_offerings_term_course_group` — **جزئی** `WHERE isActive = 1` |
| تونل استیجینگ | باز است (5433/6380) — پایدار نیست |

## ۲) سه فاز کار

1. **تحلیل ایستا:** خواندن روند ارائه از کد → یافته‌های G1–G8 + پلن تست A–E (`test-plan-gm-offering-2026-10-19.md`).
2. **اصلاح:** G1–G7 + F1 (گیت مالی) + استخراج مرجع یگانهٔ گاردها (`src/lib/offering-scheduling.ts`).
3. **تست و بستن:** هارنس gm1 (۳۸ پاس) → سه یافتهٔ H1/H2/H3 → ۴۵ پاس → هاردنینگ مهاجرت تولید.

## ۳) یافته‌ها و محل اصلاح

| # | موضوع | اصلاح | فایل |
|---|---|---|---|
| G1 | هدف‌گیری ارائه اعمال نمی‌شد | `offeringVisible` در کاتالوگ/سبد/گیت نهایی | `student/enroll/{page,actions}.tsx` · `submit.ts` |
| G2 | تداخل سالن/استاد | `detectScheduleConflicts` | `offering-scheduling.ts` |
| G3 | کلاس‌های دانشگاه دیگر | مالکیت دقیق دانشگاه + فیلتر فهرست | `group-manager/classrooms/*` |
| G4 | ارائهٔ غیرفعال از سبد کهنه | `isActive=1` در سبد + پاک‌سازی هنگام غیرفعال‌سازی | `submit.ts` · GM actions |
| G5 | تکراری (درس+گروه) در ویرایش | `findDuplicateOffering` با exclude | `offering-scheduling.ts` |
| G6 | استاد غیرفعال/دانشگاه دیگر | `professorInUniversity` | همان |
| G7 | ظرفیت سالن < ارائه | `capacityWarning` (هشدار، نه بلاک) | همان |
| F1 | گیت مالی با FK اشتباه (ترم مالی ≠ تحصیلی) | `financial_terms.academicTermId ?? term.id` | `submit.ts` |
| H1 | نبود یکتایی DB (TOCTOU) | ایندکس یکتای **جزئی** + pre-check + ابزار رفع | `drizzle/0103_*.sql` · `schema.ts` · `scripts/offering-duplicates.mjs` |
| H2 | ردیف کهنهٔ سبد کل ثبت را abort می‌کرد | soft-drop + `droppedCart` + ثبت بقیه + نمایش در UI | `submit.ts` · `EnrollClient.tsx` |
| H3 | بازهٔ ورودی وارونه → ارائهٔ نامرئی | `validateEntryYearRange` (GM + ادمین) | `offering-scheduling.ts` · GM/admin actions |

## ۴) تصمیم‌های مهم (قاعده، نه سلیقه)

- **یکتایی ارائه = فقط «فعال‌ها»:** حداکثر یک ارائهٔ فعال برای هر (ترم+درس+گروه)؛ ردیف غیرفعال تاریخچه است و مانع ساخت جدید نمی‌شود. `findDuplicateOffering` هم `isActive=1` فیلتر می‌کند.
- **H2 = soft-drop نه abort:** ردیف نامرتبط/غیرفعال/خارج از هدف از سبد حذف، در `droppedCart` گزارش، بقیه ثبت. اگر هیچ درسی نماند → خطای روشن بدون تراکنش.
- **`--fix` غیرتخریبی است:** انتقال ثبت‌نام/سبد/جلسه به نگه‌دارنده (بیشترین ثبت‌نام واقعی، تساوی→کمترین id)، حفظ بهترین وضعیت `REGISTERED > PENDING_COUNCIL > WAITLISTED`، بازمحاسبهٔ `enrolledCount`، **غیرفعال‌سازی** ردیف اضافی (هیچ حذفی نداریم).

## ۵) دستورهای عملیاتی

```bash
cd D:/afagh/afagh-next
node node_modules/typescript/bin/tsc --noEmit        # typecheck (npm run typecheck گاهی خروجی خالی می‌دهد)
npm test                                              # ۴۴ فایل — زنجیرهٔ && ؛ exit code معیار است

# تونل استیجینگ (پایدار نیست؛ هر نشست دوباره)
ssh -N -L 5433:127.0.0.1:5433 -L 6380:127.0.0.1:6380 root@100.70.187.120

# هارنس gm1 — شرط react-server اجباری است (زنجیرهٔ server-only)
DATABASE_URL='postgres://postgres:<pw>@127.0.0.1:5433/afagh_staging' \
  npx tsx --conditions=react-server scripts/gm1-offering-flow.ts

# مهاجرت (خودش پشتیبان می‌گیرد؛ در نبود pg_dump: AFAGH_MIGRATE_NO_BACKUP=1 فقط توسعه)
DATABASE_URL=… npm run db:migrate

# پیش‌نیاز 0103 روی تولید
DATABASE_URL=… node scripts/offering-duplicates.mjs        # گزارش (exit 2 = تکراری دارد)
DATABASE_URL=… node scripts/offering-duplicates.mjs --fix  # ادغام ایمن
```

## ۶) نکته‌های گیر‌انداز (اینها وقت می‌برند)

- `server-only` بیرون از Next می‌شکند → `tsx --conditions=react-server`؛ و ماژول‌های `@/lib/group-manager` قابل import نیستند (replica SQL در هارنس).
- هارنس روی استیجینگ با کاربر `postgres` وصل می‌شود (نقش `afagh` دسترسی جدول ندارد).
- شناسه‌های سنتتیک هارنس در رنج `1_600_000+`؛ `reset()` قبل از هر اجرا تمیز می‌کند (FK order مهم: notifications → staff → users).
- `DROP INDEX` + `CREATE ... IF NOT EXISTS` با هم یعنی تغییر تعریف ایندکس بی‌اثر می‌شود؛ اول DROP.
- کامیت‌های جلسات دیگر هم روی همین شاخه‌اند؛ **فقط فایل‌های خودت را stage کن**.
- گزارش‌های فارسی: بعد از نوشتن، کاراکتر CJK/عربی جاافتاده را grep کن.

## ۷) فایل‌های کلیدی

| مسیر | نقش |
|---|---|
| `src/lib/offering-scheduling.ts` | مرجع یگانهٔ گاردهای ارائه (پنجره، بازهٔ ورودی، تداخل، استاد، تکراری، کلاس، ظرفیت) |
| `src/lib/enroll-engine/submit.ts` | خط لولهٔ ثبت: مالی → ظرفیت → سقف واحد → پیش‌نیاز → تداخل + soft-drop سبد |
| `src/app/group-manager/offerings/actions.ts` | ساخت/ویرایش/غیرفعال‌سازی ارائه + برنامهٔ هفتگی |
| `scripts/gm1-offering-flow.ts` | هارنس ۴۵ سناریو (گروه‌های B/F1/G4/C/A/D/E/H) |
| `scripts/offering-duplicates.mjs` | pre-flight + `--fix` تکراری‌های ارائه |
| `drizzle/0103_course_offerings_term_course_group_unique.sql` | ایندکس یکتای جزئی + pre-check |
| `deliverables/gstack/qa-report-gm-offering-flow-2026-10-19.md` | گزارش کامل QA |
| `deliverables/gstack/test-plan-gm-offering-2026-10-19.md` | پلن تست + لاگ اصلاحات |
| `docs/RELEASE-READINESS.md` §۷ | رانبوک تولید مهاجرت 0103 |

## ۸) باقی‌مانده / بعدی

- **S2 smoke:** اکشن‌های Next با نشست واقعی (authz `requireDepHead`، چرخهٔ حیات از فرم‌ها) — در S1 پوشش داده نشد.
- **تسک‌های قدیمی #8/#9:** لودتست ثبت‌نام/امتحان (خارج از دامنهٔ این جلسه؛ گزارش `loadtest-enroll-exams-caps` موجود است).
- **تولید:** قبل از `db:migrate` ابزار `offering-duplicates` را بزنید (رانبوک §۷).
- تونل استیجینگ بعد از پایان کار بسته شود.

## ۹) ادامهٔ کار با کمترین توکن

1. همین فایل را بخوان (کافی است).
2. اگر کار روی ارائه/ثبت‌نام است: `offering-scheduling.ts` + `submit.ts` را باز کن، نه کل ریپو.
3. قبل از هر تغییر: `git log --oneline -3` و `git status` (جلسات موازی روی همین شاخه کار می‌کنند).
4. بعد از تغییر: `tsc` → `npm test` → هارنس gm1 (اگر تونل باز است).
