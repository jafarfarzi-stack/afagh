// ════════════════════════════════════════════════════════════════════════════
// فیلتر کاتالوگ انتخاب واحد بر اساس «چارت تحصیلی مصوب» دانشجو
// ────────────────────────────────────────────────────────────────────────────
// هدف: در صفحهٔ انتخاب واحد، دانشجو فقط دروسی را ببیند که
//   ۱) متعلق به نسخهٔ برنامهٔ درسیِ قابل‌اعمالِ او باشند (چارت)،
//   ۲) مربوط به ترم جاریِ تحصیلیِ خودش باشند (recommendedSemester = ordinal)،
//   ۳) یا دروس ناتمام/مردودی برای تکرار (retake) — تا انتخاب واحد بسته نشود.
//
// منطقِ حل نسخه دقیقاً همان است که در صفحهٔ چارت دانشجو (student/chart)
// استفاده می‌شود؛ بنابراین کاتالوگ و چارت همیشه هم‌راستا می‌مانند.
//
// اگر برای دانشجو نسخه‌ای حل نشود (NO_VERSIONS / NO_MAJOR_OR_DEGREE / …)،
// اسکوپ اعمال نمی‌شود و رفتارِ پیشین (فقط offeringVisible) حفظ می‌گردد —
// تا ثبت‌نام در دانشگاه‌هایی که هنوز چارت منتشر نکرده‌اند از کار نیفتد.
// ════════════════════════════════════════════════════════════════════════════

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { curriculum_courses, student_course_grants } from '@/db/schema';
import { resolveStudentCurriculum } from './curriculum-apply';
import type { ResolutionReason } from './curriculum-resolution';

export interface StudentCurriculumScope {
  /** آیا یک نسخهٔ منتشرشده برای دانشجو حل شد؟ (در غیر این صورت کاتالوگ فیلتر نمی‌شود) */
  resolved: boolean;
  reason: ResolutionReason | 'NO_STUDENT';
  versionId: number | null;
  versionCode: string | null;
  /** همهٔ courseIdهای موجود در نسخهٔ برنامه (چارت) */
  courseIds: Set<number>;
  /** courseId → ترم پیشنهادی (recommendedSemester، ۱..۸ / ۹=تابستان)؛ null = بدون ترم مشخص */
  recommendedByCourse: Map<number, number | null>;
  /** courseIdهایی که مدیر گروه صریحاً برای این دانشجو تخصیص داده (حتی ترم بالاتر) */
  grantedCourseIds: Set<number>;
}

/**
 * حل نسخهٔ برنامهٔ درسیِ دانشجو و بارگیری محدودهٔ دروسِ چارت.
 */
export async function resolveStudentCurriculumScope(
  studentId: number,
): Promise<StudentCurriculumScope> {
  // تخصیص‌های صریح مدیر گروه — مستقل از حل‌شدنِ چارت بارگذاری می‌شوند تا اگر
  // چارت حل نشد هم در دسترس باشند (اعمالِ آن‌ها فقط در حالت resolved معنا دارد).
  const grantRows = await db
    .select({ courseId: student_course_grants.courseId })
    .from(student_course_grants)
    .where(eq(student_course_grants.studentId, studentId));
  const grantedCourseIds = new Set<number>();
  for (const g of grantRows) {
    if (g.courseId != null) grantedCourseIds.add(g.courseId);
  }

  const resolution = await resolveStudentCurriculum(studentId);
  if (!resolution.version) {
    return {
      resolved: false,
      reason: resolution.reason,
      versionId: null,
      versionCode: null,
      courseIds: new Set(),
      recommendedByCourse: new Map(),
      grantedCourseIds,
    };
  }

  const versionId = resolution.version.id;
  const rows = await db
    .select({
      courseId: curriculum_courses.courseId,
      recommendedSemester: curriculum_courses.recommendedSemester,
    })
    .from(curriculum_courses)
    .where(eq(curriculum_courses.curriculumVersionId, versionId));

  const courseIds = new Set<number>();
  const recommendedByCourse = new Map<number, number | null>();
  for (const r of rows) {
    if (r.courseId == null) continue;
    courseIds.add(r.courseId);
    recommendedByCourse.set(r.courseId, r.recommendedSemester ?? null);
  }

  return {
    resolved: true,
    reason: 'RESOLVED',
    versionId,
    versionCode: resolution.version.versionCode ?? null,
    courseIds,
    recommendedByCourse,
    grantedCourseIds,
  };
}

