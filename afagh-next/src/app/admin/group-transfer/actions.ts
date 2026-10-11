'use server';

import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  course_offerings, courses, departments, enrollments,
  financial_clearances, majors, schedules, staff, students, users,
} from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { writeAuditEntry } from '@/lib/audit-writer';
import { getBool } from '@/lib/settings';
import { getCurrentUniversity } from '@/lib/university-scope';
import { currentExpertFilters, type ExpertScopeFilters } from '@/lib/expert-scope';
import { evaluateStudentRegulationStatus } from '@/lib/regulations-engine';

const EDU = ['ADMIN', 'EDU_EXPERT'];

/** وضعیت‌های «فعال» ثبت‌نام در همین ترم (برای تشخیص تداخل) */
const ACTIVE_ENROLL_STATUSES = ['REGISTERED', 'WAITLISTED', 'PENDING_COUNCIL'];

/** کسر حدنصاب گروه مبدأ (همان آستانهٔ گزارش «ظرفیت به حدنصاب نرسیده») */
const MIN_QUORUM_RATIO = 0.5;

// ─────────────── انواع اشتراکی با کلاینت ───────────────
export interface TransferOffering {
  offeringId: number;
  groupNumber: number;
  enrolledCount: number;
  capacity: number;
  professorName: string;
  isActive: boolean;
}

export interface TransferCourseGroup {
  courseId: number;
  code: string;
  title: string;
  units: number | null;
  departmentId: number | null;
  departmentName: string;
  offerings: TransferOffering[];
}

export interface GroupRosterRow {
  enrollmentId: number;
  studentId: number;
  studentCode: string;
  firstName: string;
  lastName: string;
  status: string;
}

export interface TransferResult {
  ok: boolean;
  error?: string;
  warnings?: string[];
  blocks?: string[];
  enrollmentId?: number;
}

async function uniId(): Promise<number | null> {
  try { return (await getCurrentUniversity())?.id ?? null; } catch { return null; }
}

/**
 * دامنهٔ کارشناس روی «گروه درسی» — رشته/دانشکده/گروه scope را به مجموعهٔ
 * departmentIdهای مجاز درس‌ها تبدیل می‌کند (دروس با departmentId در این مجموعه).
 * ADMIN (بدون scope) → null یعنی بدون محدودیت.
 */
async function scopedDepartmentIds(f: ExpertScopeFilters | null, _uniId: number | null): Promise<number[] | null> {
  void _uniId;
  if (!f) return null;
  const out = new Set<number>();
  if (f.departmentIds) f.departmentIds.forEach(d => out.add(d));
  if (f.facultyIds && f.facultyIds.length) {
    const rows = await db.select({ id: departments.id }).from(departments)
      .where(inArray(departments.facultyId, f.facultyIds)).limit(5000);
    rows.forEach(r => out.add(r.id));
  }
  if (f.majorIds && f.majorIds.length) {
    const rows = await db.select({ departmentId: majors.departmentId }).from(majors)
      .where(inArray(majors.id, f.majorIds)).limit(5000);
    rows.forEach(r => { if (r.departmentId != null) out.add(r.departmentId); });
  }
  return out.size ? [...out] : null;
}

async function profNameMap(ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const uniq = [...new Set(ids.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)))];
  if (!uniq.length) return out;
  const ps = await db.select({ id: staff.id, firstName: users.firstName, lastName: users.lastName })
    .from(staff).innerJoin(users, eq(users.id, staff.userId)).where(inArray(staff.id, uniq));
  for (const p of ps) out.set(p.id, `${p.firstName || ''} ${p.lastName || ''}`.trim() || '—');
  return out;
}

function fa(n: number | null | undefined): string {
  return Number.isFinite(Number(n)) ? Number(n).toLocaleString('fa-IR') : '—';
}

