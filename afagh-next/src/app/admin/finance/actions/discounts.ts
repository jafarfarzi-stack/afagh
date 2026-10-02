'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { student_discounts, tuition_discount_types } from '@/db/schema';
import { requireRole, getSessionUser } from '@/lib/auth';
import { assertServerActionOrigin, requireStudentScope } from '@/lib/security';
import { toNum } from '@/lib/finance-rules';
import { appendAudit } from '@/lib/audit';
import { FINANCE, clean, money, num, revalidateStudent } from './shared';

// ══════════════════════════════════════════════════════════════════════
//  تخفیف شهریه
// ══════════════════════════════════════════════════════════════════════

export async function addDiscountAction(input: {
  studentId: number;
  termId: number | null;
  discountTypeId: number;
  percent: number;
  amount: number;
  appliesTo: string;
  reason: string;
}): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const sc = await requireStudentScope(input.studentId);
  if (!sc.ok) return { ok: false, error: sc.error };

  const [type] = await db.select().from(tuition_discount_types)
    .where(eq(tuition_discount_types.id, input.discountTypeId)).limit(1);
  if (!type) return { ok: false, error: 'نوع تخفیف یافت نشد' };

  const percent = Math.min(Math.max(0, num(input.percent)), 100);
  if (type.maxPercent !== null && percent > toNum(type.maxPercent)) {
    return { ok: false, error: `درصد تخفیف از سقف مجاز (${toNum(type.maxPercent)}٪) بیشتر است` };
  }

  const user = await getSessionUser();
  // 🔒 وضعیت «کاملاً سمت سرور» (بازبینی — Medium): کلاینت هیچ‌گونه نقشی در تعیین
  // وضعیت ندارد؛ نوع نیازمند تأیید → PENDING، وگرنه (بدون تأیید) → APPROVED.
  const status = type.requiresApproval ? 'PENDING' : 'APPROVED';

  try {
    return await db.transaction(async (tx) => {
      const [ins] = await tx.insert(student_discounts).values({
        studentId: input.studentId,
        termId: input.termId,
        discountTypeId: input.discountTypeId,
        kind: type.kind,
        percent: String(percent),
        amount: money(input.amount),
        appliesTo: input.appliesTo || 'BOTH',
        status,
        reason: clean(input.reason),
        approvedBy: status === 'APPROVED' ? (user?.id ?? null) : null,
        approvedAt: status === 'APPROVED' ? new Date() : null,
      }).returning({ id: student_discounts.id });
      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: status === 'APPROVED' ? 'FINANCE_DISCOUNT_ADDED_APPROVED' : 'FINANCE_DISCOUNT_ADDED_PENDING',
        entityType: 'student_discounts',
        entityId: ins.id,
        details: JSON.stringify({ studentId: input.studentId, discountTypeId: input.discountTypeId, percent, status }),
      });
      return { ok: true };
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'خطا در ثبت تخفیف' };
  }
}

export async function setDiscountStatusAction(
  id: number,
  status: 'APPROVED' | 'REJECTED'
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const user = await getSessionUser();

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.select().from(student_discounts).where(eq(student_discounts.id, id)).limit(1);
      if (!row) return { ok: false, error: 'تخفیف یافت نشد' };
      // 🔒 Object-Level (بازبینی ۴): رکورد با id پیدا شد — حالا تعلق دانشجو سنجیده می‌شود
      const sc = await requireStudentScope(row.studentId);
      if (!sc.ok) return { ok: false, error: sc.error };
      // فقط PENDING قابل تصمیم است (تخفیف خودکار-تأیید یا قبلاً تصمیم‌گرفته، بازنویسی نمی‌شود)
      if (row.status !== 'PENDING') return { ok: false, error: 'این تخفیف قبلاً تصمیم‌گیری شده است (فقط «در انتظار» قابل تأیید/رد است).' };

      const upd = await tx.update(student_discounts)
        .set({
          status,
          approvedBy: user?.id ?? null,
          approvedAt: status === 'APPROVED' ? new Date() : null,
        })
        .where(and(eq(student_discounts.id, id), eq(student_discounts.status, 'PENDING')));
      if (upd.rowCount !== 1) return { ok: false, error: 'تغییر همزمان — دوباره تلاش کنید.' };

      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: status === 'APPROVED' ? 'FINANCE_DISCOUNT_APPROVED' : 'FINANCE_DISCOUNT_REJECTED',
        entityType: 'student_discounts',
        entityId: id,
        details: JSON.stringify({ studentId: row.studentId }),
      });
      revalidateStudent(row.studentId);
      return { ok: true };
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'خطا در تغییر وضعیت تخفیف' };
  }
}

