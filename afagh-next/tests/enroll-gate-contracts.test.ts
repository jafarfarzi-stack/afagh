/**
 * ════════════════════════════════════════════════════════════════════════
 *  تست قرارداد گیت‌های ثبت‌نام (contract suite)
 *
 *  ⚠ این پرونده «سوئیت قرارداد» است، نه تست واحد کلاسیک:
 *    • توابع خالص (isRealUniversityId / universityEq) واقعاً فراخوانی و SQL
 *      رندرشدهٔ drizzle بررسی می‌شود.
 *    • توابعی که به پایگاه داده می‌زنند (assertFinancialClearance و اکشن‌های
 *      سرور) فراخوانی «نمی‌شوند»؛ در عوض متنِ مبدأ با node:fs خوانده می‌شود و
 *      حضور گیت‌های الزامیِ قرارداد (تسویهٔ مالی، نقش، قفلِ دانشگاه، ردیف
 *      حسابرسی، آستانهٔ تأیید) در همان تابع هدف تأیید می‌گردد.
 *      شکستِ این تست یعنی یکی از گیت‌های قرارداد در پیاده‌سازی جا افتاده است.
 *  بدون نیاز به پایگاه داده — برای CI بدون DB مناسب است.
 * ════════════════════════════════════════════════════════════════════════
 */
import { createRequire } from 'module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { QueryBuilder } from 'drizzle-orm/pg-core';

// همان الگوی tests/debt-threshold-setting.test.ts: خنثی کردن گارد server-only بیرون از Next
const requireCjs = createRequire(import.meta.url);
const serverOnlyId = requireCjs.resolve('server-only');
(requireCjs as any).cache[serverOnlyId] = {
  id: serverOnlyId, filename: serverOnlyId, loaded: true, exports: {}, children: [], paths: [],
};

const { isRealUniversityId, universityEq } = require('../src/lib/university-scope') as typeof import('../src/lib/university-scope');
const { students } = require('../src/db/schema') as typeof import('../src/db/schema');

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

/** خواندن متن مبدأ مستقل از پوشهٔ اجرا (cwd) */
const srcOf = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/**
 * بدنهٔ یک تابع exportشده را برش می‌زند (از سرِ امضای خودش تا export بعدی).
 * اگر تابع پیدا نشد رشتهٔ خالی برمی‌گردد — خودِ تست با شکستِ صریح گزارش می‌دهد.
 */
function fnSlice(src: string, name: string): string {
  const m = src.search(new RegExp(`export (async )?function ${name}\\b`));
  if (m < 0) return '';
  const rest = src.slice(m + 1);
  const nxt = rest.search(/\nexport (async )?function /);
  return nxt < 0 ? src.slice(m) : src.slice(m, m + 1 + nxt);
}

// ───────────────────────────────────────────────────────────────────────
//  ۱) isRealUniversityId — fail-closed روی شناسهٔ دانشگاه
// ───────────────────────────────────────────────────────────────────────
console.log('\n— isRealUniversityId (شناسهٔ دانشگاه واقعی) —');
ok(isRealUniversityId(1) === true, 'شناسهٔ ۱ واقعی است');
ok(isRealUniversityId(999) === true, 'شناسهٔ مثبت بزرگ واقعی است');
ok(isRealUniversityId(0) === false, 'شناسهٔ ۰ (DENY_UNI) واقعی نیست');
ok(isRealUniversityId(null) === false, 'null واقعی نیست');
ok(isRealUniversityId(undefined) === false, 'undefined واقعی نیست');
ok(isRealUniversityId(NaN) === false, 'NaN واقعی نیست');
ok(isRealUniversityId(-3) === false, 'عدد منفی واقعی نیست');
ok(isRealUniversityId(Infinity) === false, 'non-finite (Infinity) واقعی نیست');