// ─────────────── ۱) دروس + گروه‌های یک ترم (دامنه‌دار) ───────────────
export async function getTransferTargetsAction(termId: number): Promise<{
  ok: boolean; error?: string; courses?: TransferCourseGroup[];
}> {
  try { await requireRole(EDU); } catch { return { ok: false, error: 'دسترسی ندارید.' }; }
  const tid = Number(termId);
  if (!Number.isInteger(tid)) return { ok: false, error: 'اطلاعات نامعتبر.' };

  const u = await uniId();
  const eff = await currentExpertFilters();
  const deptScope = await scopedDepartmentIds(eff, u);

  const rows = await db
    .select({
      offeringId: course_offerings.id,
      courseId: courses.id, code: courses.code, title: courses.title, units: courses.units,
      departmentId: courses.departmentId, departmentName: departments.name,
      groupNumber: course_offerings.groupNumber, enrolledCount: course_offerings.enrolledCount,
      capacity: course_offerings.capacity, isActive: course_offerings.isActive, professorId: course_offerings.professorId,
    })
    .from(course_offerings)
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .leftJoin(departments, eq(departments.id, courses.departmentId))
    .where(and(
      eq(course_offerings.termId, tid),
      eq(course_offerings.isActive, 1),
      u ? eq(course_offerings.universityId, u) : undefined,
      deptScope ? inArray(courses.departmentId, deptScope) : undefined,
    ))
    .orderBy(asc(courses.title), asc(course_offerings.groupNumber))
    .limit(4000);

  const profName = await profNameMap([...new Set(rows.map(r => r.professorId).filter((n): n is number => typeof n === 'number'))]);

  const byCourse = new Map<number, TransferCourseGroup>();
  for (const r of rows) {
    let c = byCourse.get(r.courseId);
    if (!c) {
      c = {
        courseId: r.courseId, code: r.code, title: r.title,
        units: r.units == null ? null : Number(r.units),
        departmentId: r.departmentId ?? null, departmentName: r.departmentName ?? '—',
        offerings: [],
      };
      byCourse.set(r.courseId, c);
    }
    c.offerings.push({
      offeringId: r.offeringId, groupNumber: r.groupNumber,
      enrolledCount: r.enrolledCount ?? 0, capacity: r.capacity ?? 0,
      professorName: (r.professorId != null && profName.get(r.professorId)) || '—',
      isActive: (r.isActive ?? 1) === 1,
    });
  }
  return { ok: true, courses: [...byCourse.values()] };
}

// ─────────────── ۲) فهرست دانشجویانِ یک گروه مبدأ ───────────────
export async function getGroupRosterAction(termId: number, offeringId: number): Promise<{
  ok: boolean; error?: string;
  offer?: { offeringId: number; courseCode: string; courseTitle: string; groupNumber: number; capacity: number; enrolledCount: number; professorName: string };
  roster?: GroupRosterRow[];
}> {
  try { await requireRole(EDU); } catch { return { ok: false, error: 'دسترسی ندارید.' }; }
  const tid = Number(termId), oid = Number(offeringId);
  if (!Number.isInteger(tid) || !Number.isInteger(oid)) return { ok: false, error: 'اطلاعات نامعتبر.' };

  const u = await uniId();
  const [off] = await db
    .select({
      offeringId: course_offerings.id, groupNumber: course_offerings.groupNumber,
      capacity: course_offerings.capacity, enrolledCount: course_offerings.enrolledCount,
      code: courses.code, title: courses.title, departmentId: courses.departmentId,
      professorId: course_offerings.professorId,
    })
    .from(course_offerings)
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(and(eq(course_offerings.id, oid), eq(course_offerings.termId, tid)))
    .limit(1);
  if (!off) return { ok: false, error: 'گروه مبدأ یافت نشد یا متعلق به این ترم نیست.' };

  const eff = await currentExpertFilters();
  const deptScope = await scopedDepartmentIds(eff, u);
  if (deptScope && (!off.departmentId || !deptScope.includes(off.departmentId))) {
    return { ok: false, error: 'این درس در محدودهٔ دسترسی شما نیست.' };
  }

  const profName = await profNameMap(off.professorId != null ? [off.professorId] : []);

  const rows = await db
    .select({
      enrollmentId: enrollments.id, studentId: students.id,
      studentCode: students.studentCode, firstName: users.firstName,
      lastName: users.lastName, status: enrollments.status,
    })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .where(eq(enrollments.offeringId, oid))
    .orderBy(asc(users.lastName), asc(users.firstName))
    .limit(2000);

  return {
    ok: true,
    offer: {
      offeringId: oid, courseCode: off.code, courseTitle: off.title, groupNumber: off.groupNumber,
      capacity: off.capacity ?? 0, enrolledCount: off.enrolledCount ?? 0,
      professorName: (off.professorId != null && profName.get(off.professorId)) || '—',
    },
    roster: rows.map(r => ({
      enrollmentId: r.enrollmentId, studentId: r.studentId, studentCode: r.studentCode,
      firstName: r.firstName ?? '', lastName: r.lastName ?? '', status: r.status,
    })),
  };
}