export async function deleteDiscountAction(id: number): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const user = await getSessionUser();

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.select().from(student_discounts).where(eq(student_discounts.id, id)).limit(1);
      if (!row) return { ok: false, error: 'تخفیف یافت نشد' };
      // 🔒 Object-Level (بازبینی ۴): رکورد با id پیدا شد — حالا تعلق دانشجو سنجیده می‌شود
      const sc = await requireStudentScope(row.studentId);
      if (!sc.ok) return { ok: false, error: sc.error };
      // 🔒 سیاست حذف (بازبینی — Medium): تخفیفِ «اثر مالی‌دار» (APPROVED) هرگز حذف ناپذیر است؛
      // فقط باید رد شود (REJECTED) یا در حالت در انتظار است که قابل حذف است.
      if (row.status === 'APPROVED') {
        return { ok: false, error: 'تخفیف تأییدشده در محاسبهٔ شهریه اثر دارد — قابل حذف نیست؛ ابتدا ردش کنید (REJECTED).' };
      }
      await tx.delete(student_discounts).where(eq(student_discounts.id, id));
      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: 'FINANCE_DISCOUNT_DELETED',
        entityType: 'student_discounts',
        entityId: id,
        details: JSON.stringify({ studentId: row.studentId, wasStatus: row.status }),
      });
      revalidateStudent(row.studentId);
      return { ok: true };
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'خطا در حذف تخفیف' };
  }
}

// ══════════════════════════════════════════════════════════════════════
//  تعاریف: نوع تخفیف، بنیاد، فرمول تخصیص
// ══════════════════════════════════════════════════════════════════════

export async function saveDiscountTypeAction(input: {
  id?: number;
  code: string;
  title: string;
  kind: string;
  defaultPercent: number;
  defaultAmount: number;
  maxPercent: number | null;
  requiresApproval: boolean;
  requiresDocument: boolean;
  isActive: boolean;
  note: string;
}): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };

  const code = clean(input.code);
  const title = clean(input.title);
  if (!code || !title) return { ok: false, error: 'کد و عنوان الزامی است' };

  let defaultAmount: string;
  try {
    defaultAmount = money(input.defaultAmount);
  } catch (e: any) {
    return { ok: false, error: e?.message };
  }

  const values = {
    code,
    title,
    kind: input.kind === 'FIXED' ? 'FIXED' : 'PERCENT',
    defaultPercent: String(Math.min(Math.max(0, num(input.defaultPercent)), 100)),
    defaultAmount,
    maxPercent: input.maxPercent === null ? null : String(Math.max(0, num(input.maxPercent))),
    requiresApproval: input.requiresApproval ? 1 : 0,
    requiresDocument: input.requiresDocument ? 1 : 0,
    isActive: input.isActive ? 1 : 0,
    note: clean(input.note),
  };

  if (input.id) {
    await db.update(tuition_discount_types).set(values).where(eq(tuition_discount_types.id, input.id));
  } else {
    await db.insert(tuition_discount_types).values(values);
  }

  revalidatePath('/admin/finance/rules');
  return { ok: true };
}

export async function deleteDiscountTypeAction(id: number): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const used = await db.select({ id: student_discounts.id }).from(student_discounts)
    .where(eq(student_discounts.discountTypeId, id)).limit(1);
  if (used.length) return { ok: false, error: 'این نوع تخفیف به دانشجو تخصیص یافته؛ به‌جای حذف، غیرفعالش کنید' };

  await db.delete(tuition_discount_types).where(eq(tuition_discount_types.id, id));
  revalidatePath('/admin/finance/rules');
  return { ok: true };
}
