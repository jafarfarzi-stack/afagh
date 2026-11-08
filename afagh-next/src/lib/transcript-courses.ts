import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  student_ledger, enrollments, course_offerings, courses, tuition_coefficients,
} from '@/db/schema';
import { allocateWeightedShares, toNum } from '@/lib/finance-rules';
import { computeCourseTuitionForTerms } from '@/lib/tuition-engine';
import { computeTariffCourseLinesForTerms } from '@/lib/tuition-tariff';
import { resolveTuitionPriceCodes } from '@/lib/tuition-price-codes';

/**
 * ریز شهریهٔ متغیر دروس — تنها مسیر ساخت آن برای همهٔ نماها.
 *
 * سه جا این جدول را نشان میدهند (کارنامهٔ ادمین، صفحهٔ مالی دانشجو، گزارش
 * صورت حساب) و پیشتر هرکدام جداگانه از موتور شهریه میخواندند؛ نتیجه این بود که
 * ریزِ نیمسالهای گذشته با نرخ نیمسال جاری حساب میشد و با سند رسمی نمیخواند.
 *
 * منطق یکتا:
 *   ۱) «وزن» هر درس از تعرفهٔ رسمی تفصیلی همان **سال** میآید (نظری×نرخ + عملی×نرخِ
 *      نوع درس مالی) — همان محاسبهٔ سامانهٔ مبدأ؛ اگر تعرفهٔ آن سال نباشد، وزنها از
 *      موتور یکپارچهٔ شهریه میآید.
 *   ۲) مبلغ هر درس به تناسب وزنها از جمع «شهریهٔ متغیر» **دفتر کل** تخصیص مییابد؛
 *      مقدار ذخیرهشده در سما سند معتبر است و ممکن است با بازمحاسبهٔ دروس فرق کند
 *      (ترم در جریان، دروس پژوهشی که سما جداگانه نگه میدارد، رُندکردن).
 *      بنابراین جمع ریز همیشه دقیقاً با کارنامه یکی است.
 *   ۳) چهار کد سربرگ ترم و ستونهای آموزشی کارنامهٔ «نوع الف» هم از همینجا
 *      حل میشوند تا هر سه نما یک خروجی بگیرند.
 */

export interface TranscriptCourseLine {
  courseCode: string | null;
  courseTitle: string | null;
  units: number;
  perUnit: number;
  amount: number;
  // ── اطلاعات آموزشیِ درس (برای انعکاس کارنامهٔ سیستم قدیمی) ──
  /** نمرهٔ نهاییِ درس (enrollments.gradeValue) — فقط اگر نهایی شده باشد */
  grade?: number | null;
  /** ماهیت درس (نظری/عملی/نظری-عملی/پروژه/رساله/کارآموزی…) — courses.courseNature */
  courseNature?: string | null;
  /**
   * «نوع درس مالی» سما (`courses.legacyMaliType`) — همان کدی که **نرخ هر واحد**
   * به آن گره خورده است. در کارنامه جای ستون «نرخ واحد» مینشیند: خواننده
   * بهجای یک عددِ مشتق، دلیلِ نرخ را میبیند و مبلغِ هر درس هم سر جای خودش است.
   */
  maliType?: number | null;
  /** سطلِ نوع درس در موتور یکپارچه (نظری/عملی/عمومی) — پشتیبانِ وقتی maliType نیست */
  offeringType?: string | null;
  /** واحد نظری */
  theoreticalUnits?: number;
  /** واحد عملی */
  practicalUnits?: number;
  // ── ستونهای کارنامهٔ مالی نوع الف (انعکاس سند قدیمی سما) ──
  /** «نوع انتخاب درس» (انتخاب واحد / درس انتقالی / درس مستقل / …) */
  selectionType?: string | null;
  /** «وضع» = کد وضعیت نمرهٔ سما (enrollments.samaGradeStatusCode) */
  gradeStatusCode?: string | null;
  /** ضریب شهریهٔ همان نیمسال (tuition_coefficients) — مبنای «نوع انتخاب شهریه» */
  tuitionCoefficient?: number | null;
}

