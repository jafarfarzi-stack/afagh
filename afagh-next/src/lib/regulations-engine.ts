import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { getSetting } from '@/lib/settings';
import {
  process_definitions,
  degree_level_configs,
  educational_regulations,
  students,
  enrollments,
  course_offerings,
  courses,
  academic_terms,
  curriculum_versions,
  student_requests,
} from '@/db/schema';
import {
  RegulationConfig,
  DEFAULT_BACHELOR_REGULATION_1403,
  DEFAULT_BACHELOR_REGULATION_1390,
  DEFAULT_MASTER_REGULATION_1403,
} from './regulations-types';

export * from './regulations-types';

// ════════════════════════════════════════════════════════════════════════════
// موتور جامع آیین‌نامه‌های آموزشی (Afagh Regulation Engine)
// ════════════════════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────────────────
//  ابزارهای عددی: محاسبهٔ معدل با حساب صحیح (بدون خطای ممیز شناور)
//
//  نمره تا دو رقم اعشار و واحد تا یک رقم اعشار است؛ بنابراین همهٔ جمع‌ها روی
//  اعداد صحیح مقیاس‌شده انجام و فقط در انتها یک تقسیم صورت می‌گیرد. با این کار
//  خطای انباشتی نوع 0.1 + 0.2 = 0.30000000000000004 اصلاً به وجود نمی‌آید.
// ───────────────────────────────────────────────────────────────────────────

const GRADE_SCALE = 100; // نمره: دو رقم اعشار
const UNIT_SCALE = 10;   // واحد: یک رقم اعشار
/**
 * هر چند واحد معادل‌سازی = یک ترم کسر از سنوات.
 * 🔗 منبع واحد (M-3): enroll-engine از همین ثابت استفاده می‌کند — دیگر دو ثابت
 * جدا با ریسک ناسازگاری وجود ندارد.
 */
export const EQUIV_SEMESTER_UNITS = 20;

/**
 * تبدیل امنِ مقدار نمره به عدد.
 * رشتهٔ خالی، فاصله، مقدار غیرعددی و NaN ⇒ null (یعنی «نمره‌ای ثبت نشده»)
 * تا هرگز به‌اشتباه صفر در معدل دانشجو اثر نگذارد.
 */
