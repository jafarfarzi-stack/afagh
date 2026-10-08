import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms, cart_items, course_offerings, courses,
  enrollments, financial_clearances, financial_terms, notifications, schedules, students,
} from '@/db/schema';
import { withUserRls } from '@/db';
import { atomicSeat, nextWaitlistPosition, releaseSeat, warmupCapacities } from '../waitingRoom';
import { evaluateStudentRegulationStatus, parseUnits } from '../regulations-engine';
import { buildPrereqContext, evaluateLogicTree, type PrereqContext } from './prereqs';

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

export type SubmitDeps = {
  db?: any;
  withUserRls?: <T>(userId: number, fn: (tx: any) => Promise<T>) => Promise<T>;
  atomicSeat?: (offeringId: number) => Promise<number>;
  releaseSeat?: (offeringId: number) => Promise<void>;
  nextWaitlistPosition?: (offeringId: number) => Promise<number | null>;
  warmupCapacities?: (force?: boolean) => Promise<number>;
  claimSeats?: (ids: number[]) => Promise<Set<number>>;
  readFresh?: (ids: number[]) => Promise<Map<number, { enrolled: number; capacity: number }>>;
  compensateSeat?: (id: number) => Promise<void>;
  evaluateRegulations?: (studentId: number, termId: number) => Promise<{ effectiveMaxUnits: number }>;
  buildPrereq?: (studentId: number) => Promise<PrereqContext>;
  getDebtThreshold?: () => Promise<number>;
  notifyEnrollmentDone?: (args: { userId: number; registered: string[]; waitlisted: string[] }) => Promise<void>;
};

export function buildClaimSeatsQuery(exec: any, ids: number[]) {
  return exec.update(course_offerings)
    .set({ enrolledCount: sql`"enrolledCount" + 1` })
    .where(and(inArray(course_offerings.id, ids), sql`"enrolledCount" < "capacity"`))
    .returning({ id: course_offerings.id });
}

export async function claimSeatsBatch(exec: any, ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set<number>();
  const rows = await buildClaimSeatsQuery(exec, ids) as { id: number }[];
  return new Set(rows.map(r => Number(r.id)));
}

export async function readFreshCapacities(exec: any, ids: number[]): Promise<Map<number, { enrolled: number; capacity: number }>> {
  if (ids.length === 0) return new Map();
  const rows = await exec
    .select({ id: course_offerings.id, enrolled: course_offerings.enrolledCount, capacity: course_offerings.capacity })
    .from(course_offerings)
    .where(inArray(course_offerings.id, ids)) as { id: number; enrolled: number; capacity: number }[];
  return new Map(rows.map(r => [Number(r.id), { enrolled: Number(r.enrolled), capacity: Number(r.capacity) }]));
}

