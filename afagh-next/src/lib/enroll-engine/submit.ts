import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms, cart_items, course_offerings, courses,
  enrollments, financial_clearances, financial_terms, notifications, schedules, students,
} from '@/db/schema';
import { withUserRls } from '@/db';
import { atomicSeat, nextWaitlistPosition, releaseSeat, warmupCapacities } from '../waitingRoom';
import { evaluateStudentRegulationStatus, parseUnits } from '../regulations-engine';
import { buildPrereqContext, evaluateLogicTree } from './prereqs';

// ═══ خط لولهٔ اعتبارسنجی — سند §۱۰۰۸ ═══
// هر درخواست انتخاب واحد از ۵ فیلتر می‌گذرد:
//   ۱. مالی (Financial Gate)                              §۱۰۰۸-۱
//   ۲. ظرفیت — عملیات اتمیک در Redis (Atomic Operation)     §۱۰۱۴
//      + ۲ب: تکرار همان درس در ترم (خطای سخت)
//   ۳. سقف واحد (Regulation Engine)                        §۱۰۱۰
//   ۴. پیش‌نیاز/هم‌نیاز — درخت منطقی logic_tree (خطای نرم)  §۱۰۱۲
//   ۵. تداخل زمانی کلاس و امتحان (خطای نرم → ارجاع کمیسیون) §۱۰۱۲
const MAX_UNITS = 20;

export type SubmitResult = {
  ok: boolean;
  registered: string[];
  waitlisted: string[];
  hardErrors: string[];
  softErrors: { offeringId: number; msg: string }[];
};

function overlaps(aS: string, aE: string, bS: string, bE: string, aD: number | null, bD: number | null) {
  if (aD == null || bD == null || aD !== bD) return false;
  return aS < bE && bS < aE;
}

function examOverlaps(a: { examDate: string | null; startTime: string; endTime: string }, b: { examDate: string | null; startTime: string; endTime: string }) {
  if (!a.examDate || !b.examDate || a.examDate !== b.examDate) return false;
  return a.startTime.slice(0, 5) < b.endTime.slice(0, 5) && b.startTime.slice(0, 5) < a.endTime.slice(0, 5);
}

/**
 * پردازش یک آیتم صف ثبت نهایی — بدون context درخواست (در کارگر صف اجرا می‌شود).
 * طبق §۶۹۰۶ فقط نتیجهٔ نهایی در PostgreSQL ثبت می‌شود؛ ظرفیت زنده در Redis می‌ماند.
 */
