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

// منطق خالص انتخاب قاعده در ماژول جداگانه است تا بدون دیتابیس قابل تست باشد
export { pickFeeRule, termTypeOf, toNum } from './tuition-rules';
export type { EquivFixedMode } from './tuition-rules';
export type { TermType, ResolvedRule, FeeRuleParams, FeeRuleLike } from './tuition-rules';
import { pickFeeRule, normalizeEquivFixedMode, termTypeOf, toNum,
  type EquivFixedMode, type FeeRuleParams, type ResolvedRule, type TermType } from './tuition-rules';
import { getSetting } from './settings';

type FeeRuleRow = typeof tuition_fee_rules.$inferSelect;

/** خواندن همهٔ قواعد فعال شهریه (یک کوئری) */
export async function loadActiveFeeRules(): Promise<FeeRuleRow[]> {
  return db.select().from(tuition_fee_rules).where(eq(tuition_fee_rules.isActive, 1));
}

/** همان انتخاب خاص‌ترین قاعده، با خواندن قواعد از دیتابیس */
export async function resolveFeeRule(params: FeeRuleParams): Promise<ResolvedRule | null> {
  return pickFeeRule(await loadActiveFeeRules(), params);
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
/**
 * محاسبهٔ شهریهٔ یک ترم برای یک دانشجو:
 *   ثابت (بر اساس نوع ترم) + مجموع(واحد × نرخ هر واحد بر اساس نوع گذراندن درس)
 */
export async function computeTermTuition(
  studentId: number,
  termId: number,
  /** false = شهریهٔ ثابت محاسبه نشود (برای نیمسال‌های معادل‌سازی مطابق سیاست EQUIV_FIXED_TUITION_MODE) */
  opts?: { includeFixed?: boolean },
): Promise<TermTuition> {
  const [stu] = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.id, termId)).limit(1);
  const termType = term ? termTypeOf(term) : 'NORMAL';
  const degreeLevelId = stu?.degreeLevelId ?? null;
  const entryYear = stu?.entryYear ?? null;

  // قواعد شهریه یک‌بار خوانده می‌شوند تا به ازای هر درس کوئری تکراری نزنیم
  const feeRules = await loadActiveFeeRules();

  // شهریهٔ ثابت — یک‌بار به ازای نوع ترم؛ فقط از قواعد سطح ترم (بدون offeringType)
  const fixedRule = pickFeeRule(feeRules, { degreeLevelId, termType, entryYear, termLevelOnly: true });
  const includeFixed = opts?.includeFixed !== false;
  const fixedTuition = includeFixed ? (fixedRule?.fixedTuition ?? 0) : 0;

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
    const rule = pickFeeRule(feeRules, { degreeLevelId, termType, offeringType: r.offeringType, entryYear });
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
    fixedRuleId: includeFixed ? (fixedRule?.id ?? null) : null,
  };
}

/**
 * شارژ شهریهٔ محاسبه‌شده در دفتر مالی دانشجو (idempotent با referenceId=termId
 * و نوع TUITION_CHARGE). اگر پیش‌تر برای همین ترم شارژ شده باشد، به‌روز می‌شود.
 */
export async function chargeTermTuition(
  studentId: number,
  termId: number,
  opts?: { includeFixed?: boolean },
): Promise<{ charged: number; totalTuition: number }> {
  const t = await computeTermTuition(studentId, termId, opts);
  // مبلغ نهایی هرگز منفی نمی‌شود
  const amount = Math.max(0, t.totalTuition);

  const [existing] = await db
    .select({ id: student_ledger.id })
    .from(student_ledger)
    .where(and(
      eq(student_ledger.studentId, studentId),
      eq(student_ledger.termId, termId),
      eq(student_ledger.transactionType, 'TUITION_CHARGE'),
    ))
    .limit(1);

  // چیزی برای شارژ نیست و پیش‌تر هم شارژی ثبت نشده → هیچ کاری لازم نیست
  if (amount === 0 && !existing) return { charged: 0, totalTuition: t.totalTuition };

  const [term] = await db.select({ title: academic_terms.title }).from(academic_terms).where(eq(academic_terms.id, termId)).limit(1);
  const desc = `شهریهٔ ترم «${term?.title ?? termId}» — ثابت ${t.fixedTuition.toLocaleString('fa-IR')} + متغیر ${t.variableTuition.toLocaleString('fa-IR')}`;

  // نکته: اگر amount صفر شد ولی شارژ قبلی وجود دارد، باید «صفر» شود.
  // (پیش‌تر در این حالت زودهنگام return می‌شد و با تغییر سیاست به NONE یا
  //  حذف قاعدهٔ شهریه، شارژ قدیمی دست‌نخورده و نادرست باقی می‌ماند.)
  if (existing) {
    await db.update(student_ledger)
      .set({ amount: String(amount), description: desc })
      .where(eq(student_ledger.id, existing.id));
  } else {
    await db.insert(student_ledger).values({
      studentId,
      termId,
      transactionType: 'TUITION_CHARGE',
      amount: String(amount),
      description: desc,
    });
  }
  return { charged: amount, totalTuition: t.totalTuition };
}

/** سیاست شهریهٔ ثابت معادل‌سازی — از تنظیم EQUIV_FIXED_TUITION_MODE (دیتابیس ← ENV ← پیش‌فرض) */
export async function getEquivFixedMode(): Promise<EquivFixedMode> {
  return normalizeEquivFixedMode(await getSetting('EQUIV_FIXED_TUITION_MODE'));
}
