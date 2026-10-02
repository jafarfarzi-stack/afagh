import { toNum, toMs } from './numbers';

// ══════════════════════════════════════════════════════════════════════
//  یادآوری چک پیش از سررسید
// ══════════════════════════════════════════════════════════════════════

const DAY_MS = 86_400_000;

export interface ChequeReminderRow {
  id: number;
  chequeNo?: string | null;
  amount: number | string | null;
  dueDate: string | Date | null;
  status: string | null;
  remindedAt?: string | Date | null;
}

export interface ChequeReminderDecision {
  remind: boolean;
  daysLeft: number | null;
  /** true = سررسید گذشته است */
  overdue: boolean;
}

/**
 * آیا این چک نیاز به یادآوری دارد؟
 *
 * شرط‌ها: وضعیت در انتظار وصول، هنوز یادآوری نشده، و سررسید در افقِ
 * «روزهای پیش از سررسید» باشد. چکِ گذشته از سررسید هم یادآوری می‌شود
 * (daysLeft منفی) — بی‌خبر گذاشتن دانشجو از چک برگشت‌خوردنی کمکی نیست.
 */
export function chequeNeedsReminder(
  c: ChequeReminderRow,
  nowMs: number,
  remindDays: number
): ChequeReminderDecision {
  const none: ChequeReminderDecision = { remind: false, daysLeft: null, overdue: false };

  if (String(c.status || '').toUpperCase() !== 'PENDING') return none;
  if (toMs(c.remindedAt) !== null) return none;

  const due = toMs(c.dueDate);
  if (due === null) return none;

  const daysLeft = Math.ceil((due - nowMs) / DAY_MS);
  const overdue = daysLeft < 0;
  const remind = daysLeft <= Math.max(0, toNum(remindDays));

  return { remind, daysLeft, overdue };
}

/** متن پیام یادآوری چک — فارسی، با مبلغ ریالی و روزهای باقی‌مانده */
export function buildChequeReminderText(c: {
  chequeNo?: string | null;
  amount: number | string | null;
  dueDate?: string | Date | null;
  bankName?: string | null;
}, daysLeft: number | null, overdue: boolean): string {
  const no = c.chequeNo ? ` شمارهٔ ${c.chequeNo}` : '';
  const amount = toNum(c.amount).toLocaleString('fa-IR');
  const bank = c.bankName ? ` بانک ${c.bankName}` : '';

  if (overdue) {
    return `چک${no}${bank} به مبلغ ${amount} ریال از سررسید گذشته است. لطفاً هرچه زودتر برای تعیین تکلیف به امور مالی مراجعه کنید.`;
  }
  const days = daysLeft === null ? '' :
    daysLeft === 0 ? ' امروز' :
    daysLeft === 1 ? ' فردا' :
    ` تا ${daysLeft.toLocaleString('fa-IR')} روز دیگر`;
  return `چک${no}${bank} به مبلغ ${amount} ریال${days} سررسید می‌شود. لطفاً پیش از سررسید نسبت به تأمین موجودی اقدام کنید.`;
}
