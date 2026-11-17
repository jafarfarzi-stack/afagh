import 'server-only';
/**
 * قواعدِ ثبتِ پیش‌فرضِ دفترِ کل — نگاشتِ «نوعِ رویدادِ مالی» به حسابِ
 * بدهکار/بستانکار (کدِ حساب، نه id).
 *
 * منبعِ حقیقت: بلوکِ توضیحیِ `drizzle/0142_gl_accounting.sql` که همین ۲۰ ردیف
 * را برای دانشگاه ۱ می‌کارد. واژگانِ eventKey عیناً همان
 * `student_ledger."transactionType"` است (فهرستِ مجاز در
 * `src/lib/ledger-balance.ts`).
 *
 * منطقِ حسابداری (علامتِ قراردادِ student_ledger: مثبت = بدهیِ دانشجو):
 *   • بده‌شدنِ دانشجو (شهریه/شارژ)      ⇒ Dr 1101 دریافتنی / Cr 4001 درآمد
 *   • تخفیف/بیتس/اعتبارِ کاهشی          ⇒ Dr 4101 تخفیفات  / Cr 1101 دریافتنی
 *   • وصولِ نقدی                        ⇒ Dr 1002 بانک     / Cr 1101 دریافتنی
 *   • کمکِ خیرین                        ⇒ Dr 1002 بانک     / Cr 4003 کمک‌ها
 *   • وامِ پرداختی به دانشجو            ⇒ Dr 1201 وام‌ها   / Cr 1002 بانک
 *   • برگشتِ وجه کارت‌خوان              ⇒ Dr 1101 دریافتنی / Cr 1002 بانک
 *   • تعدیلِ کاهشیِ شهریه               ⇒ Dr 4001 درآمد    / Cr 1101 دریافتنی
 *
 * همهٔ توابع idempotent هستند: ردیف‌های موجود هرگز بازنویسی نمی‌شوند تا
 * تغییرِ آگاهانهٔ مدیر (مثلاً غیرفعال‌کردن یک قاعده) با فراخوانیِ دوباره از
 * بین نرود.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/db';

/** یک قاعدهٔ ثبت — هر دو طرف همیشه پر می‌شوند تا سند همیشه متوازن باشد. */
export type PostingRule = {
  eventKey: string;
  debitAccountCode: string;
  creditAccountCode: string;
};

/**
 * ۲۰ قاعدهٔ پیش‌فرض — ترتیب و مقادیر عیناً همان `VALUES` مهاجرت ۰۱۴۲ است
 * (byte-identical با بلوکِ SQL؛ تغییرِ این‌جا باید با مهاجرت هم‌گام باشد).
 */