// ─────────────── ۳) سایر گروه‌های همان درس (مقصد) ───────────────
export async function getTransferTargetGroupsAction(termId: number, offeringId: number): Promise<{
  ok: boolean; error?: string;
  course?: { courseId: number; code: string; title: string };
  groups?: TransferOffering[];
}> {
  try { await requireRole(EDU); } catch { return { ok: false, error: 'دسترسی ندارید.' }; }
  const tid = Number(termId), oid = Number(offeringId);
  if (!Number.isInteger(tid) || !Number.isInteger(oid)) return { ok: false, error: 'اطلاعات نامعتبر.' };

  const [src] = await db.select({ courseId: course_offerings.courseId }).from(course_offerings)
    .where(eq(course_offerings.id, oid)).limit(1);
  if (!src) return { ok: false, error: 'گروه مبدأ یافت نشد.' };

  const rows = await db
    .select({
      offeringId: course_offerings.id, groupNumber: course_offerings.groupNumber,
      enrolledCount: course_offerings.enrolledCount, capacity: course_offerings.capacity,
      isActive: course_offerings.isActive, professorId: course_offerings.professorId,
      code: courses.code, title: courses.title,
    })
    .from(course_offerings)
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(and(
      eq(course_offerings.termId, tid),
      eq(course_offerings.courseId, src.courseId),
      eq(course_offerings.isActive, 1),
      ne(course_offerings.id, oid),
    ))
    .orderBy(asc(course_offerings.groupNumber))
    .limit(500);

  const profName = await profNameMap([...new Set(rows.map(r => r.professorId).filter((n): n is number => typeof n === 'number'))]);
  const first = rows[0];
  return {
    ok: true,
    course: first ? { courseId: src.courseId, code: first.code, title: first.title } : undefined,
    groups: rows.map(r => ({
      offeringId: r.offeringId, groupNumber: r.groupNumber,
      enrolledCount: r.enrolledCount ?? 0, capacity: r.capacity ?? 0,
      professorName: (r.professorId != null && profName.get(r.professorId)) || '—',
      isActive: (r.isActive ?? 1) === 1,
    })),
  };
}

// ─────────────── ۴) انتقال دانشجو (گیت‌های سخت + نادیده‌گرفتن با دلیل) ───────────────

interface TransferGateCtx {
  enrollmentId: number;
  studentId: number;
  termId: number;
  status: string;
}

interface GateResult {
  warnings: string[];
  blocks: string[];
  capacityBlocked: boolean;
  conflictBlocked: boolean;
}

function toMin(hhmm: string): number { const [h, m] = String(hhmm || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); }
function rangesOverlap(a: string, b: string, c: string, d: string): boolean { return toMin(a) < toMin(d) && toMin(c) < toMin(b); }

