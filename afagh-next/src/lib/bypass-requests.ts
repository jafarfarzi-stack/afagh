import 'server-only';

import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms, cart_items, course_offerings, courses, departments,
  enroll_bypass_requests, enrollments, expert_scopes, majors, roles,
  staff, students, user_roles, users,
} from '@/db/schema';
import { notifyUserMultichannel } from '@/lib/messaging';
import { evaluateStudentRegulationStatus } from '@/lib/regulations-engine';
import {
  BYPASS_KIND_LABEL,
  BYPASS_REASON_LABEL,
  BYPASS_STATUS_LABEL,
  type BypassKind,
  type BypassRequestRow,
  type BypassStatus,
} from '@/lib/bypass-labels';

export {
  BYPASS_KIND_LABEL,
  BYPASS_REASON_LABEL,
  BYPASS_STATUS_LABEL,
  type BypassKind,
  type BypassRequestRow,
  type BypassStatus,
} from '@/lib/bypass-labels';

const HOUR = 3600 * 1000;

function hoursOf(value: number | null | undefined, fallback: number): number {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** آزادسازی صندلی رزروشده (هرگز منفی نمی‌شود) */
export async function releaseReservedSeat(offeringId: number): Promise<void> {
  await db.execute(sql`UPDATE "course_offerings" SET "enrolledCount" = GREATEST("enrolledCount" - 1, 0) WHERE id = ${offeringId}`);
}

/** رزرو اتمی صندلی؛ false یعنی ظرفیت پر است */
async function claimSeat(offeringId: number): Promise<boolean> {
  const rows = await db.update(course_offerings)
    .set({ enrolledCount: sql`${course_offerings.enrolledCount} + 1` })
    .where(and(
      eq(course_offerings.id, offeringId),
      sql`${course_offerings.enrolledCount} < ${course_offerings.capacity}`,
    ))
    .returning({ id: course_offerings.id });
  return rows.length > 0;
}

async function studentNameAndMajor(studentId: number) {
  const [row] = await db.select({
    id: students.id,
    userId: students.userId,
    universityId: students.universityId,
    majorId: students.majorId,
    firstName: users.firstName,
    lastName: users.lastName,
    majorName: majors.name,
    majorDeptId: majors.departmentId,
    majorFacultyId: majors.facultyId,
  })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(majors, eq(majors.id, students.majorId))
    .where(eq(students.id, studentId))
    .limit(1);
  return row ?? null;
}

/** شناسهٔ کاربری مدیر گروهِ درس (از سرگروهی گروه آموزشیِ درس) */
async function managerUserIdsForCourse(courseId: number): Promise<number[]> {
  const [c] = await db.select({ departmentId: courses.departmentId }).from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!c?.departmentId) return [];
  const [d] = await db.select({ headStaffId: departments.headStaffId }).from(departments).where(eq(departments.id, c.departmentId)).limit(1);
  if (!d?.headStaffId) return [];
  const [s] = await db.select({ userId: staff.userId }).from(staff).where(eq(staff.id, d.headStaffId)).limit(1);
  return s?.userId ? [s.userId] : [];
}

/** کارشناسان آموزشِ مسئول رشته (از expert_scopes) */
export async function expertUserIdsForMajor(majorId: number | null): Promise<number[]> {
  if (!majorId) return [];
  const [m] = await db.select({
    departmentId: majors.departmentId,
    facultyId: majors.facultyId,
  }).from(majors).where(eq(majors.id, majorId)).limit(1);
  if (!m) return [];

  const conds = [and(eq(expert_scopes.scopeType, 'MAJOR'), eq(expert_scopes.scopeId, majorId))];
  if (m.departmentId) conds.push(and(eq(expert_scopes.scopeType, 'DEPARTMENT'), eq(expert_scopes.scopeId, m.departmentId)));
  if (m.facultyId) conds.push(and(eq(expert_scopes.scopeType, 'FACULTY'), eq(expert_scopes.scopeId, m.facultyId)));

  const rows = await db.select({ userId: expert_scopes.userId }).from(expert_scopes).where(or(...conds));
  return Array.from(new Set(rows.map(r => r.userId).filter((n): n is number => typeof n === 'number')));
}

