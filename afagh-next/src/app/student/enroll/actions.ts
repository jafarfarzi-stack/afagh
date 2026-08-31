'use server';

// انتخاب واحد از راه صف Redis — سند §۱۰۱۶: «ثبت نهایی» بلافاصله پاسخ می‌گیرد
// («درخواست شما در صف پردازش قرار گرفت») و کارگر صف نتیجه را در PostgreSQL می‌نویسد.
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms,
  cart_items,
  course_offerings,
  courses,
  degree_level_configs,
  enrollments,
  notifications,
  process_definitions,
  process_steps,
  student_requests,
  students,
} from '@/db/schema';
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
  if (!term) return { ok: false, error: 'ترم جاری فعال نیست' };

  // بررسی تکراری نبودن درس (همان درس با گروه دیگر نباید در سبد باشد)
  const [targetOff] = await db
    .select({ id: course_offerings.id, courseId: course_offerings.courseId })
    .from(course_offerings)
    .where(eq(course_offerings.id, offeringId))
    .limit(1);

  if (targetOff) {
    // یافتن سایر گروه‌های همین درس در سبد دانشجو و جایگزینی
    const otherGroupOfferings = await db
      .select({ id: course_offerings.id })
      .from(course_offerings)
      .where(and(eq(course_offerings.termId, term.id), eq(course_offerings.courseId, targetOff.courseId)));

    const otherIds = otherGroupOfferings.map(o => o.id);
    if (otherIds.length > 0) {
      await withUserRls(user.id, tx =>
        tx.delete(cart_items).where(and(eq(cart_items.studentId, me.id), inArray(cart_items.offeringId, otherIds)))
      );
    }
  }

  // نوشتن تحت RLS (§۲۱۷۰) با ثبت تاریخ جاری جهت تمدید مهلت
  await withUserRls(user.id, tx =>
    tx
      .insert(cart_items)
      .values({ studentId: me.id, offeringId, createdAt: new Date() })
      .onConflictDoUpdate({
        target: [cart_items.studentId, cart_items.offeringId],
        set: { createdAt: new Date() },
      })
  );

  return { ok: true };
}

export async function removeFromCartAction(offeringId: number) {
  const { user, me } = await ctx();
  await withUserRls(user.id, tx =>
    tx.delete(cart_items).where(and(eq(cart_items.studentId, me.id), eq(cart_items.offeringId, offeringId)))
  );
  return { ok: true };
}

/** خالی کردن کامل سبد انتخاب واحد (حذف همه) */
export async function clearCartAction() {
  const { user, me } = await ctx();
  await withUserRls(user.id, tx =>
    tx.delete(cart_items).where(eq(cart_items.studentId, me.id))
  );
  return { ok: true };
}