/** تداخل هفتگی/امتحانی گروه مقصد با سایر ثبت‌های دانشجو در همین ترم (مبدأ مستثناست) */
async function buildTransferConflicts(ctx: TransferGateCtx, toOfferingId: number): Promise<{ warnings: string[]; blocks: string[] }> {
  const warnings: string[] = [];
  const blocks: string[] = [];
  const others = await db
    .select({ offeringId: enrollments.offeringId, title: courses.title })
    .from(enrollments)
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(and(
      eq(enrollments.studentId, ctx.studentId),
      eq(course_offerings.termId, ctx.termId),
      inArray(enrollments.status, ACTIVE_ENROLL_STATUSES),
      ne(enrollments.id, ctx.enrollmentId),
    ));
  const otherOffIds = [...new Set(others.map(r => r.offeringId).filter((n): n is number => typeof n === 'number'))];
  const titleBy = new Map(others.map(r => [r.offeringId, r.title]));
  if (!otherOffIds.length) return { warnings, blocks };

  const [targetScheds, otherScheds] = await Promise.all([
    db.select().from(schedules).where(and(eq(schedules.offeringId, toOfferingId), inArray(schedules.scheduleType, ['CLASS', 'EXAM']))),
    db.select().from(schedules).where(and(inArray(schedules.offeringId, otherOffIds), inArray(schedules.scheduleType, ['CLASS', 'EXAM']))),
  ]);

  const classOnly = (s: typeof targetScheds[number]) => s.scheduleType !== 'EXAM';
  // هفتگی — تداخل نرم (هشدار)
  for (const a of targetScheds.filter(classOnly)) {
    if (a.dayOfWeek == null) continue;
    for (const b of otherScheds.filter(classOnly)) {
      if (b.dayOfWeek == null || a.dayOfWeek !== b.dayOfWeek) continue;
      const aS = String(a.startTime ?? '').slice(0, 5), aE = String(a.endTime ?? '').slice(0, 5);
      const bS = String(b.startTime ?? '').slice(0, 5), bE = String(b.endTime ?? '').slice(0, 5);
      if (aS && bS && rangesOverlap(aS, aE, bS, bE)) {
        warnings.push(`تداخل هفتگی: کلاس گروه مقصد با «${titleBy.get(b.offeringId) ?? 'درس دیگر'}» (روز ${a.dayOfWeek}).`);
      }
    }
  }

  const examOnly = (s: typeof targetScheds[number]) => s.scheduleType === 'EXAM';
  // امتحانی — هم‌زمان = سخت؛ هم‌روز ساعت متفاوت = نرم
  for (const a of targetScheds.filter(examOnly)) {
    const aD = String(a.examDate ?? '');
    for (const b of otherScheds.filter(examOnly)) {
      const bD = String(b.examDate ?? '');
      if (!aD || !bD || aD !== bD) continue;
      const aS = String(a.startTime ?? '').slice(0, 5), aE = String(a.endTime ?? '').slice(0, 5);
      const bS = String(b.startTime ?? '').slice(0, 5), bE = String(b.endTime ?? '').slice(0, 5);
      const clash = aS && bS && rangesOverlap(aS, aE, bS, bE);
      if (clash) {
        blocks.push(`تداخل قطعی امتحان: گروه مقصد با «${titleBy.get(b.offeringId) ?? 'درس دیگر'}» در ${aD} و همان ساعت.`);
      } else {
        warnings.push(`تداخل نرم امتحان (هم‌روز، ساعت متفاوت): گروه مقصد با «${titleBy.get(b.offeringId) ?? 'درس دیگر'}» در ${aD}.`);
      }
    }
  }
  return { warnings, blocks };
}

