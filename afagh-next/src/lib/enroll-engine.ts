import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms, cart_items, course_offerings, course_rules, courses, degree_level_configs,
  enrollments, financial_clearances, notifications, schedules, students, syllabuses,
} from '@/db/schema';
import { withUserRls } from '@/db';
import { atomicSeat, nextWaitlistPosition, warmupCapacities } from './waitingRoom';
import { evaluateStudentRegulationStatus, parseGrade, parseUnits } from './regulations-engine';
import { chargeTermTuition } from './tuition-engine';

// ═══ خط لولهٔ اعتبارسنجی — سند §۱۰۰۸ ═══
// هر درخواست انتخاب واحد از ۵ فیلتر می‌گذرد:
//   ۱. مالی (Financial Gate)                              §۱۰۰۸-۱
//   ۲. ظرفیت — عملیات اتمیک در Redis (Atomic Operation)     §۱۰۱۴
//      + ۲ب: تکرار همان درس در ترم (خطای سخت)
//   ۳. سقف واحد (Regulation Engine)                        §۱۰۱۰
//   ۴. پیش‌نیاز/هم‌نیاز — درخت منطقی logic_tree (خطای نرم)  §۱۰۱۲
//   ۵. تداخل زمانی کلاس و امتحان (خطای نرم → ارجاع کمیسیون) §۱۰۱۲
const MAX_UNITS = 20;

/** §آیین‌نامه معادل‌سازی: حداقل نمرهٔ قابل معادل‌سازی */
export const EQUIV_MIN_GRADE = 12;
/** §معادل‌سازی: حداکثر واحد هر ترم معادل‌سازی (هر ۲۰ واحد در یک نیمسال) */
export const EQUIV_TERM_UNITS = 20;

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

// ═══ فیلتر ۴: ارزیابی درخت منطقی پیش‌نیاز (وفادار به فاز صفر — engines/enrollment.js) ═══
// ساختار: {"operator":"AND"|"OR","conditions":[{course:"code",minGrade:10}, ...]}
type LogicCondition = { course?: string; minGrade?: number; operator?: string; conditions?: LogicCondition[] };
type LogicNode = { operator?: string; conditions?: LogicCondition[] };

export function evaluateLogicTree(node: LogicNode | null | undefined, passedMap: Map<string, number>): { ok: boolean; missing: string[] } {
  if (!node || typeof node !== 'object') return { ok: true, missing: [] };
  const results = (node.conditions || []).map(c => {
    if (c.course) {
      const grade = passedMap.get(c.course);
      const ok = grade !== undefined && (c.minGrade != null ? grade >= c.minGrade : true);
      return { ok, missing: ok ? [] : [c.course] };
    }
    if (c.operator) return evaluateLogicTree(c as LogicNode, passedMap);
    return { ok: true, missing: [] };
  });
  const op = (node.operator || 'AND').toUpperCase();
  if (op === 'AND') return { ok: results.every(r => r.ok), missing: results.flatMap(r => r.missing) };
  return { ok: results.some(r => r.ok), missing: results.every(r => !r.ok) ? results.flatMap(r => r.missing) : [] };
}

export type PrereqContext = {
  passed: Map<string, number>;                                  // code → بهترین نمرهٔ قبولی
  ruleByCourse: Map<number, LogicNode>;                          // courseId → درخت PREREQ مؤثر
  titles: Map<string, string>;                                   // code → عنوان درس
  defaultPassing: number;
};

/** نمرهٔ قبولی مؤثر: اورراید درس > پیش‌فرض مقطع (وفادار به regulations.js) */
function passingFor(courseId: number, overrides: Map<number, number>, defaultPassing: number) {
  return overrides.get(courseId) ?? defaultPassing;
}

/**
 * بافت پیش‌نیاز دانشجو:
 * ۱) نقشهٔ دروس پاس‌شده (FINALIZED و بالای نمرهٔ قبولی مؤثر؛ قائل‌شدن = نمرهٔ ۱)
 * ۲) قاعدهٔ PREREQ مؤثر هر درس — قاعدهٔ سیلابسیِ منطبق بر رشته/ورودی دانشجو بر قاعدهٔ عمومی مقدم است
 */
