'use server';

// ════════════════════════════════════════════════════════════════════════
// فاز ۶ — Server Actions زمان‌بندی (اتصال صفحه به موتور واقعی — الگوی D3)
// ────────────────────────────────────────────────────────────────────────
// این لایه، «موجودِ واقعی» (scheduling-engine + class-session-generator)
// را به UI وصل می‌کند. هر اکشن: requireRole مستقیم (گارد CI) + تراکنش/چرخهٔ
// فاز از موتور + بازگشت {ok,error} فارسی.
// ════════════════════════════════════════════════════════════════════════

import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import {
  academic_terms, class_sessions, classrooms, course_offerings, courses, departments,
  faculties, offering_professors, schedules, staff, term_scheduling_states, users,
} from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { detectScheduleConflicts, type RoomCapacityInfo, type ScheduleConflictInput } from '@/lib/scheduling-core';
import { transitionSchedulingPhase } from '@/lib/scheduling-engine';
import { generateClassSessionsForTerm } from '@/lib/class-session-generator';

const MANAGERS = ['ADMIN', 'EDU_EXPERT'];

// ─────────────────────────── داشبورد (دادهٔ واقعی برای Thin Client) ───────────────────────────

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

// ─────────────────────────── چک قیود سخت (پیش از انتشار) ───────────────────────────

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

// ─────────────────────────── چرخهٔ فاز + تولید جلسات ───────────────────────────

export async function transitionSchedulingPhaseAction(termId: number, to: 'ALLOCATION' | 'REVIEW' | 'PUBLISHED') {
  const user = await requireRole(MANAGERS);
  try {
    const result = await transitionSchedulingPhase(user.id, termId, to);
    revalidatePath('/admin/scheduling');
    return { ok: true, message: `فاز برنامه‌ریزی به ${to} منتقل شد.`, data: result };
  } catch (err: any) {
    console.error('transitionSchedulingPhaseAction:', err);
    return { ok: false, error: err.message || 'خطا در انتقال فاز' };
  }
}

export async function generateClassSessionsAction(termId: number, totalSessions?: number) {
  await requireRole(MANAGERS);
  try {
    const result = await generateClassSessionsForTerm(termId, { totalSessions: totalSessions ?? 16 });
    if (!result.ok) return { ok: false, error: result.error };
    revalidatePath('/admin/scheduling');
    return {
      ok: true,
      message: `${result.created} جلسهٔ واقعی ساخته شد (${result.skipped} جلسهٔ موجود رد شد)${result.warnings.length ? `؛ ${result.warnings.length} هشدار` : ''}.`,
      data: result,
    };
  } catch (err: any) {
    console.error('generateClassSessionsAction:', err);
    return { ok: false, error: err.message || 'خطا در تولید جلسات' };
  }
}
