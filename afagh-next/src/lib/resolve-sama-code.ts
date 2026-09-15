/**
 * حل کد وضعیت نمرهٔ سما بر اساس تعریف درس در کاتالوگ
 *
 * اگر curriculum_courses.passGradeStatusCode / failGradeStatusCode تنظیم شده باشد
 * از آنها استفاده می‌کند؛ در غیر اینصورت پیش‌فرض سیستم:
 *   قبولی → کد '1' (درس عادي - قبول)
 *   مردودی → کد '2' (درس عادي - مردود)
 */
'use server';

import { db } from '@/db';
import { curriculum_courses, students, course_offerings } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolveStudentCurriculum } from './curriculum-apply';

const DEFAULT_PASS_CODE = '1';
const DEFAULT_FAIL_CODE = '2';

/**
 * کد وضعیت سما را بر اساس نمرهٔ دانشجو و درس کاتالوگ برمی‌گرداند.
 *
 * @param studentId  شناسهٔ دانشجو
 * @param offeringId شناسهٔ ارائهٔ درس
 * @param gradeValue نمرهٔ عددی (null = بدون نمره)
 * @returns کد وضعیت سما (string) یا null اگر نتوان حل کرد
 */
export async function resolveSamaGradeStatusCode(
  studentId: number,
  offeringId: number,
  gradeValue: string | number | null,
): Promise<string | null> {
  if (gradeValue == null || gradeValue === '') return null;

  const numGrade = Number(gradeValue);
  if (!Number.isFinite(numGrade)) return null;

  // ۱) پیدا کردن دانشجو
  const [student] = await db
    .select({ id: students.id })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);
  if (!student) return null;

  // ۲) پیدا کردن ارائه + درس
  const [offering] = await db
    .select({ courseId: course_offerings.courseId })
    .from(course_offerings)
    .where(eq(course_offerings.id, offeringId))
    .limit(1);
  if (!offering) return null;

  // ۳) پیدا کردن نسخهٔ صحیح برنامهٔ درسی (با فیلتر رشته/مقطع/سال ورود/وضعیت)
  const { version } = await resolveStudentCurriculum(studentId);
  if (!version) {
    // نسخه‌ای نیست → پیش‌فرض
    return numGrade >= 10 ? DEFAULT_PASS_CODE : DEFAULT_FAIL_CODE;
  }

  // ۴) پیدا کردن تخصیص درس در کاتالوگ
  const [cc] = await db
    .select({
      passGradeStatusCode: curriculum_courses.passGradeStatusCode,
      failGradeStatusCode: curriculum_courses.failGradeStatusCode,
      minGrade: curriculum_courses.minGrade,
    })
    .from(curriculum_courses)
    .where(and(
      eq(curriculum_courses.curriculumVersionId, version.id),
      eq(curriculum_courses.courseId, offering.courseId),
    ))
    .limit(1);

  // ۵) تعیین حد نصاب
  const passingGrade = cc?.minGrade != null ? Number(cc.minGrade) : 10;
  const passed = numGrade >= passingGrade;

  // ۶) کد وضعیت
  if (passed) {
    return cc?.passGradeStatusCode || DEFAULT_PASS_CODE;
  } else {
    return cc?.failGradeStatusCode || DEFAULT_FAIL_CODE;
  }
}