export async function buildPrereqContext(studentId: number): Promise<PrereqContext> {
  const [stu] = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
  const [deg] = stu
    ? await db.select().from(degree_level_configs).where(eq(degree_level_configs.id, stu.degreeLevelId)).limit(1)
    : [];
  const defaultPassing = Number(deg?.defaultPassingGrade ?? 10);

  const allRules = await db.select().from(course_rules);
  const syllRows = await db.select().from(syllabuses);

  // اورراید نمرهٔ قبولی هر درس (اولین قاعدهٔ دارای customPassingGrade)
  const overrides = new Map<number, number>();
  for (const r of allRules) if (r.customPassingGrade != null && !overrides.has(r.courseId)) overrides.set(r.courseId, Number(r.customPassingGrade));

  // قاعدهٔ مؤثر: سیلابسیِ منطبق (رشته + بازهٔ ورودی) مقدم بر عمومی
  const globalRule = new Map<number, LogicNode>();
  const scopedRule = new Map<number, LogicNode>();
  for (const r of allRules) {
    if (r.ruleType !== 'PREREQ') continue;
    let applies = false; let scoped = false;
    if (r.syllabusId == null) { applies = true; scoped = false; }
    else {
      const sy = syllRows.find(s => s.id === r.syllabusId);
      applies = !!stu && !!sy && sy.majorId != null && stu.majorId === sy.majorId
        && stu.entryYear >= (sy.entryYearStart ?? 0)
        && (sy.entryYearEnd == null || stu.entryYear <= sy.entryYearEnd);
      scoped = true;
    }
    if (!applies) continue;
    const target = scoped ? scopedRule : globalRule;
    if (!target.has(r.courseId)) target.set(r.courseId, JSON.parse(r.logicTree) as LogicNode);
  }
  const ruleByCourse = new Map<number, LogicNode>([...globalRule, ...scopedRule]); // scoped بازنویسی می‌کند

  // دروس پاس‌شده
  const rows = await db
    .select({ code: courses.code, courseId: courses.id, grade: enrollments.gradeValue, status: enrollments.gradeStatus, gradingType: courses.gradingType })
    .from(enrollments)
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(eq(enrollments.studentId, studentId));
  const passed = new Map<string, number>();
  for (const r of rows) {
    if (r.status !== 'FINALIZED' || r.grade == null) continue;
    const g = Number(r.grade);
    const ok = r.gradingType === 'DESCRIPTIVE' ? g === 1 : g >= passingFor(r.courseId, overrides, defaultPassing);
    if (ok && (!passed.has(r.code) || (passed.get(r.code) as number) < g)) passed.set(r.code, g);
  }

  const courseRows = await db.select({ code: courses.code, title: courses.title }).from(courses);
  const titles = new Map(courseRows.map(c => [c.code, c.title]));
  return { passed, ruleByCourse, titles, defaultPassing };
}

/** برچسب خوانأ پیش‌نیاز برای UI: «برنامه‌نویسی پیشرفته و ریاضی عمومی ۱» */
export function formatPrereq(node: LogicNode | undefined, titles: Map<string, string>): string | null {
  if (!node || !node.conditions || node.conditions.length === 0) return null;
  const joiner = (node.operator || 'AND').toUpperCase() === 'OR' ? ' یا ' : ' و ';
  const parts = node.conditions.map(c => {
    if (c.course) return titles.get(c.course) ?? c.course;
    if (c.operator) return '(' + formatPrereq(c as LogicNode, titles) + ')';
    return '';
  }).filter(Boolean);
  return parts.length ? parts.join(joiner) : null;
}

/**
 * پردازش یک آیتم صف ثبت نهایی — بدون context درخواست (در کارگر صف اجرا می‌شود).
 * طبق §۶۹۰۶ فقط نتیجهٔ نهایی در PostgreSQL ثبت می‌شود؛ ظرفیت زنده در Redis می‌ماند.
 */