/** کاربرانِ دارای نقش معاون آموزش */
export async function viceEducationUserIds(): Promise<number[]> {
  const rows = await db.select({ userId: user_roles.userId })
    .from(user_roles)
    .innerJoin(roles, eq(roles.id, user_roles.roleId))
    .where(eq(roles.code, 'VICE_EDU'));
  return Array.from(new Set(rows.map(r => r.userId)));
}

async function notify(userIds: number[], eventCode: string, text: string): Promise<void> {
  for (const userId of Array.from(new Set(userIds))) {
    try {
      await notifyUserMultichannel({ userId, eventCode, text });
    } catch {
      /* خطای ارسال نباید جریان درخواست را متوقف کند */
    }
  }
}

function faDate(d: Date | null | undefined): string {
  if (!d) return '-';
  try {
    return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
  } catch {
    return d.toISOString();
  }
}

const requestSelect = {
  id: enroll_bypass_requests.id,
  studentId: enroll_bypass_requests.studentId,
  offeringId: enroll_bypass_requests.offeringId,
  kind: enroll_bypass_requests.kind,
  status: enroll_bypass_requests.status,
  reasonCode: enroll_bypass_requests.reasonCode,
  reasonText: enroll_bypass_requests.reasonText,
  managerDeadlineAt: enroll_bypass_requests.managerDeadlineAt,
  expertDeadlineAt: enroll_bypass_requests.expertDeadlineAt,
  decidedRole: enroll_bypass_requests.decidedRole,
  decidedAt: enroll_bypass_requests.decidedAt,
  createdAt: enroll_bypass_requests.createdAt,
  courseTitle: courses.title,
  courseCode: courses.code,
  units: courses.units,
  studentName: sql<string>`coalesce(${users.firstName} || ' ' || ${users.lastName}, ${students.studentCode})`,
  studentCode: students.studentCode,
  majorName: majors.name,
};

function shape(rows: Array<Record<string, unknown>>): BypassRequestRow[] {
  return rows as unknown as BypassRequestRow[];
}

