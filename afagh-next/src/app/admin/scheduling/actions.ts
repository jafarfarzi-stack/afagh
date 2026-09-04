'use server';

// ════════════════════════════════════════════════════════════════════════
// فاز ۶ — Server Actions صفحهٔ برنامه‌ریزی درسی (Scheduling)
// ────────────────────────────────────────────────────────────────────────
// D3: الگوی استاندارد ماژول‌ها «Server Actions» است — هر اکشن:
//   ① requireRole مستقیم (گارد CI: audit-actions.mjs)
//   ② تراکنش اتمی + auditChain (زنجیرهٔ حسابرسی) در همان تراکنش
//   ③ خطاها: هرگز throw خام به Client نمی‌رود؛ { ok:false, error } فارسی.
//
// فاز ۶ = اتصال واقعی صفحه به موتور موجود + تولید جلسات واقعی از schedules.
// هیچ UI جدیدی ساخته نشده؛ فقط دادهٔ واقعی جایگزین Mock می‌شود.
// ════════════════════════════════════════════════════════════════════════

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import {
  academic_terms, class_sessions, classrooms, course_offerings, courses, departments,
  degree_level_configs, faculties, majors, offering_professors, schedules,
  scheduling_room_grants, staff, students, term_scheduling_states, users,
} from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getSchedulingState, transitionSchedulingPhase } from '@/lib/scheduling-engine';
import { generateClassSessionsForTerm, getTermSessionsSummary, inspectSchedulingHardConflicts } from '@/lib/class-session-generator';
import { detectScheduleConflicts, jalaliDateOf, type RoomCapacityInfo, type ScheduleConflictInput } from '@/lib/scheduling-core';

const EDITORS = ['ADMIN', 'EDU_EXPERT'];
const MANAGERS = EDITORS;

// ─────────────────────────── helpers (غیر export — گارد CI) ───────────────────────────

/** نیمسال‌های واقعی (id/title) برای انتخاب‌گر بالای صفحه */
async function listRealTerms() {
  return db
    .select({ id: academic_terms.id, code: academic_terms.termCode, title: academic_terms.title, isCurrent: academic_terms.isCurrent })
    .from(academic_terms)
    .orderBy(desc(academic_terms.id));
}

/** رشته‌ها = majors + دانشکده (فقط فعال) */
async function listRealPrograms() {
  return db
    .select({
      id: majors.id,
      code: majors.majorCode,
      title: majors.name,
      facultyName: faculties.name,
      degreeLevel: degree_level_configs.title,
    })
    .from(majors)
    .leftJoin(degree_level_configs, eq(degree_level_configs.id, majors.degreeLevelId))
    .leftJoin(departments, eq(departments.id, majors.departmentId))
    .leftJoin(faculties, eq(faculties.id, majors.facultyId))
    .where(eq(majors.isActive, 1));
}

/** ورودی‌های واقعی دانشجویان (cohort) = (ورودی، تعداد) */
async function listRealCohorts() {
  const rows = await db
    .select({
      entryYear: students.entryYear,
      expectedStudents: sql<number>`count(*)::int`,
    })
    .from(students)
    .innerJoin(majors, eq(majors.id, students.majorId))
    .groupBy(students.entryYear)
    .orderBy(desc(students.entryYear));
  return rows.map(r => ({ entryYear: r.entryYear, expectedStudents: Number(r.expectedStudents) }));
}

/** سالن‌های واقعی */
async function listRealClassrooms() {
  return db
    .select({ id: classrooms.id, name: classrooms.name, buildingName: classrooms.buildingName, capacity: classrooms.capacity, roomType: classrooms.roomType })
    .from(classrooms);
}

/** استادان واقعی (staff + users + گروه) */
async function listRealProfessors() {
  return db
    .select({
      id: staff.id,
      name: users.firstName,
      lastName: users.lastName,
      staffCode: staff.staffCode,
      academicRank: staff.academicRank,
      departmentName: departments.name,
    })
    .from(staff)
    .innerJoin(users, eq(users.id, staff.userId))
    .leftJoin(departments, eq(departments.id, staff.departmentId))
    .where(eq(staff.isActive, 1))
    .orderBy(staff.id);
}

