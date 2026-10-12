'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { audit_logs, student_ledger, tuition_rules } from '@/db/schema';
import { requireRole, getSessionUser } from '@/lib/auth';
import { assertServerActionOrigin, requireStudentScope } from '@/lib/security';
import { computeFormulaTuition } from '@/lib/finance-engine';
import { appendAudit } from '@/lib/audit';
import { safeRials } from '@/lib/money';
import { FINANCE, clean, intOrNull, money, num, requireStudentUni, assertRowUni, uniScopeOf, currentUni } from './shared';

/** دستهٔ تراکنش دیتابیس برای نوشتن در دفتر مالی */
export type LedgerTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** نقش‌های مجاز POS (صندوق‌دار هم ویدی می‌کند — در FINANCE نیست) */
const POS_FINANCE_ROLES = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE', 'CASHIER'];

type LedgerWrite = {
  universityId: number;
  studentId: number;
  termId: number | null;
  financialTermId?: number | null;
  transactionType: string;
  /** رشتهٔ ریالی اعتبارسنجی‌شده (برای برگشتی: منفی) */
  amount: string;
  description: string;
  referenceId?: number | null;
  actorUserId?: number | null;
  auditAction: string;
  auditDetails: Record<string, unknown>;
};

/** نوشتن یک ردیف دفتر مالی + ردیف حسابرسی، روی اتصال داده‌شده (تراکنش بیرونی یا داخلی) */
async function writeLedgerRow(tx: LedgerTx, w: LedgerWrite): Promise<number> {
  const [ins] = await tx.insert(student_ledger).values({
    universityId: w.universityId,
    studentId: w.studentId,
    termId: w.termId,
    financialTermId: w.financialTermId ?? null,
    transactionType: w.transactionType,
    amount: w.amount,
    description: w.description,
    referenceId: w.referenceId ?? null,
  }).returning({ id: student_ledger.id });
  await appendAudit(tx, {
    actorUserId: w.actorUserId ?? null,
    action: w.auditAction,
    entityType: 'student_ledger',
    entityId: ins.id,
    details: JSON.stringify(w.auditDetails),
  });
  return ins.id;
}

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
  // 🔒 پارامتر isReversal حذف شد (حفرهٔ mutation مالی): کلاینت هیچ راهی برای
  // ثبت مستقیم مبلغ منفی ندارد. برگشتی فقط از recordReversalAction با
  // originalLedgerId اجباری + قفل سطری + سقف مانده + تفکیک تأییدکننده.
}, opts?: { tx?: LedgerTx; allowedRoles?: string[] }): Promise<{ ok: boolean; error?: string; ledgerId?: number }> {
  await requireRole(opts?.allowedRoles ?? FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };

  // فقط مبلغ صحیح مثبت؛ منفی/صفر همیشه رد می‌شود (fail-closed).
  const amount = safeRials(input.amount);
  if (amount === null || amount <= 0) {
    return { ok: false, error: 'مبلغ باید عدد صحیح و بزرگ‌تر از صفر باشد' };
  }
  const sc = await requireStudentScope(input.studentId);
  if (!sc.ok) return { ok: false, error: sc.error };
  const su = await requireStudentUni(input.studentId);
  if (!su.ok) return { ok: false, error: su.error };

  const user = await getSessionUser();
  const description = clean(input.description) || (input.transactionType === 'PAYMENT' ? 'پرداخت شهریه' : 'شارژ شهریه');
  const run = async (tx: LedgerTx) => {
    const ledgerId = await writeLedgerRow(tx, {
      universityId: su.uniId,
      studentId: input.studentId,
      termId: input.termId,
      financialTermId: input.financialTermId ?? null,
      transactionType: input.transactionType,
      amount: String(amount),
      description,
      referenceId: input.referenceId ?? null,
      actorUserId: user?.id ?? null,
      auditAction: `FINANCE_LEDGER_${input.transactionType}`,
      auditDetails: { studentId: input.studentId, amount, termId: input.termId, referenceId: input.referenceId ?? null, actorRoles: user?.roles ?? [] },
    });
    return { ok: true, ledgerId };
  };
  // اگر تراکنش بیرونی داده شد، در همان ادامه می‌یابد (بدون تودرتو) تا
  // فراخواننده (مثل ویدی POS) بتواند همه‌چیز را اتمیک کند.
  if (opts?.tx) {
    try {
      return await run(opts.tx);
    } catch (e: any) {
      return { ok: false, error: e?.message || 'خطا در ثبت تراکنش مالی' };
    }
  }
  try {
    return await db.transaction(run);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'خطا در ثبت تراکنش مالی' };
  }
}

