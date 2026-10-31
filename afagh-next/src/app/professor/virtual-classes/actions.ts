'use server';

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms,
  course_offerings,
  courses,
  enrollments,
  offering_professors,
  staff,
  students,
  users,
  virtual_classrooms,
  virtual_class_recordings,
} from '@/db/schema';
import { getSessionUser, getStaffByUser, requireRole } from '@/lib/auth';
import { notifyUserMultichannel, type Channel } from '@/lib/messaging';
import { getTermScope } from '@/lib/term-scope';
import { getCurrentUniversity } from '@/lib/university-scope';
import { createBbbMeeting, getBbbRecordings, getBbbStatus } from '@/lib/bbb-api';

export interface ProfOfferingRow {
  offeringId: number;
  termId: number | null;
  termTitle: string;
  courseCode: string;
  courseTitle: string;
  groupNumber: number;
  enrolledCount: number;
  isOwner: boolean;
  classroom: {
    id: number;
    meetingId: string;
    name: string;
    isRunning: boolean;
    participantCount: number;
    lastSyncedAt: string | null;
    lastRunningAt: string | null;
    recordingsCount: number;
  } | null;
}

export interface AdminVirtualRow {
  id: number;
  meetingId: string;
  name: string;
  isRunning: boolean;
  participantCount: number;
  lastSyncedAt: string | null;
  lastRunningAt: string | null;
  recordingsCount: number;
  courseCode: string;
  courseTitle: string;
  professorName: string;
  termTitle: string;
  groupNumber: number;
  enrolledCount: number;
  universityId: number | null;
}

export interface MyClass {
  offeringId: number;
  memberOfferingIds: number[];
  termTitle: string;
  label: string;
  enrolled: number;
}