export async function processQueuedSubmit(userId: number, studentId: number, acceptSameDayRisk = false): Promise<SubmitResult> {
  const out: SubmitResult = { ok: true, registered: [], waitlisted: [], hardErrors: [], softErrors: [] };

  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1));
  if (!term || !term.isEnrollmentOpen) { out.ok = false; out.hardErrors.push('پنجرهٔ انتخاب واحد بسته است.'); return out; }

  // ── فیلتر ۱: مالی (§۱۰۰۸) + وضعیت دانشجو ──
  const [stu] = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
  if (!stu) { out.ok = false; out.hardErrors.push('پروندهٔ دانشجویی یافت نشد.'); return out; }
  if (stu.status !== 'ACTIVE') {
    out.ok = false;
    out.hardErrors.push(stu.status === 'BLOCKED_COMMISSION'
      ? 'حساب شما توسط کمیسیون موارد خاص مسدود است.'
      : 'وضعیت دانشجو برای انتخاب واحد فعال نیست (' + stu.status + ').');
  }

  // بررسی تسویه‌حساب مالی: ابتدا ترم مالی، سپس ترم تحصیلی
  // اگر financial_terms وجود دارد از آن استفاده می‌کنیم (سازگاری با سما)
  let finTermId: number | null = null;
  const finTerms = await db.select().from(financial_terms)
    .where(and(eq(financial_terms.universityId, stu.universityId ?? 0), eq(financial_terms.isActive, 1)))
    .orderBy(sql`sort_order ASC NULLS LAST`);
  if (finTerms.length > 0) {
    // ترم مالی جاری را پیدا می‌کنیم (بر اساس sortOrder یا termCode)
    finTermId = finTerms[0].id;
  }

  const clearanceTermId = finTermId ?? term.id;
  const [fin] = await db.select().from(financial_clearances)
    .where(and(eq(financial_clearances.studentId, studentId), eq(financial_clearances.termId, clearanceTermId)));
  
  if (!fin || !fin.isCleared) { 
    out.ok = false; 
    out.hardErrors.push('تسویه‌حساب مالی این ترم ثبت نشده است. برای انتخاب واحد باید بدهکاری‌تان تسویه شود.'); 
  } else {
    // بررسی مانده بدهی: اگر بدهکار است و بیش از آستانه مجاز، انتخاب واحد قفل می‌شود
    const thresholdRaw = await import('../settings').then(m => m.getSetting('ENROLLMENT_DEBT_THRESHOLD'));
    const debtThreshold = Math.max(0, Number(thresholdRaw ?? 0));
    if (debtThreshold > 0) {
      const balResult = await db.execute(sql`
        SELECT COALESCE(SUM(
          CASE WHEN "transactionType" IN ('CHARGE','TUITION_CHARGE') THEN amount
               WHEN "transactionType" IN ('PAYMENT','CREDIT','DISCOUNT','SPONSOR','LOAN','SUBJECT_FEE_DEDUCTIVE') THEN -amount
               ELSE 0 END
        ), 0) AS balance
        FROM student_ledger
        WHERE "studentId" = ${studentId} AND ("termId" = ${clearanceTermId} OR "financialTermId" = ${clearanceTermId})
      `);
      const balance = Number(balResult.rows[0]?.balance ?? 0);
      if (balance > debtThreshold) {
        out.ok = false;
        out.hardErrors.push(`مانده بدهکاری شما (${balance.toLocaleString('fa-IR')} ریال) بیش از حد مجاز (${debtThreshold.toLocaleString('fa-IR')} ریال) است. ابتدا بدهکاری را کاهش دهید.`);
      }
    }
  }

  const cart = await db.select().from(cart_items).where(eq(cart_items.studentId, studentId));
  if (cart.length === 0) { out.ok = false; out.hardErrors.push('سبد خالی است.'); return out; }

  const ids = cart.map(c => c.offeringId);
  const offs = await db
    .select({ id: course_offerings.id, courseId: course_offerings.courseId, code: courses.code, title: courses.title, units: courses.units, capacity: course_offerings.capacity, enrolled: course_offerings.enrolledCount, waitCap: course_offerings.waitlistCapacity })
    .from(course_offerings).innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(inArray(course_offerings.id, ids));

  // دروس همین ترم که قبلاً ثبت شده‌اند (تکراری نگیریم)
  const current = await db
    .select({ offeringId: enrollments.offeringId, courseId: course_offerings.courseId, units: courses.units })
    .from(enrollments).innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(and(eq(enrollments.studentId, studentId), eq(course_offerings.termId, term.id), inArray(enrollments.status, ['REGISTERED', 'PENDING_COUNCIL'])));
  const already = new Set(current.map(c => c.offeringId));

  // ── فیلتر ۲ب: تکرار همان درس در ترم (خطای سخت — وفادار به فاز صفر) ──
  const takenCourseIds = new Set(current.map(c => c.courseId));
  for (const o of offs) {
    if (already.has(o.id)) continue;
    if (takenCourseIds.has(o.courseId)) {
      out.hardErrors.push('درس «' + o.title + '» قبلاً در این ترم (در گروهی دیگر) برای شما ثبت شده است.');
      out.ok = false;
    }
  }

  // ── فیلتر ۳: سقف واحد بر اساس موتور آیین‌نامه‌ها (Regulation Engine) ──
  let allowedMaxUnits = MAX_UNITS;
  try {
    const regStatus = await evaluateStudentRegulationStatus(studentId, term.id);
    allowedMaxUnits = regStatus.effectiveMaxUnits;
  } catch (err) {
    console.warn('Failed to evaluate regulation status, falling back to default max units:', err);
  }

  // سقف روی «جمع ترم» اعمال می‌شود: ثبت‌شدهٔ قبلی + سبد جدید (نه فقط سبد جدید)
  const currentUnits = current.reduce((s, c) => s + parseUnits(c.units), 0);
  const newUnits = offs.filter(o => !already.has(o.id)).reduce((s, o) => s + Number(o.units), 0);
  const totalUnits = currentUnits + newUnits;
  if (totalUnits > allowedMaxUnits) {
    out.ok = false;
    out.hardErrors.push(`سقف مجاز انتخاب واحد طبق آیین‌نامه آموزشی (${allowedMaxUnits} واحد) رعایت نشده است (ثبت‌شده: ${currentUnits} + جدید: ${newUnits} = مجموع ${totalUnits} واحد).`);
  }

  // ── فیلتر ۵: تداخل کلاس (خطای نرم) ──
  const cartSched = await db.select().from(schedules).where(inArray(schedules.offeringId, ids));
  const regIds = [...already];
  const regSched = regIds.length ? await db.select().from(schedules).where(inArray(schedules.offeringId, regIds)) : [];
  const cartSet = new Set(ids);
  const classClash = new Set<number>();
  const classOnly = (s: typeof cartSched[number]) => s.scheduleType !== 'EXAM';
  for (const a of cartSched.filter(classOnly)) for (const b of [...cartSched, ...regSched].filter(classOnly)) {
    if (a.offeringId === b.offeringId) continue;
    if (!overlaps(a.startTime.slice(0, 5), a.endTime.slice(0, 5), b.startTime.slice(0, 5), b.endTime.slice(0, 5), a.dayOfWeek, b.dayOfWeek)) continue;
    classClash.add(a.offeringId);
    if (cartSet.has(b.offeringId)) classClash.add(b.offeringId);
  }

  // ── فیلتر ۵: تداخل امتحان (فاز ۱۰ — سند طراحی سامانه: تقسیم HARD/SOFT) ──
  //   HARD: همان روز و ساعت هم‌پوشان → ممنوع قطعی (حتی با تأییدیه ثبت نمی‌شود)
  //   SOFT: همان روز و ساعتِ متفاوت → هشدار + تأییدیهٔ دیجیتال (hasAcceptedSameDayExam)
  const examOnly = (s: typeof cartSched[number]) => s.scheduleType === 'EXAM';
  const examHard = new Set<number>();
  const examSoft = new Set<number>();
  const examDateOf = new Map<number, string | null>();
  const allExam = [...cartSched, ...regSched].filter(examOnly);
  for (const a of cartSched.filter(examOnly)) {
    examDateOf.set(a.offeringId, a.examDate);
    for (const b of allExam) {
      if (a.offeringId === b.offeringId) continue;
      if (!a.examDate || a.examDate !== b.examDate) continue;
      if (examOverlaps(a, b)) {
        examHard.add(a.offeringId);
        if (cartSet.has(b.offeringId)) examHard.add(b.offeringId);
      } else {
        examSoft.add(a.offeringId);
        if (cartSet.has(b.offeringId)) examSoft.add(b.offeringId);
      }
    }
  }
  for (const o of offs) {
    if (already.has(o.id)) continue;
    if (classClash.has(o.id)) {
      out.softErrors.push({ offeringId: o.id, msg: 'تداخل زمانی: «' + o.title + '» با کلاس دیگر.' });
    } else if (examHard.has(o.id)) {
      out.hardErrors.push('تداخل قطعی امتحان: «' + o.title + '» با درس دیگری در ' + (examDateOf.get(o.id) ?? 'تاریخ') + ' و همان ساعت امتحان دارد.')
      out.ok = false;
    } else if (examSoft.has(o.id) && !acceptSameDayRisk) {
      out.softErrors.push({
        offeringId: o.id,
        msg: 'تداخل نرم امتحان: «' + o.title + '» با امتحان دیگر در ' + (examDateOf.get(o.id) ?? '') + ' (ساعت متفاوت). برای ثبت، تأییدیهٔ دیجیتال عواقب لازم است.',
      });
    }
  }

  // ── فیلتر ۴: پیش‌نیاز — درخت منطقی (§۱۰۱۲، خطای نرم) ──
  const prereq = await buildPrereqContext(studentId);
  for (const o of offs) {
    if (already.has(o.id)) continue;
    const rule = prereq.ruleByCourse.get(o.courseId);
    if (!rule) continue;
    const ev = evaluateLogicTree(rule, prereq.passed);
    if (!ev.ok) {
      const missing = ev.missing.map(c => prereq.titles.get(c) ?? c).join('، ');
      out.softErrors.push({ offeringId: o.id, msg: 'عدم پیش‌نیاز: «' + o.title + '» نیازمند گذرانده‌شدن «' + missing + '» است.' });
    }
  }

  if (out.hardErrors.length) { out.ok = false; return out; }

  // ── فیلتر ۲: ظرفیت اتمیک Redis (§۱۰۱۴) — گرم نبود؟ همین‌جا گرم کن ──
  await warmupCapacities(false);

  const softSet = new Set(out.softErrors.map(s => s.offeringId));
  for (const o of offs) {
    if (already.has(o.id) || softSet.has(o.id)) continue;

    const seat = await atomicSeat(o.id);
    let gotSeat = seat === 1;
    let waitlisted = false;
    let wlPos: number | null = null;
    let redisSeatTaken = seat === 1;

    if (seat === -2) {
      // Redis در دسترس نیست → خوانش تازه از DB (نه دادهٔ قدیمی o.enrolled)
      // سپس رزرو اتمیک شرطی تا دو کارگر همزمان overbooking نکنند.
      const fresh = await db
        .select({ enrolled: course_offerings.enrolledCount, capacity: course_offerings.capacity })
        .from(course_offerings)
        .where(eq(course_offerings.id, o.id))
        .limit(1);
      const f = fresh[0];
      gotSeat = !!f && Number(f.enrolled) < Number(f.capacity);
    }
    if (!gotSeat && (o.waitCap ?? 0) > 0) { waitlisted = true; wlPos = await nextWaitlistPosition(o.id).catch(() => null); }

    if (!gotSeat && !waitlisted) {
      out.hardErrors.push('ظرفیت «' + o.title + '» تکمیل است.');
      out.ok = false;
      continue;
    }

    if (!waitlisted) {
      // منبع حقیقت DB است (Redis ممکن است از DB عقب باشد):
      // افزایش شرطی اتمیک؛ اگر ۰ سطر اثر گرفت یعنی واقعاً پر است.
      const inc = await db.execute(
        sql`UPDATE course_offerings SET "enrolledCount" = "enrolledCount" + 1 WHERE id = ${o.id} AND "enrolledCount" < "capacity"`
      );
      const affected = Number((inc as unknown as { rowCount?: unknown })?.rowCount ?? 0);
      if (affected !== 1) {
        // ظرفیت واقعی پر بود — صندلی Redis را پس بده و به لیست انتظار برو
        if (redisSeatTaken) await releaseSeat(o.id).catch(() => {});
        if ((o.waitCap ?? 0) > 0) {
          waitlisted = true;
          wlPos = await nextWaitlistPosition(o.id).catch(() => null);
        } else {
          out.hardErrors.push('ظرفیت «' + o.title + '» تکمیل است.');
          out.ok = false;
          continue;
        }
      }
    }

    // درج ثبت‌نام + خالی‌کردن سبد — تحت RLS (§۲۱۷۰): خط‌مشی enroll_self_ins فقط ردیف خودش
    try {
      await withUserRls(userId, tx => tx.insert(enrollments)
      .values({
        studentId, offeringId: o.id, status: waitlisted ? 'WAITLISTED' : 'REGISTERED',
        waitlistPosition: waitlisted ? (wlPos ?? 1) : null,
        // فاز ۱۰: تأییدیهٔ دیجیتال تداخل نرم (دو امتحان هم‌روز در شیفت‌های متفاوت)
        hasAcceptedSameDayExam: acceptSameDayRisk && examSoft.has(o.id) ? 1 : 0,
      })
      .onConflictDoUpdate({
        target: [enrollments.studentId, enrollments.offeringId],
        set: {
          status: waitlisted ? 'WAITLISTED' : 'REGISTERED',
          waitlistPosition: waitlisted ? (wlPos ?? 1) : null,
          hasAcceptedSameDayExam: acceptSameDayRisk && examSoft.has(o.id) ? 1 : 0,
        },
      }));
    } catch (e) {
      // جبران: اگر INSERT شکست خورد، شمارندهٔ DB و صندلی Redis نشت نکند
      if (!waitlisted) {
        await db.execute(sql`UPDATE course_offerings SET "enrolledCount" = GREATEST("enrolledCount" - 1, 0) WHERE id = ${o.id}`).catch(() => {});
        if (redisSeatTaken) await releaseSeat(o.id).catch(() => {});
      }
      out.hardErrors.push('خطا در ثبت «' + o.title + '»: ' + String((e as Error)?.message ?? e));
      out.ok = false;
      continue;
    }
    if (!waitlisted) {
      // شمارندهٔ DB بالاتر به‌صورت شرطی زیاد شد؛ این‌جا فقط نتیجه ثبت می‌شود.
      out.registered.push(o.title);
    } else {
      out.waitlisted.push(o.title);
    }
    await withUserRls(userId, tx => tx.delete(cart_items).where(and(eq(cart_items.studentId, studentId), eq(cart_items.offeringId, o.id))));
  }

  await withUserRls(userId, tx => tx.insert(notifications).values({
    userId, eventCode: 'ENROLLMENT_DONE',
    payload: JSON.stringify({ registered: out.registered, waitlisted: out.waitlisted }),
  }));

  // اعلان تلگرامی خودکار
  try {
    const { notifyEnrollmentDone } = await import('../telegram-notifications');
    await notifyEnrollmentDone({ userId, registered: out.registered, waitlisted: out.waitlisted });
  } catch { /* ارسال تلگرام هرگز نباید انتخاب واحد را متوقف کند */ }

  return out;
}
