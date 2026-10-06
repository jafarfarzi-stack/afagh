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

import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import {
  academic_terms, class_sessions, classrooms, course_offerings, courses, curriculum_courses, curriculum_versions, departments,
  degree_level_configs, faculties, majors, offering_professors, schedules,
  professor_availabilities, scheduling_room_grants, staff, students, term_scheduling_states, users,
} from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { getSchedulingState, transitionSchedulingPhase, supplyGroupDrafts, allocateSections, allocateRoomQuotas, getSmartSuggestions } from '@/lib/scheduling-engine';
import { runSchedulingHealthCheck, type HealthReport } from '@/lib/scheduling-health';
import { generateClassSessionsForTerm, getTermSessionsSummary, inspectSchedulingHardConflicts } from '@/lib/class-session-generator';
import { detectScheduleConflicts, jalaliDateOf, type RoomCapacityInfo, type ScheduleConflictInput } from '@/lib/scheduling-core';

const EDITORS = ['ADMIN', 'EDU_EXPERT'];
const MANAGERS = EDITORS;

// ─────────────────────────── helpers (غیر export — گارد CI) ───────────────────────────

/** نیمسال‌های واقعی (id/title) برای انتخاب‌گر بالای صفحه */
async function listRealTerms(universityId?: number) {
  return db
    .select({ id: academic_terms.id, code: academic_terms.termCode, title: academic_terms.title, isCurrent: academic_terms.isCurrent })
    .from(academic_terms)
    .where(universityId ? or(eq(academic_terms.universityId, universityId), isNull(academic_terms.universityId)) : undefined)
    .orderBy(desc(academic_terms.id));
}

/** دانشگاه فعال سرور — معیار scope؛ پارامتر کلاینت فقط fallback */
async function serverUniId(fallback?: number): Promise<number | undefined> {
  const uni = await getCurrentUniversity().catch(() => null);
  return uni?.id ?? fallback;
}

/** رشته‌ها = majors + دانشکده (فقط فعال) — فیلتر شده بر اساس universityId */
async function listRealPrograms(universityId?: number) {
  const majorWhere = universityId ? and(eq(majors.isActive, 1), eq(majors.universityId, universityId)) : eq(majors.isActive, 1);
  return db
    .select({
      id: majors.id,
      code: majors.majorCode,
      title: majors.name,
      facultyName: faculties.name,
      degreeLevel: degree_level_configs.title,
      facultyId: majors.facultyId,
      deptFacultyId: departments.facultyId,
    })
    .from(majors)
    .leftJoin(degree_level_configs, eq(degree_level_configs.id, majors.degreeLevelId))
    .leftJoin(departments, eq(departments.id, majors.departmentId))
    .leftJoin(faculties, eq(faculties.id, majors.facultyId))
    .where(majorWhere);
}

/** ورودی‌های واقعی دانشجویان (cohort) = (ورودی، تعداد) — فیلتر شده بر اساس universityId */
async function listRealCohorts(universityId?: number) {
  const where = universityId ? eq(students.universityId, universityId) : undefined;
  const rows = await db
    .select({
      entryYear: students.entryYear,
      expectedStudents: sql<number>`count(*)::int`,
    })
    .from(students)
    .innerJoin(majors, eq(majors.id, students.majorId))
    .where(where)
    .groupBy(students.entryYear)
    .orderBy(desc(students.entryYear));
  return rows.map(r => ({ entryYear: r.entryYear, expectedStudents: Number(r.expectedStudents) }));
}

/** سالن‌های واقعی — فیلتر شده بر اساس universityId */
async function listRealClassrooms(universityId?: number) {
  const where = universityId ? eq(classrooms.universityId, universityId) : undefined;
  return db
    .select({ id: classrooms.id, name: classrooms.name, buildingName: classrooms.buildingName, capacity: classrooms.capacity, roomType: classrooms.roomType })
    .from(classrooms)
    .where(where);
}

/** استادان واقعی (staff + users + گروه) — فیلتر شده بر اساس universityId */
async function listRealProfessors(universityId?: number) {
  const where = universityId ? and(eq(staff.isActive, 1), eq(staff.universityId, universityId)) : eq(staff.isActive, 1);
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
    .where(where)
    .orderBy(staff.id);
}