// ───────────────────────────────────────────────────────────────────────
//  ۲) universityEq — برای شناسهٔ نامعتبر «حذف شرط» نمی‌شود؛ ۱=۰ (deny-all)
// ───────────────────────────────────────────────────────────────────────
console.log('\n— universityEq (قفل کوئری به دانشگاه) —');
{
  const q = new QueryBuilder().select().from(students).where(universityEq(students.universityId, 1)).toSQL();
  ok(q.params.includes(1) && q.sql.includes('= $1'),
    `برای شناسهٔ واقعی شرط eq با پارامتر ۱ رندر می‌شود (sql: ${q.sql})`);
}
{
  const q1 = new QueryBuilder().select().from(students).where(universityEq(students.universityId, 42)).toSQL();
  ok(q1.params.includes(42), 'شناسهٔ ۴۲ هم به‌صورت پارامتری رندر می‌شود');
}
for (const bad of [0, null, undefined, NaN] as const) {
  const cond: any = universityEq(students.universityId, bad as any);
  const neverTrue = cond !== undefined
    && new QueryBuilder().select().from(students).where(cond).toSQL().sql.includes('1 = 0');
  ok(neverTrue,
    `برای شناسهٔ نامعتبر (${String(bad)}) شرط «هیچ‌گاه‌درست» ۱=۰ رندر می‌شود، نه حذفِ WHERE (fail-closed)`);
}