/**
 * برگشتی صریح یک ردیف دفتر مالی (ویدی POS): مبلغ مثبتِ قدرمطلق می‌گیرد و
 * آن را منفی با همان نوع تراکنش ذخیره می‌کند؛ referenceId به ردیف اصلی
 * اشاره می‌کند. نوع جدیدی نوشته نمی‌شود، پس نیازی به مهاجرت constraint نیست.
 *
 * 🔒 تنها مسیر ساخت ردیف منفی (recordLedgerAction منفی نمی‌پذیرد):
 *   • originalLedgerId اجباری است (ردیف قدیمی بدون پیوند هم باید نخست
 *     پیدا و شناسه‌اش داده شود — وگرنه برگشتی رد می‌شود).
 *   • ردیف اصلی با SELECT … FOR UPDATE قفل می‌شود تا دو برگشتی همزمان
 *     نتوانند بیش از اصل برگردانند.
 *   • قدرمطلق ≤ (مبلغ اصل − برگشتی‌های قبلی)؛ برگشتی مازاد رد می‌شود.
 *   • تفکیک وظایف: برگشت‌زننده باید با ثبت‌کنندهٔ ردیف اصلی (از audit_logs)
 *     متفاوت باشد.
 */
export async function recordReversalAction(input: {
  studentId: number;
  termId: number | null;
  financialTermId?: number | null;
  /** شناسهٔ ردیف اصلی دفتر مالی — اجباری */
  originalLedgerId: number;
  transactionType: 'PAYMENT' | 'CHARGE' | 'POS_PAYMENT';
  /** قدرمطلق مبلغ برگشتی (ریال) */
  amount: number;
  reason: string;
}, opts?: { tx?: LedgerTx }): Promise<{ ok: boolean; error?: string; ledgerId?: number }> {
  await requireRole(POS_FINANCE_ROLES);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };

  if (!Number.isInteger(input.originalLedgerId) || input.originalLedgerId <= 0) {
    return { ok: false, error: 'شناسهٔ ردیف اصلی دفتر مالی الزامی است؛ برگشتی بدون پیوند به اصل مجاز نیست' };
  }
  const magnitude = safeRials(input.amount);
  if (magnitude === null || magnitude <= 0) return { ok: false, error: 'مبلغ برگشتی باید عدد صحیح و بزرگ‌تر از صفر باشد' };
  const reason = clean(input.reason);
  if (!reason) return { ok: false, error: 'دلیل برگشتی الزامی است' };
  const sc = await requireStudentScope(input.studentId);
  if (!sc.ok) return { ok: false, error: sc.error };
  const su = await requireStudentUni(input.studentId);
  if (!su.ok) return { ok: false, error: su.error };
  const user = await getSessionUser();

  const run = async (tx: LedgerTx): Promise<{ ok: boolean; error?: string; ledgerId?: number }> => {
    // ۱) قفل ردیف اصلی — برگشتی‌های همزمان همین ردیف سریال می‌شوند.
    const [orig] = await tx.select().from(student_ledger)
      .where(and(eq(student_ledger.id, input.originalLedgerId), eq(student_ledger.studentId, input.studentId)))
      .limit(1)
      .for('update');
    if (!orig) return { ok: false, error: 'ردیف اصلی دفتر مالی یافت نشد؛ برگشتی ممکن نیست' };
    if (orig.transactionType !== input.transactionType) {
      return { ok: false, error: 'نوع تراکنش برگشتی با ردیف اصلی نمی‌خواند' };
    }
    const origAmount = Number(orig.amount);
    if (!Number.isFinite(origAmount) || origAmount <= 0) {
      return { ok: false, error: 'مبلغ ردیف اصلی نامعتبر است؛ برگشتی ممکن نیست' };
    }
    // ۲) سقف ماندهٔ قابل‌برگشت = اصل − برگشتی‌های قبلیِ همین ردیف.
    const prev = await tx.execute(sql`SELECT COALESCE(SUM(-("amount")::numeric), 0) AS "reversed" FROM student_ledger WHERE "referenceId" = ${input.originalLedgerId} AND ("amount")::numeric < 0`);
    const alreadyReversed = Number((prev.rows[0] as { reversed?: unknown } | undefined)?.reversed ?? 0);
    const remaining = origAmount - (Number.isFinite(alreadyReversed) ? alreadyReversed : 0);
    if (magnitude > remaining) {
      return { ok: false, error: `مبلغ برگشتی از ماندهٔ قابل‌برگشت (${Math.max(0, remaining).toLocaleString('fa-IR')} ریال) بیشتر است` };
    }
    // ۳) تفکیک وظایف: ثبت‌کنندهٔ اصل (نخستین audit ردیف) ≠ برگشت‌زننده.
    const [creator] = await tx.select({ actorUserId: audit_logs.actorUserId }).from(audit_logs)
      .where(and(eq(audit_logs.entityType, 'student_ledger'), eq(audit_logs.entityId, input.originalLedgerId)))
      .orderBy(audit_logs.id)
      .limit(1);
    const creatorId = creator?.actorUserId ?? null;
    if (creatorId !== null && user?.id != null && creatorId === user.id) {
      return { ok: false, error: 'برگشتی باید توسط کاربری متفاوت از ثبت‌کنندهٔ تراکنش اصلی انجام شود (تفکیک وظایف)' };
    }
    const ledgerId = await writeLedgerRow(tx, {
      universityId: orig.universityId ?? su.uniId,
      studentId: input.studentId,
      termId: input.termId,
      financialTermId: input.financialTermId ?? null,
      transactionType: input.transactionType,
      amount: String(-magnitude),
      description: `برگشتی ${input.transactionType} — ردیف اصلی #${input.originalLedgerId} — ${reason}`,
      referenceId: input.originalLedgerId,
      actorUserId: user?.id ?? null,
      auditAction: `FINANCE_LEDGER_${input.transactionType}_REVERSAL`,
      auditDetails: {
        studentId: input.studentId, amount: -magnitude, termId: input.termId,
        originalLedgerId: input.originalLedgerId, alreadyReversed, creatorId,
        actorRoles: user?.roles ?? [],
      },
    });
    return { ok: true, ledgerId };
  };
  // در تراکنش بیرونیِ فراخواننده ادامه می‌یابد (اتمی با ویدی POS) وگرنه تراکنش خودش.
  if (opts?.tx) {
    try {
      return await run(opts.tx);
    } catch (e: any) {
      return { ok: false, error: e?.message || 'خطا در ثبت برگشتی مالی' };
    }
  }
  try {
    return await db.transaction(run);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'خطا در ثبت برگشتی مالی' };
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
  const su = await requireStudentUni(input.studentId);
  if (!su.ok) return { ok: false, error: su.error };

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
        universityId: su.uniId,
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
  const uni = await currentUni();
  if (!uni) return { ok: false, error: 'دانشگاه فعال نامشخص است.' };

  if (input.id) {
    const own = await assertRowUni(tuition_rules, input.id);
    if (!own.ok) return { ok: false, error: own.error };
    await db.update(tuition_rules).set(values).where(and(
      eq(tuition_rules.id, input.id),
      uniScopeOf(tuition_rules.universityId, uni.id),
    ));
  } else {
    await db.insert(tuition_rules).values({ ...values, universityId: uni.id });
  }

  revalidatePath('/admin/finance/rules');
  return { ok: true };
}

export async function deleteFormulaAction(id: number): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const own = await assertRowUni(tuition_rules, id);
  if (!own.ok) return { ok: false, error: own.error };
  await db.delete(tuition_rules).where(and(
    eq(tuition_rules.id, id),
    uniScopeOf(tuition_rules.universityId, own.uniId),
  ));
  revalidatePath('/admin/finance/rules');
  return { ok: true };
}
