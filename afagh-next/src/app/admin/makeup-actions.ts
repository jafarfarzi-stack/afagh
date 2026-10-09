'use server';

import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  class_sessions, classrooms, course_offerings, courses, staff, users,
} from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { revalidatePath } from 'next/cache';

export interface MakeupInboxRow {
  id: number;
  courseTitle: string;
  courseCode: string;
  groupNumber: number;
  professorName: string;
  staffCode: string;
  replacedSessionNo: number | null;
  absenceReason: string | null;
  sessionDate: string;
  sessionTime: string;
  topic: string | null;
  status: string;
  roomName: string | null;
  rejectionReason: string | null;
  enrolledCount: number;
  updatedHint: string;
}

const STAFF_ROLES = ['ADMIN', 'EDU_EXPERT'] as const;

/** کارتابل واقعی: جلسات جبرانی PROPOSED + تصمیم‌های اخیر */
export async function getMakeupInbox(): Promise<{ rows: MakeupInboxRow[]; rooms: { id: number; name: string; capacity: number; buildingName: string | null }[] }> {
  await requireRole([...STAFF_ROLES]);
  const uniId = (await getCurrentUniversity()).id;

  const rows = await db
    .select({
      id: class_sessions.id,
      courseTitle: courses.title,
      courseCode: courses.code,
      groupNumber: course_offerings.groupNumber,
      firstName: users.firstName,
      lastName: users.lastName,
      staffCode: staff.staffCode,
      replacedSessionNo: class_sessions.sessionNo,
      replacedId: class_sessions.replacedSessionId,
      absenceReason: class_sessions.absenceReason,
      sessionDate: class_sessions.sessionDate,
      startTime: class_sessions.startTime,
      endTime: class_sessions.endTime,
      topic: class_sessions.topic,
      status: class_sessions.status,
      roomName: classrooms.name,
      rejectionReason: class_sessions.rejectionReason,
      enrolledCount: course_offerings.enrolledCount,
    })
    .from(class_sessions)
    .innerJoin(course_offerings, eq(course_offerings.id, class_sessions.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .leftJoin(staff, eq(staff.id, course_offerings.professorId))
    .leftJoin(users, eq(users.id, staff.userId))
    .leftJoin(classrooms, eq(classrooms.id, class_sessions.roomId))
    .where(and(
      eq(class_sessions.isMakeUpSession, 1),
      eq(course_offerings.universityId, uniId),
      inArray(class_sessions.status, ['PROPOSED', 'SCHEDULED', 'REJECTED']),
    ))
    .orderBy(desc(class_sessions.id))
    .limit(60);

  // شمارهٔ جلسهٔ جایگزین‌شده (نه شمارهٔ خود جلسهٔ جبرانی)
  const replacedIds = rows.map(r => r.replacedId).filter((v): v is number => v != null);
  const replacedMap = new Map<number, number>();
  if (replacedIds.length) {
    const rr = await db.select({ id: class_sessions.id, sessionNo: class_sessions.sessionNo })
      .from(class_sessions).where(inArray(class_sessions.id, replacedIds));
    for (const x of rr) replacedMap.set(x.id, x.sessionNo ?? 0);
  }

  const rooms = await db.select({
    id: classrooms.id, name: classrooms.name,
    capacity: classrooms.capacity, buildingName: classrooms.buildingName,
  })
    .from(classrooms)
    .where(eq(classrooms.universityId, uniId))
    .orderBy(classrooms.name)
    .limit(200);

  return {
    rows: rows.map(r => ({
      id: r.id,
      courseTitle: r.courseTitle,
      courseCode: r.courseCode,
      groupNumber: r.groupNumber,
      professorName: [r.firstName, r.lastName].filter(Boolean).join(' ') || '—',
      staffCode: r.staffCode ?? '—',
      replacedSessionNo: r.replacedId != null ? (replacedMap.get(r.replacedId) ?? null) : null,
      absenceReason: r.absenceReason,
      sessionDate: r.sessionDate,
      sessionTime: `${r.startTime} الی ${r.endTime}`,
      topic: r.topic,
      status: r.status,
      roomName: r.roomName,
      rejectionReason: r.rejectionReason,
      enrolledCount: r.enrolledCount ?? 0,
      updatedHint: '',
    })),
    rooms,
  };
}

/** تأیید + تخصیص سالن */
export async function approveMakeupSession(id: number, roomId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole([...STAFF_ROLES]);
  if (!id || !roomId) return { ok: false, error: 'کلاس انتخاب نشده است.' };
  const [row] = await db.select({ status: class_sessions.status }).from(class_sessions).where(eq(class_sessions.id, id)).limit(1);
  if (!row) return { ok: false, error: 'درخواست یافت نشد.' };
  if (row.status !== 'PROPOSED') return { ok: false, error: 'این درخواست قبلاً بررسی شده است.' };
  await db.update(class_sessions).set({ roomId, status: 'SCHEDULED', rejectionReason: null }).where(eq(class_sessions.id, id));
  revalidatePath('/admin');
  return { ok: true };
}

/** رد درخواست با دلیل */
export async function rejectMakeupSession(id: number, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole([...STAFF_ROLES]);
  const r = (reason ?? '').trim();
  if (!id) return { ok: false, error: 'درخواست نامعتبر است.' };
  if (!r) return { ok: false, error: 'دلیل رد را بنویسید.' };
  const [row] = await db.select({ status: class_sessions.status }).from(class_sessions).where(eq(class_sessions.id, id)).limit(1);
  if (!row) return { ok: false, error: 'درخواست یافت نشد.' };
  if (row.status !== 'PROPOSED') return { ok: false, error: 'این درخواست قبلاً بررسی شده است.' };
  await db.update(class_sessions).set({ status: 'REJECTED', rejectionReason: r.slice(0, 500) }).where(eq(class_sessions.id, id));
  revalidatePath('/admin');
  return { ok: true };
}
