'use server';

// حذف درس → رویداد ارتقای خودکار لیست انتظار — سند §۱۰۱۸–۱۰۲۶:
// «ظرفیت به ۲۹ برنمی‌گردد! سیستم بلافاصله رویدادی شلیک می‌کند، نفر اول لیست
//  انتظار REGISTERED می‌شود و پیام «درس X برای شما ثبت قطعی شد» می‌گیرد.»
import { and, asc, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { academic_terms, course_offerings, courses, enrollments, notifications, students, users } from '@/db/schema';
import { withUserRls } from '@/db';
import { getStudentByUser, requireRole } from '@/lib/auth';
import { releaseSeat, takeSeat } from '@/lib/waitingRoom';

export async function dropCourseAction(enrollmentId: number): Promise<{ ok: boolean; error?: string; promotedTo?: string | null }> {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  if (!me) return { ok: false, error: 'پروندهٔ دانشجویی یافت نشد.' };

  const [row] = await db
    .select({ id: enrollments.id, offeringId: enrollments.offeringId, status: enrollments.status, title: courses.title })
    .from(enrollments)
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .innerJoin(academic_terms, eq(academic_terms.id, course_offerings.termId))
    .where(and(eq(enrollments.id, enrollmentId), eq(enrollments.studentId, me.id)));
  if (!row) return { ok: false, error: 'ثبت‌نام یافت نشد.' };
  if (row.status !== 'REGISTERED') return { ok: false, error: 'فقط دروس ثبت‌شده قابل حذف‌اند.' };

  // ۱) حذف (ردیف خود دانشجو → تحت RLS §۲۱۷۰) + آزادسازی صندلی
  await withUserRls(user.id, tx => tx.update(enrollments).set({ status: 'DROPPED' }).where(and(eq(enrollments.id, row.id), eq(enrollments.studentId, me.id))));
  await db.update(course_offerings).set({ enrolledCount: sql`GREATEST(${course_offerings.enrolledCount} - 1, 0)` }).where(eq(course_offerings.id, row.offeringId));
  await releaseSeat(row.offeringId);

  // ۲) رویداد ارتقا (اقدام سیستم روی ردیف «دانشجوی دیگر» → نقش مالک): نفر اول لیست انتظار همین درس
  const [firstWait] = await db
    .select({ id: enrollments.id, studentId: enrollments.studentId, pos: enrollments.waitlistPosition })
    .from(enrollments)
    .where(and(eq(enrollments.offeringId, row.offeringId), eq(enrollments.status, 'WAITLISTED')))
    .orderBy(asc(enrollments.waitlistPosition))
    .limit(1);

  let promotedName: string | null = null;
  if (firstWait) {
    await db.update(enrollments).set({ status: 'REGISTERED', waitlistPosition: null }).where(eq(enrollments.id, firstWait.id));
    // شیفت نفرات بعدی لیست انتظار یک نفر بالا
    await db.update(enrollments)
      .set({ waitlistPosition: sql`${enrollments.waitlistPosition} - 1` })
      .where(and(eq(enrollments.offeringId, row.offeringId), eq(enrollments.status, 'WAITLISTED')));
    await db.update(course_offerings).set({ enrolledCount: sql`${course_offerings.enrolledCount} + 1` }).where(eq(course_offerings.id, row.offeringId));
    await takeSeat(row.offeringId);

    // §۱۰۲۶: اطلاع‌رسانی لحظه‌ای — «درس ساختمان داده برای شما ثبت قطعی شد.»
    const [promoted] = await db
      .select({ userId: students.userId, firstName: users.firstName })
      .from(students).innerJoin(users, eq(users.id, students.userId))
      .where(eq(students.id, firstWait.studentId));
    if (promoted) {
      promotedName = promoted.firstName;
      await db.insert(notifications).values({
        userId: promoted.userId, eventCode: 'WAITLIST_PROMOTED',
        payload: JSON.stringify({ course: row.title, offeringId: row.offeringId }),
      });
    }
  }

  await withUserRls(user.id, tx => tx.insert(notifications).values({
    userId: user.id, eventCode: 'COURSE_DROPPED',
    payload: JSON.stringify({ course: row.title, promoted: promotedName }),
  }));
  revalidatePath('/student');
  return { ok: true, promotedTo: promotedName };
}