/** همان گیت‌های موتور ثبت‌نام، برای انتقال: ظرفیت، تداخل، مشروطیت/سنوات، مالی، حدنصاب */
async function evaluateTransferGates(
  ctx: TransferGateCtx,
  toOfferingId: number,
  fromOffering: typeof course_offerings.$inferSelect,
  toOffering: typeof course_offerings.$inferSelect,
): Promise<GateResult> {
  const warnings: string[] = [];
  const blocks: string[] = [];
  let capacityBlocked = false, conflictBlocked = false;

  const [student] = await db.select().from(students).where(eq(students.id, ctx.studentId)).limit(1);
  if (!student) return { warnings, blocks, capacityBlocked, conflictBlocked };

  // (a) ظرفیت مقصد — سخت، قابل نادیده‌گرفتن
  const cap = toOffering.capacity ?? 0;
  const enrolled = toOffering.enrolledCount ?? 0;
  if (cap > 0 && enrolled + 1 > cap) {
    capacityBlocked = true;
    blocks.push(`ظرفیت گروه مقصد تکمیل است (${fa(enrolled)}/${fa(cap)}) — برای تخطی، «انتقال با دلیل» لازم است.`);
  }

  // وضعیت پروندهٔ دانشجو
  if (student.status === 'BLOCKED_COMMISSION') {
    blocks.push('پروندهٔ دانشجو توسط کمیسیون موارد خاص مسدود است.');
  } else if (student.status !== 'ACTIVE' && student.status !== 'PROBATION') {
    blocks.push(`وضعیت دانشجو برای ادامهٔ ثبت فعال نیست (${student.status}).`);
  } else if (student.status === 'PROBATION') {
    warnings.push('دانشجو در وضعیت «مشروط» است.');
  }

  // (c) مشروطیت/سنوات — موتور آیین‌نامه (مستقل از گروه؛ ارزان و دوباره‌اجرا می‌شود)
  try {
    const summary = await evaluateStudentRegulationStatus(ctx.studentId, ctx.termId);
    const cfg = summary.rulesConfig as { probation_and_tenure?: Record<string, number> } | undefined;
    const maxProb = (cfg?.probation_and_tenure?.max_total_probations ?? 3) + (student.extraAllowedProbations ?? 0);
    const maxSem = (cfg?.probation_and_tenure?.max_study_semesters ?? 8) + (student.extraAllowedSemesters ?? 0) - (summary.equivalenceSemesters ?? 0);
    if (summary.totalProbations >= maxProb) {
      blocks.push(`سقف مشروطیت: ${summary.totalProbations} ترم مشروطی از سقف ${maxProb} ترم — ادامهٔ تحصیل نیازمند کمیسیون است.`);
    }
    if (summary.completedSemesters >= maxSem) {
      blocks.push(`پایان سنوات: ${summary.completedSemesters} ترم از سقف ${maxSem} ترم — نیازمند سنوات ارفاقی.`);
    }
  } catch { /* موتور در دسترس نیست */ }

  // مالی: تسویهٔ این ترم ثبت شده؟ (هشدار)
  try {
    const [clear] = await db.select({ isCleared: financial_clearances.isCleared }).from(financial_clearances)
      .where(and(eq(financial_clearances.studentId, ctx.studentId), eq(financial_clearances.termId, ctx.termId))).limit(1);
    if (!clear || (clear.isCleared ?? 0) !== 1) {
      warnings.push('تسویهٔ مالی این ترم ثبت نشده است.');
    }
  } catch { /* ignore */ }

  // (b) تداخل هفتگی/امتحانی با سایر ثبت‌های همین ترم (مبدأ مستثنا)
  const conflictIndex = await buildTransferConflicts(ctx, toOfferingId);
  conflictIndex.blocks.forEach(b => blocks.push(b));
  conflictIndex.warnings.forEach(w => warnings.push(w));
  conflictBlocked = conflictIndex.blocks.length > 0;

  // (d) حدنصاب گروه مبدأ — فقط هشدار
  if (fromOffering) {
    const srcCap = fromOffering.capacity ?? 0;
    const afterLeave = (fromOffering.enrolledCount ?? 0) - 1;
    if (srcCap > 0 && afterLeave < Math.ceil(srcCap * MIN_QUORUM_RATIO)) {
      warnings.push(`گروه مبدأ پس از انتقال به زیر حدنصاب (${Math.round(MIN_QUORUM_RATIO * 100)}٪) می‌رسد (ثبت‌شده: ${fa(Math.max(afterLeave, 0))}/${fa(srcCap)}).`);
    }
  }

  return { warnings, blocks, capacityBlocked, conflictBlocked };
}