export function parseGrade(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = typeof value === 'number' ? value : String(value).trim();
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** تبدیل امنِ تعداد واحد؛ مقدار نامعتبر یا منفی ⇒ صفر */
export function parseUnits(value: unknown): number {
  const n = parseGrade(value);
  if (n === null || n < 0) return 0;
  return n;
}

/** گرد کردن نیم‌بالا روی دو رقم اعشار، بدون خطای ممیز شناور */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * انباشتگر معدل: جمع‌ها روی اعداد صحیح مقیاس‌شده نگه‌داری می‌شوند.
 *   weighted = Σ (نمره×۱۰۰) × (واحد×۱۰)
 *   units    = Σ (واحد×۱۰)
 */
export class GpaAccumulator {
  private weighted = 0;
  private unitsScaled = 0;

  add(grade: number, units: number) {
    const g = Math.round(grade * GRADE_SCALE);
    const u = Math.round(units * UNIT_SCALE);
    if (u <= 0) return;
    this.weighted += g * u;
    this.unitsScaled += u;
  }

  get hasUnits() { return this.unitsScaled > 0; }
  get units() { return this.unitsScaled / UNIT_SCALE; }

  /** معدل دقیق (بدون گرد کردن) برای مقایسه‌های آیین‌نامه‌ای مثل آستانهٔ مشروطی */
  exact(): number | null {
    if (this.unitsScaled <= 0) return null;
    return this.weighted / (this.unitsScaled * GRADE_SCALE);
  }

  /** معدل گردشده روی دو رقم اعشار برای نمایش و ذخیره در دیتابیس */
  rounded(): number | null {
    if (this.unitsScaled <= 0) return null;
    return Math.round((this.weighted * 100) / (this.unitsScaled * GRADE_SCALE)) / 100;
  }
}

/**
 * بازیابی یا ایجاد پیش‌فرض آیین‌نامه برای یک دانشجو یا مقطع
 */
export async function getRegulationConfig(regulationId?: number | null, degreeLevelId?: number | null): Promise<RegulationConfig> {
  if (!regulationId && !degreeLevelId) return DEFAULT_BACHELOR_REGULATION_1403;

  try {
    // یک رفت‌وبرگشت به‌جای دو کوئری متوالی: هر دو شرط با OR واکشی و در حافظه
    // اولویت‌بندی می‌شوند (آیین‌نامهٔ اختصاصی دانشجو مقدم بر آیین‌نامهٔ مقطع است).
    const conditions = [
      regulationId ? eq(educational_regulations.id, regulationId) : undefined,
      degreeLevelId ? eq(educational_regulations.degreeLevelId, degreeLevelId) : undefined,
    ].filter(Boolean);

    const rows = await db
      .select()
      .from(educational_regulations)
      .where(conditions.length === 1 ? conditions[0] : or(...conditions))
      .limit(20);

    const preferred = regulationId ? rows.find(r => r.id === regulationId) : undefined;
    const fallback = degreeLevelId ? rows.find(r => r.degreeLevelId === degreeLevelId) : undefined;

    for (const reg of [preferred, fallback]) {
      if (!reg?.rulesConfig) continue;
      const parsed = JSON.parse(reg.rulesConfig);
      if (parsed && typeof parsed === 'object' && parsed.grading_and_gpa) {
        return { ...DEFAULT_BACHELOR_REGULATION_1403, ...parsed };
      }
    }
  } catch (err) {
    console.error('Error fetching regulation config:', err);
  }

  // Fallback default
  return DEFAULT_BACHELOR_REGULATION_1403;
}

export interface StudentAcademicSummary {
  studentId: number;
  totalRequiredUnits: number;
  passedUnits: number;
  remainingUnits: number;
  isGraduating: boolean;
  lastTermGpa: number | null;
  isProbatedLastTerm: boolean;
  totalProbations: number;
  completedSemesters: number;
  /** مجموع واحدهای قبول‌شدهٔ معادل‌سازی (EQUIV_PASSED/TRANSFER) */
  equivalenceUnits: number;
  /** تعداد ترم کسرشده از سنوات به ازای هر EQUIV_TERM_UNITS واحد معادل‌سازی */
  equivalenceSemesters: number;
  status: string;
  effectiveMaxUnits: number;
  minAllowedUnits: number;
  isSummer: boolean;
  quotaType: string;
  rulesConfig: RegulationConfig;
}

/**
 * محاسبه خلاصه وضعیت تحصیلی، شرایط ترم آخر، سهمیه و سقف مجاز انتخاب واحد
 */
export async function evaluateStudentRegulationStatus(
  studentId: number,
  termId?: number | null
): Promise<StudentAcademicSummary> {
  // ── موج اول: اطلاعات دانشجو + مقطع با یک JOIN، هم‌زمان با واکشی ترم جاری ──
  const [baseRows, termRows] = await Promise.all([
    db
      .select({ stu: students, deg: degree_level_configs })
      .from(students)
      .leftJoin(degree_level_configs, eq(degree_level_configs.id, students.degreeLevelId))
      .where(eq(students.id, studentId))
      .limit(1),
    db
      .select()
      .from(academic_terms)
      .where(termId ? eq(academic_terms.id, termId) : eq(academic_terms.isCurrent, 1))
      .limit(1),
  ]);

  const stu = baseRows[0]?.stu;
  if (!stu) {
    throw new Error('دانشجو یافت نشد.');
  }
  const deg = baseRows[0]?.deg ?? null;
  const currentTerm = termRows[0] ?? null;
  const isSummer = currentTerm?.isSummer === 1;

  // ── موج دوم: آیین‌نامه، چارت درسی و کارنامه؛ هر سه مستقل‌اند و موازی اجرا می‌شوند ──
  const [config, versionRows, studentEnrollments] = await Promise.all([
    getRegulationConfig(stu.regulationId, stu.degreeLevelId),
    stu.majorId
      ? db
          .select({ totalRequiredUnits: curriculum_versions.totalRequiredUnits })
          .from(curriculum_versions)
          .where(
            and(
              eq(curriculum_versions.majorId, stu.majorId),
              sql`${curriculum_versions.entryYearFrom} <= ${stu.entryYear}`,
              or(
                sql`${curriculum_versions.entryYearTo} is null`,
                sql`${curriculum_versions.entryYearTo} >= ${stu.entryYear}`
              )
            )
          )
          .orderBy(desc(curriculum_versions.entryYearFrom))
          .limit(1)
      : Promise.resolve([] as { totalRequiredUnits: string | null }[]),
    db
      .select({
        id: enrollments.id,
        offeringId: enrollments.offeringId,
        gradeValue: enrollments.gradeValue,
        gradeStatus: enrollments.gradeStatus,
        status: enrollments.status,
        termId: course_offerings.termId,
        offeringType: course_offerings.offeringType,
        units: courses.units,
        gradingType: courses.gradingType,
        affectsGpa: courses.affectsGpa,
        code: courses.code,
      })
      .from(enrollments)
      .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
      .innerJoin(courses, eq(courses.id, course_offerings.courseId))
      .where(eq(enrollments.studentId, studentId)),
  ]);

  // محاسبه کل واحدهای لازم از نسخهٔ برنامه (یا مقدار پیش‌فرض مقطع)
  let totalRequiredUnits = deg?.code?.includes('MASTER') || deg?.title?.includes('ارشد') ? 32 : 140;
  if (versionRows[0]?.totalRequiredUnits) {
    totalRequiredUnits = Number(versionRows[0].totalRequiredUnits);
  }

  const passingGrade = config.grading_and_gpa.default_passing_grade || (deg ? Number(deg.defaultPassingGrade) : 10);
  const probationGpaThreshold = config.probation_and_tenure.probation_gpa_threshold || (deg ? Number(deg.conditionalGpaThreshold) : 12);

  // تجمیع نمرات و واحدها (با حساب صحیح و ردکردن نمرات خالی/نامعتبر)
  let passedUnits = 0;
  let equivalenceUnits = 0;
  const termMap = new Map<number, GpaAccumulator>();

  for (const e of studentEnrollments) {
    if (e.gradeStatus !== 'FINALIZED') continue;
    const g = parseGrade(e.gradeValue);
    if (g === null) continue; // نمرهٔ ثبت‌نشده/خالی هرگز صفر حساب نمی‌شود
    const u = parseUnits(e.units);
    const isPassed = e.gradingType === 'DESCRIPTIVE' ? g === 1 : g >= passingGrade;

    if (isPassed) {
      passedUnits = round2(passedUnits + u);
    }

    /**
     * نوبت‌های معادل‌سازی (وضعیت EQUIV_PASSED یا گروه درسی TRANSFER):
     *  - در معدل کل (calculateOfficialGPA) مؤثرند و آنجا حساب می‌شوند؛
     *  - ولی در معدل هر ترم و مشروطیت منظور نمی‌شوند (معادل‌سازی «بدون مشروطیت» است)؛
     *  - واحدهای قبولی‌شان برای کسر سنوات شمارش می‌شود (هر EQUIV_TERM_UNITS واحد = یک ترم).
     */
    const isEquivalence = e.status === 'EQUIV_PASSED' || e.offeringType === 'TRANSFER';
    if (isEquivalence && isPassed) {
      equivalenceUnits = round2(equivalenceUnits + u);
    }

    // محاسبه معدل به ازای هر ترم (معادل‌سازی excluded)
    if (!isEquivalence && e.termId && (e.affectsGpa === 1 || e.affectsGpa == null) && e.gradingType !== 'DESCRIPTIVE') {
      const acc = termMap.get(e.termId) ?? new GpaAccumulator();
      acc.add(g, u);
      termMap.set(e.termId, acc);
    }
  }

  const remainingUnits = round2(Math.max(0, totalRequiredUnits - passedUnits));
  // تشخیص ترم آخر: باقیمانده کمتر یا مساوی سقف واحد فارغ‌التحصیلی تابستان (معمولاً ۸ واحد) یا سقف ترم عادی (۲۴ واحد)
  const isGraduating = isSummer ? remainingUnits <= (config.summer_term_rules.graduating_max_units || 8) : remainingUnits <= (config.graduating_term_rules.max_units || 24);

  // محاسبه مشروطی‌ها و معدل آخرین ترم
  let totalProbations = 0;
  let lastTermGpa: number | null = null;
  const sortedTermIds = Array.from(termMap.keys()).sort((a, b) => b - a);

  if (sortedTermIds.length > 0) {
    lastTermGpa = termMap.get(sortedTermIds[0])!.rounded();
  }

  for (const [, acc] of termMap.entries()) {
    // مقایسهٔ مشروطی روی معدل دقیق انجام می‌شود، نه معدل گردشده
    const termGpa = acc.exact();
    if (termGpa !== null && termGpa < probationGpaThreshold) {
      totalProbations++;
    }
  }

  const lastTermExact = sortedTermIds.length > 0 ? termMap.get(sortedTermIds[0])!.exact() : null;
  const isProbatedLastTerm = lastTermExact !== null && lastTermExact < probationGpaThreshold;
  const isHonorsLastTerm = lastTermExact !== null && lastTermExact >= config.regular_term_rules.honors_min_gpa;

  // محاسبه سقف واحد مجاز (Effective Max Units)
  let effectiveMaxUnits = config.regular_term_rules.max_units;
  let minAllowedUnits = config.regular_term_rules.min_units;

  if (isSummer) {
    minAllowedUnits = 0;
    effectiveMaxUnits = config.summer_term_rules.default_max_units;

    if (isGraduating) {
      effectiveMaxUnits = config.summer_term_rules.graduating_max_units;
    }

    // بررسی سهمیه شاهد و ایثارگر در تابستان
    const quota = stu.quotaType || 'NORMAL';
    if (config.quota_overrides && config.quota_overrides[quota]?.summer_term_rules?.default_max_units) {
      effectiveMaxUnits = Math.max(
        effectiveMaxUnits,
        config.quota_overrides[quota]!.summer_term_rules!.default_max_units!
      );
    }
  } else {
    // ترم عادی
    if (isGraduating && config.graduating_term_rules.can_take_with_probation) {
      effectiveMaxUnits = config.graduating_term_rules.max_units; // سقف ۲۴ واحد برای ترم آخر حتی در صورت مشروطی
      minAllowedUnits = 0;
    } else if (isProbatedLastTerm) {
      effectiveMaxUnits = config.regular_term_rules.probation_max_units; // سقف ۱۴ واحد برای مشروط
    } else if (isHonorsLastTerm) {
      effectiveMaxUnits = config.regular_term_rules.honors_max_units; // سقف ۲۴ واحد برای معدل الف
    }
  }

  const completedSemesters = termMap.size;

  /**
   * قانون سنوات: به ازای هر ۲۰ واحد معادل‌سازی، یک ترم از سنوات مجاز دانشجو
   * کسر می‌شود (دانشجو معادل آن ترم را پیش‌تر در مبدأ گذرانده است).
   */
  const equivalenceSemesters = Math.floor(equivalenceUnits / EQUIV_SEMESTER_UNITS);

  return {
    studentId,
    totalRequiredUnits,
    passedUnits,
    remainingUnits,
    isGraduating,
    lastTermGpa,
    isProbatedLastTerm,
    totalProbations,
    completedSemesters,
    equivalenceUnits,
    equivalenceSemesters,
    status: stu.status,
    effectiveMaxUnits,
    minAllowedUnits,
    isSummer,
    quotaType: stu.quotaType || 'NORMAL',
    rulesConfig: config,
  };
}

/**
 * پایش خودکار وضعیت سنوات و مشروطی جهت ارجاع به کمیسیون موارد خاص و سامانه سجاد
 */
export async function checkAndTriggerCommissionEvents(studentId: number): Promise<{
  blocked: boolean;
  reason?: string;
  requestId?: number;
  error?: string;
}> {
  const [stu] = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
  if (!stu) return { blocked: false };

  const summary = await evaluateStudentRegulationStatus(studentId);
  const config = summary.rulesConfig;

  const maxAllowedProbations =
    config.probation_and_tenure.max_total_probations + stu.extraAllowedProbations;
  // قانون سنوات: هر ۲۰ واحد معادل‌سازی یک ترم از سقف سنوات مجاز کم می‌کند
  const maxAllowedSemesters =
    config.probation_and_tenure.max_study_semesters +
    stu.extraAllowedSemesters -
    summary.equivalenceSemesters;

  let blockReason: string | null = null;

  if (summary.totalProbations >= maxAllowedProbations) {
    blockReason = `تعداد مشروطی‌های تحصیلی (${summary.totalProbations} ترم) به سقف مجاز (${maxAllowedProbations} ترم) رسیده است. ادامه تحصیل منوط به تایید کمیسیون موارد خاص در سامانه سجاد می‌باشد.`;
  } else if (summary.completedSemesters >= maxAllowedSemesters) {
    const equivNote = summary.equivalenceSemesters > 0
      ? ` (شامل ${summary.equivalenceSemesters} ترم کسرشده بابت ${summary.equivalenceUnits} واحد معادل‌سازی)`
      : '';
    blockReason = `سنوات مجاز تحصیلی (${summary.completedSemesters} ترم از سقف ${maxAllowedSemesters} ترم${equivNote}) به پایان رسیده است. ادامه تحصیل منوط به دریافت سنوات ارفاقی از کمیسیون موارد خاص در سامانه سجاد است.`;
  }

  if (!blockReason) return { blocked: false };

  // شناسهٔ فرایند «کمیسیون موارد خاص» از تنظیمات خوانده می‌شود (بدون مقدار سخت‌کد)
  const [processCode, sajjadUrl] = await Promise.all([
    getSetting('COMMISSION_PROCESS_CODE'),
    getSetting('SAJJAD_PORTAL_URL'),
  ]);
  const [proc] = await db
    .select({ id: process_definitions.id })
    .from(process_definitions)
    .where(eq(process_definitions.code, processCode.trim() || 'COMMISSION_PERMIT'))
    .limit(1);
  const [anyProc] = proc
    ? [proc]
    : await db.select({ id: process_definitions.id }).from(process_definitions).orderBy(asc(process_definitions.id)).limit(1);

  if (!anyProc) {
    // بدون فرایند مقصد، پروندهٔ کارتابل ساخته نمی‌شود؛ پس دانشجو را هم مسدود نمی‌کنیم
    // تا هرگز «دانشجوی مسدودِ بدون پرونده» به وجود نیاید.
    console.error('commission process definition not found; student not blocked', { studentId });
    return {
      blocked: false,
      reason: blockReason,
      error: 'فرایند «کمیسیون موارد خاص» در سامانه تعریف نشده است؛ مسدودسازی انجام نشد.',
    };
  }

  const formData = JSON.stringify({
    title: 'مجوز ادامه تحصیل — کمیسیون موارد خاص و سامانه سجاد',
    blockReason,
    sajjadUrl,
    instructions: '۱. ورود به سامانهٔ سجاد\n۲. ثبت دادخواست در کمیسیون بررسی موارد خاص دانشگاه\n۳. دریافت کد رهگیری و نامه ابلاغ رای\n۴. درج کد رهگیری و بارگذاری رای کمیسیون در این فرم',
  });

  try {
    // ⚠️ اتمی: مسدودسازی دانشجو و ساخت پروندهٔ کارتابل یا هر دو انجام می‌شوند یا هیچ‌کدام.
    // اگر ساخت درخواست شکست بخورد، وضعیت دانشجو Rollback می‌شود تا دانشجوی مسدودِ
    // بدون پرونده باقی نماند.
    const requestId = await db.transaction(async tx => {
      await tx
        .update(students)
        .set({ status: 'BLOCKED_COMMISSION' })
        .where(eq(students.id, studentId));

      // آیا پروندهٔ بازِ همین موضوع از قبل وجود دارد؟ (فقط همین فرایند، نه هر درخواست دیگری)
      const [existing] = await tx
        .select({ id: student_requests.id })
        .from(student_requests)
        .where(
          and(
            eq(student_requests.studentId, stu.id),
            eq(student_requests.processId, anyProc.id),
            inArray(student_requests.status, ['SUBMITTED', 'IN_REVIEW'])
          )
        )
        .orderBy(desc(student_requests.id))
        .limit(1);

      if (existing) return existing.id;

      const trackingCode = `REQ-COMM-${stu.id}-${Date.now().toString(36).toUpperCase()}`;
      const [newReq] = await tx
        .insert(student_requests)
        .values({
          studentId: stu.id,
          trackingCode,
          processId: anyProc.id,
          status: 'SUBMITTED',
          autoCreated: 1,
          formData,
        })
        .returning({ id: student_requests.id });

      if (!newReq?.id) throw new Error('ساخت پروندهٔ کمیسیون ناموفق بود.');
      return newReq.id;
    });

    return { blocked: true, reason: blockReason, requestId };
  } catch (err) {
    // تراکنش برگشت خورد: دانشجو دست‌نخورده ماند
    console.error('commission trigger failed, transaction rolled back:', err);
    return {
      blocked: false,
      reason: blockReason,
      error: err instanceof Error ? err.message : 'خطای نامشخص در ثبت پروندهٔ کمیسیون',
    };
  }
}

/**
 * محاسبه رسمی معدل کل (GPA) بر اساس سیاست نمرات مردودی
 */
export async function calculateOfficialGPA(studentId: number): Promise<{
  gpa: number;
  totalUnits: number;
  passedUnits: number;
  excludedCount: number;
  policy: string;
}> {
  const [stu] = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
  if (!stu) return { gpa: 0, totalUnits: 0, passedUnits: 0, excludedCount: 0, policy: 'UNKNOWN' };

  const config = (await getRegulationConfig(stu.regulationId, stu.degreeLevelId)) || DEFAULT_BACHELOR_REGULATION_1403;
  const policy = config?.grading_and_gpa?.failed_course_gpa_policy ?? 'EXCLUDE_IF_PASSED';
  const passingGrade = config?.grading_and_gpa?.default_passing_grade || 10;

  const rows = await db
    .select({
      enrollmentId: enrollments.id,
      courseId: courses.id,
      code: courses.code,
      title: courses.title,
      units: courses.units,
      gradeValue: enrollments.gradeValue,
      gradeStatus: enrollments.gradeStatus,
      gradingType: courses.gradingType,
      affectsGpa: courses.affectsGpa,
      termId: course_offerings.termId,
    })
    .from(enrollments)
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(and(eq(enrollments.studentId, studentId), eq(enrollments.gradeStatus, 'FINALIZED')));

  // نقشه‌برداری دروس پاس‌شده
  const passedCourses = new Set<string>();
  for (const r of rows) {
    const g = parseGrade(r.gradeValue);
    if (g === null) continue; // نمرهٔ خالی/نامعتبر = ثبت‌نشده
    const passed = r.gradingType === 'DESCRIPTIVE' ? g === 1 : g >= passingGrade;
    if (passed) {
      passedCourses.add(r.code);
    }
  }

  const acc = new GpaAccumulator();
  let passedUnits = 0;
  let excludedCount = 0;

  for (const r of rows) {
    const g = parseGrade(r.gradeValue);
    if (g === null) continue;
    const u = parseUnits(r.units);
    const passed = r.gradingType === 'DESCRIPTIVE' ? g === 1 : g >= passingGrade;

    if (passed) {
      passedUnits = round2(passedUnits + u);
    }

    // دروس توصیفی یا بی‌تاثیر در معدل وارد مخرج و صورت نمی‌شوند
    if (r.gradingType === 'DESCRIPTIVE' || r.affectsGpa === 0) {
      continue;
    }

    // اعمال مصوبه حذف نمره مردودی پس از قبولی
    if (policy === 'EXCLUDE_IF_PASSED' && !passed && passedCourses.has(r.code)) {
      excludedCount++;
      continue; // حذف از صورت و مخرج معدل کل
    }

    acc.add(g, u);
  }

  return {
    gpa: acc.rounded() ?? 0,
    totalUnits: acc.units,
    passedUnits,
    excludedCount,
    policy,
  };
}
