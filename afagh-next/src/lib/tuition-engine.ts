import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms, course_offerings, courses, enrollments, student_ledger,
  students, tuition_rules, tuition_coefficients, subject_fee_types, student_subject_fees,
} from '@/db/schema';

/**
 * موتور شهریهٔ آفاق — بدون هیچ نرخ سخت‌کد.
 *
 * نرخ‌ها از جدول یکپارچهٔ `tuition_rules` خوانده می‌شوند (جایگزین هر دو جدول
 * قدیمی tuition_fee_rules و tuition_formulas). انتخاب قاعده با resolver یکتا
 * در tuition-resolver.ts انجام می‌شود با سلسله‌مراتب:
 *   مقطع > رشته > نوع ترم > نوع گذراندن درس > بازهٔ ورودی.
 * این‌جا فقط «نوع ترم» (NORMAL/SUMMER/EQUIVALENCE) و «نوع گذراندن درس» و
 * «ورودی دانشجو» به‌همراه مقطع/رشتهٔ دانشجو به آن داده می‌شود:
 *   - شهریهٔ ثابت: یک‌بار به ازای نوع ترم (termLevelOnly — بدون قاعدهٔ مخصوص نوع درس)
 *   - شهریهٔ متغیر: به ازای هر واحد، بر اساس نوع گذراندن درس (نظری/عملی/عمومی)
 *
 * فاز ۱: ضریب افزایشی نیمسال (tuition_coefficients)
 * فاز ۲: مبالغ موضوعی (subject_fee_types + student_subject_fees)
 */

// منطق خالص انتخاب قاعده در ماژول جداگانه است تا بدون دیتابیس قابل تست باشد
export { pickFeeRule, termTypeOf, toNum } from './tuition-rules';
export type { EquivFixedMode } from './tuition-rules';
export type { TermType, ResolvedRule, FeeRuleParams, FeeRuleLike } from './tuition-rules';
import { normalizeEquivFixedMode, termTypeOf, toNum,
  type EquivFixedMode, type FeeRuleParams, type ResolvedRule, type TermType } from './tuition-rules';
import { resolveTuitionRule } from './tuition-resolver';
import { bucketCourseUnits } from './finance-rules';
import { getSetting } from './settings';

type FeeRuleRow = typeof tuition_rules.$inferSelect;

/** خواندن همهٔ قواعد فعال شهریه (یک کوئری) */
export async function loadActiveFeeRules(): Promise<FeeRuleRow[]> {
  return db.select().from(tuition_rules).where(eq(tuition_rules.isActive, 1));
}

