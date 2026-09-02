'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  payment_cheques, student_discounts, student_ledger, student_loans,
  student_sponsorships, tuition_discount_types, tuition_formulas, tuition_sponsors,
} from '@/db/schema';
import { requireRole, getSessionUser } from '@/lib/auth';
import { clearCheque, computeFormulaTuition } from '@/lib/finance-engine';
import { toNum } from '@/lib/finance-rules';

const FINANCE = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'];

const clean = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s === '' || s === 'null' || s === 'undefined' ? null : s;
};
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const intOrNull = (v: unknown): number | null => {
  const s = clean(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};
const money = (v: unknown): string => String(Math.round(Math.max(0, num(v))));

function revalidateStudent(studentId: number) {
  revalidatePath('/admin/finance');
  revalidatePath(`/admin/finance/student/${studentId}`);
}

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
  status?: string;
}): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);

  const [type] = await db.select().from(tuition_discount_types)
    .where(eq(tuition_discount_types.id, input.discountTypeId)).limit(1);
  if (!type) return { ok: false, error: 'نوع تخفیف یافت نشد' };

  const percent = Math.min(Math.max(0, num(input.percent)), 100);
  if (type.maxPercent !== null && percent > toNum(type.maxPercent)) {
    return { ok: false, error: `درصد تخفیف از سقف مجاز (${toNum(type.maxPercent)}٪) بیشتر است` };
  }

  const user = await getSessionUser();
  // اگر نوع تخفیف نیازمند تأیید است، با وضعیت در انتظار ثبت می‌شود.
  const status = type.requiresApproval ? 'PENDING' : (input.status || 'APPROVED');

  await db.insert(student_discounts).values({
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
  });

  revalidateStudent(input.studentId);
  return { ok: true };
}

export async function setDiscountStatusAction(
  id: number,
  status: 'APPROVED' | 'REJECTED'
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const user = await getSessionUser();

  const [row] = await db.select().from(student_discounts).where(eq(student_discounts.id, id)).limit(1);
  if (!row) return { ok: false, error: 'تخفیف یافت نشد' };

  await db.update(student_discounts)
    .set({
      status,
      approvedBy: user?.id ?? null,
      approvedAt: status === 'APPROVED' ? new Date() : null,
    })
    .where(eq(student_discounts.id, id));

  revalidateStudent(row.studentId);
  return { ok: true };
}

export async function deleteDiscountAction(id: number): Promise<{ ok: boolean }> {
  await requireRole(FINANCE);
  const [row] = await db.select().from(student_discounts).where(eq(student_discounts.id, id)).limit(1);
  await db.delete(student_discounts).where(eq(student_discounts.id, id));
  if (row) revalidateStudent(row.studentId);
  return { ok: true };
}

// ══════════════════════════════════════════════════════════════════════
//  پوشش بنیادها
// ══════════════════════════════════════════════════════════════════════

export async function addSponsorshipAction(input: {
  studentId: number;
  termId: number | null;
  sponsorId: number;
  coverageKind: string;
  percent: number;
  amount: number;
  appliesTo: string;
  referenceNo: string;
  status?: string;
}): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);

  const [sponsor] = await db.select().from(tuition_sponsors)
    .where(eq(tuition_sponsors.id, input.sponsorId)).limit(1);
  if (!sponsor) return { ok: false, error: 'بنیاد یافت نشد' };

  await db.insert(student_sponsorships).values({
    studentId: input.studentId,
    termId: input.termId,
    sponsorId: input.sponsorId,
    coverageKind: input.coverageKind === 'FIXED' ? 'FIXED' : 'PERCENT',
    percent: String(Math.min(Math.max(0, num(input.percent)), 100)),
    amount: money(input.amount),
    appliesTo: input.appliesTo || 'BOTH',
    referenceNo: clean(input.referenceNo),
    status: input.status || 'PENDING',
  });

  revalidateStudent(input.studentId);
  return { ok: true };
}

export async function setSponsorshipStatusAction(
  id: number,
  status: 'CONFIRMED' | 'PAID' | 'REJECTED'
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const [row] = await db.select().from(student_sponsorships).where(eq(student_sponsorships.id, id)).limit(1);
  if (!row) return { ok: false, error: 'پوشش یافت نشد' };

  await db.update(student_sponsorships).set({ status }).where(eq(student_sponsorships.id, id));
  revalidateStudent(row.studentId);
  return { ok: true };
}