export async function getMyClasses(): Promise<MyClass[]> {
  const me = await requireRole(['PROFESSOR']);
  const st = await getStaffByUser(me.id);
  if (!st) return [];

  const viaMain = await db
    .select({ offeringId: course_offerings.id })
    .from(course_offerings)
    .where(eq(course_offerings.professorId, st.id))
    .limit(1000);
  const viaCo = await db
    .select({ offeringId: offering_professors.offeringId })
    .from(offering_professors)
    .where(eq(offering_professors.staffId, st.id))
    .limit(1000);
  const ids = [...new Set([...viaMain, ...viaCo].map(r => r.offeringId))];
  if (!ids.length) return [];

  const rows = await db
    .select({
      id: course_offerings.id,
      termId: course_offerings.termId,
      groupNumber: course_offerings.groupNumber,
      enrolledCount: course_offerings.enrolledCount,
      sharedKey: course_offerings.sharedScheduleGroupKey,
      courseCode: courses.code,
      courseTitle: courses.title,
      termTitle: academic_terms.title,
    })
    .from(course_offerings)
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .leftJoin(academic_terms, eq(academic_terms.id, course_offerings.termId))
    .where(inArray(course_offerings.id, ids))
    .orderBy(desc(course_offerings.termId), asc(courses.title))
    .limit(1000);

  const uni = await getCurrentUniversity().catch(() => null);
  const scope = await getTermScope(uni?.id ?? null).catch(() => null);
  const termId = scope?.selectedId ?? scope?.effectiveId ?? null;
  if (!termId) return [];

  const inTerm = rows.filter(r => r.termId === termId);

  const groups = new Map<string, typeof inTerm>();
  for (const r of inTerm) {
    const key = r.sharedKey && !r.sharedKey.startsWith('SOLO-') ? `K:${r.sharedKey}` : `O:${r.id}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  return [...groups.values()].map(list => {
    const primary = list[0];
    const codes = [...new Set(list.map(r => r.courseCode ?? ''))].filter(Boolean);
    const groupNos = list.map(r => r.groupNumber ?? 1);
    const groupsLabel = list.length > 1 ? ` — کلاس ادغامی (گروه‌های ${groupNos.join('، ')})` : ` — گروه ${groupNos[0]}`;
    return {
      offeringId: primary.id,
      memberOfferingIds: list.map(r => r.id),
      termTitle: primary.termTitle ?? '',
      enrolled: list.reduce((s, r) => s + (r.enrolledCount ?? 0), 0),
      label: `${codes.join(' / ')} ${primary.courseTitle}${groupsLabel}`,
    };
  });
}

const PROF_SENDABLE: Channel[] = ['INAPP', 'SOROUSH', 'BALE', 'EITAA'];

export interface ClassMsgReport {
  total: number;
  inbox: number;
  sent: { channel: string; n: number }[];
  noAddress: { channel: string; n: number }[];
  failedRequests: number;
}

async function activeRecipientUserIds(offeringIds: number[]): Promise<number[]> {
  const rows = (await db
    .select({ id: users.id })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .where(and(
      inArray(enrollments.offeringId, offeringIds),
      eq(students.status, 'ACTIVE'),
      eq(users.isActive, 1),
    ))
    .limit(10000)) as { id: number }[];
  return [...new Set(rows.map(r => r.id))];
}

export async function previewMyClass(offeringId: number): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  try {
    const mine = await getMyClasses();
    const cls = mine.find(m => m.offeringId === offeringId);
    if (!cls) return { ok: false, error: 'این کلاس مال شما نیست یا خارج از نیم‌سال انتخاب‌شده است.' };
    const ids = await activeRecipientUserIds(cls.memberOfferingIds);
    return { ok: true, count: ids.length };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function sendMyClassMessage(
  offeringId: number,
  channels: Channel[],
  text: string,
): Promise<{ ok: true; report: ClassMsgReport } | { ok: false; error: string }> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: 'ابتدا وارد شوید.' };
  const mine = await getMyClasses().catch(() => []);
  const cls = mine.find(m => m.offeringId === offeringId);
  if (!cls) return { ok: false, error: 'این کلاس مال شما نیست یا خارج از نیم‌سال انتخاب‌شده است.' };

  const body = String(text || '').trim();
  if (body.length < 3) return { ok: false, error: 'متن پیام خیلی کوتاه است.' };
  if (body.length > 2000) return { ok: false, error: 'متن پیام حداکثر ۲۰۰۰ نویسه.' };
  const ch = (channels as string[]).filter(c => (PROF_SENDABLE as string[]).includes(c)) as Channel[];
  if (!ch.length) return { ok: false, error: 'حداقل یک کانال انتخاب کنید.' };

  const recipientIds = await activeRecipientUserIds(cls.memberOfferingIds);
  if (!recipientIds.length) return { ok: false, error: 'در این کلاس دانشجوی فعالی ثبت‌نام نکرده است.' };

  const eventCode = `PROFMSG_${me.id}_${Date.now()}`;
  const sentBy = new Map<string, number>();
  const skipBy = new Map<string, number>();
  let inbox = 0;
  let failedRequests = 0;
  for (let i = 0; i < recipientIds.length; i += 10) {
    const rs = await Promise.allSettled(
      recipientIds.slice(i, i + 10).map(id => notifyUserMultichannel({ userId: id, eventCode, text: body, channels: ch })),
    );
    for (const r of rs) {
      if (r.status === 'fulfilled') {
        inbox++;
        for (const d of r.value.results) {
          if (d.status === 'SENT') sentBy.set(d.channel, (sentBy.get(d.channel) ?? 0) + 1);
          else if (d.status === 'SKIPPED') skipBy.set(d.channel, (skipBy.get(d.channel) ?? 0) + 1);
        }
      } else {
        failedRequests++;
      }
    }
  }
  return {
    ok: true,
    report: {
      total: recipientIds.length,
      inbox,
      sent: [...sentBy].map(([channel, n]) => ({ channel, n })),
      noAddress: [...skipBy].map(([channel, n]) => ({ channel, n })),
      failedRequests,
    },
  };
}

export interface MyMsgRecord {
  eventCode: string;
  sentAt: string | null;
  body: string;
  total: number;
}

export async function listMyClassMessages(): Promise<MyMsgRecord[]> {
  const me = await getSessionUser();
  if (!me) return [];
  try {
    const { sql } = await import('drizzle-orm');
    const codes = (await db.execute(sql`
      SELECT "eventCode" AS code, MIN("createdAt") AS at,
             (ARRAY_AGG(body ORDER BY id LIMIT 1))[1] AS sample,
             COUNT(DISTINCT "userId") AS n
      FROM notification_deliveries
      WHERE "eventCode" LIKE ${`PROFMSG_${me.id}_%`}
      GROUP BY "eventCode"
      ORDER BY MIN(id) DESC
      LIMIT 20
    `)) as unknown as { code: string; at: string | null; sample: string | null; n: number }[];
    return codes.map(c => ({
      eventCode: c.code,
      sentAt: c.at,
      body: (c.sample ?? '').slice(0, 300),
      total: Number(c.n),
    }));
  } catch {
    return [];
  }
}

export async function listVirtualClassroomsAdminAction(termId?: number | null): Promise<{ ok: true; rows: AdminVirtualRow[] } | { ok: false; error: string }> {
  try {
    await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU']);
    const rows = await db
      .select({
        id: virtual_classrooms.id,
        meetingId: virtual_classrooms.bbbMeetingId,
        name: virtual_classrooms.meetingName,
        isRunning: virtual_classrooms.isRunning,
        participantCount: sql<number>`coalesce(${virtual_classrooms.currentAttendanceCount},0)::int`,
        lastSyncedAt: virtual_classrooms.lastSyncedAt,
        lastRunningAt: virtual_classrooms.lastRunningAt,
        recordingsCount: sql<number>`(select count(*)::int from virtual_class_recordings vr where vr."classroomId" = ${virtual_classrooms.id})`,
        courseCode: courses.code,
        courseTitle: courses.title,
        professorName: sql<string>`coalesce(${users.firstName} || ' ' || ${users.lastName}, '')`,
        termTitle: academic_terms.title,
        groupNumber: course_offerings.groupNumber,
        enrolledCount: sql<number>`coalesce(${course_offerings.enrolledCount},0)::int`,
        universityId: virtual_classrooms.universityId,
      })
      .from(virtual_classrooms)
      .innerJoin(course_offerings, eq(course_offerings.id, virtual_classrooms.courseOfferingId))
      .innerJoin(courses, eq(courses.id, course_offerings.courseId))
      .leftJoin(staff, eq(staff.id, course_offerings.professorId))
      .leftJoin(users, eq(users.id, staff.userId))
      .leftJoin(academic_terms, eq(academic_terms.id, course_offerings.termId))
      .where(termId ? eq(course_offerings.termId, termId) : undefined)
      .orderBy(desc(academic_terms.id), asc(courses.code), asc(course_offerings.groupNumber));
    return { ok: true, rows: rows.map(r => ({
      ...r,
      isRunning: r.isRunning === 1 || r.isRunning === true,
      lastSyncedAt: r.lastSyncedAt ? new Date(r.lastSyncedAt).toISOString() : null,
      lastRunningAt: r.lastRunningAt ? new Date(r.lastRunningAt).toISOString() : null,
    })) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function syncVirtualClassStatusAction(classroomId?: number | null): Promise<{ ok: boolean; error?: string; updated?: number }> {
  try {
    const me = await requireRole(['PROFESSOR', 'ADMIN', 'EDU_EXPERT']);
    const st = await getStaffByUser(me.id);
    const base = db.select({ id: virtual_classrooms.id, meetingId: virtual_classrooms.bbbMeetingId }).from(virtual_classrooms);
    const rows = classroomId
      ? await base.where(eq(virtual_classrooms.id, classroomId))
      : await base;
    let updated = 0;
    for (const r of rows) {
      const stt = await getBbbStatus(r.meetingId);
      if (!stt.ok) continue;
      await db.update(virtual_classrooms).set({
        isRunning: stt.running ? 1 : 0,
        currentAttendanceCount: stt.participantCount,
        lastSyncedAt: new Date(),
        ...(stt.running ? { lastRunningAt: new Date() } : {}),
      }).where(eq(virtual_classrooms.id, r.id));
      updated++;
    }
    return { ok: true, updated };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function syncBbbRecordingsAction(classroomId?: number | null): Promise<{ ok: boolean; error?: string; classrooms?: number; added?: number }> {
  try {
    const me = await requireRole(['PROFESSOR', 'ADMIN', 'EDU_EXPERT']);
    const st = await getStaffByUser(me.id);
    const base = db.select({ id: virtual_classrooms.id, meetingId: virtual_classrooms.bbbMeetingId, universityId: virtual_classrooms.universityId }).from(virtual_classrooms);
    const rows = classroomId
      ? await base.where(eq(virtual_classrooms.id, classroomId))
      : await base;
    let added = 0;
    for (const r of rows) {
      const rec = await getBbbRecordings(r.meetingId);
      if (!rec.ok) continue;
      const existing = await db
        .select({ url: virtual_class_recordings.recordingUrl })
        .from(virtual_class_recordings)
        .where(eq(virtual_class_recordings.classroomId, r.id));
      const known = new Set(existing.map(e => e.url));
      for (const x of rec.recordings) {
        if (!x.playbackUrl || known.has(x.playbackUrl)) continue;
        await db.insert(virtual_class_recordings).values({
          classroomId: r.id,
          sessionTitle: x.name,
          recordingUrl: x.playbackUrl,
          durationMinutes: x.durationMinutes,
          recordedAt: x.startTime ?? new Date(),
          viewsCount: 0,
          universityId: r.universityId ?? null,
        });
        added++;
      }
    }
    return { ok: true, classrooms: rows.length, added };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
