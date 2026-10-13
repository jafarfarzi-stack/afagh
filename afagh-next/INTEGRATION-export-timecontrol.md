# یکپارچه‌سازی — خروجی Word/Text مستقیم + کنترل زمانی ثبت مالی

> زیرمجموعهٔ پروژهٔ آفاق (`D:\afagh\afagh-next`) — شاخهٔ `FINAL`.
> این فایل فقط «تحویل» است: هیچ فایل موجودی تغییر نکرده؛ تغییرات پیشنهادی
> در ادامه با بلوک‌های ** قبل / بعد ** دقیق آمده تا اینتگراتور اعمال کند.

---

## ۱) فایل‌های ایجادشده (همهٔ جدید — هیچ فایل قبلی ویرایش نشده)

| فایل | نقش |
|---|---|
| `src/lib/export-doc.ts` | توابع خالصِ خروجی: `buildWordDocHtml` (HTML راست‌به‌چپ سازگار با Word)، `buildPlainText`، `buildCsv` (با گارد تزریق فرمول)، `makeExportFilename`، `DOC_CONTENT_TYPE='application/msword'` — بدون هیچ وابستگی npm |
| `src/lib/finance-time-control.ts` | گِیت زمانی مالی: `getActivePeriod()`، `isEntryAllowed(date?)`، `assertEntryAllowed(date?)` → `{ok:false, reason:'…فارسی…'}`، `getLockState()` برای UI، `invalidateTimeControlCache()` — کش درون-حافظه‌ای ۱۰ثانیه‌ای روی globalThis (الگوی `db/index.ts`) |
| `src/db/schema-timecontrol.ts` | جدول مستقل `accounting_periods` (خارج از `schema.ts` — سیاست انحصار فایل ماژول) |
| `drizzle/0082_finance_time_control.sql` | مهاجرت idempotent (`IF NOT EXISTS`)، timestamptz، UTF-8 — الگو: `0076_discipline.sql` |
| `src/app/api/admin/finance/export/route.ts` | `GET ?type=statement\|payments&format=doc\|txt\|csv` — خروجی attachment با `Content-Disposition` |
| `src/app/api/admin/finance/time-control/route.ts` | `GET` وضعیت قفل + `POST` ایجاد/به‌روزرسانی دوره (zod + requireRole + appendAudit + createLogger) |
| `src/app/admin/finance/time-control/page.tsx` | صفحهٔ مدیریت (server component —الگوی `rules/page.tsx`) |
| `src/app/admin/finance/time-control/TimeControlClient.tsx` | بنر وضعیت + فرم تنظیم دوره (نام، آغاز، پایان، کلید قفل) |

---

## ۲) مهاجرت دیتابیس

`drizzle/0082_finance_time_control.sql` ساخته شده (idempotent — `IF NOT EXISTS`
همه‌جا؛ اجرای چندباره امن است). طبق مشخصات این ماژول، خودِ `_journal.json`
دست‌نخورده گذاشته شد؛ **در حال حاضر** entry زیر در
`drizzle/meta/_journal.json` ثبت است (idx=86 — پس از `0080_council`)، پس
`node scripts/migrate-db.mjs` این مهاجرت را اعمال می‌کند:

```json
{
  "idx": 86,
  "version": "7",
  "when": 1794153604002,
  "tag": "0082_finance_time_control",
  "breakpoints": true
}
```

اگر در ادغام نهایی این entry حذف/جابه‌جا شد، یا برای محیطی که migrate-db
اجرا نمی‌شود، اجرای دستی:

```bash
psql "$DATABASE_URL" -f drizzle/0082_finance_time_control.sql
```

جدول نتیجه: `accounting_periods(id serial pk, period_name text, opens_at timestamptz not null, closes_at timestamptz not null, is_locked boolean default false, created_at, updated_at)` + ایندکس `idx_accounting_periods_opens_at`.

> توجه: `src/db/schema-timecontrol.ts` در `schema` اصلیِ `drizzle(db, { schema })`
> ثبت نشده (چون `schema.ts` دست‌نخورده ماند) — اشکالی ندارد؛ همهٔ مصرف‌ها
> `db.select()/insert()` مستقیم روی خود شیء جدول است (مثل ماژول discipline).

