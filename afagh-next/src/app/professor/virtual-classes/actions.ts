'use server';

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms,
  course_offerings,
  courses,
  offering_professors,
  staff,
  users,
  virtual_classrooms,
} from '@/db/schema';
import { getSessionUser, getStaffByUser, requireRole } from '@/lib/auth';
import { createBbbMeeting, getBbbStatus } from '@/lib/bbb-api';
import { getBbbConfig } from '@/lib/settings';
import { getTermScope } from '@/lib/term-scope';
import { getCurrentUniversity } from '@/lib/university-scope';

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

/** کلاس‌های خودِ استاد در نیم‌سالِ انتخاب‌شده در سوئیچر (فقط همین ترم) */
export async function listMyVirtualOfferings(): Promise<{ ok: true; rows: ProfOfferingRow[] } | { ok: false; error: string }> {
  try {
    const me = await requireRole(['PROFESSOR']);
    const st = await getStaffByUser(me.id);
    if (!st) return { ok: false, error: 'پروندهٔ استادی یافت نشد.' };

    const uni = await getCurrentUniversity().catch(() => null);
    const scope = await getTermScope(uni?.id ?? null).catch(() => null);
    const termId = scope?.selectedId ?? scope?.effectiveId ?? null;
    if (!termId) return { ok: false, error: 'ابتدا یک نیم‌سال را در سوئیچر بالا انتخاب کنید.' };

    const viaMain = await db
      .select({ offeringId: course_offerings.id })
      .from(course_offerings)
      .where(and(eq(course_offerings.professorId, st.id), eq(course_offerings.termId, termId)))
      .limit(1000);
    const viaCo = await db
      .select({ offeringId: offering_professors.offeringId })
      .from(offering_professors)
      .innerJoin(course_offerings, eq(course_offerings.id, offering_professors.offeringId))
      .where(and(eq(offering_professors.staffId, st.id), eq(course_offerings.termId, termId)))
      .limit(1000);
    const ids = [...new Set([...viaMain, ...viaCo].map(r => r.offeringId))];
    if (!ids.length) return { ok: true, rows: [] };

    const rows = await db
      .select({
        id: course_offerings.id,
        termId: course_offerings.termId,
        groupNumber: course_offerings.groupNumber,
        enrolledCount: course_offerings.enrolledCount,
        professorId: course_offerings.professorId,
        courseCode: courses.code,
        courseTitle: courses.title,
        termTitle: academic_terms.title,
      })
      .from(course_offerings)
      .innerJoin(courses, eq(courses.id, course_offerings.courseId))
      .leftJoin(academic_terms, eq(academic_terms.id, course_offerings.termId))
      .where(inArray(course_offerings.id, ids))
      .orderBy(asc(courses.title), asc(course_offerings.groupNumber));

    const sharedRows = ids.length
      ? await db
          .select({ offeringId: offering_professors.offeringId })
          .from(offering_professors)
          .where(and(eq(offering_professors.staffId, st.id), inArray(offering_professors.offeringId, ids)))
      : [];
    const sharedOfferings = new Set(sharedRows.map(r => r.offeringId));

    const classroomRows = await db
      .select({
        id: virtual_classrooms.id,
        offeringId: virtual_classrooms.courseOfferingId,
        meetingId: virtual_classrooms.bbbMeetingId,
        name: virtual_classrooms.meetingName,
        isRunning: virtual_classrooms.isRunning,
        participantCount: virtual_classrooms.currentAttendanceCount,
        lastSyncedAt: virtual_classrooms.lastSyncedAt,
        lastRunningAt: virtual_classrooms.lastRunningAt,
        recordingsCount: sql<number>`(select count(*)::int from virtual_class_recordings where "classroomId" = ${virtual_classrooms.id})`,
      })
      .from(virtual_classrooms)
      .where(inArray(virtual_classrooms.courseOfferingId, ids));

    const classroomByOffering = new Map(classroomRows.map(r => [r.offeringId, r]));

    const out: ProfOfferingRow[] = rows.map(r => {
      const c = classroomByOffering.get(r.id);
      return {
        offeringId: r.id,
        termId: r.termId ?? null,
        termTitle: r.termTitle ?? '',
        courseCode: r.courseCode ?? '',
        courseTitle: r.courseTitle ?? '',
        groupNumber: r.groupNumber ?? 1,
        enrolledCount: r.enrolledCount ?? 0,
        isOwner: r.professorId === st.id || sharedOfferings.has(r.id),
        classroom: c ? {
          id: c.id,
          meetingId: c.meetingId,
          name: c.name,
          isRunning: c.isRunning === 1,
          participantCount: c.participantCount ?? 0,
          lastSyncedAt: c.lastSyncedAt ? c.lastSyncedAt.toISOString() : null,
          lastRunningAt: c.lastRunningAt ? c.lastRunningAt.toISOString() : null,
          recordingsCount: Number(c.recordingsCount ?? 0),
        } : null,
      };
    });

    // گروه‌بندی ادغامی: یک ردیف برای هر گروه، با همهٔ عرضه‌های عضو
    const groups = new Map<string, typeof out>();
    for (const r of out) {
      // کلید ادغامی از sharedScheduleGroupKey یا (روز/ساعت/اتاق) — اینجا ساده: اگر sharedKey نباشد، هر عرضه جدا
      const key = r.offeringId; // placeholder — merged grouping happens at session level, not offering level
      const list = groups.get(key) ?? [];
      list.push(r);
      groups.set(key, list);
    }
    return { ok: true, rows: out };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** تعریف یا به‌روزرسانی کلاس آنلاین یک ارائه */
export async function upsertVirtualClassroomAction(offeringId: number, meetingName: string): Promise<{ ok: boolean; error?: string; classroomId?: number }> {
  try {
    const me = await requireRole(['PROFESSOR', 'ADMIN', 'EDU_EXPERT']);
    const st = await getStaffByUser(me.id);
    if (!st) return { ok: false, error: 'پروندهٔ استادی یافت نشد.' };

    // مالکیت
    const [off] = await db
      .select({ id: course_offerings.id, professorId: course_offerings.professorId, courseTitle: courses.title, courseCode: courses.code, universityId: course_offerings.universityId })
      .from(course_offerings)
      .innerJoin(courses, eq(courses.id, course_offerings.courseId))
      .where(eq(course_offerings.id, offeringId))
      .limit(1);
    if (!off) return { ok: false, error: 'ارائه یافت نشد.' };

    const isOwner = off.professorId === st.id;
    let isShared = false;
    if (!isOwner) {
      const [co] = await db
        .select({ id: offering_professors.id })
        .from(offering_professors)
        .where(and(eq(offering_professors.offeringId, offeringId), eq(offering_professors.staffId, st.id)))
        .limit(1);
      isShared = !!co;
    }
    if (!isOwner && !isShared && !me.roles.some(r => ['ADMIN', 'EDU_EXPERT'].includes(r))) {
      return { ok: false, error: 'این کلاس مال شما نیست.' };
    }

    const name = String(meetingName || '').trim() || `${off.courseCode} — ${off.courseTitle}`;
    const meetingId = `afagh-off-${offeringId}`;
    const cfg = await getBbbConfig();
    if (!cfg.configured) return { ok: false, error: 'سرویس بیگ‌بلوباتن پیکربندی نشده است — پنل مدیر ← پیکربندی سامانه ← کلاس مجازی' };

    // upsert
    const [existing] = await db
      .select({ id: virtual_classrooms.id })
      .from(virtual_classrooms)
      .where(eq(virtual_classrooms.courseOfferingId, offeringId))
      .limit(1);

    let classroomId: number;
    if (existing) {
      await db.update(virtual_classrooms).set({
        meetingName: name,
        moderatorPw: cfg.moderatorPw,
        attendeePw: cfg.attendeePw,
        universityId: off.universityId,
      }).where(eq(virtual_classrooms.id, existing.id));
      classroomId = existing.id;
    } else {
      const [ins] = await db.insert(virtual_classrooms).values({
        courseOfferingId: offeringId,
        bbbMeetingId: meetingId,
        meetingName: name,
        moderatorPw: cfg.moderatorPw,
        attendeePw: cfg.attendeePw,
        universityId: off.universityId,
      }).returning({ id: virtual_classrooms.id });
      if (!ins) return { ok: false, error: 'خطا در ذخیرهٔ کلاس آنلاین' };
      classroomId = ins.id;
    }

    // ساخت جلسه در سرور BBB (idempotent)
    const ensured = await createBbbMeeting({ meetingId, name });
    if (!ensured.ok) return { ok: false, error: ensured.error, classroomId };

    return { ok: true, classroomId };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** حذف کلاس آنلاین یک ارائه */
export async function deleteVirtualClassroomAction(classroomId: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const me = await requireRole(['PROFESSOR', 'ADMIN', 'EDU_EXPERT']);
    const st = await getStaffByUser(me.id);
    const [row] = await db
      .select({ id: virtual_classrooms.id, offeringId: virtual_classrooms.courseOfferingId, professorId: course_offerings.professorId })
      .from(virtual_classrooms)
      .innerJoin(course_offerings, eq(course_offerings.id, virtual_classrooms.courseOfferingId))
      .where(eq(virtual_classrooms.id, classroomId))
      .limit(1);
    if (!row) return { ok: false, error: 'کلاس آنلاین یافت نشد.' };
    const isOwner = st && row.professorId === st.id;
    if (!isOwner && !me.roles.some(r => ['ADMIN', 'EDU_EXPERT'].includes(r))) return { ok: false, error: 'دسترسی ندارید.' };
    await db.delete(virtual_classrooms).where(eq(virtual_classrooms.id, classroomId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** به‌روزرسانی وضعیت زندهٔ یک یا همهٔ کلاس‌ها از سرور BBB */
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

/** گزارش ادمین: همهٔ کلاس‌های آنلاین با وضعیت برگزاری */
export async function listVirtualClassroomsAdminAction(termId?: number | null): Promise<{ ok: true; rows: AdminVirtualRow[] } | { ok: false; error: string }> {
  try {
    await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU']);
    const rows = (await db.execute(sql`
      select vc.id as "id", vc."bbbMeetingId" as "meetingId", vc."meetingName" as "name",
             vc."isRunning" as "isRunning", coalesce(vc."currentAttendanceCount",0)::int as "participantCount",
             vc."lastSyncedAt" as "lastSyncedAt", vc."lastRunningAt" as "lastRunningAt",
             (select count(*)::int from virtual_class_recordings vr where vr."classroomId" = vc.id) as "recordingsCount",
             c.code as "courseCode", c.title as "courseTitle",
             (pu."firstName" || ' ' || pu."lastName") as "professorName",
             t.title as "termTitle", o."groupNumber" as "groupNumber", coalesce(o."enrolledCount",0)::int as "enrolledCount",
             vc."universityId" as "universityId"
        from virtual_classrooms vc
        join course_offerings o on o.id = vc."courseOfferingId"
        join courses c on c.id = o."courseId"
        left join staff st on st.id = o."professorId"
        left join users pu on pu.id = st."userId"
        left join academic_terms t on t.id = o."termId"
       ${termId ? sql`where o."termId" = ${termId}` : sql``}
       order by t.id desc nulls last, c.code, o."groupNumber"
    `)).rows ?? []) as unknown as AdminVirtualRow[];
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
EOF
echo done