export async function deleteSponsorshipAction(id: number): Promise<{ ok: boolean }> {
  await requireRole(FINANCE);
  const [row] = await db.select().from(student_sponsorships).where(eq(student_sponsorships.id, id)).limit(1);
  await db.delete(student_sponsorships).where(eq(student_sponsorships.id, id));
  if (row) revalidateStudent(row.studentId);
  return { ok: true };
}

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

  const amount = Math.round(num(input.amount));
  if (amount <= 0) return { ok: false, error: 'مبلغ چک باید بزرگ‌تر از صفر باشد' };

  const due = clean(input.dueDate);
  if (!due) return { ok: false, error: 'تاریخ سررسید الزامی است — بدون آن یادآوری ممکن نیست' };
  const dueMs = Date.parse(due);
  if (!Number.isFinite(dueMs)) return { ok: false, error: 'تاریخ سررسید معتبر نیست' };

  const chequeNo = clean(input.chequeNo);
  if (!chequeNo) return { ok: false, error: 'شمارهٔ چک الزامی است' };

  await db.insert(payment_cheques).values({
    studentId: input.studentId,
    termId: input.termId,
    chequeNo,
    bankName: clean(input.bankName),
    branchCode: clean(input.branchCode),
    amount: String(amount),
    dueDate: new Date(dueMs),
    status: 'PENDING',
    note: clean(input.note),
  });

  revalidateStudent(input.studentId);
  return { ok: true };
}

export async function clearChequeAction(id: number): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const [row] = await db.select().from(payment_cheques).where(eq(payment_cheques.id, id)).limit(1);
  const result = await clearCheque(id);
  if (row) revalidateStudent(row.studentId);
  return result;
}

export async function setChequeStatusAction(
  id: number,
  status: 'BOUNCED' | 'CANCELLED' | 'PENDING'
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const [row] = await db.select().from(payment_cheques).where(eq(payment_cheques.id, id)).limit(1);
  if (!row) return { ok: false, error: 'چک یافت نشد' };
  if (row.status === 'CLEARED') return { ok: false, error: 'چک وصول‌شده قابل تغییر وضعیت نیست' };

  await db.update(payment_cheques)
    .set({ status, remindedAt: status === 'PENDING' ? null : row.remindedAt })
    .where(eq(payment_cheques.id, id));

  revalidateStudent(row.studentId);
  return { ok: true };
}

export async function deleteChequeAction(id: number): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const [row] = await db.select().from(payment_cheques).where(eq(payment_cheques.id, id)).limit(1);
  if (!row) return { ok: false, error: 'چک یافت نشد' };
  if (row.status === 'CLEARED') return { ok: false, error: 'چک وصول‌شده حذف نمی‌شود؛ در دفتر مالی ثبت شده است' };

  await db.delete(payment_cheques).where(eq(payment_cheques.id, id));
  revalidateStudent(row.studentId);
  return { ok: true };
}

// ══════════════════════════════════════════════════════════════════════
//  وام
// ══════════════════════════════════════════════════════════════════════

export async function addLoanAction(input: {
  studentId: number;
  termId: number | null;
  lender: string;
  loanCode: string;
  amount: number;
  installments: number;
  firstDueDate: string;
  note: string;
}): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);

  const amount = Math.round(num(input.amount));
  if (amount <= 0) return { ok: false, error: 'مبلغ وام باید بزرگ‌تر از صفر باشد' };

  const lender = clean(input.lender);
  if (!lender) return { ok: false, error: 'نام پرداخت‌کنندهٔ وام الزامی است' };

  const firstDue = clean(input.firstDueDate);
  const firstDueMs = firstDue ? Date.parse(firstDue) : NaN;

  await db.insert(student_loans).values({
    studentId: input.studentId,
    termId: input.termId,
    lender,
    loanCode: clean(input.loanCode),
    amount: String(amount),
    installments: Math.max(1, Math.trunc(num(input.installments)) || 1),
    firstDueDate: Number.isFinite(firstDueMs) ? new Date(firstDueMs) : null,
    status: 'ACTIVE',
    note: clean(input.note),
  });

  revalidateStudent(input.studentId);
  return { ok: true };
}

export async function setLoanStatusAction(
  id: number,
  status: 'ACTIVE' | 'SETTLED' | 'CANCELLED'
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const [row] = await db.select().from(student_loans).where(eq(student_loans.id, id)).limit(1);
  if (!row) return { ok: false, error: 'وام یافت نشد' };

  await db.update(student_loans).set({ status }).where(eq(student_loans.id, id));
  revalidateStudent(row.studentId);
  return { ok: true };
}

export async function deleteLoanAction(id: number): Promise<{ ok: boolean }> {
  await requireRole(FINANCE);
  const [row] = await db.select().from(student_loans).where(eq(student_loans.id, id)).limit(1);
  await db.delete(student_loans).where(eq(student_loans.id, id));
  if (row) revalidateStudent(row.studentId);
  return { ok: true };
}

// ══════════════════════════════════════════════════════════════════════
//  پرداخت و شارژ دفتر مالی
// ══════════════════════════════════════════════════════════════════════

export async function recordLedgerAction(input: {
  studentId: number;
  termId: number | null;
  transactionType: 'PAYMENT' | 'CHARGE';
  amount: number;
  description: string;
}): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);

  const amount = Math.round(num(input.amount));
  if (amount <= 0) return { ok: false, error: 'مبلغ باید بزرگ‌تر از صفر باشد' };

  await db.insert(student_ledger).values({
    studentId: input.studentId,
    termId: input.termId,
    transactionType: input.transactionType,
    amount: String(amount),
    description: clean(input.description) || (input.transactionType === 'PAYMENT' ? 'پرداخت شهریه' : 'شارژ شهریه'),
  });

  revalidateStudent(input.studentId);
  return { ok: true };
}