---

## ۳) کلیدهای مجوز (permission keys)

- **مسیر خروجی** `api/admin/finance/export`: عیناً از مسیر موجود
  `api/admin/finance/reports/student-statement/route.ts` کپی شده:
  `['ADMIN', 'FINANCE_EXPERT', 'FINANCE', 'CASHIER']` (از `requireRole`).
- **صفحه و API کنترل زمانی** (هم‌سطح صفحات مالی مانند `rules/page.tsx`):
  `['ADMIN', 'FINANCE_EXPERT', 'FINANCE']` — البته `requireRole` نقش `ADMIN`
  را همیشه می‌پذیرد (`auth.ts:571`).
- هیچ نقش/کلید جدیدی اضافه نشده؛ فقط از کلیدهای موجود استفاده شده.

---

## ۴) آیتم نویگیشن — «کنترل زمانی مالی»

فایل: **`src/app/admin/finance/page.tsx`** (کارتابل مالی — خطوط ۶۸ تا ۷۵؛
دقیقاً کنار لینک «انواع تخفیف، بنیادها و فرمول‌ها»). فایل فعلی هیچ تغییری
نکرده؛ snippet زیر را اعمال کنید:

**قبل:**

```tsx
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/finance/rules" className="rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700">
            ⚙️ انواع تخفیف، بنیادها و فرمول‌ها
          </Link>
          <Link href="/admin/tuition" className="rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700">
            🧮 موتور شهریه
          </Link>
        </div>
```

**بعد:**

```tsx
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/finance/rules" className="rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700">
            ⚙️ انواع تخفیف، بنیادها و فرمول‌ها
          </Link>
          <Link href="/admin/finance/time-control" className="rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700">
            🔒 کنترل زمانی مالی
          </Link>
          <Link href="/admin/tuition" className="rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700">
            🧮 موتور شهریه
          </Link>
        </div>
```

(اگر ناوبری مشترک/سایدبار هم دارد، همین متن لینک با همان href اضافه شود؛
فایل ناوبری در این تغییر لمس نشده است.)

---

## ۵) (الف) دکمهٔ «خروجی Word/Text» در صفحهٔ صورت‌حساب دانشجو

فایل هدف (فقط‌خواندنی بررسی شد، تغییری نکرده):
**`src/app/admin/finance/reports/StudentStatementClient.tsx`**
(کلاینت صفحهٔ `/admin/finance/reports/student-statement?studentId=…` —
خروجی‌های فعلی: چاپ/PDF و CSV/TXT سمت کلاینت؛ دکمهٔ جدید مستقیم از سرور
 Word/Text می‌سازد).

**قبل** (خطوط ۱۶۱–۱۶۶، بلوک دکمه‌های سربرگ):

```tsx
        <div className="flex gap-2">
          <button onClick={printStatement} className="rounded-lg bg-emerald-700 hover:bg-emerald-800 px-3 py-1.5 text-xs font-medium text-white">🖨️ چاپ / PDF</button>
          <button onClick={() => setViewMode(v => v === 'table' ? 'chart' : 'table')} className="rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700">
            {viewMode === 'table' ? '📊 نمودار' : '📋 جدول'}
          </button>
        </div>
```

**بعد:**

```tsx
        <div className="flex gap-2">
          <button onClick={printStatement} className="rounded-lg bg-emerald-700 hover:bg-emerald-800 px-3 py-1.5 text-xs font-medium text-white">🖨️ چاپ / PDF</button>
          <a
            href={`/api/admin/finance/export?type=statement&format=doc&studentId=${studentId}`}
            className="rounded-lg bg-indigo-700 hover:bg-indigo-800 px-3 py-1.5 text-xs font-medium text-white"
            title="دریافت مستقیم فایل Word (doc)"
          >
            📝 خروجی Word
          </a>
          <a
            href={`/api/admin/finance/export?type=statement&format=txt&studentId=${studentId}`}
            className="rounded-lg bg-slate-700 hover:bg-slate-800 px-3 py-1.5 text-xs font-medium text-white"
            title="دریافت مستقیم فایل متنی (txt)"
          >
            📄 خروجی Text
          </a>
          <button onClick={() => setViewMode(v => v === 'table' ? 'chart' : 'table')} className="rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700">
            {viewMode === 'table' ? '📊 نمودار' : '📋 جدول'}
          </button>
        </div>
```

