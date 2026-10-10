'use server';

import { and, asc, desc, eq, inArray } from 'drizzle-orm';
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
} from '@/db/schema';
import { getSessionUser, getStaffByUser, requireRole } from '@/lib/auth';
import { notifyUserMultichannel, type Channel } from '@/lib/messaging';

export interface MyClass {
  offeringId: number;
  termTitle: string;
  label: string;
  enrolled: number;
}

/** کلاس‌های خودِ استاد (مدرس اصلی یا همکار) — جدیدترین ترم اول */
export async function getMyClasses(): Promise<MyClass[]> {
  const me = await requireRole(['PROFESSOR']);
  const st = await getStaffByUser(me.id);
  if (!st) return [];

  const viaMain = await db
    .select({ offeringId: course_offerings.id })
    .from(course_offerings)
    .where(eq(course_offerings.professorId, st.id))
    .limit(500);
  const viaCo = await db
    .select({ offeringId: offering_professors.offeringId })
    .from(offering_professors)
    .where(eq(offering_professors.staffId, st.id))
    .limit(500);
  const ids = [...new Set([...viaMain, ...viaCo].map(r => r.offeringId))];
  if (!ids.length) return [];

  const rows = await db
    .select({
      id: course_offerings.id,
      termId: course_offerings.termId,
      groupNumber: course_offerings.groupNumber,
      enrolledCount: course_offerings.enrolledCount,
      courseCode: courses.code,
      courseTitle: courses.title,
      termTitle: academic_terms.title,
    })
    .from(course_offerings)
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .leftJoin(academic_terms, eq(academic_terms.id, course_offerings.termId))
    .where(inArray(course_offerings.id, ids.slice(0, 500)))
    .orderBy(desc(course_offerings.termId), asc(courses.title))
    .limit(500);

  // فقط ترم جاری و یکی‌دو ترم اخیر — کلاس ۵ سال پیش به درد پیام نمی‌خورد
  const termIds = [...new Set(rows.map(r => r.termId))].sort((a, b) => b - a).slice(0, 3);
  return rows
    .filter(r => termIds.includes(r.termId))
    .map(r => ({
      offeringId: r.id,
      termTitle: r.termTitle ?? '',
      enrolled: r.enrolledCount ?? 0,
      label: `${r.courseCode ?? ''} ${r.courseTitle} — گروه ${r.groupNumber ?? 1}`,
    }));
}

// پیامک هزینه دارد و دست استاد نیست — فقط کانال‌های رایگان
const PROF_SENDABLE: Channel[] = ['INAPP', 'SOROUSH', 'BALE', 'EITAA'];

export interface ClassMsgReport {
  total: number;
  inbox: number;
  sent: { channel: string; n: number }[];
  noAddress: { channel: string; n: number }[];
  failedRequests: number;
}

/** شمارش ثبت‌نام‌شدگان فعال یک کلاس (پیش‌نمایش) */
export async function previewMyClass(offeringId: number): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  try {
    const mine = await getMyClasses();
    if (!mine.some(m => m.offeringId === offeringId)) return { ok: false, error: 'این کلاس مال شما نیست.' };
    const rows = await db
      .select({ id: users.id })
      .from(enrollments)
      .innerJoin(students, eq(students.id, enrollments.studentId))
      .innerJoin(users, eq(users.id, students.userId))
      .where(and(
        eq(enrollments.offeringId, offeringId),
        eq(students.status, 'ACTIVE'),
        eq(users.isActive, 1),
      ))
      .limit(5000);
    return { ok: true, count: rows.length };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** پیام استاد به دانشجویان کلاس خودش */
export async function sendMyClassMessage(
  offeringId: number,
  channels: Channel[],
  text: string,
): Promise<{ ok: true; report: ClassMsgReport } | { ok: false; error: string }> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: 'ابتدا وارد شوید.' };
  const mine = await getMyClasses().catch(() => []);
  const cls = mine.find(m => m.offeringId === offeringId);
  if (!cls) return { ok: false, error: 'این کلاس مال شما نیست.' };

  const body = String(text || '').trim();
  if (body.length < 3) return { ok: false, error: 'متن پیام خیلی کوتاه است.' };
  if (body.length > 2000) return { ok: false, error: 'متن پیام حداکثر ۲۰۰۰ نویسه.' };
  const ch = (channels as string[]).filter(c => (PROF_SENDABLE as string[]).includes(c)) as Channel[];
  if (!ch.length) return { ok: false, error: 'حداقل یک کانال انتخاب کنید.' };

  const rows = (await db
    .select({ id: users.id })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .where(and(
      eq(enrollments.offeringId, offeringId),
      eq(students.status, 'ACTIVE'),
      eq(users.isActive, 1),
    ))
    .limit(5000)) as { id: number }[];
  if (!rows.length) return { ok: false, error: 'در این کلاس دانشجوی فعالی ثبت‌نام نکرده است.' };

  const eventCode = `PROFMSG_${me.id}_${Date.now()}`;
  const sentBy = new Map<string, number>();
  const skipBy = new Map<string, number>();
  let inbox = 0;
  let failedRequests = 0;
  for (let i = 0; i < rows.length; i += 10) {
    const rs = await Promise.allSettled(
      rows.slice(i, i + 10).map(r => notifyUserMultichannel({ userId: r.id, eventCode, text: body, channels: ch })),
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
      total: rows.length,
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

/** پیام‌هایی که خودِ استاد قبلاً به کلاس‌هایش فرستاده */
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