/** ثبت شهریهٔ یک ترم بر اساس فرمول تخصیصِ منطبق بر دانشجو */
export async function chargeByFormulaAction(input: {
  studentId: number;
  termId: number;
}): Promise<{ ok: boolean; error?: string; amount?: number }> {
  await requireRole(FINANCE);

  const calc = await computeFormulaTuition(input.studentId, input.termId);
  if (!calc.formula) return { ok: false, error: 'هیچ فرمول تخصیصی با مقطع/رشته/ورودی این دانشجو نمی‌خواند' };
  if (calc.total <= 0) return { ok: false, error: 'مبلغ محاسبه‌شده صفر است' };

  await db.insert(student_ledger).values({
    studentId: input.studentId,
    termId: input.termId,
    transactionType: 'TUITION_CHARGE',
    amount: String(calc.total),
    description: `شهریه بر اساس فرمول «${calc.formula.title}»`,
    referenceId: calc.formula.id,
  });

  revalidateStudent(input.studentId);
  return { ok: true, amount: calc.total };
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

  const code = clean(input.code);
  const title = clean(input.title);
  if (!code || !title) return { ok: false, error: 'کد و عنوان الزامی است' };

  const values = {
    code,
    title,
    kind: input.kind === 'FIXED' ? 'FIXED' : 'PERCENT',
    defaultPercent: String(Math.min(Math.max(0, num(input.defaultPercent)), 100)),
    defaultAmount: money(input.defaultAmount),
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
  const used = await db.select({ id: student_discounts.id }).from(student_discounts)
    .where(eq(student_discounts.discountTypeId, id)).limit(1);
  if (used.length) return { ok: false, error: 'این نوع تخفیف به دانشجو تخصیص یافته؛ به‌جای حذف، غیرفعالش کنید' };

  await db.delete(tuition_discount_types).where(eq(tuition_discount_types.id, id));
  revalidatePath('/admin/finance/rules');
  return { ok: true };
}

export async function saveSponsorAction(input: {
  id?: number;
  code: string;
  title: string;
  contactInfo: string;
  settlementMethod: string;
  isActive: boolean;
  note: string;
}): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);

  const code = clean(input.code);
  const title = clean(input.title);
  if (!code || !title) return { ok: false, error: 'کد و عنوان الزامی است' };

  const values = {
    code,
    title,
    contactInfo: clean(input.contactInfo),
    settlementMethod: input.settlementMethod === 'REIMBURSE' ? 'REIMBURSE' : 'DIRECT',
    isActive: input.isActive ? 1 : 0,
    note: clean(input.note),
  };

  if (input.id) {
    await db.update(tuition_sponsors).set(values).where(eq(tuition_sponsors.id, input.id));
  } else {
    await db.insert(tuition_sponsors).values(values);
  }

  revalidatePath('/admin/finance/rules');
  return { ok: true };
}

export async function deleteSponsorAction(id: number): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const used = await db.select({ id: student_sponsorships.id }).from(student_sponsorships)
    .where(eq(student_sponsorships.sponsorId, id)).limit(1);
  if (used.length) return { ok: false, error: 'این بنیاد پوشش ثبت‌شده دارد؛ به‌جای حذف، غیرفعالش کنید' };

  await db.delete(tuition_sponsors).where(eq(tuition_sponsors.id, id));
  revalidatePath('/admin/finance/rules');
  return { ok: true };
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

  const code = clean(input.code);
  const title = clean(input.title);
  if (!code || !title) return { ok: false, error: 'کد و عنوان الزامی است' };

  const from = intOrNull(input.entryYearFrom);
  const to = intOrNull(input.entryYearTo);
  if (from !== null && to !== null && from > to) {
    return { ok: false, error: 'آغاز بازهٔ ورودی نمی‌تواند پس از پایان آن باشد' };
  }

  const values = {
    code,
    title,
    degreeLevelId: intOrNull(input.degreeLevelId),
    majorId: intOrNull(input.majorId),
    entryYearFrom: from,
    entryYearTo: to,
    fixedAmount: money(input.fixedAmount),
    perUnitTheory: money(input.perUnitTheory),
    perUnitPractical: money(input.perUnitPractical),
    perUnitGeneral: money(input.perUnitGeneral),
    priority: Math.trunc(num(input.priority)) || 100,
    isActive: input.isActive ? 1 : 0,
    note: clean(input.note),
    updatedAt: new Date(),
  };

  if (input.id) {
    await db.update(tuition_formulas).set(values).where(eq(tuition_formulas.id, input.id));
  } else {
    await db.insert(tuition_formulas).values(values);
  }

  revalidatePath('/admin/finance/rules');
  return { ok: true };
}

export async function deleteFormulaAction(id: number): Promise<{ ok: boolean }> {
  await requireRole(FINANCE);
  await db.delete(tuition_formulas).where(eq(tuition_formulas.id, id));
  revalidatePath('/admin/finance/rules');
  return { ok: true };
}
