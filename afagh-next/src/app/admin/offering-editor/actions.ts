'use server';

import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { db, withUserRls } from '@/db';
import {
  academic_terms, classrooms, course_offerings, courses, departments, schedules, staff, users,
} from '@/db/schema';
import { getCurrentUniversity } from '@/lib/university-scope';
import { requireRoleOrPermission } from '@/lib/permissions-enforcer';
import { currentExpertFilters } from '@/lib/expert-scope';

const EDU = ['ADMIN', 'EDU_EXPERT'];
const EDU_PERM = ['scheduling:manage_chart'];

export interface OfferingEditRow {
  offeringId: number;
  code: string; title: string; groupNumber: number; units: number | null;
  professorName: string; capacity: number; enrolledCount: number;
  departmentId: number | null;
  classRows: { id: number; day: number | null; start: string | null; end: string | null; roomId: number | null }[];
  exam: { id: number | null; date: string | null; start: string | null; end: string | null } | null;
}

/** فهرست ارائه‌های ترم برای ویرایش — کارشناس فقط دامنهٔ خودش */
export async function listOfferingsForEditor(termId: number): Promise<OfferingEditRow[]> {
  await requireRoleOrPermission(EDU, EDU_PERM);
  const u = await getCurrentUniversity().catch(() => null);
  const eff = await currentExpertFilters().catch(() => null);

  const offs = await db
    .select({
      offeringId: course_offerings.id, code: courses.code, title: courses.title,
      groupNumber: course_offerings.groupNumber, units: courses.units,
      professorId: course_offerings.professorId, capacity: course_offerings.capacity,
      enrolledCount: course_offerings.enrolledCount, departmentId: courses.departmentId,
    })
    .from(course_offerings)
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(and(
      eq(course_offerings.termId, termId), eq(course_offerings.isActive, 1),
      u ? eq(course_offerings.universityId, u.id) : undefined,
      ...await scopeOffConds(eff),
    ))
    .orderBy(asc(courses.title), asc(course_offerings.groupNumber)).limit(4000);
  const offIds = offs.map(o => o.offeringId);
  const schedRows = offIds.length
    ? await db.select({
        id: schedules.id, offeringId: schedules.offeringId, scheduleType: schedules.scheduleType,
        dayOfWeek: schedules.dayOfWeek, startTime: schedules.startTime, endTime: schedules.endTime,
        examDate: schedules.examDate, roomId: schedules.roomId,
      }).from(schedules).where(inArray(schedules.offeringId, offIds))
    : [];
  const profIds = [...new Set(offs.map(o => o.professorId).filter((n): n is number => typeof n === 'number'))];
  const profName = new Map<number, string>();
  if (profIds.length) {
    const ps = await db.select({ id: staff.id, firstName: users.firstName, lastName: users.lastName })
      .from(staff).innerJoin(users, eq(users.id, staff.userId)).where(inArray(staff.id, profIds));
    for (const p of ps) profName.set(p.id, `${p.firstName || ''} ${p.lastName || ''}`.trim());
  }
  return offs.map(o => {
    const rows = schedRows.filter(s => s.offeringId === o.offeringId);
    const classRows = rows.filter(r => r.scheduleType === 'CLASS').map(r => ({
      id: r.id, day: r.dayOfWeek, start: r.startTime ? String(r.startTime).slice(0, 5) : null,
      end: r.endTime ? String(r.endTime).slice(0, 5) : null, roomId: r.roomId,
    }));
    const ex = rows.find(r => r.scheduleType === 'EXAM');
    return {
      offeringId: o.offeringId, code: o.code, title: o.title, groupNumber: o.groupNumber,
      units: o.units == null ? null : Number(o.units),
      professorName: (o.professorId != null && profName.get(o.professorId)) || '—',
      capacity: o.capacity, enrolledCount: o.enrolledCount ?? 0, departmentId: o.departmentId ?? null,
      classRows,
      exam: ex ? { id: ex.id, date: ex.examDate ?? null, start: ex.startTime ? String(ex.startTime).slice(0, 5) : null, end: ex.endTime ? String(ex.endTime).slice(0, 5) : null } : null,
    };
  });
}