/**
 * اعمال چارت بر روی لیست ارائه‌ها.
 *
 * @param offerings لیست ارائه‌هایی که قبلاً با offeringVisible فیلتر شده‌اند
 * @param scope      خروجی resolveStudentCurriculumScope
 * @param currentTermOrdinal شمارهٔ ترم جاریِ تحصیلیِ دانشجو (از ورودی تا ترم هدف)
 * @param retakeCourseIds  شناسهٔ دروسی که دانشجو قبلاً مردود شده (برای تکرار)
 *
 * قانون نمایش:
 *   - خارج از چارت (courseId در version نباشد) → مخفی
 *   - تخصیص صریح مدیر گروه (student_course_grants) → نمایش، حتی ترم بالاتر
 *   - ترم پیشنهادی = ترم جاری → نمایش
 *   - ترم پیشنهادی = null (آزاد) → نمایش (در هر ترم مجاز)
 *   - ترم‌های پایین‌تر → نمایش (دانشجو می‌تواند درس ترم‌های قبلی را نیز بگیرد)
 *   - دروس مردودی برای تکرار → نمایش
 *   - ترم‌های بالاتر بدون تخصیص → مخفی
 */
export function scopeOfferingsByCurriculum<T extends { courseId: number | null }>(
  offerings: T[],
  scope: StudentCurriculumScope,
  currentTermOrdinal: number | null,
  retakeCourseIds: Set<number>,
  requireChart: boolean,
): T[] {
  // چارت مصوبی حل نشد:
  //  - اگر چارت در انتخاب واحد الزامی باشد → کاتالوگ **خالی** (بنر ارجاع به مدیر گروه).
  //  - در غیر این صورت → کاتالوگ بر اساس هدف‌گیریِ هر ارائه (رشته/ورودی) نمایش داده
  //    می‌شود (رفتار پیشینِ offeringVisible)؛ در این حالت تعیین رشته/ورودیِ مجاز
  //    در زمان ارائه الزامی است.
  if (!scope.resolved) return requireChart ? [] : offerings;

  return offerings.filter((o) => {
    const cid = o.courseId;
    if (cid == null) return false;                  // ارائه بدون درس پیوست → خارج از چارت
    if (!scope.courseIds.has(cid)) return false;    // خارج از چارت → مخفی
    // تخصیص صریح مدیر گروه — تنها راه بازشدنِ درسِ ترم بالاتر (بعد از چک عضویت،
    // پس تخصیص نمی‌تواند درسی از خارج چارت را باز کند).
    if (scope.grantedCourseIds.has(cid)) return true;
    const rec = scope.recommendedByCourse.get(cid);
    if (rec == null) return true;                   // درس آزاد (بدون ترم مشخص)
    if (currentTermOrdinal != null && rec === currentTermOrdinal) return true; // ترم جاری
    if (retakeCourseIds.has(cid)) return true;      // تکرار (حتی ترم بالاتر)
    // ترم‌های پایین‌تر: دسترسی آزاد — دانشجو می‌تواند درسِ ترم‌های قبلی را نیز بگیرد
    // (مثلاً دانشجوی ترم ۵ می‌تواند درس ترم ۳ را اخذ کند).
    if (currentTermOrdinal != null && rec < currentTermOrdinal) return true;
    // rec > currentTermOrdinal (ترم‌های بالاتر): پیش‌فرض مخفی — فقط با تخصیصِ
    // صریح مدیر گروه (student_course_grants) نمایش داده می‌شود.
    return false;
  });
}
