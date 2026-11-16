/**
 * تراز کانونی دفتر مالی دانشجو — تنها مرجع درست برای محاسبهٔ مانده.
 *
 * پیش‌تر چهار نقطه (موتور گردش کار، گیت انتخاب واحد، کارنامهٔ مالی،
 * استعلام کارت/آزمون) هرکدام با فهرست متفاوتی از انواع تراکنش جمع می‌زدند و
 * انواع قدیمی TUITION_FIXED / TUITION_VARIABLE و POS_PAYMENT برای گیت‌ها
 * نامرئی بودند. همهٔ مصرف‌کننده‌ها باید از همین تابع استفاده کنند.
 *
 * قرارداد علامت: مثبت = بدهی دانشجو، صفر/منفی = تسویه یا بستانکار.
 * مبالغ ممکن است رشتهٔ numeric باشند — با Number() اجبار می‌شوند.
 *
 * فهرست اعضا = دقیقاً همان ۱۵ نوعی که CHECK دیتابیس
 * (ck_student_ledger_txn_type — مهاجرت 0073_ledger_types) مجاز می‌داند:
 * ۱۰ نوع قدیمی (TUITION_FIXED/VARIABLE، PAYMENT، POS_PAYMENT،
 * DISCOUNT_FIXED/VARIABLE، SUBJECT_ADDITIVE/DEDUCTIVE، SPONSORSHIP، LOAN)
 * ‏+ TUITION_CHARGE و CHARGE (موتور شهریه/گردش‌کار) + CREDIT (بستانکاری)
 * ‏+ POS_REFUND (برگشت وجه کارت‌خوان: پرداخت را خنثی می‌کند پس بدهی است)
 * ‏+ TUITION_BATES (بیتس قدیمی: تخفیف/اعتبار — علامت سیستم قدیم مثبت=طلبکار)
 *    و زیرنوع‌های تفکیک‌شدهٔ آن (TUITION_BATES_FIXED/VARIABLE/AMOUNT)
 * ‏+ TUITION_ADJUST_DEC (تعدیل کاهشی قدیمی TSUMMab_Subject<0) و
 *    TUITION_ADJUST_INC (تعدیل افزایشی TSUMMab_Subject>0).
 * هیچ نوع مجازِ دیتابیسی نباید برای تراز نامرئی بماند.
 */

/** ردیف حداقلی موردنیاز برای محاسبهٔ تراز */
export interface LedgerBalanceRow {
  transactionType: string | null | undefined;
  amount: number | string | null | undefined;
}

/** انواع تراکنش دفتر مالی که «بدهی» می‌سازند (افزایش مانده) */
export const DEBT_LEDGER_TYPES = [
  'TUITION_FIXED',
  'TUITION_VARIABLE',
  'TUITION_CHARGE',
  'CHARGE',
  'SUBJECT_ADDITIVE',
  'POS_REFUND',
  'TUITION_ADJUST_DEC', // تعدیل کاهشی قدیمی: TSUMMab_Subject<0 به بدهی اضافه می‌شود (همان فرمول TermAcc)
] as const;

/**
 * انواع تراکنش دفتر مالی که «پرداخت/دریافت» می‌سازند (کاهش بدهی).
 *
 * ‏`CREDIT` مهم است: مهاجرت از سیستم قدیم (زرینه/شمس/…) پرداختی‌ها را با
 * نوعِ `CREDIT` ثبت کرده است. اگر این نوع در فهرستِ پرداخت نباشد، گزارش‌های
 * پرداختی برای همان دانشجویان «۰ ریال» نشان می‌دهند.
 */
export const PAID_LEDGER_TYPES = [
  'PAYMENT',
  'POS_PAYMENT',
  'SPONSORSHIP',
  'LOAN',
  'CREDIT',
] as const;

/** انواع تراکنش دفتر مالی که «تخفیف/اعتبار» می‌سازند (کاهش بدهی) */
export const DISCOUNT_LEDGER_TYPES = [
  'DISCOUNT_FIXED',
  'DISCOUNT_VARIABLE',
  'SUBJECT_DEDUCTIVE',
  'TUITION_BATES',      // بیتس قدیمی = تخفیف/اعتبار (کاهش بدهی)
  // زیرنوع‌های تفکیک‌شدهٔ بیتس سما (Fix_Bates / Units_Bates / Mab_Bates).
  // تا پیش از این، هر سه در یک ردیفِ TUITION_BATES ادغام می‌شدند و کارنامه
  // نمی‌توانست نشان دهد تخفیفِ دقیقاً بابتِ کدام قلم بوده است.
  'TUITION_BATES_FIXED',    // بیتسِ شهریهٔ ثابت سما
  'TUITION_BATES_VARIABLE', // بیتسِ شهریهٔ متغیر سما
  'TUITION_BATES_AMOUNT',   // بیتسِ مبلغی سما (Mab_Bates)
  'TUITION_ADJUST_INC', // تعدیل افزایشی قدیمی: TSUMMab_Subject>0 تخفیف است (مطابق فرمول TermAcc)
] as const;

/**
 * همهٔ انواعِ «اعتبار» (کاهش مانده) = پرداخت‌ها + تخفیف‌ها.
 * هیچ‌یک از دو گروه نباید در فهرست جا بیفتد؛ برای همین مشتق می‌شود.
 */
export const CREDIT_LEDGER_TYPES = [
  ...PAID_LEDGER_TYPES,
  ...DISCOUNT_LEDGER_TYPES,
] as const;

/**
 * فهرست آمادهٔ SQL: `'A','B'` — برای `IN (…)` در کوئری‌های متنی (sql.raw).
 * ورودی همیشه از ثابت‌های همین فایل می‌آید، نه از کاربر؛ با این حال
 * کوتیشن‌ها escape می‌شوند تا الگوی تزریق تکرار نشود.
 */
export function ledgerTypesCsv(types: readonly string[]): string {
  return types.map((t) => `'${String(t).replace(/'/g, "''")}'`).join(',');
}

const DEBT_SET: ReadonlySet<string> = new Set(DEBT_LEDGER_TYPES);
const CREDIT_SET: ReadonlySet<string> = new Set(CREDIT_LEDGER_TYPES);

/**
 * تراز = جمع بدهی‌ها − جمع اعتبارها.
 * ردیف برگشتی (مبلغ منفی، مثل ویدی POS) اعتبار همان نوع را کم می‌کند.
 * انواع ناشناخته نادیده گرفته می‌شوند (fail-closed: در گیت‌ها اثر ندارند).
 */
export function ledgerBalance(rows: readonly LedgerBalanceRow[] | null | undefined): number {
  let debt = 0;
  let credit = 0;
  for (const r of rows ?? []) {
    const t = String(r?.transactionType ?? '').trim().toUpperCase();
    const a = Number(r?.amount);
    if (!Number.isFinite(a) || a === 0) continue;
    if (DEBT_SET.has(t)) debt += a;
    else if (CREDIT_SET.has(t)) credit += a;
  }
  return debt - credit;
}