export async function processQueuedSubmit(userId: number, studentId: number): Promise<SubmitResult> {
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
  const [fin] = await db.select().from(financial_clearances)
    .where(and(eq(financial_clearances.studentId, studentId), eq(financial_clearances.termId, term.id)));
  if (!fin || !fin.isCleared) { out.ok = false; out.hardErrors.push('تسویه‌حساب مالی این ترم ثبت نشده است.'); }

  const cart = await db.select().from(cart_items).where(eq(cart_items.studentId, studentId));
  if (cart.length === 0) { out.ok = false; out.hardErrors.push('سبد خالی است.'); return out; }

  const ids = cart.map(c => c.offeringId);
  const offs = await db
    .select({ id: course_offerings.id, courseId: course_offerings.courseId, code: courses.code, title: courses.title, units: courses.units, capacity: course_offerings.capacity, enrolled: course_offerings.enrolledCount, waitCap: course_offerings.waitlistCapacity })
    .from(course_offerings).innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(inArray(course_offerings.id, ids));

  // دروس همین ترم که قبلاً ثبت شده‌اند (تکراری نگیریم)
  const current = await db
    .select({ offeringId: enrollments.offeringId, courseId: course_offerings.courseId })
    .from(enrollments).innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
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

  const totalUnits = offs.filter(o => !already.has(o.id)).reduce((s, o) => s + Number(o.units), 0);
  if (totalUnits > allowedMaxUnits) {
    out.ok = false;
    out.hardErrors.push(`سقف مجاز انتخاب واحد طبق آیین‌نامه آموزشی (${allowedMaxUnits} واحد) رعایت نشده است (مجموع انتخابی: ${totalUnits} واحد).`);
  }

  // ── فیلتر ۵: تداخل کلاس (خطای نرم) ──
  const cartSched = await db.select().from(schedules).where(inArray(schedules.offeringId, ids));
  const regIds = [...already];
  const regSched = regIds.length ? await db.select().from(schedules).where(inArray(schedules.offeringId, regIds)) : [];
  const cartSet = new Set(ids);
  const classClash = new Set<number>();
  const examClash = new Set<number>();
  const examDateOf = new Map<number, string | null>();
  const classOnly = (s: typeof cartSched[number]) => s.scheduleType !== 'EXAM';
  for (const a of cartSched.filter(classOnly)) for (const b of [...cartSched, ...regSched].filter(classOnly)) {
    if (a.offeringId === b.offeringId) continue;
    if (!overlaps(a.startTime.slice(0, 5), a.endTime.slice(0, 5), b.startTime.slice(0, 5), b.endTime.slice(0, 5), a.dayOfWeek, b.dayOfWeek)) continue;
    classClash.add(a.offeringId);
    if (cartSet.has(b.offeringId)) classClash.add(b.offeringId);
  }

  // ── فیلتر ۵: تداخل امتحان (خطای نرم — همان‌طور که فاز صفر داشت) ──
  const examOnly = (s: typeof cartSched[number]) => s.scheduleType === 'EXAM';
  for (const a of cartSched.filter(examOnly)) {
    examDateOf.set(a.offeringId, a.examDate);
    for (const b of [...cartSched, ...regSched].filter(examOnly)) {
      if (a.offeringId === b.offeringId) continue;
      if (!examOverlaps(a, b)) continue;
      examClash.add(a.offeringId);
      if (cartSet.has(b.offeringId)) examClash.add(b.offeringId);
    }
  }
  for (const o of offs) {
    if (already.has(o.id)) continue;
    if (classClash.has(o.id)) out.softErrors.push({ offeringId: o.id, msg: 'تداخل زمانی: «' + o.title + '» با کلاس دیگر.' });
    else if (examClash.has(o.id)) out.softErrors.push({ offeringId: o.id, msg: 'تداخل امتحانی: «' + o.title + '» با امتحان دیگر' + (examDateOf.get(o.id) ? ' (' + examDateOf.get(o.id) + ')' : '') + '.' });
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

    if (seat === -2) {
      // Redis در دسترس نیست → fallback به شمارش SQL (تداوم سرویس — همان روح فاز صفر)
      gotSeat = o.enrolled < o.capacity;
    }
    if (!gotSeat && (o.waitCap ?? 0) > 0) { waitlisted = true; wlPos = await nextWaitlistPosition(o.id).catch(() => null); }

    if (!gotSeat && !waitlisted) {
      out.hardErrors.push('ظرفیت «' + o.title + '» تکمیل است.');
      out.ok = false;
      continue;
    }

    // درج ثبت‌نام + خالی‌کردن سبد — تحت RLS (§۲۱۷۰): خط‌مشی enroll_self_ins فقط ردیف خودش
    await withUserRls(userId, tx => tx.insert(enrollments)
      .values({ studentId, offeringId: o.id, status: waitlisted ? 'WAITLISTED' : 'REGISTERED', waitlistPosition: waitlisted ? (wlPos ?? o.enrolled - o.capacity + 1) : null })
      .onConflictDoUpdate({
        target: [enrollments.studentId, enrollments.offeringId],
        set: { status: waitlisted ? 'WAITLISTED' : 'REGISTERED', waitlistPosition: waitlisted ? (wlPos ?? o.enrolled - o.capacity + 1) : null },
      }));
    if (!waitlisted) {
      // شمارندهٔ مشترک = اقدام سیستم → نقش مالک (خط‌مشی دانشجویی ندارد)
      await db.update(course_offerings)
        .set({ enrolledCount: sql`${course_offerings.enrolledCount} + 1` })
        .where(eq(course_offerings.id, o.id));
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
  return out;
}

// ══════════════════════════════════════════════════════════════════════
//  ثبت درس تطبیق‌داده‌شده (معادل‌سازی) — هندلر رویداد موتور گردش کار
//
//  موتور BPM در لحظهٔ «تأیید نهایی» فرایند COURSE_TRANSFER فقط رویداد شلیک
//  می‌کند؛ ثبت درس در کارنامه کارِ خودِ موتور آموزش است (جداسازی دغدغه‌ها).
//  این تابع ایدمپوتنت است: اجرای دوبارهٔ رویداد، ردیف تکراری نمی‌سازد.
// ══════════════════════════════════════════════════════════════════════

export type TransferApplyResult = {
  ok: boolean;
  enrollmentId?: number;
  offeringId?: number;
  createdOffering?: boolean;
  message: string;
};

export async function applyCourseTransfer(input: {
  studentId: number;
  targetCourseCode?: string;
  sourceCourseTitle?: string;
  sourceGrade?: string | number | null;
  sourceUnits?: string | number | null;
  previousUniversity?: string;
  workflowRequestId?: number | null;
}): Promise<TransferApplyResult> {
  const code = String(input.targetCourseCode ?? '').trim();
  if (!code) return { ok: false, message: 'کد درس مقصد در فرم تطبیق واحد وارد نشده است.' };

  const [course] = await db.select().from(courses).where(eq(courses.code, code)).limit(1);
  if (!course) return { ok: false, message: `درس مقصد با کد «${code}» در چارت دانشگاه تعریف نشده است.` };

  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1)).limit(1);
  if (!term) return { ok: false, message: 'ترم جاری مشخص نیست؛ ثبت درس تطبیق‌شده ممکن نشد.' };

  // آفرینگ اختصاصی تطبیق واحد — از ظرفیت کلاس‌های عادی چیزی کم نمی‌کند
  let [offering] = await db
    .select()
    .from(course_offerings)
    .where(and(
      eq(course_offerings.courseId, course.id),
      eq(course_offerings.termId, term.id),
      eq(course_offerings.offeringType, 'TRANSFER'),
    ))
    .limit(1);

  let createdOffering = false;
  if (!offering) {
    const [made] = await db
      .insert(course_offerings)
      .values({
        termId: term.id,
        courseId: course.id,
        groupNumber: 900,
        capacity: 500,
        enrolledCount: 0,
        offeringType: 'TRANSFER',
        isActive: 1,
      })
      .onConflictDoNothing()
      .returning();
    offering = made ?? (await db
      .select()
      .from(course_offerings)
      .where(and(
        eq(course_offerings.courseId, course.id),
        eq(course_offerings.termId, term.id),
        eq(course_offerings.offeringType, 'TRANSFER'),
      ))
      .limit(1))[0];
    createdOffering = true;
  }
  if (!offering) return { ok: false, message: 'ساخت گروه تطبیق واحد برای درس مقصد ممکن نشد.' };

  const grade = parseGrade(input.sourceGrade);
  const units = parseUnits(input.sourceUnits);

  // §آیین‌نامه: فقط نمرات ۱۲ و بالاتر قابل معادل‌سازی است — از همان ابتدا اعمال می‌شود
  if (grade !== null && grade < EQUIV_MIN_GRADE) {
    return {
      ok: false,
      message: `بر اساس آیین‌نامه، فقط نمرات ${EQUIV_MIN_GRADE} و بالاتر قابل معادل‌سازی است (نمرهٔ واردشده: ${grade}).`,
    };
  }

  // ثبت یا به‌روزرسانی ردیف کارنامه.
  // عمداً از onConflictDoUpdate استفاده نمی‌کنیم: به قید یکتاییِ
  // («studentId», «offeringId») وابسته نباشد تا در دیتابیس‌های قدیمی‌تر که
  // این قید هنوز ساخته نشده هم درست کار کند.
  const [existing] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(eq(enrollments.studentId, input.studentId), eq(enrollments.offeringId, offering.id)))
    .limit(1);

  const payload = {
    status: 'REGISTERED',
    workflowRequestId: input.workflowRequestId ?? null,
    gradeValue: grade === null ? null : String(grade),
    gradeStatus: grade === null ? 'PENDING' : 'FINALIZED',
  };

  const row = existing
    ? (await db.update(enrollments).set(payload).where(eq(enrollments.id, existing.id)).returning({ id: enrollments.id }))[0]
    : (await db
        .insert(enrollments)
        .values({ studentId: input.studentId, offeringId: offering.id, isDirectedReading: 0, ...payload })
        .returning({ id: enrollments.id }))[0];

  if (createdOffering) {
    await db
      .update(course_offerings)
      .set({ enrolledCount: sql`(select count(*)::int from enrollments where "offeringId" = ${offering.id} and status <> 'DROPPED')` })
      .where(eq(course_offerings.id, offering.id));
  }

  return {
    ok: true,
    enrollmentId: row?.id,
    offeringId: offering.id,
    createdOffering,
    message: `درس «${course.title}» با نمرهٔ ${grade === null ? 'ثبت‌نشده' : grade} و ${units} واحد از ${input.previousUniversity || 'دانشگاه مبدأ'} در کارنامه ثبت شد.`,
  };
}