/** ثبت درخواست جدید + رزرو صندلی + پیام به مدیر گروه */
export async function createBypassRequest(input: {
  studentId: number;
  offeringId: number;
  kind: BypassKind;
}): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const stu = await studentNameAndMajor(input.studentId);
  if (!stu) return { ok: false, error: 'دانشجو یافت نشد.' };

  const [off] = await db.select({
    id: course_offerings.id,
    courseId: course_offerings.courseId,
    termId: course_offerings.termId,
    capacity: course_offerings.capacity,
    enrolledCount: course_offerings.enrolledCount,
    courseTitle: courses.title,
    units: courses.units,
  })
    .from(course_offerings)
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(eq(course_offerings.id, input.offeringId))
    .limit(1);
  if (!off) return { ok: false, error: 'درس ارائه‌شده یافت نشد.' };

  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.id, off.termId)).limit(1);
  if (!term) return { ok: false, error: 'ترم یافت نشد.' };

  const [dup] = await db.select({ id: enroll_bypass_requests.id })
    .from(enroll_bypass_requests)
    .innerJoin(course_offerings, eq(course_offerings.id, enroll_bypass_requests.offeringId))
    .where(and(
      eq(enroll_bypass_requests.studentId, input.studentId),
      eq(course_offerings.courseId, off.courseId),
      inArray(enroll_bypass_requests.status, ['PENDING_MANAGER', 'ESCALATED_EXPERT']),
    ))
    .limit(1);
  if (dup) return { ok: false, error: 'برای این درس یک درخواست باز دارید.' };

  // ✅ سقف واحد ترم: واحدهای ثبت‌شده + درخواست‌های باز + همین درس
  {
    const [reg] = await db.select({
      units: sql<string>`COALESCE(SUM(${courses.units}), 0)`,
    })
      .from(enrollments)
      .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
      .innerJoin(courses, eq(courses.id, course_offerings.courseId))
      .where(and(
        eq(enrollments.studentId, input.studentId),
        eq(course_offerings.termId, term.id),
        inArray(enrollments.status, ['REGISTERED', 'PENDING_COUNCIL']),
      ));

    const [pending] = await db.select({
      units: sql<string>`COALESCE(SUM(${courses.units}), 0)`,
    })
      .from(enroll_bypass_requests)
      .innerJoin(course_offerings, eq(course_offerings.id, enroll_bypass_requests.offeringId))
      .innerJoin(courses, eq(courses.id, course_offerings.courseId))
      .where(and(
        eq(enroll_bypass_requests.studentId, input.studentId),
        eq(course_offerings.termId, term.id),
        inArray(enroll_bypass_requests.status, ['PENDING_MANAGER', 'ESCALATED_EXPERT']),
      ));

    const status = await evaluateStudentRegulationStatus(input.studentId, term.id).catch(() => null);
    const cap = status?.effectiveMaxUnits ?? null;
    if (cap != null) {
      const used = Number(reg?.units ?? 0) + Number(pending?.units ?? 0) + Number(off.units ?? 0);
      if (used > cap) {
        return {
          ok: false,
          error: `سقف واحد مجاز این ترم ${cap} واحد است و با این درس ${used} واحد می‌شود. ابتدا واحدهای دیگر را حذف کنید.`,
        };
      }
    }
  }

  if (!(await claimSeat(input.offeringId))) {
    return { ok: false, error: 'ظرفیت این درس پر است.' };
  }

  const managerHours = hoursOf(term.bypassManagerHours, 48);
  const managerDeadlineAt = new Date(Date.now() + managerHours * HOUR);

  try {
    const [ins] = await db.insert(enroll_bypass_requests).values({
      studentId: input.studentId,
      offeringId: input.offeringId,
      termId: off.termId,
      universityId: stu.universityId ?? term.universityId ?? null,
      kind: input.kind,
      status: 'PENDING_MANAGER',
      managerDeadlineAt,
      seatReserved: 1,
    }).returning({ id: enroll_bypass_requests.id });

    const managers = await managerUserIdsForCourse(off.courseId);
    await notify(managers, 'BYPASS_SUBMITTED',
      `درخواست ${stu.firstName ?? ''} ${stu.lastName ?? ''} برای ثبت درس «${off.courseTitle}» بدون رعایت ${BYPASS_KIND_LABEL[input.kind]} ثبت شد. مهلت بررسی: ${faDate(managerDeadlineAt)}.`);

    return { ok: true, id: ins.id };
  } catch (e) {
    await releaseReservedSeat(input.offeringId);
    return { ok: false, error: `ثبت درخواست ناموفق بود: ${(e as Error).message}` };
  }
}