// ───────────────────────────────────────────────────────────────────────
//  ۳) گیت تسویهٔ مالی — enrollment-financial-gate.ts (قرارداد متن مبدأ)
// ───────────────────────────────────────────────────────────────────────
console.log('\n— گیت تسویهٔ مالی (assertFinancialClearance / clearedStudentIds) —');
{
  const src = srcOf('../src/lib/enrollment-financial-gate.ts');
  ok(/getSetting\(\s*['"]ENROLLMENT_DEBT_THRESHOLD['"]\s*\)/.test(src),
    'آستانهٔ بدهی از تنظیم ENROLLMENT_DEBT_THRESHOLD خوانده می‌شود');
  ok(/error:\s*[`'"][^`'"]*تسویه/.test(src),
    'خطای ردّ گیت، پیام فارسیِ دارای «تسویه» برمی‌گرداند');
  const slice = fnSlice(src, 'clearedStudentIds');
  ok(slice.length > 0, 'تابع clearedStudentIds در مبدأ موجود است');
  ok(/isCleared\s*,\s*1\b/.test(slice), 'clearedStudentIds فقط ردیف‌های isCleared=۱ را می‌پذیرد');
  ok(/threshold/.test(slice), 'clearedStudentIds آستانهٔ بدهی را در فیلتر دسته‌ای اعمال می‌کند');
}

// ───────────────────────────────────────────────────────────────────────
//  ۴) ارجاع به شورا و تأیید شورا — گیت مالی + حسابرسی
// ───────────────────────────────────────────────────────────────────────
console.log('\n— referCouncilAction / تأیید شورا —');
{
  const src = srcOf('../src/app/student/enroll/actions.ts');
  const slice = fnSlice(src, 'referCouncilAction');
  ok(slice.includes('assertFinancialClearance'), 'referCouncilAction پیش از ارجاع، گیت تسویهٔ مالی را صدا می‌زند');
}
{
  const src = srcOf('../src/app/admin/actions.ts');
  const slice = fnSlice(src, 'approveRequestAction');
  ok(slice.includes('assertFinancialClearance'), 'تأییدِ درخواست شورا (admin) دوباره گیت تسویهٔ مالی را اجرا می‌کند');
  ok(/ACTIVE/.test(slice), 'تأییدِ درخواست شورا، فعال‌بودنِ دانشجو (ACTIVE) را بررسی می‌کند');
  ok(slice.includes('appendAudit'), 'تصمیمِ تأیید شورا ردیف حسابرسی ثبت می‌کند');
}

// ───────────────────────────────────────────────────────────────────────
//  ۵) updateTermRowAction — فقط ADMIN/VICE_EDU + قفل دانشگاه + حسابرسی
// ───────────────────────────────────────────────────────────────────────
console.log('\n— updateTermRowAction (ویرایش ترم) —');
{
  const src = srcOf('../src/app/admin/codes/actions.ts');
  const slice = fnSlice(src, 'updateTermRowAction');
  ok(slice.length > 0, 'تابع updateTermRowAction در مبدأ موجود است');
  ok(/requireRole\(\s*\[\s*['"]ADMIN['"]\s*,\s*['"]VICE_EDU['"]\s*\]\s*\)/.test(slice),
    'ویرایش ترم فقط برای ADMIN/VICE_EDU مجاز است (requireRole)');
  ok(slice.includes('appendAudit'), 'ویرایش ترم ردیف حسابرسی ثبت می‌کند');
}

// ───────────────────────────────────────────────────────────────────────
//  ۶) saveSettingsAction — ردیف حسابرسی برای هر کلید تغییر‌یافته
// ───────────────────────────────────────────────────────────────────────
console.log('\n— saveSettingsAction (تنظیمات) —');
{
  const src = srcOf('../src/lib/settings-actions.ts');
  const slice = fnSlice(src, 'saveSettingsAction');
  ok(slice.length > 0, 'تابع saveSettingsAction در مبدأ موجود است');
  // دو شکلِ مجاز: فراخوانی مستقیم appendAudit درون تابع، یا تفکیک منطق به
  // helper — فراخوانی saveSettingsWithAudit + وجودِ appendAudit در خودِ helper.
  const inline = slice.includes('appendAudit');
  const helperOk = (() => {
    try { return srcOf('../src/lib/settings-audit.ts').includes('appendAudit'); }
    catch { return false; } // نبودِ پروندهٔ helper
  })();
  const factored = slice.includes('saveSettingsWithAudit') && helperOk;
  ok(inline || factored,
    'ذخیرهٔ تنظیمات ردیف حسابرسی ثبت می‌کند (appendAudit مستقیم، یا saveSettingsWithAudit با helperِ حاوی appendAudit)');
}

// ───────────────────────────────────────────────────────────────────────
//  ۷) ثبت‌نام دستی/دسته‌جمعی — قفل fail-closed دانشگاه + آستانهٔ تأیید
// ───────────────────────────────────────────────────────────────────────
console.log('\n— اکشن‌های manual-enroll (ثبت‌نام دستی و دسته‌جمعی) —');
{
  const src = srcOf('../src/app/admin/manual-enroll/actions.ts');
  for (const fn of ['manualEnrollAction', 'dropEnrollAction', 'bulkEnrollAction', 'bulkDropAction']) {
    const slice = fnSlice(src, fn);
    ok(slice.length > 0, `تابع ${fn} در مبدأ موجود است`);
    ok(/universityEq\s*\(|isRealUniversityId\s*\(/.test(slice),
      `${fn} بررسی fail-closed دانشگاه دارد (universityEq/isRealUniversityId)`);
  }
  const bulk = fnSlice(src, 'bulkEnrollAction');
  ok(bulk.includes('confirmedCount'), 'bulkEnrollAction آستانهٔ تأیید صریح (confirmedCount) دارد');
  // سقف تورم ظرفیت = ۴۰ — هر سه شکلِ مجاز: عدد literal، ثابتِ واردشده از planning-core،
  // یا ثابت محلی با مقدار ۴۰. پرونده‌ای که هیچ سقفی ندارد باید شکست بخورد.
  const hasCeiling = /capacity\s*\+\s*40\b/.test(bulk)
    || bulk.includes('DEFAULT_MAX_STUDENTS_PER_GROUP')
    || /=\s*40\b/.test(bulk);
  ok(hasCeiling, 'bulkEnrollAction سقف تورم ظرفیت (۴۰ — literal یا DEFAULT_MAX_STUDENTS_PER_GROUP یا ثابت محلی) را در حالت override رعایت می‌کند');
}

// ───────────────────────────────────────────────────────────────────────
//  ۸) ارتقای لیست انتظار + تصمیمات درخواست bypass — گیت مالی و حسابرسی
// ───────────────────────────────────────────────────────────────────────
console.log('\n— ارتقای لیست انتظار / bypass —');
{
  const src = srcOf('../src/app/student/actions.ts');
  ok(src.includes('assertFinancialClearance'),
    'ارتقای خودکار لیست انتظار پیش از ثبت قطعی، گیت تسویهٔ مالی را اجرا می‌کند');
}
{
  const src = srcOf('../src/lib/bypass-requests.ts');
  ok(src.includes("'bypass_request_approved'"),
    'bypass-requests برای گذارِ وضعیتِ تأیید، ردیف حسابرسی با اکشن bypass_request_approved ثبت می‌کند');
  ok(src.includes('appendAudit'), 'bypass-requests از appendAudit برای ثبت حسابرسی استفاده می‌کند');
}

console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
// خروج صریح: ماژول‌های واردشده (مثلاً کلاینت Redis در rateLimit) حلقهٔ رویداد را
// باز نگه می‌دارند و بدون این، tsx بعد از موفقیت قفل می‌شود.
process.exit(fail ? 1 : 0);