/** تقاضای واقعی: درس‌های دارای offering در این ترم (با ظرفیت/گروه/استاد/رشتهٔ هدف) — فیلتر شده بر اساس universityId */
async function listRealDemands(termId: number, universityId?: number) {
  const uniFilter = universityId ? eq(course_offerings.universityId, universityId) : undefined;
  const rows = await db
    .select({
      offeringId: course_offerings.id,
      courseId: courses.id,
      courseDeptId: courses.departmentId,
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
      isSharedService: course_offerings.isSharedService,
      offeringScope: courses.offeringScope,
    })
    .from(course_offerings)
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .leftJoin(majors, eq(majors.id, course_offerings.targetMajorId))
    .where(and(eq(course_offerings.termId, termId), uniFilter))
    .orderBy(courses.code);

  const profRows = await db
    .select({ offeringId: offering_professors.offeringId, staffId: offering_professors.staffId })
    .from(offering_professors)
    .innerJoin(course_offerings, eq(course_offerings.id, offering_professors.offeringId))
    .where(and(eq(course_offerings.termId, termId), uniFilter));
  const coTaught = new Set<number>();
  for (const p of profRows) coTaught.add(p.offeringId);

  return rows.map(r => {
    const hasSingleEntryYear = r.entryYearStart != null && r.entryYearStart === r.entryYearEnd;
    return {
      offeringId: r.offeringId,
      courseId: r.courseId,
      courseDeptId: r.courseDeptId,
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
      isSharedService: r.isSharedService === 1,
      offeringScope: r.offeringScope ?? 'DEPARTMENTAL',
    };
  });
}

/** تقاضای مبتنی بر چارت درسی: درس‌های تعریف‌شده در curriculum_versions برای یک رشته/مقطع/ورودی */
async function listCurriculumDemands(termId: number, programId: number, universityId?: number) {
  // 1) پیدا کردن ترم و سال تحصیلی
  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.id, termId)).limit(1);
  if (!term) return [];

  // 2) پیدا کردن رشته (major)
  const [major] = await db.select().from(majors).where(eq(majors.id, programId)).limit(1);
  if (!major) return [];

  // 3) پیدا کردن نسخهٔ برنامه درسی منتشرشده/بایگانی‌شده برای این رشته و مقطع و سال ورودی
  // ورودی‌های متنوع وجود دارند؛ باید تمام ورودی‌های فعال را پوشش دهد
  const uniFilter = universityId ? eq(curriculum_versions.universityId, universityId) : undefined;
  const cvRows = await db
    .select({ id: curriculum_versions.id })
    .from(curriculum_versions)
    .where(and(
      eq(curriculum_versions.majorId, programId),
      eq(curriculum_versions.degreeLevelId, major.degreeLevelId),
      uniFilter,
      sql`${curriculum_versions.status} in ('PUBLISHED','ARCHIVED')`,
      sql`${term.academicYear} between ${curriculum_versions.entryYearFrom} and coalesce(${curriculum_versions.entryYearTo}, 9999)`
    ))
    .orderBy(desc(curriculum_versions.id))
    .limit(1);
  
  if (!cvRows.length) return [];
  const curriculumVersionId = cvRows[0].id;

  // 4) درس‌های این نسخهٔ برنامه با ترم پیشنهادی (recommendedSemester)
  // ترم فعلی را به شماره ترم (semester) مپ کنیم
  // academic_terms.sortOrder یا termCode می‌تواند به semester مپ شود
  // برای سادگی: اگر termType='SUMMER' → semester=9، وگرنه بر اساس sortOrder محاسبه می‌شود
  let currentSemester = 1;
  if (term.isSummer === 1) {
    currentSemester = 9;
  } else if (term.sortOrder) {
    currentSemester = ((term.sortOrder - 1) % 2) + 1; // ساده‌سازی: زوج/فرد
  }

  const ccRows = await db
    .select({
      courseId: curriculum_courses.courseId,
      roleType: curriculum_courses.roleType,
      recommendedSemester: curriculum_courses.recommendedSemester,
      units: curriculum_courses.units,
    })
    .from(curriculum_courses)
    .where(and(
      eq(curriculum_courses.curriculumVersionId, curriculumVersionId),
      or(
        eq(curriculum_courses.recommendedSemester, currentSemester),
        sql`${curriculum_courses.recommendedSemester} is null`
      )
    ));

  if (!ccRows.length) return [];

  const courseIds = ccRows.map(r => r.courseId);

  // 5) ارائهٔ این درس‌ها در ترم جاری (course_offerings)
  const offerRows = await db
    .select({
      offeringId: course_offerings.id,
      courseId: courses.id,
      courseDeptId: courses.departmentId,
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
      isSharedService: course_offerings.isSharedService,
      offeringScope: courses.offeringScope,
    })
    .from(course_offerings)
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .leftJoin(majors, eq(majors.id, course_offerings.targetMajorId))
    .where(and(
      eq(course_offerings.termId, termId),
      inArray(courses.id, courseIds),
      uniFilter
    ))
    .orderBy(courses.code);

  const profRows = await db
    .select({ offeringId: offering_professors.offeringId, staffId: offering_professors.staffId })
    .from(offering_professors)
    .innerJoin(course_offerings, eq(course_offerings.id, offering_professors.offeringId))
    .where(and(eq(course_offerings.termId, termId), inArray(course_offerings.id, offerRows.map(r => r.offeringId))));
  const coTaught = new Set<number>();
  for (const p of profRows) coTaught.add(p.offeringId);

  return offerRows.map(r => {
    const hasSingleEntryYear = r.entryYearStart != null && r.entryYearStart === r.entryYearEnd;
    return {
      offeringId: r.offeringId,
      courseId: r.courseId,
      courseDeptId: r.courseDeptId,
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
      isSharedService: r.isSharedService === 1,
      offeringScope: r.offeringScope ?? 'DEPARTMENTAL',
    };
  });
}