export interface TranscriptCourses {
  lines: TranscriptCourseLine[];
  /** منبع وزنها: TARIFF = تعرفهٔ رسمی سال، LEDGER = موتور یکپارچهٔ شهریه */
  basis: 'TARIFF' | 'LEDGER';
  /** «کد گروه تعرفه» (uPriceCode) سالِ همان نیمسال — نگه داشتهشده برای نوع ب */
  tariffGroupCode?: string | null;
  // ── چهار کد سربرگ ترم (نوع الف) ──
  /** کد متغیر همان نیمسال (UPrice_code) — سالبهسال عوض میشود */
  variablePriceCode?: string | null;
  /** کد ثابت (FPrice_code) — ثابت در تمام ترمها، از قالب نیمسال ورود */
  fixedPriceCode?: string | null;
  /** اولیهٔ کد ثابت */
  initialFixedPriceCode?: string | null;
  /** اولیهٔ کد متغیر (سال ورود) */
  initialVariablePriceCode?: string | null;
}

/**
 * «نوع انتخاب درس» سما. برچسب پیشفرض «انتخاب واحد» است؛ درسِ منتقلشده و
 * درسِ مستقل از روی پرچمهای واقعِ enrollments شناخته میشوند (هیچ کُدی
 * در لایهٔ نمایش ساخته نمیشود).
 */
const selectionTypeOf = (e: {
  sourceUniversityId?: number | null;
  isDirectedReading?: number | null;
} | undefined): string => {
  if (!e) return 'انتخاب واحد';
  if (e.sourceUniversityId != null) return 'درس انتقالی';
  if (Number(e.isDirectedReading ?? 0) === 1) return 'درس مستقل';
  return 'انتخاب واحد';
};

