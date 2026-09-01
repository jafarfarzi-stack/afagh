'use server';

import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { course_offerings, courses, enrollments, notifications, student_requests, students } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function approveRequestAction(requestId: number) {
  const user = await requireRole(['ADMIN']);

  const [req] = await db
    .select()
    .from(student_requests)
    .where(eq(student_requests.id, requestId))
    .limit(1);

  if (!req) return { ok: false, error: 'درخواست یافت نشد.' };

  // به‌روزرسانی وضعیت درخواست به تاییدشده
  await db
    .update(student_requests)
    .set({ status: 'APPROVED', updatedAt: new Date() })
    .where(eq(student_requests.id, requestId));

  // اگر درخواست مربوط به اخذ درس با مجوز کمیسیون بوده باشد
  if (req.relatedEnrollmentId) {
    const [enr] = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, req.relatedEnrollmentId))
      .limit(1);

    if (enr) {
      // تغییر وضعیت درس به ثبت قطعی
      await db
        .update(enrollments)
        .set({ status: 'REGISTERED' })
        .where(eq(enrollments.id, enr.id));

      // افزایش شمارنده ثبت‌نام‌شدگان کلاس
      await db
        .update(course_offerings)
        .set({ enrolledCount: sql`${course_offerings.enrolledCount} + 1` })
        .where(eq(course_offerings.id, enr.offeringId));
    }
  }

  // ارسال اعلان به دانشجو
  const [stu] = await db.select().from(students).where(eq(students.id, req.studentId)).limit(1);
  if (stu) {
    await db.insert(notifications).values({
      userId: stu.userId,
      eventCode: 'COUNCIL_APPROVED',
      payload: JSON.stringify({
        text: `درخواست شورای آموزشی شما با کد رهگیری ${req.trackingCode} تایید شد و درس به صورت قطعی در کارنامه ثبت گردید.`,
      }),
    });
  }

  revalidatePath('/admin');
  revalidatePath('/student');
  revalidatePath('/student/requests');
  return { ok: true };
}

export async function rejectRequestAction(requestId: number, reason?: string) {
  const user = await requireRole(['ADMIN']);

  const [req] = await db
    .select()
    .from(student_requests)
    .where(eq(student_requests.id, requestId))
    .limit(1);

  if (!req) return { ok: false, error: 'درخواست یافت نشد.' };

  // تغییر وضعیت درخواست به رده‌شده
  await db
    .update(student_requests)
    .set({ status: 'REJECTED', updatedAt: new Date() })
    .where(eq(student_requests.id, requestId));

  // تغییر وضعیت درس در سبد دانشجو
  if (req.relatedEnrollmentId) {
    await db
      .update(enrollments)
      .set({ status: 'REJECTED' })
      .where(eq(enrollments.id, req.relatedEnrollmentId));
  }

  // ارسال اعلان به دانشجو
  const [stu] = await db.select().from(students).where(eq(students.id, req.studentId)).limit(1);
  if (stu) {
    await db.insert(notifications).values({
      userId: stu.userId,
      eventCode: 'COUNCIL_REJECTED',
      payload: JSON.stringify({
        text: `درخواست شورای آموزشی شما با کد رهگیری ${req.trackingCode} رد شد. دلیل: ${reason || 'عدم احراز شرایط کمیسیون'}`,
      }),
    });
  }

  revalidatePath('/admin');
  revalidatePath('/student');
  revalidatePath('/student/requests');
  return { ok: true };
}
