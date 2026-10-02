'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { loan_products, student_loans } from '@/db/schema';
import { requireRole, getSessionUser } from '@/lib/auth';
import { assertServerActionOrigin, requireStudentScope } from '@/lib/security';
import { toNum } from '@/lib/finance-rules';
import { appendAudit } from '@/lib/audit';
import { safeRials } from '@/lib/money';
import { FINANCE, clean, money, num, revalidateStudent } from './shared';

// ══════════════════════════════════════════════════════════════════════
//  وام
// ══════════════════════════════════════════════════════════════════════

export async function addLoanAction(input: {
  studentId: number;
  termId: number | null;
  loanProductId: number | null;
  lender: string;
  loanCode: string;
  amount: number;
  installments: number;
  firstDueDate: string;
  note: string;
}): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };

  const amount = safeRials(input.amount);
  if (amount === null || amount <= 0) return { ok: false, error: 'مبلغ وام باید عدد صحیح و بزرگ‌تر از صفر باشد' };
  const sc = await requireStudentScope(input.studentId);
  if (!sc.ok) return { ok: false, error: sc.error };

  const lender = clean(input.lender);
  if (!lender) return { ok: false, error: 'نام پرداخت‌کنندهٔ وام الزامی است' };

  // اگر وام از کاتالوگ انتخاب شده، سقف مجاز همان نوع وام اعمال می‌شود —
  // وگرنه هر کارشناس می‌توانست هر مبلغی را با نام وامِ موجود ثبت کند.
  if (input.loanProductId) {
    const [product] = await db.select().from(loan_products)
      .where(eq(loan_products.id, input.loanProductId)).limit(1);
    if (!product) return { ok: false, error: 'نوع وام یافت نشد' };
    if (product.maxAmount !== null && amount > toNum(product.maxAmount)) {
      return { ok: false, error: `مبلغ از سقف مجاز این وام (${toNum(product.maxAmount).toLocaleString('fa-IR')} ریال) بیشتر است` };
    }
  }

  const firstDue = clean(input.firstDueDate);
  const firstDueMs = firstDue ? Date.parse(firstDue) : NaN;

  const user = await getSessionUser();
  try {
    return await db.transaction(async (tx) => {
      const [ins] = await tx.insert(student_loans).values({
        studentId: input.studentId,
        termId: input.termId,
        loanProductId: input.loanProductId || null,
        lender,
        loanCode: clean(input.loanCode),
        amount: String(amount),
        installments: Math.max(1, Math.trunc(num(input.installments)) || 1),
        firstDueDate: Number.isFinite(firstDueMs) ? new Date(firstDueMs) : null,
        status: 'ACTIVE',
        note: clean(input.note),
      }).returning({ id: student_loans.id });
      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: 'FINANCE_LOAN_ADDED',
        entityType: 'student_loans',
        entityId: ins.id,
        details: JSON.stringify({ studentId: input.studentId, lender, amount, installments: num(input.installments) }),
      });
      return { ok: true };
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'خطا در ثبت وام' };
  }
}

export async function setLoanStatusAction(
  id: number,
  status: 'ACTIVE' | 'SETTLED' | 'CANCELLED'
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const user = await getSessionUser();

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.select().from(student_loans).where(eq(student_loans.id, id)).limit(1);
      if (!row) return { ok: false, error: 'وام یافت نشد' };
      // 🔒 Object-Level (بازبینی ۴): رکورد با id پیدا شد — حالا تعلق دانشجو سنجیده می‌شود
      const sc = await requireStudentScope(row.studentId);
      if (!sc.ok) return { ok: false, error: sc.error };
      if (row.status === 'SETTLED' || row.status === 'CANCELLED') return { ok: false, error: 'وام تسویه/ابطال‌شده قابل تغییر نیست.' };

      const upd = await tx.update(student_loans).set({ status })
        .where(and(eq(student_loans.id, id), eq(student_loans.status, row.status)));
      if (upd.rowCount !== 1) return { ok: false, error: 'تغییر همزمان: وضعیت وام توسط کاربر دیگری عوض شده است.' };

      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: `FINANCE_LOAN_${status}`,
        entityType: 'student_loans',
        entityId: id,
        details: JSON.stringify({ studentId: row.studentId, from: row.status }),
      });
      revalidateStudent(row.studentId);
      return { ok: true };
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'خطا در تغییر وضعیت وام' };
  }
}