/** تقاضای واقعی: درس‌های دارای offering در این ترم (با ظرفیت/گروه/استاد/رشتهٔ هدف) */
async function listRealDemands(termId: number) {
  const rows = await db
    .select({
      offeringId: course_offerings.id,
      courseCode: courses.code,
      courseTitle: courses.title,
      units: courses.units,
      courseType: courses.courseType,
      capacity: course_offerings.capacity,
      groupNumber: course_offerings.groupNumber,
      professorId: course_offerings.professorId,
      enrolledCount: course_offerings.enrolledCount,
      targetMajorId: course_offerings.targetMajorId,
      targetMajorTitle: majors.name,
      entryYearStart: course_offerings.entryYearStart,
      entryYearEnd: course_offerings.entryYearEnd,
    })
    .from(course_offerings)
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .leftJoin(majors, eq(majors.id, course_offerings.targetMajorId))
    .where(eq(course_offerings.termId, termId))
    .orderBy(courses.code);

  const profRows = await db
    .select({ offeringId: offering_professors.offeringId, staffId: offering_professors.staffId })
    .from(offering_professors)
    .innerJoin(course_offerings, eq(course_offerings.id, offering_professors.offeringId))
    .where(eq(course_offerings.termId, termId));
  const coTaught = new Set<number>();
  for (const p of profRows) coTaught.add(p.offeringId);

  return rows.map(r => {
    const hasSingleEntryYear = r.entryYearStart != null && r.entryYearStart === r.entryYearEnd;
    return {
      offeringId: r.offeringId,
      code: r.courseCode,
      title: r.courseTitle,
      units: String(r.units),
      courseType: r.courseType ?? 'عمومی',
      capacity: r.capacity,
      groupNumber: r.groupNumber,
      professorId: r.professorId,
      isCoTaught: coTaught.has(r.offeringId),
      enrolledCount: r.enrolledCount,
      programId: r.targetMajorId ?? 0,
      programTitle: r.targetMajorTitle ?? 'همهٔ رشته‌ها',
      cohortId: hasSingleEntryYear ? String(r.entryYearStart) : 'ALL',
      cohortTitle: hasSingleEntryYear ? `ورودی ${r.entryYearStart}` : 'کلیهٔ ورودی‌ها',
    };
  });
}

const hm = (t: unknown) => (t == null ? '' : String(t).slice(0, 5));

