'use server';

import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import { course_offerings, enrollments, notifications, student_requests, students } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { assertServerActionOrigin } from '@/lib/security';
import { assertFinancialClearance } from '@/lib/enrollment-financial-gate';
import { assertEnrollmentWrite } from '@/lib/enrollment-window';
import { appendAudit } from '@/lib/audit';
import { getCurrentUniversity } from '@/lib/university-scope';
import { revalidatePath } from 'next/cache';

// وضعیت‌هایی که درخواست در آن‌ها «قابل تصمیم» است (تایید/رد) — بقیه قابل پردازش مجدد نیستند
const DECIDABLE_SQL = (t: any) => inArray(t, ['SUBMITTED', 'IN_REVIEW', 'DRAFT']);

/** درخواست باید متعلق به دانشگاه فعال باشد (رد/تایید بین‌دانشگاهی ممنوع) */
async function assertRequestInUni(requestId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const uni = await getCurrentUniversity().catch(() => null);
  if (!uni) return { ok: false, error: 'دانشگاه فعال نامشخص است.' };
  const [r] = await db
    .select({ reqUni: student_requests.universityId, stuUni: students.universityId })
    .from(student_requests)
    .leftJoin(students, eq(students.id, student_requests.studentId))
    .where(eq(student_requests.id, requestId))
    .limit(1);
  if (!r) return { ok: false, error: 'درخواست یافت نشد.' };
  const owner = r.reqUni ?? r.stuUni;
  if (owner !== null && owner !== uni.id) return { ok: false, error: 'درخواست متعلق به دانشگاه دیگری است.' };
  return { ok: true };
}

