import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms, cart_items, course_offerings, course_rules, courses, degree_level_configs,
  enrollments, financial_clearances, notifications, schedules, students, syllabuses,
} from '@/db/schema';
import { withUserRls } from '@/db';
import { atomicSeat, nextWaitlistPosition, warmupCapacities } from './waitingRoom';

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

  // ── فیلتر ۳: سقف واحد (§۱۰۱۰) ──
  const totalUnits = offs.filter(o => !already.has(o.id)).reduce((s, o) => s + Number(o.units), 0);
  if (totalUnits > MAX_UNITS) { out.ok = false; out.hardErrors.push('سقف ' + MAX_UNITS + ' واحد رعایت نشده (' + totalUnits + ' واحد).'); }

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