نکته: `<a>` ساده کافی است (مرورگر هدر `Content-Disposition: attachment`
را می‌بیند و دانلود می‌کند) — نیازی به `saveAs`/`file-saver` نیست.
دادهٔ فایل از همان مسیر کانونی `getStudentFinance` می‌آید، پس با صفحه واگرا نمی‌شود.

همین الگو برای «فهرست پرداخت‌ها» (صفحهٔ گزارش‌ها):

```
GET /api/admin/finance/export?type=payments&format=doc
GET /api/admin/finance/export?type=payments&format=txt&dateFrom=1404-01-01&dateTo=1404-06-31   (تاریخ میلادی YYYY-MM-DD)
```

---

## ۶) (ب) فراخوانی `assertEntryAllowed()` در اکشن مالی

نمونهٔ منتخب (مهم‌ترین مسیر نوشتن دفتر مالی):
**`src/app/admin/finance/actions/ledger.ts`** → `recordLedgerAction` (خط ~۶۱؛
همان تابعی که پرداخت/شارژ POS و ویدی می‌نویسد). فایل فعلی تغییری نکرده.

**قبل** (بالای تابع — بعد از گیت‌های scope و پیش از `getSessionUser`):

```ts
export async function recordLedgerAction(input: {
  studentId: number;
  termId: number | null;
  transactionType: 'PAYMENT' | 'CHARGE' | 'POS_PAYMENT';
  amount: number;
  description: string;
  financialTermId?: number | null;
  referenceId?: number;
}, opts?: { tx?: LedgerTx; allowedRoles?: string[] }): Promise<{ ok: boolean; error?: string; ledgerId?: number }> {
  await requireRole(opts?.allowedRoles ?? FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };

  // فقط مبلغ صحیح مثبت؛ منفی/صفر همیشه رد می‌شود (fail-closed).
  const amount = safeRials(input.amount);
  if (amount === null || amount <= 0) {
    return { ok: false, error: 'مبلغ باید عدد صحیح و بزرگ‌تر از صفر باشد' };
  }
  const sc = await requireStudentScope(input.studentId);
  if (!sc.ok) return { ok: false, error: sc.error };
  const su = await requireStudentUni(input.studentId);
  if (!su.ok) return { ok: false, error: su.error };
```

**بعد:**

```ts
import { assertEntryAllowed } from '@/lib/finance-time-control';   // ← افزوده بالای فایل
// …
export async function recordLedgerAction(input: {
  studentId: number;
  termId: number | null;
  transactionType: 'PAYMENT' | 'CHARGE' | 'POS_PAYMENT';
  amount: number;
  description: string;
  financialTermId?: number | null;
  referenceId?: number;
}, opts?: { tx?: LedgerTx; allowedRoles?: string[] }): Promise<{ ok: boolean; error?: string; ledgerId?: number }> {
  await requireRole(opts?.allowedRoles ?? FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };

  // 🔒 کنترل زمانی دقیق ثبت مالی: فقط داخل دورهٔ مالی باز (و بدون قفل)
  const gate = await assertEntryAllowed();
  if (!gate.ok) return { ok: false, error: gate.reason };

  // فقط مبلغ صحیح مثبت؛ منفی/صفر همیشه رد می‌شود (fail-closed).
  const amount = safeRials(input.amount);
  if (amount === null || amount <= 0) {
    return { ok: false, error: 'مبلغ باید عدد صحیح و بزرگ‌تر از صفر باشد' };
  }
  const sc = await requireStudentScope(input.studentId);
  if (!sc.ok) return { ok: false, error: sc.error };
  const su = await requireStudentUni(input.studentId);
  if (!su.ok) return { ok: false, error: su.error };
```

نکات:

- `assertEntryAllowed()` **بالای `db.transaction`** صدا زده می‌شود (پیش از هر
  نوشتنی)؛ چون کش ۱۰ثانیه‌ای دارد، هزینهٔ هر اکشن یک SELECT اضافه در بدترین حالت است.