export async function deleteLoanAction(id: number): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const user = await getSessionUser();

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.select().from(student_loans).where(eq(student_loans.id, id)).limit(1);
      if (!row) return { ok: false, error: 'وام یافت نشد' };
      // 🔒 Object-Level (بازبینی ۴): رکورد با id پیدا شد — حالا تعلق دانشجو سنجیده می‌شود
      const sc = await requireStudentScope(row.studentId);
      if (!sc.ok) return { ok: false, error: sc.error };
      if (row.status === 'SETTLED') return { ok: false, error: 'وام تسویه‌شده حذف نمی‌شود (سابقهٔ مالی است).' };

      await tx.delete(student_loans).where(eq(student_loans.id, id));
      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: 'FINANCE_LOAN_DELETED',
        entityType: 'student_loans',
        entityId: id,
        details: JSON.stringify({ studentId: row.studentId, wasStatus: row.status }),
      });
      revalidateStudent(row.studentId);
      return { ok: true };
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'خطا در حذف وام' };
  }
}

// ══════════════════════════════════════════════════════════════════════
//  نهاد وام (Loan Product) — بازیابی‌شده از نسخهٔ پیشین + سخت‌گیری مبلغ
// ══════════════════════════════════════════════════════════════════════

export async function saveLoanProductAction(input: {
  id?: number;
  code: string;
  title: string;
  lender: string;
  maxAmount: number | null;
  defaultAmount: number;
  defaultInstallments: number;
  isInterestFree: boolean;
  requiresApproval: boolean;
  isActive: boolean;
  note: string;
}): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };

  const code = clean(input.code);
  const title = clean(input.title);
  const lender = clean(input.lender);
  if (!code || !title) return { ok: false, error: 'کد و عنوان الزامی است' };
  if (!lender) return { ok: false, error: 'نام نهاد پرداخت‌کننده الزامی است' };

  let maxAmount: number | null = null;
  let defaultAmount = 0;
  try {
    maxAmount = input.maxAmount === null ? null : Number(money(input.maxAmount));
    defaultAmount = Number(money(input.defaultAmount));
  } catch (e: any) {
    return { ok: false, error: e?.message || 'مبلغ نامعتبر است' };
  }
  if (maxAmount !== null && defaultAmount > maxAmount) {
    return { ok: false, error: 'مبلغ پیش‌فرض نمی‌تواند از سقف مجاز بیشتر باشد' };
  }

  const user = await getSessionUser();
  const values = {
    code,
    title,
    lender,
    maxAmount: maxAmount === null ? null : String(maxAmount),
    defaultAmount: String(defaultAmount),
    defaultInstallments: Math.max(1, Math.trunc(num(input.defaultInstallments)) || 1),
    isInterestFree: input.isInterestFree ? 1 : 0,
    requiresApproval: input.requiresApproval ? 1 : 0,
    isActive: input.isActive ? 1 : 0,
    note: clean(input.note),
  };

  try {
    await db.transaction(async (tx) => {
      if (input.id) {
        const upd = await tx.update(loan_products).set(values).where(eq(loan_products.id, input.id));
        if (upd.rowCount !== 1) throw new Error('نهاد وام یافت نشد یا ویرایش همزمانی دارد');
      } else {
        const [ins] = await tx.insert(loan_products).values(values).returning({ id: loan_products.id });
        await appendAudit(tx, {
          actorUserId: user?.id ?? null,
          action: 'FINANCE_LOAN_PRODUCT_CREATED',
          entityType: 'loan_products',
          entityId: ins.id,
          details: JSON.stringify({ code, maxAmount, defaultAmount }),
        });
      }
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'خطا در ذخیرهٔ نهاد وام' };
  }
  revalidatePath('/admin/finance/rules');
  return { ok: true };
}

export async function deleteLoanProductAction(id: number): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };

  const used = await db.select({ id: student_loans.id }).from(student_loans)
    .where(eq(student_loans.loanProductId, id)).limit(1);
  if (used.length) return { ok: false, error: 'این نوع وام به دانشجو تخصیص یافته؛ به‌جای حذف، غیرفعالش کنید' };

  const user = await getSessionUser();
  try {
    await db.transaction(async (tx) => {
      const del = await tx.delete(loan_products).where(eq(loan_products.id, id));
      if (del.rowCount !== 1) throw new Error('نهاد وام یافت نشد');
      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: 'FINANCE_LOAN_PRODUCT_DELETED',
        entityType: 'loan_products',
        entityId: id,
        details: JSON.stringify({}),
      });
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'خطا در حذف نهاد وام' };
  }
  revalidatePath('/admin/finance/rules');
  return { ok: true };
}