/** درخواست‌های بازِ یک دانشجو (برای نمایش در صفحهٔ انتخاب واحد) */
export async function openBypassRequestsOfStudent(studentId: number): Promise<BypassRequestRow[]> {
  const rows = await db.select(requestSelect)
    .from(enroll_bypass_requests)
    .innerJoin(course_offerings, eq(course_offerings.id, enroll_bypass_requests.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .innerJoin(students, eq(students.id, enroll_bypass_requests.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(majors, eq(majors.id, students.majorId))
    .where(and(
      eq(enroll_bypass_requests.studentId, studentId),
      inArray(enroll_bypass_requests.status, ['PENDING_MANAGER', 'ESCALATED_EXPERT']),
    ));
  return shape(rows);
}

/** صندوق مدیر گروه: درخواست‌های بازِ گروه‌های تحت سرپرستی */
export async function bypassInboxForManager(departmentIds: number[]): Promise<BypassRequestRow[]> {
  if (!departmentIds.length) return [];
  const rows = await db.select(requestSelect)
    .from(enroll_bypass_requests)
    .innerJoin(course_offerings, eq(course_offerings.id, enroll_bypass_requests.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .innerJoin(students, eq(students.id, enroll_bypass_requests.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(majors, eq(majors.id, students.majorId))
    .where(and(
      inArray(enroll_bypass_requests.status, ['PENDING_MANAGER', 'ESCALATED_EXPERT']),
      inArray(courses.departmentId, departmentIds),
    ));
  return shape(rows);
}

/** صندوق کارشناس آموزش: درخواست‌های ارجاع‌شدهٔ رشته‌های تحت دامنه */
export async function bypassInboxForExpert(userId: number): Promise<BypassRequestRow[]> {
  const scopes = await db.select().from(expert_scopes).where(eq(expert_scopes.userId, userId));
  if (!scopes.length) return [];
  const majorIds = scopes.filter(s => s.scopeType === 'MAJOR' && s.scopeId).map(s => s.scopeId as number);
  const deptIds = scopes.filter(s => s.scopeType === 'DEPARTMENT' && s.scopeId).map(s => s.scopeId as number);
  const facultyIds = scopes.filter(s => s.scopeType === 'FACULTY' && s.scopeId).map(s => s.scopeId as number);
  const allUniversities = scopes.some(s => s.scopeType === 'UNIVERSITY');

  const majorFilter = majorIds.length
    ? [inArray(students.majorId, majorIds)]
    : [];
  const deptFilter = deptIds.length ? [inArray(majors.departmentId, deptIds)] : [];
  const facultyFilter = facultyIds.length ? [inArray(majors.facultyId, facultyIds)] : [];
  const filters = [...majorFilter, ...deptFilter, ...facultyFilter];
  if (!filters.length && !allUniversities) return [];

  const where = and(
    eq(enroll_bypass_requests.status, 'ESCALATED_EXPERT'),
    filters.length ? or(...filters) : undefined,
    allUniversities ? undefined : undefined,
  );

  const rows = await db.select(requestSelect)
    .from(enroll_bypass_requests)
    .innerJoin(course_offerings, eq(course_offerings.id, enroll_bypass_requests.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .innerJoin(students, eq(students.id, enroll_bypass_requests.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(majors, eq(majors.id, students.majorId))
    .where(where);
  return shape(rows);
}

/** همهٔ درخواست‌های در جریان برای داشبورد معاون آموزش */
export async function bypassOverviewForVice(): Promise<BypassRequestRow[]> {
  const rows = await db.select(requestSelect)
    .from(enroll_bypass_requests)
    .innerJoin(course_offerings, eq(course_offerings.id, enroll_bypass_requests.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .innerJoin(students, eq(students.id, enroll_bypass_requests.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(majors, eq(majors.id, students.majorId))
    .where(inArray(enroll_bypass_requests.status, ['PENDING_MANAGER', 'ESCALATED_EXPERT', 'AUTO_REJECTED', 'REJECTED']))
    .orderBy(enroll_bypass_requests.createdAt);
  return shape(rows);
}

/** ثبت نهایی درس پس از تأیید (صندلی از قبل رزرو شده است) */
async function fulfillEnrollment(requestId: number, actorUserId: number): Promise<{ ok: boolean; error?: string }> {
  const [req] = await db.select().from(enroll_bypass_requests).where(eq(enroll_bypass_requests.id, requestId)).limit(1);
  if (!req) return { ok: false, error: 'درخواست یافت نشد.' };

  const [stu] = await db.select({ universityId: students.universityId }).from(students).where(eq(students.id, req.studentId)).limit(1);

  await db.insert(enrollments).values({
    studentId: req.studentId,
    offeringId: req.offeringId,
    status: 'REGISTERED',
    universityId: stu?.universityId ?? null,
    enrollOverride: 1,
    enrollOverrideReason: `تأیید درخواست بدون رعایت ${BYPASS_KIND_LABEL[req.kind as BypassKind] ?? 'محدودیت'}`,
    enrolledByUserId: actorUserId,
  }).onConflictDoUpdate({
    target: [enrollments.studentId, enrollments.offeringId],
    set: {
      status: 'REGISTERED',
      enrollOverride: 1,
      enrollOverrideReason: `تأیید درخواست بدون رعایت ${BYPASS_KIND_LABEL[req.kind as BypassKind] ?? 'محدودیت'}`,
      enrolledByUserId: actorUserId,
    },
  });

  await db.delete(cart_items).where(and(
    eq(cart_items.studentId, req.studentId),
    eq(cart_items.offeringId, req.offeringId),
  ));

  return { ok: true };
}

export type BypassActorRole = 'MANAGER' | 'EXPERT' | 'VICE' | 'SYSTEM';

/** تأیید درخواست: ثبت خودکار درس + پیام به دانشجو */
export async function approveBypassRequest(input: {
  requestId: number;
  actorUserId: number;
  actorRole: BypassActorRole;
}): Promise<{ ok: boolean; error?: string }> {
  const [req] = await db.select().from(enroll_bypass_requests).where(eq(enroll_bypass_requests.id, input.requestId)).limit(1);
  if (!req) return { ok: false, error: 'درخواست یافت نشد.' };
  if (!['PENDING_MANAGER', 'ESCALATED_EXPERT'].includes(req.status)) {
    return { ok: false, error: 'این درخواست قبلاً بسته شده است.' };
  }

  const done = await fulfillEnrollment(input.requestId, input.actorUserId);
  if (!done.ok) return done;

  await db.update(enroll_bypass_requests).set({
    status: 'APPROVED',
    decidedRole: input.actorRole,
    decidedByUserId: input.actorUserId,
    decidedAt: new Date(),
    seatReserved: 0,
    updatedAt: new Date(),
  }).where(eq(enroll_bypass_requests.id, input.requestId));

  const stu = await studentNameAndMajor(req.studentId);
  const [off] = await db.select({ courseTitle: courses.title })
    .from(course_offerings).innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(eq(course_offerings.id, req.offeringId)).limit(1);

  if (stu) {
    await notify([stu.userId], 'BYPASS_APPROVED',
      `درخواست ثبت درس «${off?.courseTitle ?? ''}» بدون رعایت ${BYPASS_KIND_LABEL[req.kind as BypassKind] ?? 'محدودیت'} تأیید شد و درس به‌صورت خودکار در انتخاب واحد شما ثبت گردید.`);
  }
  return { ok: true };
}

/** رد دستی: دلیل الزامی است، صندلی آزاد و دانشجو مطلع می‌شود */
export async function rejectBypassRequest(input: {
  requestId: number;
  actorUserId: number;
  actorRole: BypassActorRole;
  reasonCode: string;
  reasonText?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (!input.reasonCode) return { ok: false, error: 'دلیل رد الزامی است.' };
  if (input.reasonCode === 'OTHER' && !(input.reasonText ?? '').trim()) {
    return { ok: false, error: 'برای گزینهٔ «سایر» توضیح تکمیلی الزامی است.' };
  }

  const [req] = await db.select().from(enroll_bypass_requests).where(eq(enroll_bypass_requests.id, input.requestId)).limit(1);
  if (!req) return { ok: false, error: 'درخواست یافت نشد.' };
  if (!['PENDING_MANAGER', 'ESCALATED_EXPERT'].includes(req.status)) {
    return { ok: false, error: 'این درخواست قبلاً بسته شده است.' };
  }

  await db.update(enroll_bypass_requests).set({
    status: 'REJECTED',
    reasonCode: input.reasonCode,
    reasonText: input.reasonText ?? null,
    decidedRole: input.actorRole,
    decidedByUserId: input.actorUserId,
    decidedAt: new Date(),
    seatReserved: 0,
    updatedAt: new Date(),
  }).where(eq(enroll_bypass_requests.id, input.requestId));

  if (req.seatReserved) await releaseReservedSeat(req.offeringId);

  const stu = await studentNameAndMajor(req.studentId);
  const [off] = await db.select({ courseTitle: courses.title })
    .from(course_offerings).innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(eq(course_offerings.id, req.offeringId)).limit(1);

  if (stu) {
    const reason = BYPASS_REASON_LABEL[input.reasonCode] ?? input.reasonCode;
    const extra = (input.reasonText ?? '').trim();
    await notify([stu.userId], 'BYPASS_REJECTED',
      `درخواست ثبت درس «${off?.courseTitle ?? ''}» بدون رعایت ${BYPASS_KIND_LABEL[req.kind as BypassKind] ?? 'محدودیت'} رد شد. دلیل: ${reason}.${extra ? ` ${extra}` : ''} این درس طبق قوانین آموزشی برایتان ثبت نشد.`);
  }
  return { ok: true };
}

/**
 * بازگرداندن درخواست توسط معاون آموزش به یکی از دو مرحله:
 * - MANAGER: دوباره در انتظار تصمیم مدیر گروه (مهلت تازه)
 * - EXPERT: ارجاع دوباره به کارشناس آموزش رشته با مهلت تازه
 * صندلی رزروشده دست‌نخورده می‌ماند.
 */
export async function returnBypassRequest(input: {
  requestId: number;
  target: 'MANAGER' | 'EXPERT';
  actorUserId: number;
}): Promise<{ ok: boolean; error?: string }> {
  const [req] = await db.select().from(enroll_bypass_requests).where(eq(enroll_bypass_requests.id, input.requestId)).limit(1);
  if (!req) return { ok: false, error: 'درخواست یافت نشد.' };
  if (!['PENDING_MANAGER', 'ESCALATED_EXPERT'].includes(req.status)) {
    return { ok: false, error: 'این درخواست بسته شده و قابل بازگشت نیست.' };
  }

  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.id, req.termId)).limit(1);
  const [off] = await db.select({ courseId: courses.id, courseTitle: courses.title })
    .from(course_offerings).innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(eq(course_offerings.id, req.offeringId)).limit(1);
  const stu = await studentNameAndMajor(req.studentId);
  const now = new Date();
  const kindLabel = BYPASS_KIND_LABEL[req.kind as BypassKind] ?? 'محدودیت';

  if (input.target === 'MANAGER') {
    const deadline = new Date(now.getTime() + hoursOf(term?.bypassManagerHours, 48) * HOUR);
    await db.update(enroll_bypass_requests).set({
      status: 'PENDING_MANAGER',
      managerDeadlineAt: deadline,
      expertDeadlineAt: null,
      escalatedAt: null,
      managerReminderAt: null,
      expertReminderAt: null,
      studentWarnedAt: null,
      decidedRole: null,
      decidedByUserId: null,
      decidedAt: null,
      updatedAt: now,
    }).where(eq(enroll_bypass_requests.id, input.requestId));

    if (off) {
      const managers = await managerUserIdsForCourse(off.courseId);
      await notify(managers, 'BYPASS_SUBMITTED',
        `درخواست ${stu ? `${stu.firstName} ${stu.lastName}` : 'دانشجو'} برای ثبت درس «${off.courseTitle}» بدون رعایت ${kindLabel} از سوی معاون آموزش برای بررسی مجدد به شما بازگردانده شد. مهلت بررسی: ${faDate(deadline)}.`);
    }
    return { ok: true };
  }

  const deadline = new Date(now.getTime() + hoursOf(term?.bypassExpertHours, 12) * HOUR);
  await db.update(enroll_bypass_requests).set({
    status: 'ESCALATED_EXPERT',
    expertDeadlineAt: deadline,
    escalatedAt: now,
    managerReminderAt: null,
    expertReminderAt: null,
    studentWarnedAt: null,
    decidedRole: null,
    decidedByUserId: null,
    decidedAt: null,
    updatedAt: now,
  }).where(eq(enroll_bypass_requests.id, input.requestId));

  if (off) {
    const experts = await expertUserIdsForMajor(stu?.majorId ?? null);
    if (experts.length) {
      await notify(experts, 'BYPASS_ESCALATED_TO_EXPERT',
        `درخواست ${stu ? `${stu.firstName} ${stu.lastName}` : 'دانشجو'} برای ثبت درس «${off.courseTitle}» بدون رعایت ${kindLabel} از سوی معاون آموزش با دستور بررسی به شما ارجاع شد. مهلت بررسی: ${faDate(deadline)}.`);
    }
  }
  return { ok: true };
}

/** لغو توسط دانشجو */
export async function cancelBypassRequest(requestId: number, studentId: number): Promise<{ ok: boolean; error?: string }> {
  const [req] = await db.select().from(enroll_bypass_requests).where(eq(enroll_bypass_requests.id, requestId)).limit(1);
  if (!req || req.studentId !== studentId) return { ok: false, error: 'درخواست یافت نشد.' };
  if (!['PENDING_MANAGER', 'ESCALATED_EXPERT'].includes(req.status)) {
    return { ok: false, error: 'این درخواست قابل لغو نیست.' };
  }
  await db.update(enroll_bypass_requests).set({ status: 'CANCELLED', seatReserved: 0, updatedAt: new Date() })
    .where(eq(enroll_bypass_requests.id, requestId));
  if (req.seatReserved) await releaseReservedSeat(req.offeringId);
  return { ok: true };
}

/**
 * کار زمان‌بندی‌شده: یادآوری‌ها، ارجاع به کارشناس، و رد خودکار پس از پایان مهلت.
 * هر گام با پرچم زمانیِ خودش یک‌بار اجرا می‌شود.
 */
export async function runBypassDeadlines(): Promise<{
  reminders: number; escalated: number; studentWarnings: number; expired: number;
}> {
  const now = new Date();
  const stats = { reminders: 0, escalated: 0, studentWarnings: 0, expired: 0 };

  const open = await db.select({
    req: enroll_bypass_requests,
    term: academic_terms,
    courseTitle: courses.title,
    courseId: courses.id,
  })
    .from(enroll_bypass_requests)
    .innerJoin(course_offerings, eq(course_offerings.id, enroll_bypass_requests.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .innerJoin(academic_terms, eq(academic_terms.id, enroll_bypass_requests.termId))
    .where(inArray(enroll_bypass_requests.status, ['PENDING_MANAGER', 'ESCALATED_EXPERT']));

  for (const row of open) {
    const req = row.req;
    const warningMs = hoursOf(row.term.bypassReminderHours, 10) * HOUR;
    const stu = await studentNameAndMajor(req.studentId);
    const kindLabel = BYPASS_KIND_LABEL[req.kind as BypassKind] ?? 'محدودیت';

    if (req.status === 'PENDING_MANAGER') {
      if (req.managerDeadlineAt.getTime() <= now.getTime()) {
        const expertHours = hoursOf(row.term.bypassExpertHours, 12);
        const expertDeadlineAt = new Date(now.getTime() + expertHours * HOUR);
        await db.update(enroll_bypass_requests).set({
          status: 'ESCALATED_EXPERT',
          escalatedAt: now,
          expertDeadlineAt,
          updatedAt: now,
        }).where(eq(enroll_bypass_requests.id, req.id));
        stats.escalated += 1;

        const experts = await expertUserIdsForMajor(stu?.majorId ?? null);
        const targets = experts.length ? experts : await viceEducationUserIds();
        await notify(targets, 'BYPASS_ESCALATED_TO_EXPERT',
          `درخواست ${stu?.firstName ?? ''} ${stu?.lastName ?? ''} برای درس «${row.courseTitle}» بدون رعایت ${kindLabel} به دلیل عدم پاسخ مدیر گروه به شما ارجاع شد. مهلت بررسی: ${faDate(expertDeadlineAt)}.`);
        continue;
      }

      if (!req.managerReminderAt && req.managerDeadlineAt.getTime() - warningMs <= now.getTime()) {
        const managers = await managerUserIdsForCourse(row.courseId);
        await notify(managers, 'BYPASS_REMINDER_MANAGER',
          `درخواست ${stu?.firstName ?? ''} ${stu?.lastName ?? ''} برای درس «${row.courseTitle}» هنوز بررسی نشده و مهلت آن تا ${faDate(req.managerDeadlineAt)} است.`);
        await db.update(enroll_bypass_requests)
          .set({ managerReminderAt: now, updatedAt: now })
          .where(eq(enroll_bypass_requests.id, req.id));
        stats.reminders += 1;
      }
      continue;
    }

    // ESCALATED_EXPERT
    const expertDeadline = req.expertDeadlineAt;
    if (expertDeadline) {
      if (expertDeadline.getTime() <= now.getTime()) {
        await db.update(enroll_bypass_requests).set({
          status: 'AUTO_REJECTED',
          reasonCode: 'NO_RESPONSE',
          decidedRole: 'SYSTEM',
          decidedAt: now,
          seatReserved: 0,
          updatedAt: now,
        }).where(eq(enroll_bypass_requests.id, req.id));
        if (req.seatReserved) await releaseReservedSeat(req.offeringId);
        stats.expired += 1;

        if (stu) {
          await notify([stu.userId], 'BYPASS_AUTO_REJECTED',
            `درس «${row.courseTitle}» به دلیل عدم رعایت ${kindLabel} و طبق قوانین آموزشی برایتان ثبت نشد (بدون پاسخ در مهلت تعیین‌شده). برای پیگیری به آموزش ${stu.majorName ?? 'رشته'} مراجعه کنید.`);
        }
        const vice = await viceEducationUserIds();
        await notify(vice, 'BYPASS_VICE_NOTICE',
          `یک درخواست بدون رعایت ${kindLabel} برای درس «${row.courseTitle}» (${stu?.firstName ?? ''} ${stu?.lastName ?? ''}) در مهلت پاسخ‌دادهی بی‌پاسخ ماند و به‌صورت خودکار رد شد. جهت بررسی به داشبورد معاون آموزش مراجعه فرمایید.`);
        continue;
      }

      if (!req.studentWarnedAt && expertDeadline.getTime() - warningMs <= now.getTime()) {
        if (stu) {
          await notify([stu.userId], 'BYPASS_STUDENT_FOLLOWUP_WARNING',
            `درخواست شما برای ثبت درس «${row.courseTitle}» بدون رعایت ${kindLabel} هنوز بررسی نشده است. لطفاً سریعاً از آموزش رشته پیگیری کنید، وگرنه این درس برایتان ثبت نخواهد شد.`);
        }
        await db.update(enroll_bypass_requests).set({ studentWarnedAt: now, updatedAt: now })
          .where(eq(enroll_bypass_requests.id, req.id));
        stats.studentWarnings += 1;
      }

      if (!req.expertReminderAt && expertDeadline.getTime() - warningMs <= now.getTime()) {
        const experts = await expertUserIdsForMajor(stu?.majorId ?? null);
        await notify(experts, 'BYPASS_REMINDER_EXPERT',
          `درخواست ${stu?.firstName ?? ''} ${stu?.lastName ?? ''} برای درس «${row.courseTitle}» هنوز بررسی نشده و مهلت آن تا ${faDate(expertDeadline)} است.`);
        await db.update(enroll_bypass_requests).set({ expertReminderAt: now, updatedAt: now })
          .where(eq(enroll_bypass_requests.id, req.id));
        stats.reminders += 1;
      }
    }
  }

  return stats;
}

/** درخواست‌های بازِ یک درس (برای بررسی ظرفیت/رزرو) */
export async function openBypassCountForOffering(offeringId: number): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` })
    .from(enroll_bypass_requests)
    .where(and(
      eq(enroll_bypass_requests.offeringId, offeringId),
      inArray(enroll_bypass_requests.status, ['PENDING_MANAGER', 'ESCALATED_EXPERT']),
    ));
  return row?.n ?? 0;
}