export async function approveRequestAction(requestId: number) {
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const user = await requireRole(['ADMIN']);
  const scope = await assertRequestInUni(requestId);
  if (!scope.ok) return scope;

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

      // ── ۲) گیت‌های ارتقای ارجاع به ثبت قطعی (F-01): ارجاعِ شورا صندلی نگرفته است
      // (PENDING_COUNCIL در تعریفِ یکتای شمارندهٔ صندلی نمی‌آید)، پس پیش از ارتقا
      // گیت‌های مالی / وضعیتِ دانشجو / پنجرهٔ انتخاب واحد دوباره اعمال می‌شوند.
      let approvedOfferingId: number | null = null;
      if (req.relatedEnrollmentId) {
        const [enr] = await tx
          .select({ id: enrollments.id, status: enrollments.status, offeringId: enrollments.offeringId })
          .from(enrollments)
          .where(eq(enrollments.id, req.relatedEnrollmentId))
          .limit(1);
        if (!enr) {
          // ندارد → کل تراکنش را برگردان (بدون پردازش ناقص)
          throw new Error('ثبت‌نام مرتبط با درخواست یافت نشد — تراکنش برگشت خورد.');
        }
        approvedOfferingId = enr.offeringId ?? null;
        if (enr.status !== 'REGISTERED' && enr.status !== 'DROPPED') {
          const [off] = await tx
            .select({ termId: course_offerings.termId })
            .from(course_offerings)
            .where(eq(course_offerings.id, enr.offeringId))
            .limit(1);
          if (!off) {
            throw new Error('ارائهٔ درس مرتبط با درخواست یافت نشد — تراکنش برگشت خورد.');
          }
          // گیت مالی: پذیرشِ درسیِ شورا بدهی را نمی‌بخشد
          const uni = await getCurrentUniversity().catch(() => null);
          const fin = await assertFinancialClearance(req.studentId, off.termId, uni?.id ?? null);
          if (!fin.ok) {
            throw new Error(`تبدیل ارجاع شورا به ثبت قطعی ممکن نیست — ${fin.error}`);
          }
          // وضعیت دانشجو باید فعال بماند
          const [stuRow] = await tx
            .select({ status: students.status })
            .from(students)
            .where(eq(students.id, req.studentId))
            .limit(1);
          if (!stuRow || stuRow.status !== 'ACTIVE') {
            throw new Error('وضعیت دانشجو فعال نیست؛ ارجاع شورا قابل تبدیل به ثبت قطعی نیست.');
          }
          // پنجرهٔ انتخاب واحد: راهِ قانونی، بازکردن پنجره است نه دورزدن آن
          const win = await assertEnrollmentWrite(off.termId, 'ADD', tx as unknown as Parameters<typeof assertEnrollmentWrite>[2]);
          if (!win.ok) {
            throw new Error(`تبدیل ارجاع شورا به ثبت قطعی خارج از پنجرهٔ انتخاب واحد ممکن نیست — ${win.error} در صورت نیاز واقعی، ابتدا پنجرهٔ انتخاب واحد را باز کنید.`);
          }
        }

        // ── ۳) ثبت قطعی درس (فقط اگر قبلاً قطعی نشده باشد) + شمارنده (فقط در صورت انتقال واقعی)
        const enrTransition = await tx
          .update(enrollments)
          .set({ status: 'REGISTERED' })
          .where(and(eq(enrollments.id, req.relatedEnrollmentId), ne(enrollments.status, 'REGISTERED'), ne(enrollments.status, 'DROPPED')))
          .returning({ offeringId: enrollments.offeringId });
        if (enrTransition.length === 1) {
          // شمارنده فقط با قیدِ ظرفیت +۱ می‌شود؛ اگر کلاس بین ارجاع و تاییدِ شورا پر شده باشد،
          // ارتقا رد می‌شود و تراکنش برگشت می‌خورد (ارجاع در PENDING_COUNCIL می‌ماند).
          const capUpd = await tx
            .update(course_offerings)
            .set({ enrolledCount: sql`${course_offerings.enrolledCount} + 1` })
            .where(and(
              eq(course_offerings.id, enrTransition[0].offeringId),
              sql`(${course_offerings.enrolledCount} < ${course_offerings.capacity} OR ${course_offerings.capacity} <= 0)`,
            ))
            .returning({ id: course_offerings.id });
          if (capUpd.length === 0) {
            throw new Error('ظرفیت این درس پس از ارجاع تکمیل شده است؛ ارجاع قابل تبدیل به ثبت قطعی نیست و در وضعیت «در انتظار شورا» باقی ماند.');
          }
        }
      }

      // ── ۴) اعلان دانشجو (در همان تراکنش)
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

      // ── ۵) ردِ حسابرسیِ تصمیم (خانوادهٔ F-08)
      await appendAudit(tx, {
        actorUserId: user.id,
        action: 'council_approval',
        entityType: 'enrollments',
        entityId: req.relatedEnrollmentId ?? null,
        details: JSON.stringify({
          decision: 'APPROVED',
          studentId: req.studentId,
          offeringId: approvedOfferingId,
          trackingCode: req.trackingCode,
        }),
      });
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
  const scope = await assertRequestInUni(requestId);
  if (!scope.ok) return scope;

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
      let rejectedOfferingId: number | null = null;
      if (req.relatedEnrollmentId) {
        const rejRows = await tx
          .update(enrollments)
          .set({ status: 'REJECTED' })
          .where(and(eq(enrollments.id, req.relatedEnrollmentId), ne(enrollments.status, 'REGISTERED'), ne(enrollments.status, 'DROPPED')))
          .returning({ offeringId: enrollments.offeringId });
        rejectedOfferingId = rejRows[0]?.offeringId ?? null;
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

      // ردِ حسابرسیِ تصمیم (خانوادهٔ F-08)
      await appendAudit(tx, {
        actorUserId: user.id,
        action: 'council_approval',
        entityType: 'enrollments',
        entityId: req.relatedEnrollmentId ?? null,
        details: JSON.stringify({
          decision: 'REJECTED',
          studentId: req.studentId,
          offeringId: rejectedOfferingId,
          trackingCode: req.trackingCode,
          reason: reason?.slice(0, 300) ?? null,
        }),
      });
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