export interface TransferInput {
  enrollmentId: number;
  toOfferingId: number;
  overrideReason?: string;
}

export async function transferStudentAction(input: TransferInput): Promise<TransferResult> {
  const me = await requireRole(EDU);
  const enrollmentId = Number(input.enrollmentId), toOfferingId = Number(input.toOfferingId);
  if (!Number.isInteger(enrollmentId) || !Number.isInteger(toOfferingId)) return { ok: false, error: 'اطلاعات نامعتبر.' };
  const overrideReason = String(input.overrideReason || '').trim();
  const hasOverride = overrideReason.length >= 5;

  const [enr] = await db.select().from(enrollments).where(eq(enrollments.id, enrollmentId)).limit(1);
  if (!enr) return { ok: false, error: 'ثبت‌نام یافت نشد.' };
  if (enr.status !== 'REGISTERED') {
    return { ok: false, error: `فقط ثبت‌نام قطعی (REGISTERED) قابل انتقال است (وضعیت فعلی: ${enr.status}).` };
  }

  const fromOffId = enr.offeringId;
  if (fromOffId === toOfferingId) return { ok: false, error: 'گروه مبدأ و مقصد یکی است.' };

  const [fromOff, toOff] = await Promise.all([
    db.select().from(course_offerings).where(eq(course_offerings.id, fromOffId)).limit(1),
    db.select().from(course_offerings).where(and(eq(course_offerings.id, toOfferingId), eq(course_offerings.isActive, 1))).limit(1),
  ]);
  if (!fromOff[0]) return { ok: false, error: 'گروه مبدأ یافت نشد.' };
  if (!toOff[0]) return { ok: false, error: 'گروه مقصد یافت نشد یا غیرفعال است.' };
  if (fromOff[0].termId !== toOff[0].termId) return { ok: false, error: 'گروه مقصد در ترم دیگری است.' };
  if (fromOff[0].courseId !== toOff[0].courseId) {
    return { ok: false, error: 'گروه مقصد از درس دیگری است — انتقال فقط بین گروه‌های یک درس مجاز است.' };
  }

  // دانشجو از قبل در گروه مقصد؟
  const dup = await db.select({ id: enrollments.id }).from(enrollments)
    .where(and(eq(enrollments.studentId, enr.studentId), eq(enrollments.offeringId, toOfferingId))).limit(1);
  if (dup.length) return { ok: false, error: 'این دانشجو همین‌الان در گروه مقصد ثبت است.' };

  // دامنهٔ کارشناس: درس هر دو گروه باید در محدودهٔ مجاز باشد
  const u = await uniId();
  const eff = await currentExpertFilters();
  const deptScope = await scopedDepartmentIds(eff, u);
  if (deptScope) {
    const deptRows = await db
      .select({ courseId: courses.id, departmentId: courses.departmentId })
      .from(courses)
      .where(inArray(courses.id, [fromOff[0].courseId, toOff[0].courseId]));
    const deptBy = new Map(deptRows.map(r => [r.courseId, r.departmentId]));
    const fromDept = deptBy.get(fromOff[0].courseId) ?? null;
    const toDept = deptBy.get(toOff[0].courseId) ?? null;
    if (!fromDept || !deptScope.includes(fromDept)) return { ok: false, error: 'درس گروه مبدأ در محدودهٔ دسترسی شما نیست.' };
    if (!toDept || !deptScope.includes(toDept)) return { ok: false, error: 'درس گروه مقصد در محدودهٔ دسترسی شما نیست.' };
  }

  // ── بررسی گیت‌ها ──
  const gates = await evaluateTransferGates(
    { enrollmentId, studentId: enr.studentId, termId: fromOff[0].termId, status: enr.status },
    toOfferingId,
    fromOff[0],
    toOff[0],
  );

  if (gates.blocks.length > 0) {
    const overrideAllowed = await getBool('ENROLL_EXPERT_OVERRIDE').catch(() => true);
    if (!overrideAllowed) {
      return { ok: false, error: 'نادیده‌گرفتن آیین‌نامه در حال حاضر غیرمجاز است (تنظیم سازمان).', blocks: gates.blocks, warnings: gates.warnings };
    }
    if (!hasOverride) return { ok: false, blocks: gates.blocks, warnings: gates.warnings };
  }

  // ── اجرای انتقال در یک تراکنش (تغییر offeringId ردیف همان enrollment) ──
  try {
    await db.transaction(async (tx) => {
      await tx.update(enrollments).set({
        offeringId: toOfferingId,
        status: 'REGISTERED',
        waitlistPosition: null,
        enrolledByUserId: me.id,
        enrollOverride: hasOverride ? 1 : 0,
        enrollOverrideReason: hasOverride ? overrideReason : null,
        councilRuling: gates.conflictBlocked ? 1 : 0,
        overriddenRules: hasOverride ? JSON.stringify([...gates.blocks, ...gates.warnings]) : null,
        universityId: toOff[0].universityId ?? null,
      }).where(eq(enrollments.id, enrollmentId));

      // ظرفیت مقصد: افزایش اتمیک (مگر با نادیده‌گرفتن ظرفیت)
      if (gates.capacityBlocked) {
        await tx.update(course_offerings)
          .set({ enrolledCount: sql`${course_offerings.enrolledCount} + 1` })
          .where(eq(course_offerings.id, toOfferingId));
      } else {
        const claimed = await tx.update(course_offerings)
          .set({ enrolledCount: sql`${course_offerings.enrolledCount} + 1` })
          .where(and(eq(course_offerings.id, toOfferingId), sql`${course_offerings.capacity} <= 0 OR ${course_offerings.enrolledCount} < ${course_offerings.capacity}`))
          .returning({ id: course_offerings.id });
        if (!claimed.length) throw new Error('ظرفیت گروه مقصد در همین لحظه تکمیل شد؛ دوباره تلاش کنید.');
      }

      // گروه مبدأ: -۱
      await tx.update(course_offerings)
        .set({ enrolledCount: sql`GREATEST(${course_offerings.enrolledCount} - 1, 0)` })
        .where(eq(course_offerings.id, fromOffId));

      // ردگیری ممیزی (کی/چرا) — زنجیرهٔ audit_logs
      await writeAuditEntry(tx, {
        actorUserId: me.id,
        action: 'GROUP_TRANSFER',
        entityType: 'enrollment',
        entityId: enrollmentId,
        details: JSON.stringify({
          studentId: enr.studentId,
          fromOfferingId: fromOffId, toOfferingId,
          termId: fromOff[0].termId,
          fromGroupNumber: fromOff[0].groupNumber, toGroupNumber: toOff[0].groupNumber,
          status: enr.status,
          override: hasOverride ? 1 : 0,
          overrideReason: hasOverride ? overrideReason : null,
          blocksOverridden: hasOverride ? gates.blocks : [],
          warnings: gates.warnings,
        }),
      });
    });
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? 'خطا در انتقال.', blocks: gates.blocks, warnings: gates.warnings };
  }

  const finalWarnings = hasOverride
    ? [...gates.warnings, ...gates.blocks.map(b => `⚠ (نادیده گرفته شد) ${b}`)]
    : gates.warnings;
  return { ok: true, warnings: finalWarnings, blocks: hasOverride ? gates.blocks : [], enrollmentId };
}