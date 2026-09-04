'use server';

// انتخاب واحد از راه صف Redis — سند §۱۰۱۶: «ثبت نهایی» بلافاصله پاسخ می‌گیرد
// («درخواست شما در صف پردازش قرار گرفت») و کارگر صف نتیجه را در PostgreSQL می‌نویسد.
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms,
  cart_items,
  classrooms,
  course_offerings,
  courses,
  degree_level_configs,
  enrollments,
  notifications,
  process_definitions,
  process_steps,
  schedules,
  student_requests,
  students,
} from '@/db/schema';
import { getStudentByUser, requireRole } from '@/lib/auth';
import { enqueueSubmit, ensureWorker, rateLimitSubmit } from '@/lib/waitingRoom';

async function ctx() {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  if (!me) throw new Error('پروندهٔ دانشجویی یافت نشد');
  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1));
  return { user, me, term };
}

function timeOverlap(s1: string, e1: string, s2: string, e2: string) {
  return s1.slice(0, 5) < e2.slice(0, 5) && s2.slice(0, 5) < e1.slice(0, 5);
}

export async function addToCartAction(offeringId: number) {
  const { user, me, term } = await ctx();
  if (!term) return { ok: false, error: 'ترم جاری فعال نیست' };

  // دریافت اطلاعات این ارائه
  const [targetOff] = await db
    .select({ id: course_offerings.id, courseId: course_offerings.courseId })
    .from(course_offerings)
    .where(eq(course_offerings.id, offeringId))
    .limit(1);

  if (targetOff) {
    // یافتن و حذف سایر گروه‌های همین درس از سبد دانشجو (جایگزینی گروه جدید)
    const otherGroupOfferings = await db
      .select({ id: course_offerings.id })
      .from(course_offerings)
      .where(and(eq(course_offerings.termId, term.id), eq(course_offerings.courseId, targetOff.courseId)));

    const otherIds = otherGroupOfferings.map(o => o.id);
    if (otherIds.length > 0) {
      await db.transaction(tx =>
        tx.delete(cart_items).where(and(eq(cart_items.studentId, me.id), inArray(cart_items.offeringId, otherIds)))
      );
    }
  }

  // درج ارائه جدید در سبد تحت RLS (§۲۱۷۰) با تمدید مهلت
  await db.transaction(tx =>
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
  await db.transaction(tx =>
    tx.delete(cart_items).where(and(eq(cart_items.studentId, me.id), eq(cart_items.offeringId, offeringId)))
  );
  return { ok: true };
}

/** خالی کردن کامل سبد انتخاب واحد (حذف همه) */
export async function clearCartAction() {
  const { user, me } = await ctx();
  await db.transaction(tx =>
    tx.delete(cart_items).where(eq(cart_items.studentId, me.id))
  );
  return { ok: true };
}

/** چیدمان هوشمند و خودکار دروس ترم بر اساس چارت، ظرفیت و کنترل عدم تداخل زمانی و امتحانی */
export async function autoFillCartFromChartAction(): Promise<{
  ok: boolean;
  count: number;
  units: number;
  message: string;
  conflictsResolved?: number;
}> {
  const { user, me, term } = await ctx();
  if (!term) return { ok: false, count: 0, units: 0, message: 'ترم جاری فعال نیست.' };

  // ۱. پاکسازی سبد قبلی جهت چیدمان تازه و بدون تداخل
  await db.transaction(tx =>
    tx.delete(cart_items).where(eq(cart_items.studentId, me.id))
  );

  // ۲. دریافت تمام ارائه‌های فعال ترم جاری
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

  // ۳. دریافت زمان‌بندی کلاس‌ها و امتحانات ارائه‌ها
  const allScheds = await db.select().from(schedules);
  const schedMap = new Map<
    number,
    {
      classes: { dayOfWeek: number; startTime: string; endTime: string }[];
      exam?: { examDate: string; startTime: string; endTime: string };
    }
  >();

  for (const s of allScheds) {
    if (!schedMap.has(s.offeringId)) schedMap.set(s.offeringId, { classes: [] });
    const entry = schedMap.get(s.offeringId)!;
    if (s.scheduleType === 'CLASS' && s.dayOfWeek != null) {
      entry.classes.push({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime });
    } else if (s.scheduleType === 'EXAM' && s.examDate) {
      entry.exam = { examDate: String(s.examDate), startTime: s.startTime, endTime: s.endTime };
    }
  }

  // ۴. دسته‌بندی ارائه‌ها بر اساس کد/شناسه درس (جهت مدیریت چندگروهی)
  const byCourse = new Map<number, typeof offerings>();
  for (const off of offerings) {
    // فیلتر عدم درج پایان‌نامه ارشد برای دانشجوی کارشناسی
    if (me.degreeLevelId === 1 && (off.code.startsWith('21') || off.title.includes('پایان‌نامه'))) continue;
    if (off.title.includes('معرفی به استاد') || off.title.includes('مطالعه فردی')) continue;

    if (!byCourse.has(off.courseId)) byCourse.set(off.courseId, []);
    byCourse.get(off.courseId)!.push(off);
  }

  // ۵. الگوریتم انتخاب بهینه گروه‌ها بدون تداخل و با اولویت ظرفیت خالی
  const chosenOfferings: typeof offerings = [];
  let totalUnits = 0;
  let conflictsAvoidedCount = 0;
  const maxUnitsLimit = 20;

  for (const [courseId, groups] of byCourse.entries()) {
    const courseUnits = Number(groups[0].units || 0);
    if (totalUnits + courseUnits > maxUnitsLimit) continue;

    // رتبه‌بندی گروه‌ها بر اساس:
    // ۱) عدم تداخل کلاسی و امتحانی با دروس انتخاب‌شده تاکنون
    // ۲) داشتن ظرفیت خالی (enrolled < capacity)
    // ۳) شماره گروه کمتر
    let bestGroup: typeof groups[0] | null = null;
    let bestScore = -9999;

    for (const grp of groups) {
      const s = schedMap.get(grp.id);
      const hasCap = grp.enrolledCount < grp.capacity;
      let hasClassConflict = false;
      let hasExamConflict = false;

      // بررسی تداخل با دروس از قبل انتخاب‌شده
      for (const chosen of chosenOfferings) {
        const chSched = schedMap.get(chosen.id);
        if (!chSched || !s) continue;

        // بررسی تداخل کلاسی
        for (const c1 of s.classes) {
          for (const c2 of chSched.classes) {
            if (c1.dayOfWeek === c2.dayOfWeek && timeOverlap(c1.startTime, c1.endTime, c2.startTime, c2.endTime)) {
              hasClassConflict = true;
            }
          }
        }

        // بررسی تداخل امتحانی
        if (s.exam && chSched.exam && s.exam.examDate === chSched.exam.examDate) {
          if (timeOverlap(s.exam.startTime, s.exam.endTime, chSched.exam.startTime, chSched.exam.endTime)) {
            hasExamConflict = true;
          }
        }
      }

      let score = 0;
      if (hasCap) score += 100;
      if (!hasClassConflict) score += 500;
      else score -= 500;
      if (!hasExamConflict) score += 500;
      else score -= 500;

      // ترجیح گروه ۱ اگر شرایط یکسان باشد
      score -= grp.groupNumber * 2;

      if (score > bestScore) {
        bestScore = score;
        bestGroup = grp;
        if ((hasClassConflict || hasExamConflict) && groups.length > 1) {
          conflictsAvoidedCount++;
        }
      }
    }

    // اگر گروه بدون تداخل یافت شد، اضافه می‌شود
    if (bestGroup && bestScore > 0) {
      chosenOfferings.push(bestGroup);
      totalUnits += courseUnits;
    }
  }

  // ۶. ذخیره در سبد دانشجو
  const now = new Date();
  for (const off of chosenOfferings) {
    await db.transaction(tx =>
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
    conflictsResolved: conflictsAvoidedCount,
    message: `چیدمان هوشمند با موفقیت انجام شد: ${chosenOfferings.length} درس (${totalUnits} واحد) با بررسی دقیق ظرفیت و انتخاب گروه‌های فاقد تداخل کلاسی و امتحانی در سبد شما چیده شد.`,
  };
}

/** ورود به اتاق انتظار — پاسخ فوری با شمارهٔ نوبت (§۱۰۱۶ + §۶۹۰۶) */
export async function submitCartAction(acceptSameDayRisk = false): Promise<{ queued: boolean; ticketId: string; position: number; limited?: boolean }> {
  const { user, me } = await ctx();
  ensureWorker(); // کارگر صف در همین فرایند Next فعال است

  // سپر نرخ (§۲۰۷۷): بیش از ۵ درخواست ثبت در ثانیه → رد سریع
  if (!(await rateLimitSubmit(user.id))) {
    return { queued: false, ticketId: '', position: 0, limited: true };
  }

  // فاز ۱۰: اگر کاربر دو امتحانِ هم‌روز (شیفت‌های متفاوت) را با «تأیید عواقب» پذیرفت،
  // همین پرچم در بلیت صف می‌ماند تا در کارگر صف، در ردیف ثبت‌نام ذخیره شود.
  const { ticket, position } = await enqueueSubmit(user.id, me.id, acceptSameDayRisk);
  return { queued: true, ticketId: ticket.id, position };
}

/** پیش‌نمایش تداخل امتحانی سبد (قبل از ثبت): HARD = قطعی (همان روز + هم‌ساعت)، SOFT = نرم (هم‌روز، ساعت متفاوت) */
export async function previewExamConflictsAction(): Promise<{
  ok: boolean;
  hard: { courseCode: string; title: string; examDate: string; startTime: string; withCourse: string }[];
  soft: { courseCode: string; title: string; examDate: string; startTime: string; withCourse: string }[];
}> {
  const { user, me, term } = await ctx();
  if (!term) return { ok: false, hard: [], soft: [] };
  const cart = await db.select().from(cart_items).where(eq(cart_items.studentId, me.id));
  const cartIds = cart.map(c => c.offeringId);
  const own = await db
    .select({ offeringId: enrollments.offeringId })
    .from(enrollments)
    .where(and(eq(enrollments.studentId, me.id), inArray(enrollments.status, ['REGISTERED', 'PENDING_COUNCIL'])));
  const allIds = [...new Set([...cartIds, ...own.map(o => o.offeringId)])];
  if (allIds.length < 2) return { ok: true, hard: [], soft: [] };

  const rows = await db
    .select({
      offeringId: schedules.offeringId,
      courseCode: courses.code,
      title: courses.title,
      examDate: schedules.examDate,
      startTime: schedules.startTime,
      endTime: schedules.endTime,
    })
    .from(schedules)
    .innerJoin(course_offerings, eq(course_offerings.id, schedules.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(and(eq(schedules.scheduleType, 'EXAM'), sql`${schedules.examDate} is not null`, inArray(schedules.offeringId, allIds)));

  const hard: { courseCode: string; title: string; examDate: string; startTime: string; withCourse: string }[] = [];
  const soft: { courseCode: string; title: string; examDate: string; startTime: string; withCourse: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      if (!a.examDate || String(a.examDate) !== String(b.examDate)) continue;
      const aS = String(a.startTime).slice(0, 5), aE = String(a.endTime).slice(0, 5);
      const bS = String(b.startTime).slice(0, 5), bE = String(b.endTime).slice(0, 5);
      const info = { courseCode: a.courseCode, title: a.title, examDate: String(a.examDate), startTime: aS, withCourse: b.courseCode };
      if (aS < bE && bS < aE) hard.push(info);
      else soft.push(info);
    }
  }
  return { ok: true, hard, soft };
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
  const [ins] = await db.transaction(tx =>
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
    const [req] = await db.transaction(tx =>
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
    if (req && ins) await db.transaction(tx => tx.update(enrollments).set({ workflowRequestId: req.id }).where(eq(enrollments.id, ins.id)));
  }

  await db.transaction(tx =>
    tx.delete(cart_items).where(and(eq(cart_items.studentId, me.id), eq(cart_items.offeringId, offeringId)))
  );
  await db.transaction(tx =>
    tx.insert(notifications).values({
      userId: user.id,
      eventCode: 'COUNCIL_REFERRAL',
      payload: JSON.stringify({ course: o?.title ?? '', termId: term.id }),
    })
  );
  return { ok: true };
}