/** برنامهٔ مصوب واقعی: سطرهای schedules با scheduleType='CLASS' + جزئیات درس/استاد/سالن */
async function listApprovedOfferings(termId: number) {
  const rows = await db
    .select({
      offeringId: course_offerings.id,
      code: courses.code,
      title: courses.title,
      units: courses.units,
      courseType: courses.courseType,
      groupNumber: course_offerings.groupNumber,
      professorId: course_offerings.professorId,
      profFirstName: users.firstName,
      profLastName: users.lastName,
      capacity: course_offerings.capacity,
      enrolledCount: course_offerings.enrolledCount,
      dayOfWeek: schedules.dayOfWeek,
      startTime: schedules.startTime,
      endTime: schedules.endTime,
      roomId: schedules.roomId,
      roomName: classrooms.name,
      buildingName: classrooms.buildingName,
    })
    .from(schedules)
    .innerJoin(course_offerings, eq(course_offerings.id, schedules.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .leftJoin(staff, eq(staff.id, course_offerings.professorId))
    .leftJoin(users, eq(users.id, staff.userId))
    .leftJoin(classrooms, eq(classrooms.id, schedules.roomId))
    .where(and(eq(schedules.scheduleType, 'CLASS'), eq(course_offerings.termId, termId), sql`${schedules.dayOfWeek} is not null`))
    .orderBy(courses.code, course_offerings.groupNumber);

  return rows.map(r => ({
    offeringId: r.offeringId,
    code: r.code,
    title: r.title,
    units: String(r.units),
    courseType: r.courseType ?? 'عمومی',
    groupNumber: r.groupNumber,
    professorId: r.professorId,
    professorName: r.profFirstName ? `${r.profFirstName} ${r.profLastName ?? ''}`.trim() : 'تخصیص‌نیافته',
    capacity: r.capacity,
    enrolledCount: r.enrolledCount,
    dayOfWeek: r.dayOfWeek,
    dayName: ['', 'شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه'][r.dayOfWeek ?? 0] ?? '—',
    startTime: hm(r.startTime),
    endTime: hm(r.endTime),
    roomId: r.roomId,
    roomName: r.roomName ?? '—',
    buildingName: r.buildingName ?? '—',
  }));
}

/** درخواست‌های جلسهٔ جبرانی واقعی (class_sessions.isMakeUpSession = 1) */
async function listMakeupSessions(termId: number) {
  const rows = await db
    .select({
      id: class_sessions.id,
      courseCode: courses.code,
      courseTitle: courses.title,
      profFirstName: users.firstName,
      profLastName: users.lastName,
      sessionNo: class_sessions.sessionNo,
      sessionDate: class_sessions.sessionDate,
      startTime: class_sessions.startTime,
      endTime: class_sessions.endTime,
      replacedSessionId: class_sessions.replacedSessionId,
    })
    .from(class_sessions)
    .innerJoin(course_offerings, eq(course_offerings.id, class_sessions.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .leftJoin(staff, eq(staff.id, course_offerings.professorId))
    .leftJoin(users, eq(users.id, staff.userId))
    .where(and(eq(class_sessions.isMakeUpSession, 1), eq(course_offerings.termId, termId)))
    .orderBy(class_sessions.sessionDate);

  return rows.map(r => ({
    id: r.id,
    courseCode: r.courseCode,
    courseTitle: r.courseTitle,
    profName: r.profFirstName ? `${r.profFirstName} ${r.profLastName ?? ''}`.trim() : '—',
    sessionNo: r.sessionNo ?? 0,
    sessionDate: r.sessionDate,
    sessionTime: `${hm(r.startTime)} تا ${hm(r.endTime)}`,
    replacedSessionId: r.replacedSessionId,
  }));
}

/** سالن‌هایی که در این ترم سهمیهٔ ALLOCATED دارند */
async function listAllocatedRoomIds(termId: number) {
  const rows = await db
    .select({ classroomId: scheduling_room_grants.classroomId })
    .from(scheduling_room_grants)
    .where(and(eq(scheduling_room_grants.termId, termId), eq(scheduling_room_grants.status, 'ALLOCATED')));
  return rows.map(r => r.classroomId);
}

// ─────────────────────────── اکشن‌ها — Page Data ───────────────────────────

/** تایپ صریح نتیجهٔ کارتابل — برای narrowing صحیح در کلاینت */
export type SchedulingWorkspaceResult =
  | {
      ok: true;
      terms: { id: number; code: string; title: string; isCurrent: boolean }[];
      selectedTermId: number | null;
      programs: { id: number; code: string; title: string; facultyName: string; degreeLevel: string }[];
      cohorts: { entryYear: number; expectedStudents: number }[];
      classrooms: { id: number; name: string; buildingName: string; capacity: number; roomType: string }[];
      allocatedRoomIds: number[];
      professors: { id: number; name: string; staffCode: string | null; academicRank: string | null; departmentName: string | null }[];
      demands: {
        offeringId: number; code: string; title: string; units: string; courseType: string;
        capacity: number; groupNumber: number; professorId: number | null; isCoTaught: boolean;
        enrolledCount: number; programId: number; programTitle: string;
        cohortId: string; cohortTitle: string;
      }[];
      phases: Record<number, string>;
      termCalendar: { id: number; startJalali: string | null; endJalali: string | null; startDate: string | null } | null;
      sessionsTotal: number;
      sessionsByOffering: Record<number, { total: number; makeup: number; firstDate: string | null }>;
      hardConflictCount: number;
      approvedOfferings: {
        offeringId: number; code: string; title: string; units: string; courseType: string;
        groupNumber: number; professorId: number | null; professorName: string; capacity: number;
        enrolledCount: number; dayOfWeek: number | null; dayName: string; startTime: string;
        endTime: string; roomId: number | null; roomName: string; buildingName: string;
      }[];
      makeupSessions: {
        id: number; courseCode: string; courseTitle: string; profName: string;
        sessionNo: number; sessionDate: string; sessionTime: string; replacedSessionId: number | null;
      }[];
    }
  | { ok: false; error: string };

/** دادهٔ اولیهٔ واقعی صفحه (جایگزین INITIAL_* های Mock) */
export async function getSchedulingWorkspaceAction(termId?: number): Promise<SchedulingWorkspaceResult> {
  try {
    await requireRole(EDITORS);
    const [terms, programs, classrooms, professors] = await Promise.all([
      listRealTerms(),
      listRealPrograms(),
      listRealClassrooms(),
      listRealProfessors(),
    ]);
    const resolvedTermId = termId ?? terms.find(t => t.isCurrent === 1)?.id ?? terms[0]?.id ?? null;

    let demands: Awaited<ReturnType<typeof listRealDemands>> = [];
    let phases: { termId: number; phase: string }[] = [];
    let termCalendar: { id: number; startJalali: string | null; endJalali: string | null; startDate: string | null } | null = null;
    let sessionsTotal = 0;
    let sessionsByOffering: Record<number, { total: number; makeup: number; firstDate: string | null }> = {};
    let hardConflictCount = 0;
    let cohorts: { entryYear: number; expectedStudents: number }[] = [];
    let approvedOfferings: Awaited<ReturnType<typeof listApprovedOfferings>> = [];
    let makeupSessions: Awaited<ReturnType<typeof listMakeupSessions>> = [];
    let allocatedRoomIds: number[] = [];

    if (resolvedTermId != null) {
      [demands, phases, cohorts] = await Promise.all([
        listRealDemands(resolvedTermId),
        db.select({ termId: term_scheduling_states.termId, phase: term_scheduling_states.phase }).from(term_scheduling_states),
        listRealCohorts(),
      ]);
      const [inspect, term] = await Promise.all([
        inspectSchedulingHardConflicts(resolvedTermId),
        db.select().from(academic_terms).where(eq(academic_terms.id, resolvedTermId)).limit(1).then(rows => rows[0] ?? null),
      ]);
      hardConflictCount = inspect.hardConflicts.length;
      [approvedOfferings, makeupSessions, allocatedRoomIds] = await Promise.all([
        listApprovedOfferings(resolvedTermId),
        listMakeupSessions(resolvedTermId),
        listAllocatedRoomIds(resolvedTermId),
      ]);
      if (term) {
        termCalendar = {
          id: term.id,
          startJalali: term.startDate ? jalaliDateOf(term.startDate) : null,
          endJalali: term.endDate ? jalaliDateOf(term.endDate) : null,
          startDate: term.startDate ? term.startDate.toISOString() : null,
        };
      }
      const summary = await getTermSessionsSummary(resolvedTermId);
      for (const s of summary) {
        sessionsTotal += s.total;
        sessionsByOffering[s.offeringId] = { total: s.total, makeup: s.makeup, firstDate: s.firstDate };
      }
    }

    return {
      ok: true,
      terms: terms.map(t => ({ id: t.id, code: t.code, title: t.title, isCurrent: t.isCurrent === 1 })),
      selectedTermId: resolvedTermId,
      programs: programs.map(p => ({
        id: p.id, code: p.code ?? String(p.id), title: p.title,
        facultyName: p.facultyName ?? '—', degreeLevel: p.degreeLevel ?? '—',
      })),
      cohorts,
      classrooms: classrooms.map(c => ({
        id: c.id, name: c.name, buildingName: c.buildingName ?? '—',
        capacity: c.capacity, roomType: c.roomType ?? 'THEORY',
      })),
      professors: professors.map(p => ({
        id: p.id, name: `${p.name} ${p.lastName}`.trim(), staffCode: p.staffCode,
        academicRank: p.academicRank ?? '—', departmentName: p.departmentName ?? '—',
      })),
      demands,
      phases: Object.fromEntries(phases.map(p => [p.termId, p.phase])),
      termCalendar,
      sessionsTotal,
      sessionsByOffering,
      hardConflictCount,
      approvedOfferings,
      makeupSessions,
      allocatedRoomIds,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'خطا در بارگذاری دادهٔ صفحه.' };
  }
}

// ─────────────────────────── اکشن‌ها — تولید جلسات ───────────────────────────

/** تولید/بازتولید جلسات واقعی از schedules (تراکنشی + audit + گیت قیود سخت) */
export type GenerateSessionsOutcome =
  | { ok: true; generated: number; offerings: number; sessionsPerOffering: Record<number, number>; hardConflicts: unknown[]; termStart: string | null }
  | { ok: false; generated: 0; error: string };

export async function generateClassSessionsAction(px: {
  termId: number;
  sessionsCount?: number;
  holidays?: string[];
  dryRun?: boolean;
}): Promise<GenerateSessionsOutcome> {
  try {
    const user = await requireRole(EDITORS);
    const result = await generateClassSessionsForTerm(user.id, px.termId, {
      sessionsCount: px.sessionsCount,
      holidays: px.holidays,
      dryRun: px.dryRun,
    });
    revalidatePath('/admin/scheduling');
    if (!result.ok) return { ok: false as const, generated: 0 as const, error: 'تولید جلسات ناموفق بود.' };
    return {
      ok: true,
      generated: result.generated,
      offerings: result.offerings,
      sessionsPerOffering: result.sessionsPerOffering,
      hardConflicts: result.hardConflicts,
      termStart: result.termStart,
    };
  } catch (e: any) {
    return { ok: false, generated: 0, error: e?.message ?? 'خطا در تولید جلسات.' };
  }
}

/** گذار فاز برنامه‌ریزی (SUPPLY→ALLOCATION→REVIEW→PUBLISHED پله‌ای) */
export async function transitionSchedulingPhaseAction(termId: number, to: 'ALLOCATION' | 'REVIEW' | 'PUBLISHED') {
  try {
    const user = await requireRole(EDITORS);
    const state = await getSchedulingState(termId);
    const result = await transitionSchedulingPhase(user.id, termId, to);
    revalidatePath('/admin/scheduling');
    return { ...result, from: state.phase };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'گذار فاز ناموفق بود.' };
  }
}

export async function getSchedulingDashboardAction(termId?: number) {
  await requireRole(MANAGERS);
  try {
    const [terms, rooms, profs, phases] = await Promise.all([
      db.select({ id: academic_terms.id, termCode: academic_terms.termCode, title: academic_terms.title, isCurrent: academic_terms.isCurrent, isSummer: academic_terms.isSummer, startDate: academic_terms.startDate })
        .from(academic_terms).orderBy(desc(academic_terms.id)),
      db.select().from(classrooms).orderBy(asc(classrooms.name)),
      db.select({ id: staff.id, staffCode: staff.staffCode, departmentId: staff.departmentId, title: staff.title, name: users.firstName, lastname: users.lastName, isActive: staff.isActive, departmentName: departments.name, facultyName: faculties.name })
        .from(staff)
        .innerJoin(users, eq(users.id, staff.userId))
        .leftJoin(departments, eq(departments.id, staff.departmentId))
        .leftJoin(faculties, eq(faculties.id, departments.facultyId))
        .orderBy(asc(staff.staffCode)),
      db.select().from(term_scheduling_states),
    ]);

    const current = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1)).limit(1);
    const targetTermId = termId ?? current[0]?.id ?? terms[0]?.id ?? null;
    let offerings: any[] = [];
    let schedulesRows: any[] = [];
    let generatedCount = 0;
    let offeringProfMap: { offeringId: number; staffId: number | null; role: string | null }[] = [];

    if (targetTermId != null) {
      offerings = await db
        .select({
          id: course_offerings.id, termId: course_offerings.termId, courseId: course_offerings.courseId,
          groupNumber: course_offerings.groupNumber, capacity: course_offerings.capacity,
          isActive: course_offerings.isActive, code: courses.code, title: courses.title, units: courses.units,
        })
        .from(course_offerings)
        .innerJoin(courses, eq(courses.id, course_offerings.courseId))
        .where(eq(course_offerings.termId, targetTermId))
        .orderBy(asc(course_offerings.courseId), asc(course_offerings.groupNumber));

      const offeringIds = offerings.map((o) => o.id);
      if (offeringIds.length) {
        const [sched, profsOf] = await Promise.all([
          db.select().from(schedules).where(inArray(schedules.offeringId, offeringIds)).orderBy(asc(schedules.offeringId)),
          db.select({ offeringId: offering_professors.offeringId, staffId: offering_professors.staffId, role: offering_professors.role })
            .from(offering_professors).where(inArray(offering_professors.offeringId, offeringIds)),
        ]);
        schedulesRows = sched;
        const gen = await db.select({ id: class_sessions.id }).from(class_sessions).where(inArray(class_sessions.offeringId, offeringIds));
        generatedCount = gen.length;
        offeringProfMap = profsOf as { offeringId: number; staffId: number | null; role: string | null }[];
      }
    }

    const state = phases.find((p) => p.termId === targetTermId) ?? null;

    return {
      ok: true,
      data: {
        terms, rooms, professors: profs, phases: state ? [state] : [],
        activeTermId: targetTermId,
        offerings, schedules: schedulesRows,
        offeringProfessors: offeringProfMap,
        generatedSessionCount: generatedCount,
        phase: state?.phase ?? 'SUPPLY',
      },
    };
  } catch (err: any) {
    console.error('getSchedulingDashboardAction:', err);
    return { ok: false, error: err.message || 'خطا در بارگیری دادهٔ زمان‌بندی' };
  }
}


export async function checkScheduleConflictsAction(termId: number) {
  await requireRole(MANAGERS);
  try {
    const rows = await db
      .select({
        offeringId: schedules.offeringId,
        dayOfWeek: schedules.dayOfWeek,
        startTime: schedules.startTime,
        endTime: schedules.endTime,
        roomId: schedules.roomId,
        capacity: course_offerings.capacity,
        courseTitle: courses.title,
        groupNumber: course_offerings.groupNumber,
      })
      .from(schedules)
      .innerJoin(course_offerings, eq(course_offerings.id, schedules.offeringId))
      .innerJoin(courses, eq(courses.id, course_offerings.courseId))
      .where(eq(course_offerings.termId, termId));

    const profRows = await db
      .select({ offeringId: offering_professors.offeringId, staffId: offering_professors.staffId })
      .from(offering_professors)
      .innerJoin(course_offerings, eq(course_offerings.id, offering_professors.offeringId))
      .where(eq(course_offerings.termId, termId));
    const profByOffering = new Map<number, (number | null)[]>();
    for (const p of profRows) {
      if (!profByOffering.has(p.offeringId)) profByOffering.set(p.offeringId, []);
      profByOffering.get(p.offeringId)!.push(p.staffId);
    }

    const roomRows = await db.select().from(classrooms);
    const rooms: RoomCapacityInfo[] = roomRows.map((r) => ({ id: r.id, capacity: r.capacity, title: r.name }));

    const entries: ScheduleConflictInput[] = rows.map((r) => ({
      offeringId: r.offeringId,
      groupNumber: r.groupNumber,
      dayOfWeek: r.dayOfWeek,
      startTime: String(r.startTime).slice(0, 5),
      endTime: String(r.endTime).slice(0, 5),
      roomId: r.roomId,
      requiredCapacity: r.capacity,
      professorIds: profByOffering.get(r.offeringId) ?? [null],
      offeringTitle: r.courseTitle + (r.groupNumber > 1 ? ` (گروه ${r.groupNumber})` : ''),
    }));

    const conflicts = detectScheduleConflicts(entries, rooms);
    return { ok: true, data: { conflicts, hasConflicts: conflicts.length > 0 } };
  } catch (err: any) {
    console.error('checkScheduleConflictsAction:', err);
    return { ok: false, error: err.message || 'خطا در بررسی تداخل‌ها' };
  }
}

