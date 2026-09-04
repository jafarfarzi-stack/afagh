'use server';

import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import { course_offerings, enrollments, notifications, student_requests, students } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { assertServerActionOrigin } from '@/lib/security';
import { revalidatePath } from 'next/cache';

// وضعیت‌هایی که درخواست در آن‌ها «قابل تصمیم» است (تایید/رد) — بقیه قابل پردازش مجدد نیستند
const DECIDABLE_SQL = (t: any) => inArray(t, ['SUBMITTED', 'IN_REVIEW', 'DRAFT']);

export async function approveRequestAction(requestId: number) {
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const user = await requireRole(['ADMIN']);

  try {
    const outcome = await db.transaction(async (tx) => {
      // ── ۱) انتقال وضعیت درخواست فقط اگر هنوز «تصمیم‌ناگرفته» باشد (ضد دوبار اجرا — بند ۷/۸)
      const updReq = await tx
        .update(student_requests)
        .set({ status: 'APPROVED', updatedAt: new Date() })
        .where(and(eq(student_requests.id, requestId), DECIDABLE_SQL(student_requests.status)))
        .returning({
          id: student_requests.id,
          studentId: student_requests.studentId,
          trackingCode: student_requests.trackingCode,
          relatedEnrollmentId: student_requests.relatedEnrollmentId,
        });
      const req = updReq[0];
      if (!req) {
        const [cur] = await tx.select({ status: student_requests.status }).from(student_requests).where(eq(student_requests.id, requestId)).limit(1);
        return { ok: false, error: cur ? 'این درخواست قبلاً پردازش شده است.' : 'درخواست یافت نشد.' };
      }

      // ── ۲) ثبت قطعی درس (فقط اگر قبلاً قطعی نشده باشد) + شمارنده (فقط در صورت انتقال واقعی)
      if (req.relatedEnrollmentId) {
        const enrTransition = await tx
          .update(enrollments)
          .set({ status: 'REGISTERED' })
          .where(and(eq(enrollments.id, req.relatedEnrollmentId), ne(enrollments.status, 'REGISTERED'), ne(enrollments.status, 'DROPPED')))
          .returning({ offeringId: enrollments.offeringId });
        if (enrTransition.length === 1) {
          await tx
            .update(course_offerings)
            .set({ enrolledCount: sql`${course_offerings.enrolledCount} + 1` })
            .where(eq(course_offerings.id, enrTransition[0].offeringId));
        }
        // اگر ردیف پیدا نشد (enrollment حذف/ناهمخوان) — درخواست هنوز APPROVED است؛
        // یعنی اتفاقی نمی‌افتد و خطا روشن است:
        const [enrExists] = await tx.select({ id: enrollments.id }).from(enrollments).where(eq(enrollments.id, req.relatedEnrollmentId)).limit(1);
        if (!enrExists && req.relatedEnrollmentId) {
          // ندارد → کل تراکنش را برگردان (بدون پردازش ناقص)
          throw new Error('ثبت‌نام مرتبط با درخواست یافت نشد — تراکنش برگشت خورد.');
        }
      }

      // ── ۳) اعلان دانشجو (در همان تراکنش)
      const [stu] = await tx.select({ userId: students.userId }).from(students).where(eq(students.id, req.studentId)).limit(1);
      if (stu) {
        await tx.insert(notifications).values({
          userId: stu.userId,
          eventCode: 'COUNCIL_APPROVED',
          payload: JSON.stringify({
            text: `درخواست شورای آموزشی شما با کد رهگیری ${req.trackingCode} تایید شد و درس به صورت قطعی در کارنامه ثبت گردید.`,
          }),
        });
      }
      return { ok: true };
    });

    if (outcome.ok) {
      revalidatePath('/admin');
      revalidatePath('/student');
      revalidatePath('/student/requests');
    }
    return outcome;
  } catch (err: any) {
    return { ok: false, error: err?.message || 'خطا در تأیید درخواست' };
  }
}

export async function rejectRequestAction(requestId: number, reason?: string) {
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const user = await requireRole(['ADMIN']);

  try {
    const outcome = await db.transaction(async (tx) => {
      const updReq = await tx
        .update(student_requests)
        .set({ status: 'REJECTED', updatedAt: new Date() })
        .where(and(eq(student_requests.id, requestId), DECIDABLE_SQL(student_requests.status)))
        .returning({
          id: student_requests.id,
          studentId: student_requests.studentId,
          trackingCode: student_requests.trackingCode,
          relatedEnrollmentId: student_requests.relatedEnrollmentId,
        });
      const req = updReq[0];
      if (!req) {
        const [cur] = await tx.select({ status: student_requests.status }).from(student_requests).where(eq(student_requests.id, requestId)).limit(1);
        return { ok: false, error: cur ? 'این درخواست قبلاً پردازش شده است.' : 'درخواست یافت نشد.' };
      }

      // تغییر وضعیت درس مرتبط (فقط اگر هنوز در حال بررسی/ثبت موقت باشد)
      if (req.relatedEnrollmentId) {
        await tx
          .update(enrollments)
          .set({ status: 'REJECTED' })
          .where(and(eq(enrollments.id, req.relatedEnrollmentId), ne(enrollments.status, 'REGISTERED'), ne(enrollments.status, 'DROPPED')));
      }

      const [stu] = await tx.select({ userId: students.userId }).from(students).where(eq(students.id, req.studentId)).limit(1);
      if (stu) {
        await tx.insert(notifications).values({
          userId: stu.userId,
          eventCode: 'COUNCIL_REJECTED',
          payload: JSON.stringify({
            text: `درخواست شورای آموزشی شما با کد رهگیری ${req.trackingCode} رد شد. دلیل: ${reason?.slice(0, 300) || 'عدم احراز شرایط کمیسیون'}`,
          }),
        });
      }
      return { ok: true };
    });

    if (outcome.ok) {
      revalidatePath('/admin');
      revalidatePath('/student');
      revalidatePath('/student/requests');
    }
    return outcome;
  } catch (err: any) {
    return { ok: false, error: err?.message || 'خطا در رد درخواست' };
  }
}