- سایر اکشن‌های مالی هم‌الگو هستند و همین دو خط به آن‌ها اضافه شود:
  - `src/app/admin/finance/actions/discounts.ts` → `addDiscountAction`، `setDiscountStatusAction`
  - `src/app/admin/finance/actions/ledger.ts` → `recordReversalAction`، `chargeByFormulaAction`
  - `src/app/admin/finance/actions/loans.ts`، `sponsorships.ts`، `cheques.ts` (ثبت/وصول چک)
  - `src/app/admin/finance/pos/` (ویدی POS — اگر از `recordLedgerAction` استفاده می‌کند،
    با اعمال اینجا به‌صورت خودکار پوشش داده می‌شود)
- قرارداد: اگر **هیچ** دوره‌ای تعریف نشده باشد، رفتار فعلیِ سیستم حفظ می‌شود
  (ثبت آزاد) — استقرار بدون قطع کار ممکن است.

---

## ۷) API خروجی — خلاصهٔ پارامترها

`GET /api/admin/finance/export`

| پارامتر | مقادیر | توضیح |
|---|---|---|
| `type` | `statement` \| `payments` | صورت‌حساب دانشجو / فهرست پرداخت‌ها (الزامی) |
| `format` | `doc` \| `txt` \| `csv` | پیش‌فرض `doc` — doc = HTML سازگار با Word با مای‌تایپ `application/msword` |
| `studentId` | عدد | برای statement الزامی؛ برای payments اختیاری |
| `dateFrom`/`dateTo` | `YYYY-MM-DD` (میلادی) | فقط برای payments — فیلتر روی `student_ledger.createdAt` |

خروجی همیشه `attachment` با UTF-8 BOM و `filename*=UTF-8''…` است.

---

## ۸) انحراف‌ها / نکات تصمیم

1. **فرمت `.doc`:** فایل Word تولیدشده در حقیقت HTML با مای‌تایپ
   `application/msword` است (ترفند استاندارد خروجی سروری — Word آن را مثل
   DOC واقعی باز و چاپ می‌کند؛ برخلاف `export-utils.ts` که سمت کلاینت DOCX
   واقعی با کتابخانهٔ `docx` می‌سازد). مزیت: بدون deps، سریع، RTL-preserve.
2. **نام ستون‌های جدول `accounting_periods` به‌صورت snake_case** است
   (`period_name`, `opens_at`, …) طبق مشخصات این ماژول — برخلاف بقیهٔ
   اسکیما که camelCase است. هماهنگ با `schema-timecontrol.ts` + migration.
3. **تنها یک دورهٔ فعال:** آخرین ردیفِ ثبت‌شده (id بزرگ‌تر) ملاک است؛
   به‌روزرسانی از طریق `id` در POST انجام می‌شود (فرم صفحه خودش id دورهٔ
   فعلی را می‌فرستد).
4. **کش ۱۰ ثانیه‌ای** قفل (globalThis مثل `db/index.ts`) + `invalidateTimeControlCache()`
   بلافاصله بعد از POST؛ حداکثر تأخیر اثر قفل در بدترین حالت ۱۰ ثانیه است.
5. صفحهٔ `/admin/finance/time-control` مثل بقیهٔ صفحات مالی با `requireRole`
   و `dynamic='force-dynamic'` است؛ API همان صفحه `GET/POST` سمت سرور است
   (نه server action) — الگوی `api/admin/payroll/*`.
6. **تایپ‌چک**: در محیط این subagent هیچ runtime از Node.js موجود نبود
   (npx/node نصب نیست)؛ `npx tsc --noEmit` اجرا نشد. در عوض بازبینی دقیق دستی
   با مراجعه به امضاهای واقعی پروژه انجام شد (`requireRole`، `appendAudit`
   AuditTx، `createLogger`، `toNum(value: unknown)`، `getStudentFinance`/
   TermStatement، زنجیره‌های drizzle `.limit(1).for('update')`، zod 3.23.8،
   React 19 useTransition). **پیش از ادغام، اینتگراتور یک `npx tsc --noEmit`
   اجرا کند** — نباید خطایی از این فایل‌ها بیاید، ولی تأیید نهایی بر عهدهٔ اوست.
