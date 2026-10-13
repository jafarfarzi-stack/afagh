'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { audit_logs, loan_products, student_loans } from '@/db/schema';
import { welfare_funds } from '@/db/schema-welfare';
import { requireRole, getSessionUser } from '@/lib/auth';
import { assertServerActionOrigin, requireStudentScope } from '@/lib/security';
import { toNum } from '@/lib/finance-rules';
import { appendAudit } from '@/lib/audit';
import { safeRials } from '@/lib/money';
import { FINANCE, clean, money, num, revalidateStudent, requireStudentUni, assertRowUni, uniScopeOf, currentUni } from './shared';

// ══════════════════════════════════════════════════════════════════════
//  وام
// ══════════════════════════════════════════════════════════════════════

/**
 * سقف تأیید دومرحله‌ای وام (ریال): وامِ بالای این مبلغ فقط با «بررسی» یک
 * کارشناس و «تسویه/تغییرِ» کارشناسِ دیگر (هر دو متفاوت از ثبت‌کننده) پیش می‌رود.
 */
const LOAN_TWO_STEP_THRESHOLD = 100_000_000;

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
  /** صندوق رفاه/حمایتی (ماژول 0081) — اختیاری */
  welfareFundId?: number | null;
}): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };

  const amount = safeRials(input.amount);
  if (amount === null || amount <= 0) return { ok: false, error: 'مبلغ وام باید عدد صحیح و بزرگ‌تر از صفر باشد' };
  const sc = await requireStudentScope(input.studentId);
  if (!sc.ok) return { ok: false, error: sc.error };
  const su = await requireStudentUni(input.studentId);
  if (!su.ok) return { ok: false, error: su.error };

  const lender = clean(input.lender);
  if (!lender) return { ok: false, error: 'نام پرداخت‌کنندهٔ وام الزامی است' };

  // اگر وام از کاتالوگ انتخاب شده، سقف مجاز همان نوع وام اعمال می‌شود —
  // وگرنه هر کارشناس می‌توانست هر مبلغی را با نام وامِ موجود ثبت کند.
  if (input.loanProductId) {
    const [product] = await db.select().from(loan_products)
      .where(eq(loan_products.id, input.loanProductId)).limit(1);
    if (!product) return { ok: false, error: 'نوع وام یافت نشد' };
    if (product.universityId !== null && product.universityId !== su.uniId) {
      return { ok: false, error: 'نوع وام متعلق به دانشگاه دیگری است' };
    }
    if (product.maxAmount !== null && amount > toNum(product.maxAmount)) {
      return { ok: false, error: `مبلغ از سقف مجاز این وام (${toNum(product.maxAmount).toLocaleString('fa-IR')} ریال) بیشتر است` };
    }
  }

  const firstDue = clean(input.firstDueDate);
  const firstDueMs = firstDue ? Date.parse(firstDue) : NaN;

  // صندوق رفاه (اختیاری): وجود + هم‌دانشگاهی بودن بررسی می‌شود
  let welfareFundId: number | null = null;
  if (input.welfareFundId !== undefined && input.welfareFundId !== null) {
    const [fund] = await db.select().from(welfare_funds)
      .where(eq(welfare_funds.id, input.welfareFundId)).limit(1);
    if (!fund) return { ok: false, error: 'صندوق رفاه یافت نشد' };
    if (fund.universityId !== null && fund.universityId !== su.uniId) {
      return { ok: false, error: 'صندوق متعلق به دانشگاه دیگری است' };
    }
    welfareFundId = fund.id;
  }

  const user = await getSessionUser();
  try {
    return await db.transaction(async (tx) => {
      const [ins] = await tx.insert(student_loans).values({
        universityId: su.uniId,
        studentId: input.studentId,
        termId: input.termId,
        loanProductId: input.loanProductId || null,
        welfareFundId,
        lender,
        loanCode: clean(input.loanCode),
        amount: String(amount),
        installments: Math.max(1, Math.trunc(num(input.installments)) || 1),
        firstDueDate: Number.isFinite(firstDueMs) ? new Date(firstDueMs) : null,
        status: 'ACTIVE',
        note: clean(input.note),
      }).returning({ id: student_loans.id });
      // 🔒 وامِ بالای سقف دومرحله‌ای از ابتدا پرچم می‌خورد تا تسویه‌اش بدون بررسی دوم رد شود.
      const needsSecond = amount > LOAN_TWO_STEP_THRESHOLD;
      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: needsSecond ? 'FINANCE_LOAN_ADDED_NEEDS_REVIEW' : 'FINANCE_LOAN_ADDED',
        entityType: 'student_loans',
        entityId: ins.id,
        details: JSON.stringify({ studentId: input.studentId, lender, amount, installments: num(input.installments), needsSecondApproval: needsSecond }),
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
      const su = await requireStudentUni(row.studentId);
      if (!su.ok) return { ok: false, error: su.error };
      if (row.status === 'SETTLED' || row.status === 'CANCELLED') return { ok: false, error: 'وام تسویه/ابطال‌شده قابل تغییر نیست.' };

      // 🔒 تفکیک وظایف: تغییر وضعیت وام (تأیید) باید توسط کاربری متفاوت از
      // ثبت‌کننده (نخستین audit ردیف) انجام شود.
      const [creator] = await tx.select({ actorUserId: audit_logs.actorUserId }).from(audit_logs)
        .where(and(eq(audit_logs.entityType, 'student_loans'), eq(audit_logs.entityId, id)))
        .orderBy(audit_logs.id)
        .limit(1);
      const creatorId = creator?.actorUserId ?? null;
      if (creatorId !== null && user?.id != null && creatorId === user.id) {
        return { ok: false, error: 'تغییر وضعیت وام باید توسط کاربری متفاوت از ثبت‌کننده انجام شود (تفکیک وظایف)' };
      }

      // 🔒 دومرحله‌ای برای وامِ بالای سقف: تسویه فقط پس از «بررسی» ثبت‌شدهٔ
      // یک کارشناسِ دیگر (متفاوت از ثبت‌کننده و تسویه‌کننده).
      if (status === 'SETTLED' && Number(row.amount) > LOAN_TWO_STEP_THRESHOLD) {
        const reviews = await tx.select({ actorUserId: audit_logs.actorUserId }).from(audit_logs)
          .where(and(
            eq(audit_logs.entityType, 'student_loans'),
            eq(audit_logs.entityId, id),
            eq(audit_logs.action, 'FINANCE_LOAN_REVIEWED'),
          ))
          .orderBy(audit_logs.id);
        const okReview = reviews.some(r =>
          r.actorUserId !== null && r.actorUserId !== creatorId && r.actorUserId !== (user?.id ?? null));
        if (!okReview) {
          return { ok: false, error: 'وام بالای سقف دومرحله‌ای است: نخست یک کارشناسِ دیگر (متفاوت از ثبت‌کننده و تسویه‌کننده) باید آن را «بررسی» کند' };
        }
      }

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

/**
 * گام اولِ تأیید دومرحله‌ای وام‌های بالای سقف (LOAN_TWO_STEP_THRESHOLD):
 * «بررسی» توسط کارشناسی متفاوت از ثبت‌کننده؛ گام دوم، تسویه توسط
 * کارشناسِ سوم (setLoanStatusAction) است.
 */
export async function reviewLoanAction(id: number, note?: string): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const user = await getSessionUser();

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.select().from(student_loans).where(eq(student_loans.id, id)).limit(1);
      if (!row) return { ok: false, error: 'وام یافت نشد' };
      const sc = await requireStudentScope(row.studentId);
      if (!sc.ok) return { ok: false, error: sc.error };
      const su = await requireStudentUni(row.studentId);
      if (!su.ok) return { ok: false, error: su.error };
      if (row.status === 'SETTLED' || row.status === 'CANCELLED') {
        return { ok: false, error: 'وام تسویه/ابطال‌شده قابل بررسی نیست.' };
      }
      // بررسی‌کننده ≠ ثبت‌کننده (تفکیک وظایف).
      const [creator] = await tx.select({ actorUserId: audit_logs.actorUserId }).from(audit_logs)
        .where(and(eq(audit_logs.entityType, 'student_loans'), eq(audit_logs.entityId, id)))
        .orderBy(audit_logs.id)
        .limit(1);
      const creatorId = creator?.actorUserId ?? null;
      if (creatorId !== null && user?.id != null && creatorId === user.id) {
        return { ok: false, error: 'بررسی وام باید توسط کاربری متفاوت از ثبت‌کننده انجام شود (تفکیک وظایف)' };
      }
      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: 'FINANCE_LOAN_REVIEWED',
        entityType: 'student_loans',
        entityId: id,
        details: JSON.stringify({ studentId: row.studentId, amount: Number(row.amount), note: (note ?? '').trim() || null }),
      });
      return { ok: true };
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'خطا در بررسی وام' };
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
      const su = await requireStudentUni(row.studentId);
      if (!su.ok) return { ok: false, error: su.error };
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
    const uni = await currentUni();
    if (!uni) return { ok: false, error: 'دانشگاه فعال نامشخص است.' };
    await db.transaction(async (tx) => {
      if (input.id) {
        const own = await assertRowUni(loan_products, input.id);
        if (!own.ok) throw new Error(own.error);
        const upd = await tx.update(loan_products).set(values).where(and(
          eq(loan_products.id, input.id),
          uniScopeOf(loan_products.universityId, uni.id),
        ));
        if (upd.rowCount !== 1) throw new Error('نهاد وام یافت نشد یا ویرایش همزمانی دارد');
      } else {
        const [ins] = await tx.insert(loan_products).values({ ...values, universityId: uni.id }).returning({ id: loan_products.id });
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
  const own = await assertRowUni(loan_products, id);
  if (!own.ok) return { ok: false, error: own.error };

  const user = await getSessionUser();
  try {
    await db.transaction(async (tx) => {
      const del = await tx.delete(loan_products).where(and(
        eq(loan_products.id, id),
        uniScopeOf(loan_products.universityId, own.uniId),
      ));
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
