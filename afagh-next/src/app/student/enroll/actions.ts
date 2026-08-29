'use server';

// انتخاب واحد از راه صف Redis — سند §۱۰۱۶: «ثبت نهایی» بلافاصله پاسخ می‌گیرد
// («درخواست شما در صف پردازش قرار گرفت») و کارگر صف نتیجه را در PostgreSQL می‌نویسد.
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, cart_items, course_offerings, courses, enrollments, notifications, process_definitions, process_steps, student_requests } from '@/db/schema';
import { withUserRls } from '@/db';
import { getStudentByUser, requireRole } from '@/lib/auth';
import { enqueueSubmit, ensureWorker, rateLimitSubmit } from '@/lib/waitingRoom';

async function ctx() {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  if (!me) throw new Error('پروندهٔ دانشجویی یافت نشد');
  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1));
  return { user, me, term };
}

export async function addToCartAction(offeringId: number) {
  const { user, me, term } = await ctx();
  if (!term) return;
  // نوشتن تحت RLS (§۲۱۷۰): خط‌مشی cart_self_ins فقط سبد خودش را اجازه می‌دهد
  await withUserRls(user.id, tx => tx.insert(cart_items).values({ studentId: me.id, offeringId }).onConflictDoNothing());
}

export async function removeFromCartAction(offeringId: number) {
  const { user, me } = await ctx();
  await withUserRls(user.id, tx => tx.delete(cart_items).where(and(eq(cart_items.studentId, me.id), eq(cart_items.offeringId, offeringId))));
}

/** ورود به اتاق انتظار — پاسخ فوری با شمارهٔ نوبت (§۱۰۱۶ + §۶۹۰۶) */
export async function submitCartAction(): Promise<{ queued: boolean; ticketId: string; position: number; limited?: boolean }> {
  const { user, me } = await ctx();
  ensureWorker(); // کارگر صف در همین فرایند Next فعال است

  // سپر نرخ (§۲۰۷۷): بیش از ۵ درخواست ثبت در ثانیه → رد سریع
  if (!(await rateLimitSubmit(user.id))) {
    return { queued: false, ticketId: '', position: 0, limited: true };
  }

  const { ticket, position } = await enqueueSubmit(user.id, me.id);
  return { queued: true, ticketId: ticket.id, position };
}

export async function referCouncilAction(offeringId: number, reason?: string): Promise<{ ok: boolean; error?: string }> {
  const { user, me, term } = await ctx();
  if (!term) return { ok: false, error: 'ترم جاری یافت نشد.' };
  const [o] = await db.select({ title: courses.title }).from(course_offerings).innerJoin(courses, eq(courses.id, course_offerings.courseId)).where(eq(course_offerings.id, offeringId));

  // ثبت PENDING_COUNCIL + پروندهٔ گردش کار — همهٔ نوشتن‌ها تحت RLS در یک تراکنش
  const [ins] = await withUserRls(user.id, tx => tx.insert(enrollments).values({ studentId: me.id, offeringId, status: 'PENDING_COUNCIL' })
    .onConflictDoUpdate({ target: [enrollments.studentId, enrollments.offeringId], set: { status: 'PENDING_COUNCIL' } })
    .returning({ id: enrollments.id }));

  const [proc] = await db.select().from(process_definitions).where(eq(process_definitions.code, 'PREREQ_WAIVER')).limit(1);
  if (proc) {
    const [firstStep] = await db.select().from(process_steps)
      .where(eq(process_steps.processId, proc.id)).orderBy(process_steps.stepOrder).limit(1);
    const tracking = 'WR-' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 90 + 10);
    const [req] = await withUserRls(user.id, tx => tx.insert(student_requests).values({
      trackingCode: tracking, studentId: me.id, processId: proc.id,
      currentStepId: firstStep?.id ?? null, status: 'SUBMITTED',
      formData: JSON.stringify({ offeringId, offeringTitle: o?.title ?? '', reasons: reason ? [reason] : ['خطای نرم انتخاب واحد'] }),
      relatedEnrollmentId: ins?.id ?? null,
    }).returning({ id: student_requests.id }));
    if (req && ins) await withUserRls(user.id, tx => tx.update(enrollments).set({ workflowRequestId: req.id }).where(eq(enrollments.id, ins.id)));
  }

  await withUserRls(user.id, tx => tx.delete(cart_items).where(and(eq(cart_items.studentId, me.id), eq(cart_items.offeringId, offeringId))));
  await withUserRls(user.id, tx => tx.insert(notifications).values({ userId: user.id, eventCode: 'COUNCIL_REFERRAL', payload: JSON.stringify({ course: o?.title ?? '', termId: term.id }) }));
  return { ok: true };
}
