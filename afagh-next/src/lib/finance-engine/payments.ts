import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { payment_cheques, student_ledger } from '@/db/schema';
import { appendAudit } from '../audit';
import { toNum } from '../finance-rules';

// ══════════════════════════════════════════════════════════════════════
//  ثبت پرداخت و وصول چک در دفتر مالی
// ══════════════════════════════════════════════════════════════════════

/** ثبت یک پرداخت قطعی در دفتر مالی */
export async function recordPayment(input: {
  studentId: number;
  termId: number | null;
  amount: number;
  description?: string;
  /** دانشگاه صاحب رکورد — برای تفکیک چنددانشگاهی دفتر مالی */
  universityId?: number | null;
}): Promise<number> {
  const amount = Math.round(toNum(input.amount));
  if (amount <= 0) throw new Error('مبلغ پرداخت باید بزرگ‌تر از صفر باشد');

  const [ins] = await db.insert(student_ledger).values({
    studentId: input.studentId,
    termId: input.termId,
    transactionType: 'PAYMENT',
    amount: String(amount),
    description: input.description || 'پرداخت شهریه',
    universityId: input.universityId ?? null,
  }).returning({ id: student_ledger.id });

  return ins.id;
}

/**
 * وصول چک — مبلغ را در دفتر مالی ثبت و وضعیت چک را CLEARED می‌کند.
 *
 * اگر چک پیش‌تر وصول شده باشد کاری نمی‌کند؛ وگرنه هر بار اجرا یک پرداخت
 * تکراری در دفتر مالی می‌ساخت.
 */
/**
 * وصول چک — تراکنش + قفل ردیف (بازبینی — بند ۱/۲/۸)
 *   • SELECT … FOR UPDATE: دو کارشناس همزمان نمی‌توانند یک چک را وصول کنند.
 *   • ثبت دفتر مالی و تغییر وضعیت چک در یک تراکنش — هر دو یا هیچ‌کدام.
 *   • انتقال فقط از PENDING: اگر وضعیت در همین لحظه تغییر کرده باشد،
 *     تراکنش برگشت می‌خورد و خطای واضح می‌گیرد (optimistic concurrency).
 */
export async function clearCheque(chequeId: number): Promise<{ ok: boolean; reason?: string }> {
  try {
    return await db.transaction(async (tx) => {
      const lock = await tx.execute(sql`
        SELECT id, "studentId", "termId", "universityId", amount, "chequeNo", status
        FROM payment_cheques WHERE id = ${chequeId} FOR UPDATE`);
      const cheque = lock.rows[0] as any;
      if (!cheque) return { ok: false, reason: 'چک یافت نشد' };
      if (cheque.status === 'CLEARED') return { ok: false, reason: 'این چک پیش‌تر وصول شده است' };
      if (cheque.status === 'CANCELLED') return { ok: false, reason: 'چک باطل‌شده قابل وصول نیست' };
      if (cheque.status === 'BOUNCED') return { ok: false, reason: 'چک برگشتی قابل وصول نیست؛ ابتدا وضعیت را به «در انتظار» برگردانید' };

      const [ins] = await tx.insert(student_ledger).values({
        studentId: cheque.studentId,
        termId: cheque.termId,
        transactionType: 'PAYMENT',
        amount: String(cheque.amount),
        description: `وصول چک ${cheque.chequeNo || ''}`.trim(),
        universityId: cheque.universityId ?? null,
      }).returning({ id: student_ledger.id });

      const upd = await tx.update(payment_cheques)
        .set({ status: 'CLEARED', clearedAt: new Date(), ledgerTxnId: ins.id })
        .where(and(eq(payment_cheques.id, chequeId), eq(payment_cheques.status, 'PENDING')));
      if (upd.rowCount !== 1) {
        throw new Error('وضعیت چک در همین لحظه تغییر کرده است؛ صبر کنید و دوباره تلاش کنید.');
      }
      // 🔒 حسابرسی غیرقابل‌انکار: وصول چک + ثبت دفتر + زنجیرهٔ audit — یک تراکنش
      await appendAudit(tx, {
        action: 'FINANCE_CHEQUE_CLEARED',
        entityType: 'payment_cheques',
        entityId: chequeId,
        details: JSON.stringify({ studentId: cheque.studentId, ledgerTxnId: ins.id, amount: cheque.amount }),
      });
      return { ok: true };
    });
  } catch (err: any) {
    return { ok: false, reason: err?.message || 'خطا در وصول چک' };
  }
}
