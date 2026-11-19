'use server';

// حذف درس → رویداد ارتقای خودکار لیست انتظار — سند §۱۰۱۸–۱۰۲۶:
// «ظرفیت به ۲۹ برنمی‌گردد! سیستم بلافاصله رویدادی شلیک می‌کند، نفر اول لیست
//  انتظار REGISTERED می‌شود و پیام «درس X برای شما ثبت قطعی شد» می‌گیرد.»
import { and, asc, eq, sql, gte, lte, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { academic_terms, course_offerings, course_rules, courses, enrollments, notifications, students, users } from '@/db/schema';
import { withUserRls } from '@/db';
import { getStudentByUser, requireRole } from '@/lib/auth';
import { releaseSeat, takeSeat } from '@/lib/waitingRoom';
import { getBool } from '@/lib/settings';
import { assertEnrollmentWrite } from '@/lib/enrollment-window';
import { recountOffering } from '@/lib/enrollment-count';
import { assertFinancialClearance } from '@/lib/enrollment-financial-gate';
import { evaluateStudentRegulationStatus, parseUnits } from '@/lib/regulations-engine';
import { appendAudit } from '@/lib/audit';
import { assertAddDropBudget } from '@/lib/add-drop-limit';

/** برگ درخت منطقی هم‌نیاز/پیش‌نیاز — {"operator":"AND"|"OR","conditions":[{course:"code"},...]} */
type CoreqCond = { course?: string; operator?: string; conditions?: CoreqCond[] };

/** آیا درخت هم‌نیازِ درس وابسته، بدون درسِ در حالِ حذف همچنان برقرار است؟
 *  برگ‌های غیردرسی (واحد پاس‌کرده/حداقل ترم) مانع حذف نیستند و برقرار فرض می‌شوند. */
function coreqStillSatisfied(node: CoreqCond | null | undefined, droppedCode: string, registeredCodes: Set<string>): boolean {
  if (!node || typeof node !== 'object') return true;
  const conds = Array.isArray(node.conditions) ? node.conditions : [];
  const op = (node.operator ?? 'AND').toUpperCase();
  const results = conds.map(c => {
    if (c.operator) return coreqStillSatisfied(c, droppedCode, registeredCodes);
    if (c.course) return c.course !== droppedCode && registeredCodes.has(c.course);
    return true; // برگ غیردرسی
  });
  return op === 'OR' ? results.some(Boolean) : results.every(Boolean);
}

/** سقف تعداد نامزدِ لیست انتظار که در هر فراخوانی گیت‌ها رویشان اجرا می‌شود (کنترل هزینه) */
const WAITLIST_MAX_CANDIDATES = 5;

/** گیت‌های ارتقای لیست انتظار — همان قواعد «ثبت تازه»: وضعیت ACTIVE،
 *  تسویهٔ مالی، و سقف واحد مؤثر (ظرفیت داخل تراکنش و با قفل سطر بررسی می‌شود).
 *  نامزدِ گیت‌خورده حذف یا تنزل نمی‌کند؛ فقط رد می‌شود و ترتیب لیست دست‌نخورده می‌ماند. */
async function waitlistGateCheck(opts: {
  studentId: number;
  termId: number;
  courseUnits: string | number | null;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  // الف) فقط دانشجوی ACTIVE
  const [stu] = await db
    .select({ status: students.status, universityId: students.universityId })
    .from(students)
    .where(eq(students.id, opts.studentId))
    .limit(1);
  if (!stu) return { ok: false, reason: 'پروندهٔ دانشجویی یافت نشد.' };
  if (stu.status !== 'ACTIVE') {
    return { ok: false, reason: 'وضعیت پروندهٔ دانشجویی شما فعال نیست؛ ارتقا از لیست انتظار انجام نشد.' };
  }
  // ب) گیت تسویهٔ مالی — همان قاعدهٔ ثبت نهایی
  const fin = await assertFinancialClearance(opts.studentId, opts.termId, stu.universityId);
  if (!fin.ok) return { ok: false, reason: fin.error };
  // د) سقف واحد مؤثر از موتور آیین‌نامه؛ در صورت خطا سقف پیش‌فرض هم‌خوان با مسیر ثبت
  let cap = 20;
  try {
    cap = (await evaluateStudentRegulationStatus(opts.studentId, opts.termId)).effectiveMaxUnits;
  } catch { /* موتور آیین‌نامه در دسترس نبود → سقف پیش‌فرض */ }
  const [cur] = await db
    .select({ taken: sql<number>`coalesce(sum(${courses.units}), 0)::float8` })
    .from(enrollments)
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(and(
      eq(enrollments.studentId, opts.studentId),
      eq(course_offerings.termId, opts.termId),
      eq(enrollments.status, 'REGISTERED'),
    ));
  const currentUnits = Number(cur?.taken ?? 0);
  if (currentUnits + parseUnits(opts.courseUnits) > cap) {
    return {
      ok: false,
      reason: `با افزودن این درس، سقف مجاز انتخاب واحد (${cap.toLocaleString('fa-IR')} واحد) در این ترم رد می‌شود.`,
    };
  }
  return { ok: true };
}

/** ارتقای خودکار لیست انتظار پس از آزاد شدن صندلی.
 *  نامزدها به ترتیب لیست بررسی می‌شوند (حداکثر WAITLIST_MAX_CANDIDATES نفر)؛
 *  نخستین نامزدی که همهٔ گیت‌ها را بگذرد REGISTERED می‌شود. نامزدهای گیت‌خورده
 *  روی لیست می‌مانند و «waitlist_promotion_blocked» برایشان ثبت می‌شود. */
async function promoteFromWaitlist(opts: {
  actingUserId: number;
  offeringId: number;
  termId: number;
  courseTitle: string;
}): Promise<string | null> {
  const candidates = await db
    .select({ id: enrollments.id, studentId: enrollments.studentId })
    .from(enrollments)
    .where(and(eq(enrollments.offeringId, opts.offeringId), eq(enrollments.status, 'WAITLISTED')))
    .orderBy(asc(enrollments.waitlistPosition))
    .limit(WAITLIST_MAX_CANDIDATES);
  if (candidates.length === 0) return null;

  const [off] = await db
    .select({ units: courses.units })
    .from(course_offerings)
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(eq(course_offerings.id, opts.offeringId));

  for (const cand of candidates) {
    const gate = await waitlistGateCheck({
      studentId: cand.studentId,
      termId: opts.termId,
      courseUnits: off?.units ?? null,
    });
    if (!gate.ok) {
      // گیت‌خورده: روی لیست می‌ماند، مطلع می‌شود و ردیف audit ثبت می‌گردد
      await db.transaction(async tx => {
        await appendAudit(tx, {
          actorUserId: opts.actingUserId,
          action: 'waitlist_promotion_blocked',
          entityType: 'enrollments',
          entityId: cand.id,
          details: JSON.stringify({
            offeringId: opts.offeringId, termId: opts.termId, studentId: cand.studentId, reason: gate.reason,
          }),
        });
        const [blockedStu] = await tx
          .select({ userId: students.userId })
          .from(students)
          .where(eq(students.id, cand.studentId))
          .limit(1);
        if (blockedStu) {
          await tx.insert(notifications).values({
            userId: blockedStu.userId,
            eventCode: 'WAITLIST_PROMOTION_BLOCKED',
            payload: JSON.stringify({
              course: opts.courseTitle, offeringId: opts.offeringId, reason: gate.reason,
            }),
          });
        }
      });
      continue;
    }

    // تراکنش READ COMMITTED: قفل سطر ارائه + بازبینی ظرفیت برای جلوگیری از مسابقه
    const promoted = await db.transaction(async tx => {
      const [offRow] = await tx
        .select({ capacity: course_offerings.capacity, enrolledCount: course_offerings.enrolledCount })
        .from(course_offerings)
        .where(eq(course_offerings.id, opts.offeringId))
        .for('update');
      if (!offRow) return null;
      if (offRow.enrolledCount >= offRow.capacity) return null; // صندلی در فاصلهٔ بین پر شده

      await tx.update(enrollments)
        .set({ status: 'REGISTERED', waitlistPosition: null })
        .where(eq(enrollments.id, cand.id));
      // شیفت نفرات بعدی لیست انتظار یک نفر بالا (ترتیب نسبی حفظ می‌شود)
      await tx.update(enrollments)
        .set({ waitlistPosition: sql`${enrollments.waitlistPosition} - 1` })
        .where(and(eq(enrollments.offeringId, opts.offeringId), eq(enrollments.status, 'WAITLISTED')));
      await tx.update(course_offerings)
        .set({ enrolledCount: sql`${course_offerings.enrolledCount} + 1` })
        .where(eq(course_offerings.id, opts.offeringId));

      const [promotedStu] = await tx
        .select({ userId: students.userId, firstName: users.firstName })
        .from(students).innerJoin(users, eq(users.id, students.userId))
        .where(eq(students.id, cand.studentId))
        .limit(1);

      await appendAudit(tx, {
        actorUserId: opts.actingUserId,
        action: 'waitlist_promotion',
        entityType: 'enrollments',
        entityId: cand.id,
        details: JSON.stringify({
          offeringId: opts.offeringId, termId: opts.termId, studentId: cand.studentId,
        }),
      });
      return promotedStu ?? null;
    });

    if (!promoted) continue; // ظرفیت بین‌راهی پر شد → نامزد بعدی
    await takeSeat(opts.offeringId);
    await recountOffering(opts.offeringId);
    // §۱۰۲۶: اطلاع‌رسانی لحظه‌ای — «درس X برای شما ثبت قطعی شد.»
    await db.insert(notifications).values({
      userId: promoted.userId,
      eventCode: 'WAITLIST_PROMOTED',
      payload: JSON.stringify({ course: opts.courseTitle, offeringId: opts.offeringId }),
    });
    return promoted.firstName ?? null;
  }
  return null;
}

export async function dropCourseAction(enrollmentId: number): Promise<{ ok: boolean; error?: string; promotedTo?: string | null }> {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  if (!me) return { ok: false, error: 'پروندهٔ دانشجویی یافت نشد.' };

  const [row] = await db
    .select({ id: enrollments.id, offeringId: enrollments.offeringId, status: enrollments.status, title: courses.title, code: courses.code, termId: course_offerings.termId })
    .from(enrollments)
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .innerJoin(academic_terms, eq(academic_terms.id, course_offerings.termId))
    .where(and(eq(enrollments.id, enrollmentId), eq(enrollments.studentId, me.id)));
  if (!row) return { ok: false, error: 'ثبت‌نام یافت نشد.' };
  if (row.status !== 'REGISTERED') return { ok: false, error: 'فقط دروس ثبت‌شده قابل حذف‌اند.' };

  // ⏳ گیت سروری «حذف و اضافه» — فقط بازهٔ addDrop (بدون پرچم ترم/کلید سراسری)
  const gate = await assertEnrollmentWrite(row.termId, 'DROP');
  if (!gate.ok) return { ok: false, error: gate.error };

  // 🚫 سقف «حذف و اضافه دو درس» — تنظیم ADD_DROP_MAX_CHANGES (۰ = بدون سقف)
  const budget = await assertAddDropBudget(me.id, row.termId);
  if (!budget.ok) return { ok: false, error: budget.error };

  // 🚫 ترتیب حذف هم‌نیاز: اگر درسِ در حالِ حذف، هم‌نیازِ درسِ ثبت‌شدهٔ دیگر همین ترم است،
  //    ابتدا باید درس وابسته حذف شود — حذف هم‌نیاز از زیرِ درسِ ثبت‌شده مجاز نیست.
  if (row.code) {
    const currentRows = await db
      .select({ courseId: courses.id, code: courses.code, title: courses.title })
      .from(enrollments)
      .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
      .innerJoin(courses, eq(courses.id, course_offerings.courseId))
      .where(and(
        eq(enrollments.studentId, me.id),
        eq(course_offerings.termId, row.termId),
        inArray(enrollments.status, ['REGISTERED', 'PENDING_COUNCIL']),
      ));
    const otherRows = currentRows.filter(r => r.code !== row.code);
    if (otherRows.length > 0) {
      // مجموعهٔ کدهای ثبت‌شدهٔ همین ترم (بدون درسِ در حالِ حذف) برای ارزیابی درخت‌ها
      const registeredCodes = new Set(otherRows.map(r => r.code));
      const candidateRules = await db
        .select({ courseId: course_rules.courseId, tree: course_rules.logicTree, title: courses.title })
        .from(course_rules)
        .innerJoin(courses, eq(courses.id, course_rules.courseId))
        .where(and(
          eq(course_rules.ruleType, 'COREQ'),
          inArray(course_rules.courseId, otherRows.map(r => r.courseId)),
          sql`${course_rules.logicTree} ilike ${'%' + row.code + '%'}`,
        ));
      for (const rule of candidateRules) {
        let tree: CoreqCond | null = null;
        try { tree = JSON.parse(rule.tree) as CoreqCond; } catch { /* درخت نامعتبر → نادیده */ }
        if (!tree) continue;
        if (!coreqStillSatisfied(tree, row.code, registeredCodes)) {
          return {
            ok: false,
            error: `ابتدا درس وابسته «${rule.title}» را حذف کنید؛ حذف «${row.title}» بدون آن مجاز نیست.`,
          };
        }
      }
    }
  }

  // ۱) حذف (ردیف خود دانشجو → تحت RLS §۲۱۷۰) + آزادسازی صندلی
  await withUserRls(user.id, tx => tx.update(enrollments).set({ status: 'DROPPED' }).where(and(eq(enrollments.id, row.id), eq(enrollments.studentId, me.id))));
  // شمارندهٔ صندلی از یک منبع واحد بازمحاسبه می‌شود (نه ±۱ دستی)
  await recountOffering(row.offeringId);
  await releaseSeat(row.offeringId);

  // ۲) رویداد ارتقا (اقدام سیستم روی ردیف «دانشجوی دیگر» → نقش مالک): نخستین نامزدِ واجد شرایط لیست انتظار
  const promotedName = await promoteFromWaitlist({
    actingUserId: user.id,
    offeringId: row.offeringId,
    termId: row.termId,
    courseTitle: row.title,
  });

  await withUserRls(user.id, tx => tx.insert(notifications).values({
    userId: user.id, eventCode: 'COURSE_DROPPED',
    payload: JSON.stringify({ course: row.title, promoted: promotedName }),
  }));
  revalidatePath('/student');
  return { ok: true, promotedTo: promotedName };
}

/** حذف اضطراری (Emergency Drop) — پس از مهلت حذف و اضافه
 *  فقط برای دروسی که emergencyWithdrawal=1 در جدول courses دارند
 *  وضعیت در کارنامه: DROPPED به‌همراه پرچم emergencyWithdrawal=1 (وضعیت جداگانه‌ای وجود ندارد)
 */
export async function emergencyDropAction(enrollmentId: number): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  if (!me) return { ok: false, error: 'پروندهٔ دانشجویی یافت نشد.' };

  // کلید دستی مدیر: «حذف اضطراری» سراسری خاموش؟
  const ewOpen = await getBool('EMERGENCY_WITHDRAW_OPEN');
  if (!ewOpen) return { ok: false, error: 'حذف اضطراری در حال حاضر غیرفعال است؛ با ادارهٔ آموزش هماهنگ کنید.' };

  const [row] = await db
    .select({
      id: enrollments.id,
      offeringId: enrollments.offeringId,
      status: enrollments.status,
      title: courses.title,
      courseEmergencyWithdrawal: courses.emergencyWithdrawal,
      addDropEndDate: academic_terms.addDropEndDate,
      termId: course_offerings.termId,
    })
    .from(enrollments)
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .innerJoin(academic_terms, eq(academic_terms.id, course_offerings.termId))
    .where(and(eq(enrollments.id, enrollmentId), eq(enrollments.studentId, me.id)));

  if (!row) return { ok: false, error: 'ثبت‌نام یافت نشد.' };
  if (row.status !== 'REGISTERED') return { ok: false, error: 'فقط دروس ثبت‌شده قابل حذف اضطراری‌اند.' };
  if (!row.courseEmergencyWithdrawal) return { ok: false, error: 'این درس مجوز حذف اضطراری ندارد.' };

  // بررسی پایان مهلت حذف و اضافه
  if (row.addDropEndDate && new Date() <= new Date(row.addDropEndDate)) {
    return { ok: false, error: 'هنوز در مهلت حذف و اضافه هستید؛ از حذف معمولی استفاده کنید.' };
  }

  // حذف اضطراری: وضعیت DROPPED + emergencyWithdrawal=1
  await withUserRls(user.id, tx => tx.update(enrollments)
    .set({ status: 'DROPPED', emergencyWithdrawal: 1 })
    .where(and(eq(enrollments.id, row.id), eq(enrollments.studentId, me.id))));
  await db.update(course_offerings).set({ enrolledCount: sql`GREATEST(${course_offerings.enrolledCount} - 1, 0)` }).where(eq(course_offerings.id, row.offeringId));
  await releaseSeat(row.offeringId);
  await recountOffering(row.offeringId);

  // ارتقای لیست انتظار (مشابه حذف معمولی) — با همان گیت‌های وضعیت/مالی/ظرفیت/سقف واحد
  const promotedName = await promoteFromWaitlist({
    actingUserId: user.id,
    offeringId: row.offeringId,
    termId: row.termId,
    courseTitle: row.title,
  });

  await withUserRls(user.id, tx => tx.insert(notifications).values({
    userId: user.id, eventCode: 'EMERGENCY_DROP',
    payload: JSON.stringify({ course: row.title, promoted: promotedName }),
  }));
  revalidatePath('/student');
  return { ok: true };
}

/** Wrapper برای فراخوانی از طریق <form action={...}> در Server Component */
export async function emergencyDropFormAction(formData: FormData): Promise<void> {
  const enrollmentId = Number(formData.get('enrollmentId'));
  if (!enrollmentId) return;
  await emergencyDropAction(enrollmentId);
}