export const DEFAULT_RULES: ReadonlyArray<{
  eventKey: string;
  debitAccountCode: string;
  creditAccountCode: string;
}> = [
  // ── شهریه/شارژ (افزایشِ بدهیِ دانشجو) ──
  { eventKey: 'TUITION_FIXED', debitAccountCode: '1101', creditAccountCode: '4001' },
  { eventKey: 'TUITION_VARIABLE', debitAccountCode: '1101', creditAccountCode: '4001' },
  { eventKey: 'TUITION_CHARGE', debitAccountCode: '1101', creditAccountCode: '4001' },
  { eventKey: 'CHARGE', debitAccountCode: '1101', creditAccountCode: '4001' },
  { eventKey: 'SUBJECT_ADDITIVE', debitAccountCode: '1101', creditAccountCode: '4001' },
  // ── تخفیف/بیتس/اعتبار (کاهشِ بدهیِ دانشجو) ──
  { eventKey: 'DISCOUNT_FIXED', debitAccountCode: '4101', creditAccountCode: '1101' },
  { eventKey: 'DISCOUNT_VARIABLE', debitAccountCode: '4101', creditAccountCode: '1101' },
  { eventKey: 'SUBJECT_DEDUCTIVE', debitAccountCode: '4101', creditAccountCode: '1101' },
  { eventKey: 'TUITION_BATES', debitAccountCode: '4101', creditAccountCode: '1101' },
  { eventKey: 'TUITION_BATES_FIXED', debitAccountCode: '4101', creditAccountCode: '1101' },
  { eventKey: 'TUITION_BATES_VARIABLE', debitAccountCode: '4101', creditAccountCode: '1101' },
  { eventKey: 'TUITION_BATES_AMOUNT', debitAccountCode: '4101', creditAccountCode: '1101' },
  { eventKey: 'TUITION_ADJUST_INC', debitAccountCode: '4101', creditAccountCode: '1101' },
  // ── وصولِ نقدی ──
  { eventKey: 'PAYMENT', debitAccountCode: '1002', creditAccountCode: '1101' },
  { eventKey: 'POS_PAYMENT', debitAccountCode: '1002', creditAccountCode: '1101' },
  { eventKey: 'CREDIT', debitAccountCode: '1002', creditAccountCode: '1101' },
  // ── کمکِ خیرین ──
  { eventKey: 'SPONSORSHIP', debitAccountCode: '1002', creditAccountCode: '4003' },
  // ── وامِ پرداختی به دانشجو ──
  { eventKey: 'LOAN', debitAccountCode: '1201', creditAccountCode: '1002' },
  // ── برگشتِ وجهِ کارت‌خوان ──
  { eventKey: 'POS_REFUND', debitAccountCode: '1101', creditAccountCode: '1002' },
  // ── تعدیلِ کاهشیِ شهریه ──
  { eventKey: 'TUITION_ADJUST_DEC', debitAccountCode: '4001', creditAccountCode: '1101' },
];

/** شناسهٔ دانشگاه را نرمال می‌کند تا هرگز با NaN به دیتابیس نرویم. */
function requireUniversityId(universityId: number): number {
  const uid = Number(universityId);
  if (!Number.isInteger(uid) || uid <= 0) {
    throw new Error('شناسهٔ دانشگاه نامعتبر است.');
  }
  return uid;
}

/**
 * قواعدِ پیش‌فرض را برای دانشگاه می‌سازد — idempotent.
 * `ON CONFLICT ("universityId", "eventKey") DO NOTHING` ⇒ ردیفِ موجود
 * (حتی اگر مدیر عمداً کدهایش را عوض کرده باشد) دست‌نخورده می‌ماند.
 */
export async function ensureDefaultRules(universityId: number, exec?: any): Promise<void> {
  const uid = requireUniversityId(universityId);
  const ex = exec ?? db;
  const rows = DEFAULT_RULES.map(
    (r) =>
      sql`(${uid}::integer, ${r.eventKey}::varchar, ${r.debitAccountCode}::varchar, ${r.creditAccountCode}::varchar)`,
  );
  await ex.execute(sql`
    INSERT INTO gl_posting_rules ("universityId", "eventKey", "debitAccountCode", "creditAccountCode")
    VALUES ${sql.join(rows, sql`, `)}
    ON CONFLICT ("universityId", "eventKey") DO NOTHING
  `);
}

/**
 * قاعدهٔ فعالِ یک رویداد را برمی‌گرداند یا null اگر تعریف نشده باشد.
 * کلید با trim + uppercase نرمال می‌شود تا «CHARGE» و « charge » یکسان دیده
 * شوند؛ خودِ مقدارِ ذخیره‌شده در دیتابیس هم همیشه با حروف بزرگ است.
 */
export async function getRule(
  universityId: number,
  eventKey: string,
): Promise<{ debitAccountCode: string; creditAccountCode: string } | null> {
  const uid = requireUniversityId(universityId);
  const key = String(eventKey ?? '').trim().toUpperCase();
  if (!key) return null;

  const res: any = await db.execute(sql`
    SELECT "debitAccountCode", "creditAccountCode"
      FROM gl_posting_rules
     WHERE "universityId" = ${uid}
       AND "eventKey" = ${key}
       AND "isActive" = 1
     LIMIT 1
  `);
  const row = (res?.rows ?? [])[0];
  if (!row) return null;
  return {
    debitAccountCode: String(row.debitAccountCode),
    creditAccountCode: String(row.creditAccountCode),
  };
}
