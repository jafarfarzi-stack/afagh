"use server";

import { requireRole, getSessionUser } from '@/lib/auth';
import { db } from '@/db';
import { and, eq, isNull } from 'drizzle-orm';
import { courses, students } from '@/db/schema';
import { student_course_tuition_overrides } from '@/db/schema-welfare';
import { getCurrentUniversity } from '@/lib/university-scope';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

const FINANCE = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'];
const PATH = '/admin/finance/course-tuition';

/**
 * ثبتِ شهریهٔ ویژهٔ یک درس برای یک دانشجو.
 * رکوردِ فعالِ قبلی برای همان (دانشجو، درس، ترم) غیرفعال می‌شود تا همیشه
 * فقط یک نرخِ معتبر بماند (موتور آخرین رکوردِ فعال را می‌خواند).
 */
export async function saveCourseTuition(formData: FormData) {
  await requireRole(FINANCE);

  const studentCode = String(formData.get('studentCode') ?? '').trim();
  const courseCode = String(formData.get('courseCode') ?? '').trim();
  const termRaw = String(formData.get('termId') ?? '').trim();
  const perUnit = Number(String(formData.get('perUnitAmount') ?? '').replace(/[^\d.]/g, ''));
  const reason = String(formData.get('reason') ?? '').trim() || null;

  if (!studentCode || !courseCode || !Number.isFinite(perUnit) || perUnit <= 0) {
    redirect(`${PATH}?err=invalid`);
  }

  const [st] = await db
    .select({ id: students.id })
    .from(students)
    .where(eq(students.studentCode, studentCode))
    .limit(1);
  if (!st) redirect(`${PATH}?err=student`);

  const [co] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.code, courseCode))
    .limit(1);
  if (!co) redirect(`${PATH}?err=course`);

  const uni = await getCurrentUniversity();
  const me = await getSessionUser().catch(() => null);
  const termId = termRaw ? Number(termRaw) : null;

  // غیرفعال‌کردنِ نسخهٔ فعالِ قبلی برای همان کلید
  await db
    .update(student_course_tuition_overrides)
    .set({ isActive: 0 })
    .where(and(
      eq(student_course_tuition_overrides.studentId, st.id),
      eq(student_course_tuition_overrides.courseId, co.id),
      termId === null
        ? isNull(student_course_tuition_overrides.termId)
        : eq(student_course_tuition_overrides.termId, termId),
    ));

  await db.insert(student_course_tuition_overrides).values({
    studentId: st.id,
    courseId: co.id,
    termId,
    perUnitAmount: String(Math.round(perUnit)),
    reason,
    isActive: 1,
    createdBy: me?.id ?? null,
    universityId: uni.id,
  });

  revalidatePath(PATH);
  redirect(`${PATH}?ok=1`);
}

/** غیرفعال‌کردنِ یک رکورد (حذفِ نرم) */
export async function deactivateCourseTuition(formData: FormData) {
  await requireRole(FINANCE);
  const id = Number(formData.get('id') ?? 0);
  if (id > 0) {
    await db
      .update(student_course_tuition_overrides)
      .set({ isActive: 0 })
      .where(eq(student_course_tuition_overrides.id, id));
  }
  revalidatePath(PATH);
  redirect(`${PATH}?ok=1`);
}
