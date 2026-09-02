import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms, course_offerings, courses, enrollments, student_ledger,
  students, tuition_fee_rules,
} from '@/db/schema';

/**
 * موتور شهریهٔ آفاق — بدون هیچ نرخ سخت‌کد.
 *
 * نرخ‌ها از جدول `tuition_fee_rules` خوانده می‌شوند و بر اساس سه کلید انتخاب
 * می‌گردند: مقطع، نوع ترم (NORMAL/SUMMER/EQUIVALENCE) و نوع گذراندن درس
 * (offeringType مثل NORMAL/TRANSFER). «خاص‌ترین» قاعدهٔ منطبق برنده است، پس
 * معادل‌سازی می‌تواند شهریهٔ ثابت و نرخ هر واحد کاملاً جداگانه داشته باشد:
 *   - شهریهٔ ثابت: یک‌بار به ازای نوع ترم
 *   - شهریهٔ متغیر: به ازای هر واحد، بر اساس نوع گذراندن همان درس
 */

export type TermType = 'NORMAL' | 'SUMMER' | 'EQUIVALENCE';

export interface ResolvedRule {
  id: number;
  fixedTuition: number;
  perUnitTuition: number;
  degreeLevelId: number | null;
  termType: string | null;
  offeringType: string | null;
}

const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * انتخاب خاص‌ترین قاعدهٔ فعالِ منطبق. خاص‌بودن = تعداد کلیدهای غیرخالی بیشتر
 * (مقطع، نوع ترم، نوع درس). تساوی → جدیدترین effectiveFromYear و سپس id بزرگ‌تر.
 */
export async function resolveFeeRule(params: {
  degreeLevelId: number | null;
  termType: TermType | string | null;
  offeringType?: string | null;
  entryYear?: number | null;
}): Promise<ResolvedRule | null> {
  const rows = await db
    .select()
    .from(tuition_fee_rules)
    .where(eq(tuition_fee_rules.isActive, 1));

  const matches = rows.filter((r) => {
    if (r.degreeLevelId != null && params.degreeLevelId != null && r.degreeLevelId !== params.degreeLevelId) return false;
    if (r.degreeLevelId != null && params.degreeLevelId == null) return false;
    if (r.termType && params.termType && r.termType !== params.termType) return false;
    if (r.offeringType && params.offeringType && r.offeringType !== params.offeringType) return false;
    if (r.effectiveFromYear != null && params.entryYear != null && r.effectiveFromYear > params.entryYear) return false;
    return true;
  });

  if (matches.length === 0) return null;

  const specificity = (r: (typeof matches)[number]) =>
    (r.degreeLevelId != null ? 1 : 0) + (r.termType ? 1 : 0) + (r.offeringType ? 1 : 0);

  matches.sort((a, b) => {
    const s = specificity(b) - specificity(a);
    if (s !== 0) return s;
    const y = (b.effectiveFromYear ?? 0) - (a.effectiveFromYear ?? 0);
    if (y !== 0) return y;
    return b.id - a.id;
  });

  const best = matches[0];
  return {
    id: best.id,
    fixedTuition: toNum(best.fixedTuition),
    perUnitTuition: toNum(best.perUnitTuition),
    degreeLevelId: best.degreeLevelId,
    termType: best.termType,
    offeringType: best.offeringType,
  };
}

export interface TuitionLine {
  courseCode: string;
  courseTitle: string;
  offeringType: string;
  units: number;
  perUnit: number;
  amount: number;
}

export interface TermTuition {
  studentId: number;
  termId: number;
  termType: TermType;
  fixedTuition: number;
  variableTuition: number;
  totalTuition: number;
  lines: TuitionLine[];
  fixedRuleId: number | null;
}

/** نوع ترم را از رکورد ترم می‌خواند (با بازگشت امن به NORMAL) */
export function termTypeOf(term: { termType?: string | null; isSummer?: number | null }): TermType {
  if (term.termType === 'EQUIVALENCE' || term.termType === 'SUMMER' || term.termType === 'NORMAL') return term.termType;
  if (term.isSummer) return 'SUMMER';
  return 'NORMAL';
}

