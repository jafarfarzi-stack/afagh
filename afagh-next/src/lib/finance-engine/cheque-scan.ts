import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { payment_cheques, students } from '@/db/schema';
import { getSetting } from '../settings';
import { notifyUserMultichannel } from '../messaging';
import { buildChequeReminderText, chequeNeedsReminder, toNum } from '../finance-rules';

/** وضعیت‌هایی که یک دانشجو را «فعال» می‌شمارند */
const ACTIVE_STUDENT_STATUSES = ['ACTIVE', 'ENROLLED', 'STUDYING'] as const;

/** وضعیت دانشجو را برای کارتابل برمی‌گرداند (فعال/غیرفعال) */
export function isActiveStudent(status: string | null): boolean {
  return ACTIVE_STUDENT_STATUSES.includes(String(status || '').toUpperCase() as typeof ACTIVE_STUDENT_STATUSES[number]);
}

// ══════════════════════════════════════════════════════════════════════
//  پویش یادآوری چک پیش از سررسید
// ══════════════════════════════════════════════════════════════════════

export interface ChequeScanResult {
  scanned: number;
  reminded: number;
  failed: number;
  skipped: number;
  dryRun: boolean;
  items: { chequeId: number; studentId: number; daysLeft: number | null; overdue: boolean; sent: boolean }[];
}

/**
 * پویش چک‌های در انتظار وصول و ارسال پیام یادآوری به دانشجو.
 *
 * افق یادآوری از تنظیم CHEQUE_REMIND_DAYS می‌آید، نه از کد. اگر
 * CHEQUE_REMIND_ENABLED صفر باشد یا dryRun داده شود، فهرست آماده می‌شود
 * ولی پیامی فرستاده نمی‌شود — تا کارشناس مالی بتواند پیش از فعال‌سازی
 * خروجی را ببیند.
 *
 * هر چک تنها یک بار یادآوری می‌شود (remindedAt ثبت می‌شود)؛ وگرنه هر
 * اجرای پویش یک پیام تکراری به دانشجو می‌فرستاد.
 */
export async function runChequeReminderScan(opts: { dryRun?: boolean } = {}): Promise<ChequeScanResult> {
  const remindDaysRaw = await getSetting('CHEQUE_REMIND_DAYS');
  const enabledRaw = await getSetting('CHEQUE_REMIND_ENABLED');
  const remindDays = Math.max(0, Math.round(toNum(remindDaysRaw) || 0));
  const enabled = String(enabledRaw || '1').trim() !== '0';
  const dryRun = !!opts.dryRun || !enabled;

  const pending = await db.select({
    id: payment_cheques.id,
    studentId: payment_cheques.studentId,
    userId: students.userId,
    chequeNo: payment_cheques.chequeNo,
    bankName: payment_cheques.bankName,
    amount: payment_cheques.amount,
    dueDate: payment_cheques.dueDate,
    status: payment_cheques.status,
    remindedAt: payment_cheques.remindedAt,
  }).from(payment_cheques)
    .innerJoin(students, eq(students.id, payment_cheques.studentId))
    .where(eq(payment_cheques.status, 'PENDING'));

  const nowMs = Date.now();
  const result: ChequeScanResult = {
    scanned: pending.length, reminded: 0, failed: 0, skipped: 0, dryRun, items: [],
  };

  for (const c of pending) {
    const decision = chequeNeedsReminder(c, nowMs, remindDays);
    if (!decision.remind) { result.skipped++; continue; }

    let sent = false;
    if (!dryRun && c.userId) {
      const text = buildChequeReminderText(
        { chequeNo: c.chequeNo, amount: c.amount, dueDate: c.dueDate, bankName: c.bankName },
        decision.daysLeft,
        decision.overdue
      );
      try {
        await notifyUserMultichannel({ userId: c.userId, eventCode: 'FINANCE_CHEQUE_DUE', text });
        await db.update(payment_cheques)
          .set({ remindedAt: new Date() })
          .where(eq(payment_cheques.id, c.id));
        sent = true;
        result.reminded++;
      } catch {
        result.failed++;
      }
    } else {
      result.skipped++;
    }

    result.items.push({
      chequeId: c.id,
      studentId: c.studentId,
      daysLeft: decision.daysLeft,
      overdue: decision.overdue,
      sent,
    });
  }

  return result;
}