export async function buildTranscriptCourses(
  studentId: number,
  termIds: number[],
): Promise<Record<number, TranscriptCourses>> {
  const ids = [...new Set((termIds || []).filter((t) => Number.isFinite(t) && t > 0))];
  if (!ids.length) return {};

  // جمع «شهریهٔ متغیر» هر ترم — سند معتبر
  const ledgerRows = await db
    .select({ termId: student_ledger.termId, amount: student_ledger.amount })
    .from(student_ledger)
    .where(and(
      eq(student_ledger.studentId, studentId),
      eq(student_ledger.transactionType, 'TUITION_VARIABLE'),
    ));
  const ledgerVar = new Map<number, number>();
  for (const r of ledgerRows) {
    const key = r.termId ?? 0;
    ledgerVar.set(key, (ledgerVar.get(key) ?? 0) + toNum(r.amount));
  }

  // فرادادهٔ تعرفه در همان پرسوجوی نرخها پر میشود (پرسوجوی اضافهای نیست).
  const tariffMeta: { groupCodes: Record<number, string | null> } = { groupCodes: {} };
  const [tariffMap, engineMap, eduRows, priceCodes, coeffRows] = await Promise.all([
    computeTariffCourseLinesForTerms(studentId, ids, tariffMeta),
    computeCourseTuitionForTerms(studentId, ids),
    // اطلاعات آموزشیِ هر درس (نمره/ماهیت/نظری-عملی/وضعیت) — برای انعکاس آنچه
    // کارنامهٔ سیستم قدیمی نشان میداد. کلید = (termId, courseCode).
    db.select({
      termId: course_offerings.termId,
      courseCode: courses.code,
      gradeValue: enrollments.gradeValue,
      gradeStatusCode: enrollments.samaGradeStatusCode,
      originalSamaCode: enrollments.originalSamaCode,
      courseNature: courses.courseNature,
      legacyMaliType: courses.legacyMaliType,
      theoreticalUnits: courses.theoreticalUnits,
      practicalUnits: courses.practicalUnits,
      sourceUniversityId: enrollments.sourceUniversityId,
      isDirectedReading: enrollments.isDirectedReading,
    }).from(enrollments)
      .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
      .innerJoin(courses, eq(courses.id, course_offerings.courseId))
      .where(and(eq(enrollments.studentId, studentId), inArray(course_offerings.termId, ids))),
    // چهار کد سربرگ ترم: کد ثابت/اولیه از قالب نیمسال ورود، کد متغیر سالبهسال.
    // مهاجرت ۰۱۳۶ ممکن است هنوز اعمال نشده باشد؛ در آن صورت بینهایت امن
    // «کدی چاپ نمیشود» بهجای خطا افتادن کل کارنامه.
    resolveTuitionPriceCodes(studentId, ids).catch(() => null),
    // ضریب شهریهٔ نیمسال (ستون «نوع انتخاب شهریه») — جدول از مهاجرت ۰۰۲۰ موجود است.
    // Promise.resolve().then(...) پرسوجوی thenableِ Drizzle را به Promise بومی
    // تبدیل میکند تا در نبود جدول، کارنامه خطا ندهد بلکه ستون را خالی بگذارد.
    Promise.resolve().then(() => db.select({
      termId: tuition_coefficients.termId,
      variableCoefficient: tuition_coefficients.variableCoefficient,
    }).from(tuition_coefficients)
      .where(inArray(tuition_coefficients.termId, ids)))
      .catch(() => [] as { termId: number; variableCoefficient: string | null }[]),
  ]);

  const eduMap = new Map<string, (typeof eduRows)[number]>();
  for (const r of eduRows) eduMap.set(`${r.termId}|${String(r.courseCode ?? '').trim()}`, r);

  const coeffByTerm = new Map<number, number | null>();
  for (const r of coeffRows) {
    if (coeffByTerm.has(r.termId)) continue;
    const v = toNum(r.variableCoefficient);
    coeffByTerm.set(r.termId, Number.isFinite(v) && v > 0 ? v : null);
  }

  const out: Record<number, TranscriptCourses> = {};
  for (const termId of ids) {
    const tariffLines = tariffMap[termId];
    const lines = tariffLines ?? engineMap[termId] ?? [];
    const target = ledgerVar.get(termId) ?? 0;
    const weights = lines.map((l) => toNum(l.amount));
    const shares = target > 0
      ? allocateWeightedShares(
          weights.some((w) => w > 0) ? weights : lines.map((l) => toNum(l.units)),
          target,
        )
      : weights.map((w) => Math.round(w));
    const pc = priceCodes?.byTerm[termId] ?? null;
    const coefficient = coeffByTerm.get(termId) ?? null;
    out[termId] = {
      basis: tariffLines ? 'TARIFF' : 'LEDGER',
      tariffGroupCode: tariffMeta.groupCodes[termId] ?? null,
      variablePriceCode: pc?.variablePriceCode ?? tariffMeta.groupCodes[termId] ?? null,
      fixedPriceCode: pc?.fixedPriceCode ?? priceCodes?.template.fixedPriceCode ?? null,
      initialFixedPriceCode: pc?.initialFixedPriceCode ?? priceCodes?.template.initialFixedPriceCode ?? null,
      initialVariablePriceCode: pc?.initialVariablePriceCode ?? priceCodes?.template.initialVariablePriceCode ?? null,
      lines: lines.map((l, i) => {
        const edu = eduMap.get(`${termId}|${String(l.courseCode ?? '').trim()}`);
        // «نوع درس مالی»: خطِ تعرفه خودش maliType دارد (همان کدی که نرخ را ساخته)
        // و دقیقترین منبع است؛ در مسیر موتور یکپارچه از کاتالوگ درس خوانده
        // میشود. `offeringType` سطلِ موتور (نظری/عملی/عمومی) است و فقط پشتیبان.
        const tariffMali = (l as { maliType?: number | null }).maliType;
        const engineType = (l as { offeringType?: string | null }).offeringType;
        const maliType = tariffMali != null
          ? Number(tariffMali)
          : (edu?.legacyMaliType != null ? Number(edu.legacyMaliType) : null);
        return {
          courseCode: l.courseCode,
          courseTitle: l.courseTitle,
          units: toNum(l.units),
          perUnit: toNum(l.units) > 0 ? Math.round(shares[i] / toNum(l.units)) : 0,
          amount: shares[i],
          grade: edu && edu.gradeValue != null ? toNum(edu.gradeValue) : null,
          courseNature: edu?.courseNature ?? null,
          maliType: maliType != null && Number.isFinite(maliType) ? maliType : null,
          offeringType: engineType ?? null,
          theoreticalUnits: edu ? toNum(edu.theoreticalUnits) : undefined,
          practicalUnits: edu ? toNum(edu.practicalUnits) : undefined,
          selectionType: selectionTypeOf(edu),
          gradeStatusCode: edu?.gradeStatusCode ?? edu?.originalSamaCode ?? null,
          tuitionCoefficient: coefficient,
        };
      }),
    };
  }
  return out;
}