/**
 * محاسبهٔ شهریهٔ یک ترم برای یک دانشجو:
 *   ثابت (بر اساس نوع ترم) + مجموع(واحد × نرخ هر واحد بر اساس نوع گذراندن درس)
 */
export async function computeTermTuition(studentId: number, termId: number): Promise<TermTuition> {
  const [stu] = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.id, termId)).limit(1);
  const termType = term ? termTypeOf(term) : 'NORMAL';
  const degreeLevelId = stu?.degreeLevelId ?? null;
  const entryYear = stu?.entryYear ?? null;

  // شهریهٔ ثابت — یک‌بار به ازای نوع ترم (قاعدهٔ بدون offeringType)
  const fixedRule = await resolveFeeRule({ degreeLevelId, termType, offeringType: null, entryYear });
  const fixedTuition = fixedRule?.fixedTuition ?? 0;

  // دروس ثبت‌شدهٔ دانشجو در این ترم + نوع گذراندن هر درس
  const rows = await db
    .select({
      courseCode: courses.code,
      courseTitle: courses.title,
      units: courses.units,
      offeringType: course_offerings.offeringType,
    })
    .from(enrollments)
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(and(eq(enrollments.studentId, studentId), eq(course_offerings.termId, termId)));

  const lines: TuitionLine[] = [];
  let variableTuition = 0;
  for (const r of rows) {
    const units = toNum(r.units);
    const rule = await resolveFeeRule({ degreeLevelId, termType, offeringType: r.offeringType, entryYear });
    const perUnit = rule?.perUnitTuition ?? fixedRule?.perUnitTuition ?? 0;
    const amount = Math.round(units * perUnit);
    variableTuition += amount;
    lines.push({
      courseCode: r.courseCode,
      courseTitle: r.courseTitle,
      offeringType: r.offeringType,
      units,
      perUnit,
      amount,
    });
  }

  return {
    studentId,
    termId,
    termType,
    fixedTuition,
    variableTuition,
    totalTuition: fixedTuition + variableTuition,
    lines,
    fixedRuleId: fixedRule?.id ?? null,
  };
}

/**
 * شارژ شهریهٔ محاسبه‌شده در دفتر مالی دانشجو (idempotent با referenceId=termId
 * و نوع TUITION_CHARGE). اگر پیش‌تر برای همین ترم شارژ شده باشد، به‌روز می‌شود.
 */
export async function chargeTermTuition(studentId: number, termId: number): Promise<{ charged: number; totalTuition: number }> {
  const t = await computeTermTuition(studentId, termId);
  if (t.totalTuition <= 0) return { charged: 0, totalTuition: 0 };

  const [term] = await db.select({ title: academic_terms.title }).from(academic_terms).where(eq(academic_terms.id, termId)).limit(1);
  const desc = `شهریهٔ ترم «${term?.title ?? termId}» — ثابت ${t.fixedTuition.toLocaleString('fa-IR')} + متغیر ${t.variableTuition.toLocaleString('fa-IR')}`;

  const [existing] = await db
    .select({ id: student_ledger.id })
    .from(student_ledger)
    .where(and(
      eq(student_ledger.studentId, studentId),
      eq(student_ledger.termId, termId),
      eq(student_ledger.transactionType, 'TUITION_CHARGE'),
    ))
    .limit(1);

  if (existing) {
    await db.update(student_ledger)
      .set({ amount: String(t.totalTuition), description: desc })
      .where(eq(student_ledger.id, existing.id));
  } else {
    await db.insert(student_ledger).values({
      studentId,
      termId,
      transactionType: 'TUITION_CHARGE',
      amount: String(t.totalTuition),
      description: desc,
    });
  }
  return { charged: t.totalTuition, totalTuition: t.totalTuition };
}