// ══════════════════════════════════════════════════════════════════
//  ثبت دسته‌ای معادل‌سازی — پس از تأیید مدیر گروه و مدیرکل آموزش
//
//  طبق دستور: هر ۲۰ واحد معادل‌سازی‌شده در یک «نیمسال معادل‌سازی» جداگانه
//  ثبت می‌شود که پیش از اولین نیمسال واقعی در کارنامه نمایش داده می‌شود؛
//  وضعیت درس «قبولی در معادل‌سازی پذیرفته شده» است و مشروطیت در این ترم‌ها
//  معنا ندارد. فقط نمرات >= EQUIV_MIN_GRADE ثبت می‌شوند.
// ══════════════════════════════════════════════════════════════════

export type EquivalenceItem = {
  sourceTitle: string;
  sourceGrade: number | string | null;
  sourceUnits: number | string | null;
  targetCourseCode: string;
  headComment?: string | null;
};

export type EquivalenceBatchResult = {
  ok: boolean;
  message: string;
  termsCreated: number;
  chargedTotal?: number;
  registered: { courseTitle: string; termTitle: string; grade: number | null; units: number }[];
  rejected: { sourceTitle: string; reason: string }[];
};

export async function applyEquivalenceBatch(input: {
  studentId: number;
  items: EquivalenceItem[];
  previousUniversity?: string;
  workflowRequestId?: number | null;
}): Promise<EquivalenceBatchResult> {
  const registered: EquivalenceBatchResult['registered'] = [];
  const rejected: EquivalenceBatchResult['rejected'] = [];

  // ۱) فیلتر نمره و تطبیق درس مقصد
  type Ready = { course: typeof courses.$inferSelect; grade: number; units: number; sourceTitle: string };
  const ready: Ready[] = [];
  for (const it of input.items) {
    const grade = parseGrade(it.sourceGrade);
    if (grade === null || grade < EQUIV_MIN_GRADE) {
      rejected.push({ sourceTitle: it.sourceTitle, reason: grade === null ? 'نمره نامعتبر' : `نمرهٔ کمتر از ${EQUIV_MIN_GRADE} (غیرقابل معادل‌سازی)` });
      continue;
    }
    const [course] = await db.select().from(courses).where(eq(courses.code, String(it.targetCourseCode ?? '').trim())).limit(1);
    if (!course) {
      rejected.push({ sourceTitle: it.sourceTitle, reason: `درس مقصد «${it.targetCourseCode}» در چارت آفاق یافت نشد` });
      continue;
    }
    const units = parseUnits(it.sourceUnits) || Number(course.units || 0);
    ready.push({ course, grade, units, sourceTitle: it.sourceTitle });
  }

  if (ready.length === 0) {
    return { ok: false, message: 'هیچ درس واجد شرایطی برای معادل‌سازی یافت نشد.', termsCreated: 0, registered, rejected };
  }

  // ۲) دسته‌بندی هر ۲۰ واحد در یک ترم معادل‌سازی
  const chunks: Ready[][] = [];
  let cur: Ready[] = [];
  let curUnits = 0;
  for (const r of ready) {
    if (curUnits + r.units > EQUIV_TERM_UNITS && cur.length > 0) {
      chunks.push(cur);
      cur = [];
      curUnits = 0;
    }
    cur.push(r);
    curUnits += r.units;
  }
  if (cur.length) chunks.push(cur);

  // ۳) ساخت ترم‌های معادل‌سازی پیش از اولین نیمسال و ثبت دروس
  let termsCreated = 0;
  const equivTermIds: number[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const termCode = `00EQ${i + 1}`;
    let [term] = await db.select().from(academic_terms).where(eq(academic_terms.termCode, termCode)).limit(1);
    if (!term) {
      const [made] = await db
        .insert(academic_terms)
        .values({
          termCode,
          title: `معادل‌سازی — نوبت ${i + 1}`,
          termType: 'EQUIVALENCE',
          isCurrent: 0,
          isSummer: 0,
          isEnrollmentOpen: 0,
          startDate: new Date(2000, 0, 1),
          endDate: new Date(2000, 5, 30),
        })
        .onConflictDoNothing()
        .returning();
      term = made ?? (await db.select().from(academic_terms).where(eq(academic_terms.termCode, termCode)).limit(1))[0];
    }
    if (!term) continue;
    termsCreated++;
    equivTermIds.push(term.id);

    for (const r of chunks[i]) {
      let [offering] = await db
        .select()
        .from(course_offerings)
        .where(and(eq(course_offerings.courseId, r.course.id), eq(course_offerings.termId, term.id), eq(course_offerings.offeringType, 'TRANSFER')))
        .limit(1);
      if (!offering) {
        const [made] = await db
          .insert(course_offerings)
          .values({ termId: term.id, courseId: r.course.id, groupNumber: 900, capacity: 500, enrolledCount: 0, offeringType: 'TRANSFER', isActive: 1 })
          .onConflictDoNothing()
          .returning();
        offering = made ?? (await db.select().from(course_offerings).where(and(eq(course_offerings.courseId, r.course.id), eq(course_offerings.termId, term.id), eq(course_offerings.offeringType, 'TRANSFER'))).limit(1))[0];
      }
      if (!offering) continue;

      const [existing] = await db.select({ id: enrollments.id }).from(enrollments).where(and(eq(enrollments.studentId, input.studentId), eq(enrollments.offeringId, offering.id))).limit(1);
      const payload = {
        status: 'EQUIV_PASSED',
        workflowRequestId: input.workflowRequestId ?? null,
        gradeValue: String(r.grade),
        gradeStatus: 'FINALIZED',
      };
      if (existing) {
        await db.update(enrollments).set(payload).where(eq(enrollments.id, existing.id));
      } else {
        await db.insert(enrollments).values({ studentId: input.studentId, offeringId: offering.id, isDirectedReading: 0, ...payload });
      }
      registered.push({ courseTitle: r.course.title, termTitle: term.title, grade: r.grade, units: r.units });
    }
  }

  // ۴) شارژ شهریهٔ معادل‌سازی بر اساس نوع ترم و نوع گذراندن درس (موتور شهریه)
  let chargedTotal = 0;
  for (const tid of equivTermIds) {
    try {
      const { charged } = await chargeTermTuition(input.studentId, tid);
      chargedTotal += charged;
    } catch (e) {
      // نبود قاعدهٔ شهریه نباید معادل‌سازی را شکست دهد؛ فقط ثبت نمی‌شود
      console.error('equivalence tuition charge failed', { studentId: input.studentId, termId: tid, e });
    }
  }

  return {
    ok: true,
    message: `${registered.length} درس معادل‌سازی‌شده در ${termsCreated} نیمسال معادل‌سازی (هر ${EQUIV_TERM_UNITS} واحد) پیش از اولین ترم ثبت شد.` +
      (chargedTotal > 0 ? ` شهریهٔ معادل‌سازی: ${chargedTotal.toLocaleString('fa-IR')} ریال.` : ''),
    termsCreated,
    chargedTotal,
    registered,
    rejected,
  };
}
