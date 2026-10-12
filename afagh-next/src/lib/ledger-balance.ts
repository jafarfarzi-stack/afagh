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
 * ‏+ TUITION_BATES (شهریهٔ قدیمی بیتس). هیچ نوع مجازِ دیتابیسی نباید برای
 * تراز نامرئی بماند — وگرنه گیت‌ها بدهکار را رد می‌کنند (fail-open).
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
  'TUITION_BATES',
  'CHARGE',
  'SUBJECT_ADDITIVE',
  'POS_REFUND',
] as const;

/** انواع تراکنش دفتر مالی که «اعتبار» می‌سازند (کاهش مانده) */
export const CREDIT_LEDGER_TYPES = [
  'PAYMENT',
  'POS_PAYMENT',
  'DISCOUNT_FIXED',
  'DISCOUNT_VARIABLE',
  'SUBJECT_DEDUCTIVE',
  'SPONSORSHIP',
  'LOAN',
  'CREDIT',
] as const;

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