export async function compensateSeatDb(exec: any, id: number): Promise<void> {
  await exec.execute(sql`UPDATE course_offerings SET "enrolledCount" = GREATEST("enrolledCount" - 1, 0) WHERE id = ${id}`).catch(() => {});
}

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
export async function processQueuedSubmit(userId: number, studentId: number, acceptSameDayRisk = false, deps: SubmitDeps = {}): Promise<SubmitResult> {
  const out: SubmitResult = { ok: true, registered: [], waitlisted: [], hardErrors: [], softErrors: [] };
  const D: typeof db = deps.db ?? db;
  const doRls = deps.withUserRls ?? withUserRls;

  const [term] = await D.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1));
  if (!term || !term.isEnrollmentOpen) { out.ok = false; out.hardErrors.push('پنجرهٔ انتخاب واحد بسته است.'); return out; }

  // ── فیلتر ۱: مالی (§۱۰۰۸) + وضعیت دانشجو ──
  const [stu] = await D.select().from(students).where(eq(students.id, studentId)).limit(1);
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
  const finTerms = await D.select().from(financial_terms)
    .where(and(eq(financial_terms.universityId, stu.universityId ?? 0), eq(financial_terms.isActive, 1)))
    .orderBy(sql`sort_order ASC NULLS LAST`);
  if (finTerms.length > 0) {
    // ترم مالی جاری را پیدا می‌کنیم (بر اساس sortOrder یا termCode)
    finTermId = finTerms[0].id;
  }

  const clearanceTermId = finTermId ?? term.id;
  const [fin] = await D.select().from(financial_clearances)
    .where(and(eq(financial_clearances.studentId, studentId), eq(financial_clearances.termId, clearanceTermId)));
  
  if (!fin || !fin.isCleared) { 
    out.ok = false; 
    out.hardErrors.push('تسویه‌حساب مالی این ترم ثبت نشده است. برای انتخاب واحد باید بدهکاری‌تان تسویه شود.'); 
  } else {
    const getThreshold = deps.getDebtThreshold ?? (async () => {
      const thresholdRaw = await import('../settings').then(m => m.getSetting('ENROLLMENT_DEBT_THRESHOLD'));
      return Math.max(0, Number(thresholdRaw ?? 0));
    });
    const debtThreshold = await getThreshold();
    if (debtThreshold > 0) {
      const balResult = await D.execute(sql`
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

  const cart = await D.select().from(cart_items).where(eq(cart_items.studentId, studentId));
  if (cart.length === 0) { out.ok = false; out.hardErrors.push('سبد خالی است.'); return out; }

  const ids = cart.map(c => c.offeringId);
  const offs = await D
    .select({ id: course_offerings.id, courseId: course_offerings.courseId, code: courses.code, title: courses.title, units: courses.units, capacity: course_offerings.capacity, enrolled: course_offerings.enrolledCount, waitCap: course_offerings.waitlistCapacity })
    .from(course_offerings).innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(inArray(course_offerings.id, ids));

  // دروس همین ترم که قبلاً ثبت شده‌اند (تکراری نگیریم)
  const current = await D
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
    const evaluateRegs = deps.evaluateRegulations ?? evaluateStudentRegulationStatus;
    const regStatus = await evaluateRegs(studentId, term.id);
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
  const cartSched = await D.select().from(schedules).where(inArray(schedules.offeringId, ids));
  const regIds = [...already];
  const regSched = regIds.length ? await D.select().from(schedules).where(inArray(schedules.offeringId, regIds)) : [];
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
  const buildCtx = deps.buildPrereq ?? buildPrereqContext;
  const prereq = await buildCtx(studentId);
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

  const doWarmup = deps.warmupCapacities ?? warmupCapacities;
  await doWarmup(false);

  const softSet = new Set(out.softErrors.map(s => s.offeringId));
  type SubmitPlan = {
    o: (typeof offs)[number];
    gotSeat: boolean;
    redisSeatTaken: boolean;
    waitlisted: boolean;
    wlPos: number | null;
    excluded: boolean;
    failMessage: string | null;
  };
  const plans: SubmitPlan[] = offs
    .filter(o => !already.has(o.id) && !softSet.has(o.id))
    .map(o => ({ o, gotSeat: false, redisSeatTaken: false, waitlisted: false, wlPos: null, excluded: false, failMessage: null }));

  const doSeat = deps.atomicSeat ?? atomicSeat;
  const doRelease = deps.releaseSeat ?? releaseSeat;
  const doNextWl = deps.nextWaitlistPosition ?? nextWaitlistPosition;
  const doClaim = deps.claimSeats ?? ((ids: number[]) => claimSeatsBatch(D, ids));
  const doFresh = deps.readFresh ?? ((ids: number[]) => readFreshCapacities(D, ids));
  const doCompensate = deps.compensateSeat ?? ((id: number) => compensateSeatDb(D, id));

  const seatCodes = await Promise.all(plans.map(p => doSeat(p.o.id)));
  const fresh = await doFresh(plans.filter((p, i) => seatCodes[i] === -2).map(p => p.o.id));
  plans.forEach((p, i) => {
    const code = seatCodes[i];
    p.redisSeatTaken = code === 1;
    if (code === 1) {
      p.gotSeat = true;
    } else if (code === -2) {
      const f = fresh.get(p.o.id);
      p.gotSeat = !!f && Number(f.enrolled) < Number(f.capacity);
    } else {
      p.gotSeat = false;
    }
    if (!p.gotSeat && (p.o.waitCap ?? 0) > 0) p.waitlisted = true;
  });
  await Promise.all(plans.filter(p => p.waitlisted).map(async p => {
    p.wlPos = await doNextWl(p.o.id).catch(() => null);
  }));

  const claimed = await doClaim(plans.filter(p => !p.waitlisted).map(p => p.o.id));
  for (const p of plans) {
    if (p.waitlisted) continue;
    if (claimed.has(p.o.id)) continue;
    if (p.redisSeatTaken) await doRelease(p.o.id).catch(() => {});
    if ((p.o.waitCap ?? 0) > 0) {
      p.waitlisted = true;
      p.wlPos = await doNextWl(p.o.id).catch(() => null);
    } else {
      p.excluded = true;
      p.failMessage = 'ظرفیت «' + p.o.title + '» تکمیل است.';
    }
  }

  let txError: unknown = null;
  try {
    await doRls(userId, async (tx: any) => {
      for (const p of plans) {
        if (p.excluded) continue;
        await tx.execute(sql.raw('SAVEPOINT enroll_sp'));
        try {
          await tx.insert(enrollments)
            .values({
              studentId, offeringId: p.o.id, status: p.waitlisted ? 'WAITLISTED' : 'REGISTERED',
              waitlistPosition: p.waitlisted ? (p.wlPos ?? 1) : null,
              hasAcceptedSameDayExam: acceptSameDayRisk && examSoft.has(p.o.id) ? 1 : 0,
            })
            .onConflictDoUpdate({
              target: [enrollments.studentId, enrollments.offeringId],
              set: {
                status: p.waitlisted ? 'WAITLISTED' : 'REGISTERED',
                waitlistPosition: p.waitlisted ? (p.wlPos ?? 1) : null,
                hasAcceptedSameDayExam: acceptSameDayRisk && examSoft.has(p.o.id) ? 1 : 0,
              },
            });
        } catch (e) {
          await tx.execute(sql.raw('ROLLBACK TO SAVEPOINT enroll_sp')).catch(() => {});
          p.failMessage = 'خطا در ثبت «' + p.o.title + '»: ' + String((e as Error)?.message ?? e);
          continue;
        }
        await tx.execute(sql.raw('RELEASE SAVEPOINT enroll_sp')).catch(() => {});
      }
      const winners = plans.filter(p => !p.excluded && !p.failMessage);
      if (winners.length > 0) {
        await tx.delete(cart_items).where(and(eq(cart_items.studentId, studentId), inArray(cart_items.offeringId, winners.map(p => p.o.id))));
      }
      await tx.insert(notifications).values({
        userId, eventCode: 'ENROLLMENT_DONE',
        payload: JSON.stringify({
          registered: winners.filter(p => !p.waitlisted).map(p => p.o.title),
          waitlisted: winners.filter(p => p.waitlisted).map(p => p.o.title),
        }),
      });
    });
  } catch (e) {
    txError = e;
  }
  if (txError !== null) {
    const msg = String((txError as Error)?.message ?? txError);
    for (const p of plans) {
      if (!p.excluded && !p.failMessage) p.failMessage = 'خطا در ثبت «' + p.o.title + '»: ' + msg;
    }
  }
  for (const p of plans) {
    if (p.failMessage && !p.excluded && !p.waitlisted) {
      await doCompensate(p.o.id);
      if (p.redisSeatTaken) await doRelease(p.o.id).catch(() => {});
    }
  }
  for (const p of plans) {
    if (p.failMessage) {
      out.hardErrors.push(p.failMessage);
      out.ok = false;
      continue;
    }
    if (!p.waitlisted) {
      out.registered.push(p.o.title);
    } else {
      out.waitlisted.push(p.o.title);
    }
  }

  const notifyDone = deps.notifyEnrollmentDone ?? (async (args: { userId: number; registered: string[]; waitlisted: string[] }) => {
    const { notifyEnrollmentDone } = await import('../telegram-notifications');
    await notifyEnrollmentDone(args);
  });
  try {
    await notifyDone({ userId, registered: out.registered, waitlisted: out.waitlisted });
  } catch {}

  return out;
}