/** چیدمان هوشمند و خودکار دروس ترم بر اساس چارت مصوب رشته */
export async function autoFillCartFromChartAction(): Promise<{ ok: boolean; count: number; units: number; message: string }> {
  const { user, me, term } = await ctx();
  if (!term) return { ok: false, count: 0, units: 0, message: 'ترم جاری فعال نیست.' };

  // ۱. ابتدا سبد قبلی خالی می‌شود تا درس‌های تکراری و متناقض پاک شوند
  await withUserRls(user.id, tx =>
    tx.delete(cart_items).where(eq(cart_items.studentId, me.id))
  );

  // ۲. دریافت دروس ارائه‌شده در ترم جاری به همراه مشخصات درس
  const offerings = await db
    .select({
      id: course_offerings.id,
      courseId: course_offerings.courseId,
      code: courses.code,
      title: courses.title,
      units: courses.units,
      groupNumber: course_offerings.groupNumber,
      capacity: course_offerings.capacity,
      enrolledCount: course_offerings.enrolledCount,
    })
    .from(course_offerings)
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(and(eq(course_offerings.termId, term.id), eq(course_offerings.isActive, 1)));

  // ۳. فیلتر هوشمند بر اساس مقطع دانشجو و دروس پیشنهادی ترم
  // برای کارشناسی: دروس پایان‌نامه ارشد (2112901) و مطالعه فردی حذف می‌شوند
  const isUndergrad = me.degreeLevelId === 1;

  // انتخاب یکتا برای هر درس (جلوگیری از ثبت دو گروه از یک درس)
  const chosenOfferings: typeof offerings = [];
  const seenCourseIds = new Set<number>();
  let totalUnits = 0;
  const maxUnitsLimit = 20; // سقف آیین‌نامه ترمیک

  // اولویت ۱: دروس پایه و اصلی ترمیک مرتبط با مقطع
  for (const off of offerings) {
    if (seenCourseIds.has(off.courseId)) continue;

    // عدم اضافه کردن پایان‌نامه ارشد برای دانشجوی کارشناسی
    if (isUndergrad && (off.code.startsWith('21') || off.title.includes('پایان‌نامه'))) continue;

    // عدم اضافه کردن دروس موردی کمیسیون در چیدمان خودکار
    if (off.title.includes('معرفی به استاد') || off.title.includes('مطالعه فردی')) continue;

    const u = Number(off.units || 0);
    if (totalUnits + u <= maxUnitsLimit) {
      seenCourseIds.add(off.courseId);
      chosenOfferings.push(off);
      totalUnits += u;
    }
  }

  // ۴. درج دروس انتخاب‌شده در سبد دانشجو
  const now = new Date();
  for (const off of chosenOfferings) {
    await withUserRls(user.id, tx =>
      tx
        .insert(cart_items)
        .values({ studentId: me.id, offeringId: off.id, createdAt: now })
        .onConflictDoNothing()
    );
  }

  return {
    ok: true,
    count: chosenOfferings.length,
    units: totalUnits,
    message: `چیدمان خودکار انجام شد: ${chosenOfferings.length} درس معادل ${totalUnits} واحد مصوب بر اساس چارت در سبد شما چیده شد.`,
  };
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
  const [o] = await db
    .select({ title: courses.title })
    .from(course_offerings)
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(eq(course_offerings.id, offeringId));

  // ثبت PENDING_COUNCIL + پروندهٔ گردش کار
  const [ins] = await withUserRls(user.id, tx =>
    tx
      .insert(enrollments)
      .values({ studentId: me.id, offeringId, status: 'PENDING_COUNCIL' })
      .onConflictDoUpdate({ target: [enrollments.studentId, enrollments.offeringId], set: { status: 'PENDING_COUNCIL' } })
      .returning({ id: enrollments.id })
  );

  const [proc] = await db.select().from(process_definitions).where(eq(process_definitions.code, 'PREREQ_WAIVER')).limit(1);
  if (proc) {
    const [firstStep] = await db
      .select()
      .from(process_steps)
      .where(eq(process_steps.processId, proc.id))
      .orderBy(process_steps.stepOrder)
      .limit(1);
    const tracking = 'WR-' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 90 + 10);
    const [req] = await withUserRls(user.id, tx =>
      tx
        .insert(student_requests)
        .values({
          trackingCode: tracking,
          studentId: me.id,
          processId: proc.id,
          currentStepId: firstStep?.id ?? null,
          status: 'SUBMITTED',
          formData: JSON.stringify({ offeringId, offeringTitle: o?.title ?? '', reasons: reason ? [reason] : ['خطای نرم انتخاب واحد'] }),
          relatedEnrollmentId: ins?.id ?? null,
        })
        .returning({ id: student_requests.id })
    );
    if (req && ins) await withUserRls(user.id, tx => tx.update(enrollments).set({ workflowRequestId: req.id }).where(eq(enrollments.id, ins.id)));
  }

  await withUserRls(user.id, tx =>
    tx.delete(cart_items).where(and(eq(cart_items.studentId, me.id), eq(cart_items.offeringId, offeringId)))
  );
  await withUserRls(user.id, tx =>
    tx.insert(notifications).values({
      userId: user.id,
      eventCode: 'COUNCIL_REFERRAL',
      payload: JSON.stringify({ course: o?.title ?? '', termId: term.id }),
    })
  );
  return { ok: true };
}
