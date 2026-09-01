import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { getSetting } from '@/lib/settings';
import {
  degree_level_configs,
  educational_regulations,
  students,
  enrollments,
  course_offerings,
  courses,
  academic_terms,
  syllabuses,
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

/**
 * بازیابی یا ایجاد پیش‌فرض آیین‌نامه برای یک دانشجو یا مقطع
 */
export async function getRegulationConfig(regulationId?: number | null, degreeLevelId?: number | null): Promise<RegulationConfig> {
  try {
    if (regulationId) {
      const [reg] = await db
        .select()
        .from(educational_regulations)
        .where(eq(educational_regulations.id, regulationId))
        .limit(1);

      if (reg && reg.rulesConfig) {
        const parsed = JSON.parse(reg.rulesConfig);
        if (parsed && typeof parsed === 'object' && parsed.grading_and_gpa) {
          return { ...DEFAULT_BACHELOR_REGULATION_1403, ...parsed };
        }
      }
    }

    if (degreeLevelId) {
      const [reg] = await db
        .select()
        .from(educational_regulations)
        .where(eq(educational_regulations.degreeLevelId, degreeLevelId))
        .limit(1);

      if (reg && reg.rulesConfig) {
        const parsed = JSON.parse(reg.rulesConfig);
        if (parsed && typeof parsed === 'object' && parsed.grading_and_gpa) {
          return { ...DEFAULT_BACHELOR_REGULATION_1403, ...parsed };
        }
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
  const [stu] = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
  if (!stu) {
    throw new Error('دانشجو یافت نشد.');
  }

  const [deg] = await db
    .select()
    .from(degree_level_configs)
    .where(eq(degree_level_configs.id, stu.degreeLevelId))
    .limit(1);

  // واکشی ترم جاری
  let currentTerm: typeof academic_terms.$inferSelect | null = null;
  if (termId) {
    const [t] = await db.select().from(academic_terms).where(eq(academic_terms.id, termId)).limit(1);
    currentTerm = t || null;
  } else {
    const [t] = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1)).limit(1);
    currentTerm = t || null;
  }

  const isSummer = currentTerm?.isSummer === 1;

  // واکشی آیین‌نامه مربوطه
  const config = await getRegulationConfig(stu.regulationId, stu.degreeLevelId);

  // محاسبه کل واحدهای لازم از چارت (یا مقدار پیش‌فرض مقطع)
  let totalRequiredUnits = deg?.code?.includes('MASTER') || deg?.title?.includes('ارشد') ? 32 : 140;
  if (stu.majorId) {
    const [syl] = await db
      .select()
      .from(syllabuses)
      .where(eq(syllabuses.majorId, stu.majorId))
      .limit(1);
    if (syl?.minTotalUnitsToGraduate) {
      totalRequiredUnits = syl.minTotalUnitsToGraduate;
    }
  }

  // واکشی کارنامه و سوابق نمرات نهایی‌شده
  const studentEnrollments = await db
    .select({
      id: enrollments.id,
      offeringId: enrollments.offeringId,
      gradeValue: enrollments.gradeValue,
      gradeStatus: enrollments.gradeStatus,
      termId: course_offerings.termId,
      units: courses.units,
      gradingType: courses.gradingType,
      affectsGpa: courses.affectsGpa,
      code: courses.code,
    })
    .from(enrollments)
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(eq(enrollments.studentId, studentId));

  const passingGrade = config.grading_and_gpa.default_passing_grade || (deg ? Number(deg.defaultPassingGrade) : 10);
  const probationGpaThreshold = config.probation_and_tenure.probation_gpa_threshold || (deg ? Number(deg.conditionalGpaThreshold) : 12);

  // تجمیع نمرات و واحدها
  let passedUnits = 0;
  const termMap = new Map<number, { weightedSum: number; gpaUnits: number }>();

  for (const e of studentEnrollments) {
    if (e.gradeStatus !== 'FINALIZED' || e.gradeValue == null) continue;
    const g = Number(e.gradeValue);
    const u = Number(e.units);
    const isPassed = e.gradingType === 'DESCRIPTIVE' ? g === 1 : g >= passingGrade;

    if (isPassed) {
      passedUnits += u;
    }

    // محاسبه معدل به ازای هر ترم
    if (e.termId && (e.affectsGpa === 1 || e.affectsGpa == null) && e.gradingType !== 'DESCRIPTIVE') {
      const tData = termMap.get(e.termId) || { weightedSum: 0, gpaUnits: 0 };
      tData.weightedSum += g * u;
      tData.gpaUnits += u;
      termMap.set(e.termId, tData);
    }
  }

  const remainingUnits = Math.max(0, totalRequiredUnits - passedUnits);
  // تشخیص ترم آخر: باقیمانده کمتر یا مساوی سقف واحد فارغ‌التحصیلی تابستان (معمولاً ۸ واحد) یا سقف ترم عادی (۲۴ واحد)
  const isGraduating = isSummer ? remainingUnits <= (config.summer_term_rules.graduating_max_units || 8) : remainingUnits <= (config.graduating_term_rules.max_units || 24);

  // محاسبه مشروطی‌ها و معدل آخرین ترم
  let totalProbations = 0;
  let lastTermGpa: number | null = null;
  const sortedTermIds = Array.from(termMap.keys()).sort((a, b) => b - a);

  if (sortedTermIds.length > 0) {
    const lastTermData = termMap.get(sortedTermIds[0])!;
    if (lastTermData.gpaUnits > 0) {
      lastTermGpa = Number((lastTermData.weightedSum / lastTermData.gpaUnits).toFixed(2));
    }
  }

  for (const [, tData] of termMap.entries()) {
    if (tData.gpaUnits > 0) {
      const termGpa = tData.weightedSum / tData.gpaUnits;
      if (termGpa < probationGpaThreshold) {
        totalProbations++;
      }
    }
  }

  const isProbatedLastTerm = lastTermGpa !== null && lastTermGpa < probationGpaThreshold;
  const isHonorsLastTerm = lastTermGpa !== null && lastTermGpa >= config.regular_term_rules.honors_min_gpa;

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
}> {
  const [stu] = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
  if (!stu) return { blocked: false };

  const summary = await evaluateStudentRegulationStatus(studentId);
  const config = summary.rulesConfig;

  const maxAllowedProbations =
    config.probation_and_tenure.max_total_probations + stu.extraAllowedProbations;
  const maxAllowedSemesters =
    config.probation_and_tenure.max_study_semesters + stu.extraAllowedSemesters;

  let blockReason: string | null = null;

  if (summary.totalProbations >= maxAllowedProbations) {
    blockReason = `تعداد مشروطی‌های تحصیلی (${summary.totalProbations} ترم) به سقف مجاز (${maxAllowedProbations} ترم) رسیده است. ادامه تحصیل منوط به تایید کمیسیون موارد خاص در سامانه سجاد می‌باشد.`;
  } else if (summary.completedSemesters >= maxAllowedSemesters) {
    blockReason = `سنوات مجاز تحصیلی (${summary.completedSemesters} ترم) به پایان رسیده است. ادامه تحصیل منوط به دریافت سنوات ارفاقی از کمیسیون موارد خاص در سامانه سجاد است.`;
  }

  if (blockReason) {
    // تغییر وضعیت دانشجو به BLOCKED_COMMISSION
    await db
      .update(students)
      .set({ status: 'BLOCKED_COMMISSION' })
      .where(eq(students.id, studentId));

    // بررسی اینکه آیا درخواست بازی برای این موضوع وجود دارد یا خیر
    const existingRequests = await db
      .select()
      .from(student_requests)
      .where(
        and(
          eq(student_requests.studentId, stu.id),
          eq(student_requests.status, 'SUBMITTED')
        )
      );

    let reqId = existingRequests[0]?.id;
    if (!reqId) {
      const trackingCode = `REQ-COMM-${Date.now().toString().slice(-6)}`;
      const [newReq] = await db
        .insert(student_requests)
        .values({
          studentId: stu.id,
          trackingCode,
          processId: 1, // فرایند مجوز کمیسیون
          status: 'SUBMITTED',
          autoCreated: 1,
          formData: JSON.stringify({
            title: 'مجوز ادامه تحصیل — کمیسیون موارد خاص و سامانه سجاد',
            blockReason,
            sajjadUrl: await getSetting('SAJJAD_PORTAL_URL'),
            instructions: '۱. ورود به سامانهٔ سجاد\n۲. ثبت دادخواست در کمیسیون بررسی موارد خاص دانشگاه\n۳. دریافت کد رهگیری و نامه ابلاغ رای\n۴. درج کد رهگیری و بارگذاری رای کمیسیون در این فرم',
          }),
        })
        .returning({ id: student_requests.id });
      reqId = newReq?.id;
    }

    return {
      blocked: true,
      reason: blockReason,
      requestId: reqId,
    };
  }

  return { blocked: false };
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
    if (r.gradeValue == null) continue;
    const g = Number(r.gradeValue);
    const passed = r.gradingType === 'DESCRIPTIVE' ? g === 1 : g >= passingGrade;
    if (passed) {
      passedCourses.add(r.code);
    }
  }

  let totalWeighted = 0;
  let gpaUnits = 0;
  let passedUnits = 0;
  let excludedCount = 0;

  for (const r of rows) {
    if (r.gradeValue == null) continue;
    const g = Number(r.gradeValue);
    const u = Number(r.units);
    const passed = r.gradingType === 'DESCRIPTIVE' ? g === 1 : g >= passingGrade;

    if (passed) {
      passedUnits += u;
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

    totalWeighted += g * u;
    gpaUnits += u;
  }

  const gpa = gpaUnits > 0 ? Number((totalWeighted / gpaUnits).toFixed(2)) : 0;

  return {
    gpa,
    totalUnits: gpaUnits,
    passedUnits,
    excludedCount,
    policy,
  };
}
