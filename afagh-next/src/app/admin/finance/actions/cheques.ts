'use server';

import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { payment_cheques } from '@/db/schema';
import { requireRole, getSessionUser } from '@/lib/auth';
import { assertServerActionOrigin, requireStudentScope } from '@/lib/security';
import { clearCheque } from '@/lib/finance-engine';
import { appendAudit } from '@/lib/audit';
import { safeRials } from '@/lib/money';
import { FINANCE, clean, revalidateStudent } from './shared';

// ══════════════════════════════════════════════════════════════════════
//  چک
// ══════════════════════════════════════════════════════════════════════

export async function addChequeAction(input: {
  studentId: number;
  termId: number | null;
  chequeNo: string;
  bankName: string;
  branchCode: string;
  amount: number;
  dueDate: string;
  note: string;
}): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };

  const amount = safeRials(input.amount);
  if (amount === null || amount <= 0) return { ok: false, error: 'مبلغ چک باید عدد صحیح و بزرگ‌تر از صفر باشد' };
  const sc = await requireStudentScope(input.studentId);
  if (!sc.ok) return { ok: false, error: sc.error };

  const due = clean(input.dueDate);
  if (!due) return { ok: false, error: 'تاریخ سررسید الزامی است — بدون آن یادآوری ممکن نیست' };
  const dueMs = Date.parse(due);
  if (!Number.isFinite(dueMs)) return { ok: false, error: 'تاریخ سررسید معتبر نیست' };

  const chequeNo = clean(input.chequeNo);
  if (!chequeNo) return { ok: false, error: 'شمارهٔ چک الزامی است' };

  const user = await getSessionUser();
  try {
    return await db.transaction(async (tx) => {
      const [ins] = await tx.insert(payment_cheques).values({
        studentId: input.studentId,
        termId: input.termId,
        chequeNo,
        bankName: clean(input.bankName),
        branchCode: clean(input.branchCode),
        amount: String(amount),
        dueDate: new Date(dueMs),
        status: 'PENDING',
        note: clean(input.note),
      }).returning({ id: payment_cheques.id });
      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: 'FINANCE_CHEQUE_ADDED',
        entityType: 'payment_cheques',
        entityId: ins.id,
        details: JSON.stringify({ studentId: input.studentId, chequeNo, amount, dueDate: due }),
      });
      return { ok: true };
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'خطا در ثبت چک' };
  }
}

export async function clearChequeAction(id: number): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const [row] = await db.select().from(payment_cheques).where(eq(payment_cheques.id, id)).limit(1);
  if (!row) return { ok: false, error: 'چک یافت نشد' };
  // 🔒 Object-Level (بازبینی ۴): چکِ دانشجوی خارج از scope هرگز وصول نمی‌شود
  const sc = await requireStudentScope(row.studentId);
  if (!sc.ok) return { ok: false, error: sc.error };
  const res = await clearCheque(id); // داخل finance-engine: تراکنش + FOR UPDATE + audit
  revalidateStudent(row.studentId);
  return res;
}

export async function setChequeStatusAction(
  id: number,
  status: 'BOUNCED' | 'CANCELLED' | 'PENDING'
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const user = await getSessionUser();

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.select().from(payment_cheques).where(eq(payment_cheques.id, id)).limit(1);
      if (!row) return { ok: false, error: 'چک یافت نشد' };
      // 🔒 Object-Level (بازبینی ۴): رکورد با id پیدا شد — حالا تعلق دانشجو سنجیده می‌شود
      const sc = await requireStudentScope(row.studentId);
      if (!sc.ok) return { ok: false, error: sc.error };
      if (row.status === 'CLEARED') return { ok: false, error: 'چک وصول‌شده قابل تغییر وضعیت نیست' };

      const upd = await tx.update(payment_cheques)
        .set({ status, remindedAt: status === 'PENDING' ? null : row.remindedAt })
        .where(and(eq(payment_cheques.id, id), eq(payment_cheques.status, row.status)));
      if (upd.rowCount !== 1) return { ok: false, error: 'تغییر همزمان: وضعیت چک توسط کاربر دیگری عوض شده است.' };

      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: `FINANCE_CHEQUE_${status}`,
        entityType: 'payment_cheques',
        entityId: id,
        details: JSON.stringify({ studentId: row.studentId, from: row.status }),
      });
      revalidateStudent(row.studentId);
      return { ok: true };
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'خطا در تغییر وضعیت چک' };
  }
}

export async function deleteChequeAction(id: number): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const user = await getSessionUser();

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.select().from(payment_cheques).where(eq(payment_cheques.id, id)).limit(1);
      if (!row) return { ok: false, error: 'چک یافت نشد' };
      // 🔒 Object-Level (بازبینی ۴): رکورد با id پیدا شد — حالا تعلق دانشجو سنجیده می‌شود
      const sc = await requireStudentScope(row.studentId);
      if (!sc.ok) return { ok: false, error: sc.error };
      if (row.status === 'CLEARED') return { ok: false, error: 'چک وصول‌شده حذف نمی‌شود؛ در دفتر مالی ثبت شده است' };

      await tx.delete(payment_cheques).where(eq(payment_cheques.id, id));
      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: 'FINANCE_CHEQUE_DELETED',
        entityType: 'payment_cheques',
        entityId: id,
        details: JSON.stringify({ studentId: row.studentId, chequeNo: row.chequeNo, wasStatus: row.status }),
      });
      revalidateStudent(row.studentId);
      return { ok: true };
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'خطا در حذف چک' };
  }
}