/** همان انتخاب خاص‌ترین قاعده، با خواندن قواعد از دیتابیس */
export async function resolveFeeRule(params: FeeRuleParams): Promise<ResolvedRule | null> {
  const best = resolveTuitionRule(await loadActiveFeeRules(), {
    degreeLevelId: params.degreeLevelId,
    majorId: params.majorId ?? null,
    entryYear: params.entryYear ?? null,
    termType: params.termType ?? null,
    offeringType: params.offeringType ?? null,
    termLevelOnly: params.termLevelOnly,
  });
  if (!best) return null;
  return {
    id: best.id,
    fixedTuition: toNum(best.fixedAmount),
    perUnitTuition: toNum(best.perUnitTheory),
    degreeLevelId: best.degreeLevelId,
    termType: best.termType ?? null,
    offeringType: best.offeringType ?? null,
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

export interface SubjectFeeLine {
  code: string;
  title: string;
  kind: string;
  amount: number;
}

export interface TermTuition {
  studentId: number;
  termId: number;
  termType: TermType;
  fixedTuition: number;
  variableTuition: number;
  /** ضریب افزایشی نیمسال (۱.۰۰ = بدون تغییر) */
  fixedCoefficient: number;
  variableCoefficient: number;
  /** مبالغ موضوعی (افزایشی - کاهشی) */
  subjectFees: SubjectFeeLine[];
  subjectFeesTotal: number;
  fixedTuitionAfterCoeff: number;
  variableTuitionAfterCoeff: number;
  totalTuition: number;
  lines: TuitionLine[];
  fixedRuleId: number | null;
}

/**
 * خواندن ضریب افزایشی نیمسال از دیتابیس.
 * اگر ضریبی تعریف نشده باشد، ۱.۰۰ برمی‌گرداند (بدون تغییر).
 */
async function getCoefficientForTerm(termId: number): Promise<{ fixed: number; variable: number }> {
  const [row] = await db
    .select()
    .from(tuition_coefficients)
    .where(eq(tuition_coefficients.termId, termId))
    .limit(1);
  if (!row) return { fixed: 1, variable: 1 };
  return {
    fixed: toNum(row.fixedCoefficient) || 1,
    variable: toNum(row.variableCoefficient) || 1,
  };
}

/**
 * محاسبه مبالغ موضوعی یک دانشجو در یک ترم.
 * این مبالغ جداگانه از شهریه محاسبه شده و به آن اضافه/کسر می‌شوند.
 */
async function computeSubjectFees(studentId: number, termId: number, variableTuition: number, fixedTuition: number): Promise<{
  lines: SubjectFeeLine[];
  total: number;
}> {
  // خواندن فعال‌های دانشجو در این ترم
  const rows = await db
    .select({
      code: subject_fee_types.code,
      title: subject_fee_types.title,
      kind: subject_fee_types.kind,
      fixedAmount: subject_fee_types.fixedAmount,
      variablePercent: subject_fee_types.variablePercent,
      appliesTo: subject_fee_types.appliesTo,
      studentAmount: student_subject_fees.amount,
      sfIsActive: student_subject_fees.isActive,
    })
    .from(student_subject_fees)
    .innerJoin(subject_fee_types, eq(subject_fee_types.id, student_subject_fees.subjectFeeTypeId))
    .where(and(
      eq(student_subject_fees.studentId, studentId),
      eq(student_subject_fees.termId, termId),
      eq(student_subject_fees.isActive, 1),
      eq(subject_fee_types.isActive, 1),
    ));

  const lines: SubjectFeeLine[] = [];
  let total = 0;

  for (const r of rows) {
    // محاسبه مبلغ: اگر دانشجو مبلغ دستی دارد، از آن استفاده می‌کنیم
    let amount = toNum(r.studentAmount);
    if (amount === 0) {
      // محاسبه خودکار از قاعده نوع
      const fixedPart = toNum(r.fixedAmount);
      let variablePart = 0;
      if (toNum(r.variablePercent) > 0) {
        const base = r.appliesTo === 'FIXED' ? fixedTuition :
                     r.appliesTo === 'VARIABLE' ? variableTuition :
                     fixedTuition + variableTuition;
        variablePart = Math.round((toNum(r.variablePercent) / 100) * base);
      }
      amount = fixedPart + variablePart;
    }

    // DEDUCTIVE = کاهشی (منفی)
    const sign = r.kind === 'DEDUCTIVE' ? -1 : 1;
    const finalAmount = sign * amount;

    lines.push({
      code: r.code,
      title: r.title,
      kind: r.kind,
      amount: finalAmount,
    });
    total += finalAmount;
  }

  return { lines, total };
}

/** نوع ترم را از رکورد ترم می‌خواند (با بازگشت امن به NORMAL) */
/**
 * محاسبهٔ شهریهٔ یک ترم برای یک دانشجو:
 *   ثابت (بر اساس نوع ترم) + مجموع(واحد × نرخ هر واحد بر اساس نوع گذراندن درس)
 *   + ضریب افزایشی نیمسال + مبالغ موضوعی
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
  const majorId = stu?.majorId ?? null;
  const entryYear = stu?.entryYear ?? null;

  // قواعد شهریه یک‌بار خوانده می‌شوند تا به ازای هر درس کوئری تکراری نزنیم
  const feeRules = await loadActiveFeeRules();

  // شهریهٔ ثابت — یک‌بار به ازای نوع ترم؛ فقط قواعد سطح ترم (بدون offeringType)
  const fixedRule = resolveTuitionRule(feeRules, {
    degreeLevelId, majorId, termType, entryYear, termLevelOnly: true,
  });
  const includeFixed = opts?.includeFixed !== false;
  const fixedTuition = includeFixed ? toNum(fixedRule?.fixedAmount ?? 0) : 0;

  // دروس ثبت‌شدهٔ دانشجو در این ترم + نوع گذراندن هر درس
  const rows = await db
    .select({
      courseCode: courses.code,
      courseTitle: courses.title,
      units: courses.units,
      theoreticalUnits: courses.theoreticalUnits,
      practicalUnits: courses.practicalUnits,
      courseType: courses.courseType,
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
    const rule = resolveTuitionRule(feeRules, {
      degreeLevelId, majorId, termType, entryYear, offeringType: r.offeringType,
    });
    const src = rule ?? fixedRule;
    // نرخ هر واحد بر حسب نوع درس (نظری/عملی/عمومی) + سطل‌بندی واحدهای درس
    const buckets = bucketCourseUnits(r);
    const amount = Math.round(
      buckets.theory * toNum(src?.perUnitTheory ?? 0) +
      buckets.practical * toNum(src?.perUnitPractical ?? 0) +
      buckets.general * toNum(src?.perUnitGeneral ?? 0),
    );
    const perUnit = units > 0 ? Math.round(amount / units) : 0;
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

  // ═══ فاز ۱: اعمال ضریب افزایشی نیمسال ═══
  const coeff = await getCoefficientForTerm(termId);
  const fixedTuitionAfterCoeff = Math.round(fixedTuition * coeff.fixed);
  const variableTuitionAfterCoeff = Math.round(variableTuition * coeff.variable);

  // ═══ فاز ۲: محاسبه مبالغوضوعی ═══
  const subjectFees = await computeSubjectFees(studentId, termId, variableTuitionAfterCoeff, fixedTuitionAfterCoeff);

  return {
    studentId,
    termId,
    termType,
    fixedTuition,
    variableTuition,
    fixedCoefficient: coeff.fixed,
    variableCoefficient: coeff.variable,
    subjectFees: subjectFees.lines,
    subjectFeesTotal: subjectFees.total,
    fixedTuitionAfterCoeff,
    variableTuitionAfterCoeff,
    totalTuition: fixedTuitionAfterCoeff + variableTuitionAfterCoeff + subjectFees.total,
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
  const coeffNote = (t.fixedCoefficient !== 1 || t.variableCoefficient !== 1)
    ? ` [ضریب: ثابت×${t.fixedCoefficient}، متغیر×${t.variableCoefficient}]`
    : '';
  const subjectNote = t.subjectFeesTotal !== 0
    ? ` + موضوعی ${t.subjectFeesTotal > 0 ? '+' : ''}${t.subjectFeesTotal.toLocaleString('fa-IR')}`
    : '';
  const desc = `شهریهٔ ترم «${term?.title ?? termId}» — ثابت ${t.fixedTuitionAfterCoeff.toLocaleString('fa-IR')} + متغیر ${t.variableTuitionAfterCoeff.toLocaleString('fa-IR')}${subjectNote}${coeffNote}`;

  // نکته: اگر amount صفر شد ولی شارژ قبلی وجود دارد، باید «صفر» شود.
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
