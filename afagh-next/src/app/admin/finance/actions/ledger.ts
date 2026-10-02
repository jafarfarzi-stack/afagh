'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { student_ledger, tuition_rules } from '@/db/schema';
import { requireRole, getSessionUser } from '@/lib/auth';
import { assertServerActionOrigin, requireStudentScope } from '@/lib/security';
import { computeFormulaTuition } from '@/lib/finance-engine';
import { appendAudit } from '@/lib/audit';
import { safeRials } from '@/lib/money';
import { FINANCE, clean, intOrNull, money, num } from './shared';

// ══════════════════════════════════════════════════════════════════════
//  پرداخت و شارژ دفتر مالی
// ══════════════════════════════════════════════════════════════════════

export async function recordLedgerAction(input: {
  studentId: number;
  termId: number | null;
  transactionType: 'PAYMENT' | 'CHARGE' | 'POS_PAYMENT';
  amount: number;
  description: string;
  financialTermId?: number | null;
  referenceId?: number;
}): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };

  const amount = safeRials(input.amount);
  if (amount === null || amount <= 0) return { ok: false, error: 'مبلغ باید عدد صحیح و بزرگ‌تر از صفر باشد' };
  const sc = await requireStudentScope(input.studentId);
  if (!sc.ok) return { ok: false, error: sc.error };

  const user = await getSessionUser();
  try {
    return await db.transaction(async (tx) => {
      const [ins] = await tx.insert(student_ledger).values({
        studentId: input.studentId,
        termId: input.termId,
        transactionType: input.transactionType,
        amount: String(amount),
        description: clean(input.description) || (input.transactionType === 'PAYMENT' ? 'پرداخت شهریه' : 'شارژ شهریه'),
      }).returning({ id: student_ledger.id });
      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: `FINANCE_LEDGER_${input.transactionType}`,
        entityType: 'student_ledger',
        entityId: ins.id,
        details: JSON.stringify({ studentId: input.studentId, amount, termId: input.termId }),
      });
      return { ok: true };
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'خطا در ثبت تراکنش مالی' };
  }
}

/** ثبت شهریهٔ یک ترم بر اساس فرمول تخصیصِ منطبق بر دانشجو */
export async function chargeByFormulaAction(input: {
  studentId: number;
  termId: number;
}): Promise<{ ok: boolean; error?: string; amount?: number }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };

  const sc = await requireStudentScope(input.studentId);
  if (!sc.ok) return { ok: false, error: sc.error };

  const calc = await computeFormulaTuition(input.studentId, input.termId);
  if (!calc.formula) return { ok: false, error: 'هیچ فرمول تخصیصی با مقطع/رشته/ورودی این دانشجو نمی‌خواند' };
  const formula = calc.formula; // برای انتقال غیر-null به بسته‌های (closure) تراکنش
  if (calc.total <= 0) return { ok: false, error: 'مبلغ محاسبه‌شده صفر است' };

  const amount = safeRials(calc.total);
  if (amount === null || amount <= 0) return { ok: false, error: 'مبلغ محاسبه‌شده نامعتبر است' };

  const user = await getSessionUser();
  try {
    return await db.transaction(async (tx) => {
      const [ins] = await tx.insert(student_ledger).values({
        studentId: input.studentId,
        termId: input.termId,
        transactionType: 'TUITION_CHARGE',
        amount: String(amount),
        description: `شهریه بر اساس فرمول «${formula.title}»`,
        referenceId: formula.id,
      }).returning({ id: student_ledger.id });
      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: 'FINANCE_TUITION_CHARGED',
        entityType: 'student_ledger',
        entityId: ins.id,
        details: JSON.stringify({ studentId: input.studentId, amount, formulaId: formula.id, termId: input.termId }),
      });
      return { ok: true, amount };
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'خطا در شارژ شهریه' };
  }
}

export async function saveFormulaAction(input: {
  id?: number;
  code: string;
  title: string;
  degreeLevelId: number | null;
  majorId: number | null;
  entryYearFrom: number | null;
  entryYearTo: number | null;
  fixedAmount: number;
  perUnitTheory: number;
  perUnitPractical: number;
  perUnitGeneral: number;
  priority: number;
  isActive: boolean;
  note: string;
}): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };

  const code = clean(input.code);
  const title = clean(input.title);
  if (!code || !title) return { ok: false, error: 'کد و عنوان الزامی است' };

  const from = intOrNull(input.entryYearFrom);
  const to = intOrNull(input.entryYearTo);
  if (from !== null && to !== null && from > to) {
    return { ok: false, error: 'آغاز بازهٔ ورودی نمی‌تواند پس از پایان آن باشد' };
  }

  let fixedAmount: string, perUnitTheory: string, perUnitPractical: string, perUnitGeneral: string;
  try {
    fixedAmount = money(input.fixedAmount);
    perUnitTheory = money(input.perUnitTheory);
    perUnitPractical = money(input.perUnitPractical);
    perUnitGeneral = money(input.perUnitGeneral);
  } catch (e: any) {
    return { ok: false, error: e?.message };
  }

  const values = {
    code,
    title,
    degreeLevelId: intOrNull(input.degreeLevelId),
    majorId: intOrNull(input.majorId),
    entryYearFrom: from,
    entryYearTo: to,
    fixedAmount,
    perUnitTheory,
    perUnitPractical,
    perUnitGeneral,
    priority: Math.trunc(num(input.priority)) || 100,
    isActive: input.isActive ? 1 : 0,
    note: clean(input.note),
    updatedAt: new Date(),
  };

  if (input.id) {
    await db.update(tuition_rules).set(values).where(eq(tuition_rules.id, input.id));
  } else {
    await db.insert(tuition_rules).values(values);
  }

  revalidatePath('/admin/finance/rules');
  return { ok: true };
}

export async function deleteFormulaAction(id: number): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  await db.delete(tuition_rules).where(eq(tuition_rules.id, id));
  revalidatePath('/admin/finance/rules');
  return { ok: true };
}