export async function getRoomsForEditor(): Promise<{ id: number; name: string }[]> {
  await requireRoleOrPermission(EDU, EDU_PERM);
  const u = await getCurrentUniversity().catch(() => null);
  const { sql } = await import('drizzle-orm');
  return (await db.select({ id: classrooms.id, name: classrooms.name }).from(classrooms)
    .where(u ? sql`${classrooms.universityId} = ${u.id} OR ${classrooms.universityId} IS NULL` : undefined)
    .orderBy(asc(classrooms.name))).map(r => ({ id: r.id, name: r.name }));
}

export interface OfferingEditInput {
  offeringId: number;
  capacity: number;
  classRows: { id: number; day: number; start: string; end: string; roomId: number | null }[];
  exam?: { id?: number | null; date: string; start: string; end: string } | null;
  overrideReason?: string;
}

function toMin(s: string): number { const [h, m] = String(s || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); }

/** ذخیرهٔ تغییرات (ظرفیت + زمان کلاس/امتحان) با گارد تداخل؛ تداخل → نیازمند دلیل */
export async function saveOfferingEditorAction(input: OfferingEditInput): Promise<{ ok: boolean; error?: string }> {
  const me = await requireRoleOrPermission(EDU, EDU_PERM);
  const [off] = await db.select().from(course_offerings).where(eq(course_offerings.id, input.offeringId)).limit(1);
  if (!off) return { ok: false, error: 'ارائه یافت نشد.' };
  const u = await getCurrentUniversity().catch(() => null);
  if (u && off.universityId && off.universityId !== u.id) return { ok: false, error: 'این ارائه متعلق به دانشگاه دیگری است.' };
  if (u && off.universityId == null) return { ok: false, error: 'دانشگاه ارائه نامشخص است.' };
  // IDOR: هر شناسهٔ برنامه/امتحانِ ارسالی باید متعلق به همین ارائه باشد
  const suppliedIds = [...(input.classRows || []).map(c => Number(c.id)).filter(Number.isInteger),
    ...(input.exam?.id ? [Number(input.exam.id)] : [])].filter(Number.isInteger);
  if (suppliedIds.length) {
    const owned = await db.select({ id: schedules.id }).from(schedules)
      .where(and(inArray(schedules.id, suppliedIds), eq(schedules.offeringId, input.offeringId)));
    if (owned.length !== [...new Set(suppliedIds)].length) return { ok: false, error: 'شناسهٔ برنامه نامعتبر است.' };
  }
  // سالن‌ها باید متعلق به همین دانشگاه باشند
  const roomIds = [...new Set((input.classRows || []).map(c => c.roomId).filter((n): n is number => typeof n === 'number' && Number.isInteger(n)))];
  if (roomIds.length && u) {
    const roomRows = await db.select({ id: classrooms.id, universityId: classrooms.universityId }).from(classrooms).where(inArray(classrooms.id, roomIds));
    if (roomRows.length !== roomIds.length) return { ok: false, error: 'سالن نامعتبر است.' };
    if (roomRows.some(r => r.universityId && r.universityId !== u.id)) return { ok: false, error: 'این سالن متعلق به دانشگاه دیگری است.' };
  }

  const eff = await currentExpertFilters().catch(() => null);
  const [course] = await db.select({ departmentId: courses.departmentId }).from(courses).where(eq(courses.id, off.courseId)).limit(1);
  if (me.roles.includes('EDU_EXPERT') && eff) {
    if (eff.departmentIds) {
      if (!course?.departmentId || !eff.departmentIds.includes(course.departmentId)) return { ok: false, error: 'این درس در دامنهٔ شما نیست.' };
    } else if (eff.facultyIds) {
      if (course?.departmentId) {
        const [d] = await db.select({ facultyId: departments.facultyId }).from(departments).where(eq(departments.id, course.departmentId)).limit(1);
        if (!d || !eff.facultyIds.includes(d.facultyId)) return { ok: false, error: 'این درس در دامنهٔ شما نیست.' };
      } else return { ok: false, error: 'این درس در دامنهٔ شما نیست.' };
    }
  }

  // گارد تداخل: جلسات/امتحاناتِ دیگرِ همین ترم را بارگیری و با تغییرات مقایسه کن
  const others = await db
    .select({
      offeringId: schedules.offeringId, dayOfWeek: schedules.dayOfWeek,
      startTime: schedules.startTime, endTime: schedules.endTime,
      examDate: schedules.examDate, scheduleType: schedules.scheduleType, roomId: schedules.roomId, professorId: course_offerings.professorId,
    })
    .from(schedules)
    .innerJoin(course_offerings, eq(course_offerings.id, schedules.offeringId))
    .where(and(eq(course_offerings.termId, off.termId), ne(schedules.offeringId, input.offeringId)));
  const conflicts: string[] = [];
  for (const c of input.classRows || []) {
    for (const o of others) {
      if (o.scheduleType === 'EXAM') continue;
      if (c.day === o.dayOfWeek && o.startTime && o.endTime && c.start && c.end &&
          toMin(c.start) < toMin(String(o.endTime)) && toMin(String(o.startTime)) < toMin(c.end)) {
        if (c.roomId && o.roomId === c.roomId) conflicts.push(`تداخل سالن در ${c.day} ${c.start}–${c.end}`);
        if (o.professorId && off.professorId && o.professorId === off.professorId) conflicts.push(`تداخل استاد در ${c.day}`);
      }
    }
  }
  if (input.exam) {
    for (const o of others) {
      if (o.scheduleType !== 'EXAM') continue;
      if (o.examDate && input.exam.date === String(o.examDate) && input.exam.start &&
          o.startTime && toMin(input.exam.start) < toMin(String(o.endTime || o.startTime)) && toMin(String(o.startTime)) < toMin(input.exam.end)) {
        conflicts.push(`تداخل امتحان در ${input.exam.date}`);
      }
    }
  }
  if (conflicts.length && !String(input.overrideReason || '').trim()) {
    return { ok: false, error: `تداخل: ${conflicts[0]} — برای ذخیره با وجود تداخل، دلیل (حکم/مجوز) را وارد کن.` };
  }
  const reason = String(input.overrideReason || '').trim();

  // ظرفیت
  if (Number.isInteger(input.capacity) && input.capacity >= 0) {
    await db.update(course_offerings).set({ capacity: input.capacity }).where(eq(course_offerings.id, input.offeringId));
  }
  // جلسات کلاس
  await withUserRls(me.id, async tx => {
    for (const c of input.classRows || []) {
      await tx.update(schedules).set({
        dayOfWeek: c.day, startTime: c.start || '00:00', endTime: c.end || '00:00', roomId: c.roomId ?? null,
      }).where(eq(schedules.id, c.id));
    }
    // امتحان: به‌روزرسانی ردیف موجود یا درج یک EXAM اگر نبود
    if (input.exam) {
      if (input.exam.id) {
        await tx.update(schedules).set({ examDate: input.exam.date || null, startTime: input.exam.start || '00:00', endTime: input.exam.end || '00:00' }).where(eq(schedules.id, input.exam.id));
      } else if (input.exam.date && input.exam.start) {
        await tx.insert(schedules).values({ offeringId: input.offeringId, scheduleType: 'EXAM', examDate: input.exam.date, startTime: input.exam.start, endTime: input.exam.end || input.exam.start });
      }
    }
  });
  return { ok: true };
}

export async function listTermsForEditor(): Promise<{ id: number; title: string; isCurrent: boolean }[]> {
  await requireRoleOrPermission(EDU, EDU_PERM);
  const u = await getCurrentUniversity().catch(() => null);
  const rows = await db.select({ id: academic_terms.id, title: academic_terms.title, isCurrent: academic_terms.isCurrent })
    .from(academic_terms)
    .where(u ? eq(academic_terms.universityId, u.id) : undefined)
    .orderBy(desc(academic_terms.id));
  return rows.map(r => ({ id: r.id, title: r.title, isCurrent: (r.isCurrent ?? 0) === 1 }));
}

async function scopeOffConds(eff: Awaited<ReturnType<typeof currentExpertFilters>>): Promise<any[]> {
  if (!eff) return [];
  if (eff.departmentIds) return [inArray(courses.departmentId, eff.departmentIds)];
  if (eff.facultyIds) {
    const ids = (await db.select({ id: departments.id }).from(departments).where(inArray(departments.facultyId, eff.facultyIds))).map(r => r.id);
    return ids.length ? [inArray(courses.departmentId, ids)] : [eq(courses.id, -1)];
  }
  return [];
}