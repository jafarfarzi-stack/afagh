'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import {
  academic_terms,
  majors,
  student_course_grants,
  students,
} from '@/db/schema';
import { back, num, requireDepHead, str } from '@/lib/group-manager';
import { resolveStudentCurriculumScope } from '@/lib/enroll-curriculum-scope';
import { termOrdinalForEntry } from '@/lib/term-scope';

/** دانشجو در دامنهٔ گروه‌های مدیر است؟ (رشتهٔ دانشجو زیرمجموعهٔ یکی از گروه‌های او) */
async function studentInScope(studentId: number, deptIds: number[]): Promise<boolean> {
  if (!deptIds.length) return false;
  const [row] = await db
    .select({ majorId: students.majorId })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);
  if (!row?.majorId) return false;
  const [m] = await db
    .select({ departmentId: majors.departmentId })
    .from(majors)
    .where(eq(majors.id, row.majorId))
    .limit(1);
  return !!m && deptIds.includes(m.departmentId ?? -1);
}

/** شمارهٔ ترم تحصیلیِ دانشجو نسبت به ترم جاری (همان formule صفحهٔ انتخاب واحد). */
async function currentTermOrdinalOf(studentId: number): Promise<number | null> {
  const [stu] = await db
    .select({ entryYear: students.entryYear, entryTerm: students.entryTerm })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);
  if (!stu) return null;
  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1)).limit(1);
  if (!term) return null;
  return termOrdinalForEntry({
    entryYear: stu.entryYear,
    entryTerm: stu.entryTerm,
    terms: [],
    targetTermCode: term.termCode,
  });
}

/**
 * تخصیص یک درسِ چارت به دانشجو — فقط برای درسِ ترمِ *بالاتر* معنا دارد
 * (ترم جاری/پایین‌تر و تکرار از قبل قابل اخذند). درس حتماً باید عضو چارتِ
 * منتشرشدهٔ همان دانشجو باشد.
 */
export async function grantCourseAction(fd: FormData) {
  const { staff: me, depts } = await requireDepHead();
  const deptIds = depts.map(d => d.id);
  const studentId = num(fd, 'studentId');
  const courseId = num(fd, 'courseId');
  const reason = str(fd, 'reason');

  if (!studentId || !courseId) back('/group-manager/grants', 'err', 'دانشجو یا درس مشخص نیست.');
  if (!(await studentInScope(studentId, deptIds))) back('/group-manager/grants', 'err', 'این دانشجو در گروه‌های زیر نظرشما نیست.');

  const scope = await resolveStudentCurriculumScope(studentId);
  if (!scope.resolved) back('/group-manager/grants', 'err', 'برای این دانشجو چارت منتشرشده‌ای حل نشده — تخصیص فقط برای دروس داخل چارت است.');
  if (!scope.courseIds.has(courseId)) back('/group-manager/grants', 'err', 'این درس در چارت تحصیلی دانشجو نیست.');

  const rec = scope.recommendedByCourse.get(courseId) ?? null;
  const ordinal = await currentTermOrdinalOf(studentId);
  if (rec == null) {
    back('/group-manager/grants', 'err', 'این درس ترم مشخصی در چارت ندارد (درس آزاد) و از قبل قابل اخذ است — نیازی به تخصیص ندارد.');
  } else if (ordinal != null && rec <= ordinal) {
    back('/group-manager/grants', 'err', `این درس ترم ${rec} است و از قبل (ترم جاری یا پایین‌تر) قابل اخذ است — تخصیص فقط برای ترم‌های بالاتر لازم است.`);
  }

  const [dup] = await db
    .select({ id: student_course_grants.id })
    .from(student_course_grants)
    .where(and(eq(student_course_grants.studentId, studentId), eq(student_course_grants.courseId, courseId)))
    .limit(1);
  if (dup) back('/group-manager/grants', 'err', 'این درس قبلاً برای این دانشجو تخصیص یافته است.');

  await db.insert(student_course_grants).values({
    studentId,
    courseId,
    curriculumVersionId: scope.versionId,
    termOrdinal: rec,
    reason: reason || null,
    grantedByStaffId: me.id,
    grantedByUserId: me.userId,
  });
  revalidatePath('/group-manager/grants');
  revalidatePath('/student/enroll');
  back('/group-manager/grants', 'msg', 'درس برای دانشجو تخصیص یافت و در انتخاب واحد او نمایان می‌شود.');
}

/** لغو تخصیص — درس دوباره به قانون ترم برمی‌گردد (پیش‌فرض مخفی برای ترم بالاتر). */
export async function revokeGrantAction(fd: FormData) {
  const { depts } = await requireDepHead();
  const deptIds = depts.map(d => d.id);
  const studentId = num(fd, 'studentId');
  const courseId = num(fd, 'courseId');
  if (!studentId || !courseId) back('/group-manager/grants', 'err', 'دانشجو یا درس مشخص نیست.');
  if (!(await studentInScope(studentId, deptIds))) back('/group-manager/grants', 'err', 'این دانشجو در گروه‌های زیر نظرشما نیست.');

  await db
    .delete(student_course_grants)
    .where(and(eq(student_course_grants.studentId, studentId), eq(student_course_grants.courseId, courseId)));
  revalidatePath('/group-manager/grants');
  revalidatePath('/student/enroll');
  back('/group-manager/grants', 'msg', 'تخصیص لغو شد.');
}