const hm = (t: unknown) => (t == null ? '' : String(t).slice(0, 5));

/** برنامهٔ مصوب واقعی: سطرهای schedules با scheduleType='CLASS' + جزئیات درس/استاد/سالن — فیلتر شده بر اساس universityId */
async function listApprovedOfferings(termId: number, universityId?: number) {
  const uniFilter = universityId ? eq(course_offerings.universityId, universityId) : undefined;
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
    .where(and(eq(schedules.scheduleType, 'CLASS'), eq(course_offerings.termId, termId), sql`${schedules.dayOfWeek} is not null`, uniFilter))
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

/** درخواست‌های جلسهٔ جبرانی واقعی (class_sessions.isMakeUpSession = 1) — فیلتر شده بر اساس universityId */
async function listMakeupSessions(termId: number, universityId?: number) {
  const uniFilter = universityId ? eq(course_offerings.universityId, universityId) : undefined;
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
    .where(and(eq(class_sessions.isMakeUpSession, 1), eq(course_offerings.termId, termId), uniFilter))
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

/** سالن‌هایی که در این ترم سهمیهٔ ALLOCATED دارند — فیلتر شده بر اساس universityId */
async function listAllocatedRoomIds(termId: number, universityId?: number) {
  const uniFilter = universityId ? eq(classrooms.universityId, universityId) : undefined;
  const rows = await db
    .select({ classroomId: scheduling_room_grants.classroomId })
    .from(scheduling_room_grants)
    .innerJoin(classrooms, eq(classrooms.id, scheduling_room_grants.classroomId))
    .where(and(eq(scheduling_room_grants.termId, termId), eq(scheduling_room_grants.status, 'ALLOCATED'), uniFilter));
  return rows.map(r => r.classroomId);
}

// ─────────────────────────── اکشن‌ها — Page Data ───────────────────────────

/** تایپ صریح نتیجهٔ کارتابل — برای narrowing صحیح در کلاینت */
export type SchedulingWorkspaceResult =
  | {
      ok: true;
      terms: { id: number; code: string; title: string; isCurrent: boolean }[];
      selectedTermId: number | null;
      programs: { id: number; code: string; title: string; facultyName: string; degreeLevel: string; facultyId: number | null }[];
      cohorts: { entryYear: number; expectedStudents: number }[];
      classrooms: { id: number; name: string; buildingName: string; capacity: number; roomType: string }[];
      allocatedRoomIds: number[];
      departments: { id: number; name: string }[];
      availabilities: { staffId: number; dayOfWeek: number | null; startTime: string | null; endTime: string | null; status: string | null }[];
      professors: { id: number; name: string; staffCode: string | null; academicRank: string | null; departmentName: string | null }[];
      demands: {
        offeringId: number; courseId: number; courseDeptId: number | null;
        code: string; title: string; units: string; courseType: string;
        capacity: number; groupNumber: number; professorId: number | null; isCoTaught: boolean;
        enrolledCount: number; programId: number; programTitle: string;
        cohortId: string; cohortTitle: string;
        isSharedService: boolean; offeringScope: string;
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
export async function getSchedulingWorkspaceAction(termId?: number, universityId?: number): Promise<SchedulingWorkspaceResult> {
  try {
    await requireRole(EDITORS);
    const uid = await serverUniId(universityId);
    const [terms, programs, classrooms, professors, deptRows] = await Promise.all([
      listRealTerms(uid),
      listRealPrograms(uid),
      listRealClassrooms(uid),
      listRealProfessors(uid),
      db.select({ id: departments.id, name: departments.name }).from(departments).where(uid ? or(eq(departments.universityId, uid), isNull(departments.universityId)) : undefined).orderBy(departments.name),
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
    let availRows: { staffId: number; dayOfWeek: number | null; startTime: unknown; endTime: unknown; status: string | null }[] = [];

    if (resolvedTermId != null) {
      [demands, phases, cohorts, availRows] = await Promise.all([
        listRealDemands(resolvedTermId, uid),
        db.select({ termId: term_scheduling_states.termId, phase: term_scheduling_states.phase }).from(term_scheduling_states)
          .where(uid ? or(eq(term_scheduling_states.universityId, uid), isNull(term_scheduling_states.universityId)) : undefined),
        listRealCohorts(uid),
        db.select({
          staffId: professor_availabilities.staffId,
          dayOfWeek: professor_availabilities.dayOfWeek,
          startTime: professor_availabilities.startTime,
          endTime: professor_availabilities.endTime,
          status: professor_availabilities.status,
        }).from(professor_availabilities).where(and(
          or(eq(professor_availabilities.termId, resolvedTermId), sql`${professor_availabilities.termId} is null`),
          uid ? or(eq(professor_availabilities.universityId, uid), isNull(professor_availabilities.universityId)) : undefined,
        )),
      ]);
      const [inspect, term] = await Promise.all([
        inspectSchedulingHardConflicts(resolvedTermId),
        db.select().from(academic_terms).where(and(
          eq(academic_terms.id, resolvedTermId),
          uid ? or(eq(academic_terms.universityId, uid), isNull(academic_terms.universityId)) : undefined,
        )).limit(1).then(rows => rows[0] ?? null),
      ]);
      hardConflictCount = inspect.total;
      [approvedOfferings, makeupSessions, allocatedRoomIds] = await Promise.all([
        listApprovedOfferings(resolvedTermId, uid),
        listMakeupSessions(resolvedTermId, uid),
        listAllocatedRoomIds(resolvedTermId, uid),
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
        facultyId: (p as any).facultyId ?? (p as any).deptFacultyId ?? null,
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
      departments: deptRows,
      availabilities: availRows.map(a => ({
        staffId: a.staffId, dayOfWeek: a.dayOfWeek,
        startTime: a.startTime == null ? null : String(a.startTime).slice(0, 5),
        endTime: a.endTime == null ? null : String(a.endTime).slice(0, 5),
        status: a.status ?? 'AVAIL',
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

/** تقاضای مبتنی بر چارت درسی برای یک رشته خاص — برای فیلتر کردن دروس در CurriculumAssignTab */
export type CurriculumDemandsResult =
  | { ok: true; demands: Awaited<ReturnType<typeof listCurriculumDemands>> }
  | { ok: false; error: string };

export async function getCurriculumDemandsAction(termId: number, programId: number, universityId?: number): Promise<CurriculumDemandsResult> {
  try {
    await requireRole(EDITORS);
    const demands = await listCurriculumDemands(termId, programId, await serverUniId(universityId));
    return { ok: true, demands };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'خطا در بارگذاری دروس چارت درسی.' };
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

/** گذار فاز برنامه‌ریزی (SUPPLY→ALLOCATION→REVIEW→PUBLISHED پله‌ای) — گیت: انتشار فقط بدون تداخل سخت */
export async function transitionSchedulingPhaseAction(termId: number, to: 'ALLOCATION' | 'REVIEW' | 'PUBLISHED'): Promise<{ ok: true; phase: 'ALLOCATION' | 'REVIEW' | 'PUBLISHED'; from: string } | { ok: false; error: string }> {
  try {
    const user = await requireRole(EDITORS);
    if (to === 'PUBLISHED') {
      const insp = await inspectSchedulingHardConflicts(termId);
      if (insp.total > 0) {
        return {
          ok: false,
          error: `انتشار برنامه متوقف شد: ${insp.total} قید سخت (تداخل استاد/سالن/ظرفیت) باقی است. نمونه: ${insp.hardConflicts[0]?.message ?? ''}`,
        };
      }
    }
    const state = await getSchedulingState(termId);
    const result = await transitionSchedulingPhase(user.id, termId, to);
    revalidatePath('/admin/scheduling');
    return { ok: true as const, phase: result.phase as 'ALLOCATION' | 'REVIEW' | 'PUBLISHED', from: state.phase };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'گذار فاز ناموفق بود.' };
  }
}

export async function getSchedulingDashboardAction(termId?: number) {
  await requireRole(MANAGERS);
  try {
    const uni = await getCurrentUniversity().catch(() => null);
    const uid = uni?.id;
    const scopeOf = (c: any) => (uid ? or(eq(c, uid), isNull(c)) : undefined);
    const [terms, rooms, profs, phases] = await Promise.all([
      db.select({ id: academic_terms.id, termCode: academic_terms.termCode, title: academic_terms.title, isCurrent: academic_terms.isCurrent, isSummer: academic_terms.isSummer, startDate: academic_terms.startDate })
        .from(academic_terms).where(scopeOf(academic_terms.universityId)).orderBy(desc(academic_terms.id)),
      db.select().from(classrooms).where(scopeOf(classrooms.universityId)).orderBy(asc(classrooms.name)),
      db.select({ id: staff.id, staffCode: staff.staffCode, departmentId: staff.departmentId, title: staff.title, name: users.firstName, lastname: users.lastName, isActive: staff.isActive, departmentName: departments.name, facultyName: faculties.name })
        .from(staff)
        .innerJoin(users, eq(users.id, staff.userId))
        .leftJoin(departments, eq(departments.id, staff.departmentId))
        .leftJoin(faculties, eq(faculties.id, departments.facultyId))
        .where(scopeOf(staff.universityId))
        .orderBy(asc(staff.staffCode)),
      db.select().from(term_scheduling_states).where(scopeOf(term_scheduling_states.universityId)),
    ]);

    const current = uid
      ? await db.select().from(academic_terms).where(and(eq(academic_terms.isCurrent, 1), scopeOf(academic_terms.universityId))).limit(1)
      : await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1)).limit(1);
    const targetTermId = termId ?? current[0]?.id ?? terms[0]?.id ?? null;
    if (termId != null && uid && !terms.some(t => t.id === termId)) {
      return { ok: false, error: 'ترم متعلق به دانشگاه دیگری است.' };
    }
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
        .where(and(eq(course_offerings.termId, targetTermId), scopeOf(course_offerings.universityId)))
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
    const uni = await getCurrentUniversity().catch(() => null);
    const uid = uni?.id;
    const offScope = uid ? or(eq(course_offerings.universityId, uid), isNull(course_offerings.universityId)) : undefined;
    // ترم باید متعلق به همین دانشگاه باشد
    const [term] = await db.select({ id: academic_terms.id }).from(academic_terms)
      .where(and(eq(academic_terms.id, termId), offScope ? or(eq(academic_terms.universityId, uid as number), isNull(academic_terms.universityId)) : undefined)).limit(1);
    if (uid && !term) return { ok: false, error: 'ترم متعلق به دانشگاه دیگری است.' };
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
      .where(and(eq(course_offerings.termId, termId), offScope));

    const profRows = await db
      .select({ offeringId: offering_professors.offeringId, staffId: offering_professors.staffId })
      .from(offering_professors)
      .innerJoin(course_offerings, eq(course_offerings.id, offering_professors.offeringId))
      .where(and(eq(course_offerings.termId, termId), offScope));
    const profByOffering = new Map<number, (number | null)[]>();
    for (const p of profRows) {
      if (!profByOffering.has(p.offeringId)) profByOffering.set(p.offeringId, []);
      profByOffering.get(p.offeringId)!.push(p.staffId);
    }

    const roomRows = uid
      ? await db.select().from(classrooms)
        .where(or(eq(classrooms.universityId, uid), isNull(classrooms.universityId)))
      : await db.select().from(classrooms);
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

// ─────────────────────────── اکشن‌ها — موتور واقعی (فاز ۱۲: تأمین/تخصیص/پیشنهاد/سلامت) ───────────────────────────

/** نتیجهٔ پیشنهاد هوشمند موتور (اسلات‌های ممکن برای یک درس/استاد) */
export type SmartSlot = {
  dayOfWeek: number; startTime: string; endTime: string;
  classroomId: number; classroomName: string; classroomCapacity: number;
  score: number; reasons: string[];
};

/** تأمین گروه درسی: درج واقعی offering + schedule + offering_professors (موتور — تراکنشی + قفل + audit) */
export async function supplyGroupDraftsAction(px: {
  termId: number; courseId: number; ownerDepartmentId: number; isSharedService?: boolean;
  drafts: { groupNumber: number; capacity: number; gender: 'MALE' | 'FEMALE' | 'MIXED';
            professorId: number; classroomId: number; dayOfWeek: number; startTime: string; endTime: string }[];
}): Promise<{ ok: true; created: number; offeringIds: number[] } | { ok: false; error: string }> {
  try {
    const user = await requireRole(EDITORS);
    const res = await supplyGroupDrafts(user.id, {
      termId: px.termId, courseId: px.courseId, ownerDepartmentId: px.ownerDepartmentId,
      isSharedService: !!px.isSharedService, drafts: px.drafts,
    });
    revalidatePath('/admin/scheduling');
    revalidatePath('/group-manager/offerings');
    revalidatePath('/student/enroll');
    return { ok: true, created: res.created, offeringIds: res.offeringIds };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'خطا در تأمین گروه درسی.' };
  }
}

/** تخصیص کلاس‌های مشترک (استخر خدمات) به یک گروه — فقط فاز ALLOCATION/REVIEW */
export async function allocateSectionsAction(px: { termId: number; departmentId: number; offeringIds: number[] }) {
  try {
    const user = await requireRole(EDITORS);
    const res = await allocateSections(user.id, px);
    revalidatePath('/admin/scheduling');
    return res;
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'خطا در تخصیص کلاس‌های مشترک.' };
  }
}

/** سهمیه‌بندی (سالن، شیفت) گروه‌ها بر اساس جمعیت دانشجویی — موتور واقعی */
export async function allocateRoomQuotasAction(termId: number) {
  try {
    const user = await requireRole(EDITORS);
    const res = await allocateRoomQuotas(user.id, termId);
    revalidatePath('/admin/scheduling');
    return res;
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'خطا در سهمیه‌بندی سالن‌ها.' };
  }
}

/** پیشنهاد هوشمند موتور: اسلات‌های ممکن بر اساس درٔ دسترس بودنِ واقعی استاد + اشغال سالن‌ها + زونینگ */
export async function getSmartSuggestionsAction(px: {
  termId: number; professorId: number; capacity: number;
  targetFacultyId: number | null; durationMinutes?: number;
}): Promise<{ ok: true; suggestions: SmartSlot[] } | { ok: false; error: string }> {
  try {
    await requireRole(EDITORS);
    const rows = await getSmartSuggestions(px);
    return { ok: true, suggestions: rows };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'خطا در محاسبهٔ پیشنهادها.' };
  }
}

/** عارضه‌یابی خودکار برنامه (عرضه در برابر تقاضا، تداخل‌های پنهان، بهره‌وری سالن‌ها، کلاس‌های یتیم) */
export type SchedulingHealthReport = HealthReport;
export async function getSchedulingHealthAction(termId: number): Promise<{ ok: true; health: HealthReport } | { ok: false; error: string }> {
  try {
    await requireRole(EDITORS);
    const health = await runSchedulingHealthCheck(termId);
    return { ok: true, health };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'خطا در عارضه‌یابی برنامه.' };
  }
}

