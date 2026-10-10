'use server';

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms,
  course_offerings,
  courses,
  departments,
  enrollments,
  faculties,
  majors,
  notification_deliveries,
  notifications,
  offering_professors,
  staff,
  students,
  users,
} from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { notifyUserMultichannel, type Channel } from '@/lib/messaging';
import { getCurrentUniversity } from '@/lib/university-scope';

const EDU = ['ADMIN', 'EDU_EXPERT'];

async function uniId(): Promise<number | null> {
  try {
    return (await getCurrentUniversity())?.id ?? null;
  } catch {
    return null;
  }
}

export interface BroadcastFilters {
  faculties: { id: number; name: string }[];
  departments: { id: number; name: string; facultyId: number }[];
  majors: { id: number; name: string; departmentId: number | null }[];
  entryYears: number[];
  terms: { id: number; title: string; isCurrent: number | null }[];
}

export async function getBroadcastFilters(): Promise<BroadcastFilters> {
  await requireRole(EDU);
  const u = await uniId();
  const [fac, dep, maj] = await Promise.all([
    db.select({ id: faculties.id, name: faculties.name }).from(faculties)
      .where(u ? eq(faculties.universityId, u) : undefined).orderBy(asc(faculties.name)).limit(500),
    db.select({ id: departments.id, name: departments.name, facultyId: departments.facultyId }).from(departments)
      .where(u ? eq(departments.universityId, u) : undefined).orderBy(asc(departments.name)).limit(2000),
    db.select({ id: majors.id, name: majors.name, departmentId: majors.departmentId }).from(majors)
      .where(u ? eq(majors.universityId, u) : undefined).orderBy(asc(majors.name)).limit(5000),
  ]);
  const years = (await db
    .selectDistinct({ y: students.entryYear })
    .from(students)
    .where(u ? eq(students.universityId, u) : undefined)
    .orderBy(asc(students.entryYear))
    .limit(60)) as { y: number | null }[];
  const terms = await db
    .select({ id: academic_terms.id, title: academic_terms.title, isCurrent: academic_terms.isCurrent })
    .from(academic_terms)
    .where(u ? eq(academic_terms.universityId, u) : undefined)
    .orderBy(desc(academic_terms.id))
    .limit(24);
  return {
    faculties: fac,
    departments: dep,
    majors: maj.map(m => ({ ...m, departmentId: m.departmentId ?? null })),
    entryYears: years.map(r => r.y).filter((y): y is number => typeof y === 'number'),
    terms: terms.map(t => ({ ...t, isCurrent: t.isCurrent ?? 0 })),
  };
}

export interface TermOffering {
  id: number;
  label: string;
  enrolled: number;
}

/**
 * کلاس‌های یک ترم برای فیلتر «دانشجویان یک کلاس» — برچسب شامل درس، گروه و
 * استاد است تا کلاس درست انتخاب شود. فقط ارائه‌های فعال.
 */
export async function getTermOfferings(termId: number): Promise<TermOffering[]> {
  await requireRole(EDU);
  if (!Number.isInteger(termId) || termId <= 0) return [];
  const u = await uniId();
  const conds = [eq(course_offerings.termId, termId), eq(course_offerings.isActive, 1)];
  if (u) conds.push(eq(course_offerings.universityId, u));
  const rows = await db
    .select({
      id: course_offerings.id,
      groupNumber: course_offerings.groupNumber,
      enrolledCount: course_offerings.enrolledCount,
      courseCode: courses.code,
      courseTitle: courses.title,
      professorId: course_offerings.professorId,
    })
    .from(course_offerings)
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(and(...conds))
    .orderBy(asc(courses.title), asc(course_offerings.groupNumber))
    .limit(3000);
  // نام استادِ هر ارائه (برای برچسب)
  const profIds = [...new Set(rows.map(r => r.professorId).filter((n): n is number => typeof n === 'number'))];
  const names = new Map<number, string>();
  if (profIds.length) {
    const ps = await db
      .select({ id: staff.id, firstName: users.firstName, lastName: users.lastName })
      .from(staff)
      .innerJoin(users, eq(users.id, staff.userId))
      .where(inArray(staff.id, profIds.slice(0, 2000)));
    for (const p of ps) names.set(p.id, `${p.firstName || ''} ${p.lastName || ''}`.trim());
  }
  return rows.map(r => ({
    id: r.id,
    enrolled: r.enrolledCount ?? 0,
    label: `${r.courseCode ?? ''} ${r.courseTitle} — گروه ${r.groupNumber ?? 1}` +
      (r.professorId && names.get(r.professorId) ? ` — ${names.get(r.professorId)}` : ''),
  }));
}

export interface BroadcastAudience {
  role: 'student' | 'staff' | 'both';
  facultyId: number | null;
  departmentId: number | null;
  majorId: number | null;
  entryYear: number | null;
  /** ترم + کلاس درس: اگر کلاس انتخاب شود، فقط ثبت‌نام‌شدگان همان کلاس */
  termId: number | null;
  offeringId: number | null;
  /** فقط فعال‌ها (دانشجوی ACTIVE / پروندهٔ پرسنلی فعال) — پیش‌فرض روشن */
  activeOnly: boolean;
}

/** شناسهٔ کاربرانِ مخاطب — حداکثر ۵۰۰۰ نفر در هر ارسال */
async function audienceUserIds(a: BroadcastAudience): Promise<{ ids: number[]; capped: boolean }> {
  const u = await uniId();
  const out = new Set<number>();
  const CAP = 5000;

  if (a.role === 'student' || a.role === 'both') {
    // ── حالت کلاس: فقط ثبت‌نام‌شدگانِ همان ارائه (سریع و دقیق) ──
    if (a.offeringId) {
      const conds = [eq(enrollments.offeringId, a.offeringId), eq(users.isActive, 1)];
      if (a.activeOnly) conds.push(eq(students.status, 'ACTIVE'));
      const stu = (await db.select({ id: users.id }).from(enrollments)
        .innerJoin(students, eq(students.id, enrollments.studentId))
        .innerJoin(users, eq(users.id, students.userId))
        .where(and(...conds)).limit(CAP)) as { id: number }[];
      for (const r of stu) {
        if (out.size >= CAP) break;
        out.add(r.id);
      }
    } else {
      const conds = [eq(users.isActive, 1)];
      if (u) conds.push(eq(students.universityId, u));
      if (a.activeOnly) conds.push(eq(students.status, 'ACTIVE'));
      if (a.majorId) conds.push(eq(students.majorId, a.majorId));
      if (a.entryYear) conds.push(eq(students.entryYear, a.entryYear));
      // فیلتر دانشکده/گروه از روی رشتهٔ دانشجو — اول رشته‌های واجدشرط، بعد دانشجوها
      let stu: { id: number }[] = [];
      if (a.facultyId || a.departmentId) {
        const mConds = [];
        if (a.facultyId) mConds.push(eq(majors.facultyId, a.facultyId));
        if (a.departmentId) mConds.push(eq(majors.departmentId, a.departmentId));
        const mids = (await db.select({ id: majors.id }).from(majors)
          .where(mConds.length > 1 ? and(...mConds) : mConds[0]).limit(5000)).map(r => r.id);
        if (mids.length) {
          stu = (await db.select({ id: users.id }).from(students)
            .innerJoin(users, eq(users.id, students.userId))
            .where(and(...conds, inArray(students.majorId, mids))).limit(CAP)) as { id: number }[];
        }
      } else {
        stu = (await db.select({ id: users.id }).from(students)
          .innerJoin(users, eq(users.id, students.userId))
          .where(and(...conds)).limit(CAP)) as { id: number }[];
      }
      for (const r of stu) {
        if (out.size >= CAP) break;
        out.add(r.id);
      }
    }
  }

  if ((a.role === 'staff' || a.role === 'both') && out.size < CAP) {
    // ── حالت کلاس: استاد(های) همان ارائه ──
    if (a.offeringId) {
      const opStaffIds = (await db
        .select({ staffId: offering_professors.staffId })
        .from(offering_professors)
        .where(eq(offering_professors.offeringId, a.offeringId))
        .limit(20)).map(r => r.staffId);
      const [off] = await db
        .select({ professorId: course_offerings.professorId })
        .from(course_offerings)
        .where(eq(course_offerings.id, a.offeringId))
        .limit(1);
      const sids = [...new Set([...opStaffIds, ...(off?.professorId ? [off.professorId] : [])])];
      if (sids.length) {
        const conds = [inArray(staff.id, sids.slice(0, 100)), eq(users.isActive, 1)];
        if (a.activeOnly) conds.push(eq(staff.isActive, 1));
        const rows = (await db.select({ id: users.id }).from(staff)
          .innerJoin(users, eq(users.id, staff.userId))
          .where(and(...conds)).limit(100)) as { id: number }[];
        for (const r of rows) {
          if (out.size >= CAP) break;
          out.add(r.id);
        }
      }
    } else {
      const conds = [eq(users.isActive, 1)];
      if (u) conds.push(eq(staff.universityId, u));
      if (a.activeOnly) conds.push(eq(staff.isActive, 1));
      if (a.facultyId) conds.push(eq(staff.facultyId, a.facultyId));
      if (a.departmentId) conds.push(eq(staff.departmentId, a.departmentId));
      // ورودی و رشته برای استاد معنا ندارد — نادیده گرفته می‌شود
      const rows = (await db.select({ id: users.id }).from(staff)
        .innerJoin(users, eq(users.id, staff.userId))
        .where(and(...conds)).limit(CAP)) as { id: number }[];
      for (const r of rows) {
        if (out.size >= CAP) break;
        out.add(r.id);
      }
    }
  }

  return { ids: [...out], capped: out.size >= CAP };
}

export async function previewBroadcastCount(
  a: BroadcastAudience,
): Promise<{ ok: true; count: number; capped: boolean } | { ok: false; error: string }> {
  try {
    await requireRole(EDU);
  } catch {
    return { ok: false, error: 'دسترسی ندارید.' };
  }
  try {
    const { ids, capped } = await audienceUserIds(a);
    return { ok: true, count: ids.length, capped };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

const SENDABLE: Channel[] = ['INAPP', 'SMS', 'SOROUSH', 'BALE', 'EITAA'];

export interface BroadcastRecord {
  eventCode: string;
  sender: string;
  sentAt: string | null;
  body: string;
  total: number;
  inbox: number;
  channels: ChannelStat[];
}

function parseBroadcastSender(eventCode: string): number | null {
  // قالب جدید: BROADCAST_<adminId>_<ts> · قدیمی: BROADCAST_<ts>
  const parts = eventCode.split('_');
  if (parts.length >= 3 && parts[0] === 'BROADCAST') {
    const n = Number(parts[1]);
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  return null;
}

/**
 * تاریخچهٔ ارسال‌های همگانی (مدیر/کارشناس و استاد) — چه پیامی، کی، به کجا،
 * با چه نتیجه‌ای. جدیدترین اول. فرستنده از داخل کد رهگیری خوانده می‌شود؛
 * رکوردهای قدیمی فرستنده ندارند و «—» نشان داده می‌شوند.
 */
export async function listBroadcastHistory(
  limit = 20,
): Promise<{ ok: true; records: BroadcastRecord[] } | { ok: false; error: string }> {
  try {
    await requireRole(EDU);
  } catch {
    return { ok: false, error: 'دسترسی ندارید.' };
  }
  try {
    const codes = (await db.execute(sql`
      SELECT "eventCode" AS code, MAX(id) AS m
      FROM notification_deliveries
      WHERE "eventCode" LIKE 'BROADCAST%' OR "eventCode" LIKE 'PROFMSG%'
      GROUP BY "eventCode"
      ORDER BY m DESC
      LIMIT ${Math.min(Math.max(limit, 1), 50)}
    `)) as unknown as { code: string; m: number }[];
    if (!codes.length) return { ok: true, records: [] };
    const list = codes.map(r => r.code);

    const inboxRows = (await db
      .select({ eventCode: notifications.eventCode, n: sql<number>`COUNT(*)` })
      .from(notifications)
      .where(inArray(notifications.eventCode, list))
      .groupBy(notifications.eventCode)) as { eventCode: string | null; n: number }[];
    const inboxBy = new Map(list.map(c => [c, 0] as [string, number]));
    for (const r of inboxRows) if (r.eventCode) inboxBy.set(r.eventCode, Number(r.n));

    const detRows = (await db
      .select({
        eventCode: notification_deliveries.eventCode,
        channel: notification_deliveries.channel,
        status: notification_deliveries.status,
        n: sql<number>`COUNT(*)`,
      })
      .from(notification_deliveries)
      .where(inArray(notification_deliveries.eventCode, list))
      .groupBy(notification_deliveries.eventCode, notification_deliveries.channel, notification_deliveries.status)
    ) as { eventCode: string | null; channel: string; status: string; n: number }[];

    const metaRows = (await db.execute(sql`
      SELECT "eventCode" AS code, MIN("createdAt") AS at,
             (ARRAY_AGG(body ORDER BY id LIMIT 1))[1] AS sample
      FROM notification_deliveries
      WHERE "eventCode" IN (${sql.join(list.map(c => sql`${c}`), sql`, `)})
      GROUP BY "eventCode"
    `)) as unknown as { code: string; at: string | null; sample: string | null }[];

    const senderIds = [...new Set(list.map(parseBroadcastSender).filter((n): n is number => n !== null))];
    const nameBy = new Map<number, string>();
    if (senderIds.length) {
      const us = await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(inArray(users.id, senderIds));
      for (const u of us) nameBy.set(u.id, `${u.firstName || ''} ${u.lastName || ''}`.trim() || `کاربر ${u.id}`);
    }

    const statsBy = new Map<string, Map<string, ChannelStat>>();
    const totals = new Map<string, Set<number>>();
    for (const c of list) {
      statsBy.set(c, new Map());
      totals.set(c, new Set());
    }
    // تعداد گیرندگان یکتا از روی deliveries (userId) — برای هر کد جدا می‌خوانیم
    const userRows = (await db
      .select({ eventCode: notification_deliveries.eventCode, userId: notification_deliveries.userId })
      .from(notification_deliveries)
      .where(inArray(notification_deliveries.eventCode, list))
      .limit(200000)) as { eventCode: string | null; userId: number }[];
    for (const r of userRows) {
      if (!r.eventCode) continue;
      totals.get(r.eventCode)?.add(r.userId);
    }
    for (const r of detRows) {
      if (!r.eventCode) continue;
      const m = statsBy.get(r.eventCode)!;
      let s = m.get(r.channel);
      if (!s) {
        s = { channel: r.channel, sent: 0, skipped: 0, failed: 0 };
        m.set(r.channel, s);
      }
      const n = Number(r.n);
      if (r.status === 'SENT') s.sent += n;
      else if (r.status === 'SKIPPED') s.skipped += n;
      else s.failed += n;
    }

    const metaBy = new Map(metaRows.map(r => [r.code, r]));
    const records: BroadcastRecord[] = list.map(code => {
      const meta = metaBy.get(code);
      const sid = parseBroadcastSender(code);
      const users_n = totals.get(code)?.size ?? 0;
      return {
        eventCode: code,
        sender: sid ? (nameBy.get(sid) ?? `کاربر ${sid}`) : '—',
        sentAt: meta?.at ?? null,
        body: (meta?.sample ?? '').slice(0, 300),
        total: users_n,
        inbox: inboxBy.get(code) ?? 0,
        channels: [...(statsBy.get(code)?.values() ?? [])],
      };
    });
    return { ok: true, records };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface ChannelStat {
  channel: string;
  sent: number;
  skipped: number;
  failed: number;
}

export interface BroadcastReport {
  total: number;
  /** رسیدن به صندوق داخل پورتال (همیشه برای همه ثبت می‌شود) */
  inbox: number;
  /** درخواست‌هایی که کلاً به خطا خوردند (حتی صندوق هم ثبت نشد) */
  failedRequests: number;
  /** تفکیک کانال‌های بیرونی — اینجاست که «عضو نشده» دیده می‌شود */
  channels: ChannelStat[];
}

export async function sendBroadcast(
  a: BroadcastAudience,
  channels: Channel[],
  text: string,
): Promise<{ ok: true; report: BroadcastReport } | { ok: false; error: string }> {
  let me: { id: number } | null = null;
  try {
    await requireRole(EDU);
    const { getSessionUser } = await import('@/lib/auth');
    me = await getSessionUser();
  } catch {
    return { ok: false, error: 'دسترسی ندارید.' };
  }
  const body = String(text || '').trim();
  if (body.length < 3) return { ok: false, error: 'متن پیام خیلی کوتاه است.' };
  if (body.length > 2000) return { ok: false, error: 'متن پیام حداکثر ۲۰۰۰ نویسه.' };
  const ch = (channels as string[]).filter(c => (SENDABLE as string[]).includes(c)) as Channel[];
  if (!ch.length) return { ok: false, error: 'حداقل یک کانال انتخاب کنید.' };

  let ids: number[];
  try {
    ({ ids } = await audienceUserIds(a));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!ids.length) return { ok: false, error: 'هیچ مخاطبی با این فیلترها پیدا نشد.' };

  // کد رهگیری شامل فرستنده است تا در تاریخچه معلوم باشد کی فرستاده
  const eventCode = `BROADCAST_${me?.id ?? 0}_${Date.now()}`;
  const stats = new Map<string, ChannelStat>();
  const bump = (channel: string, status: string) => {
    let s = stats.get(channel);
    if (!s) {
      s = { channel, sent: 0, skipped: 0, failed: 0 };
      stats.set(channel, s);
    }
    if (status === 'SENT') s.sent++;
    else if (status === 'SKIPPED') s.skipped++;
    else s.failed++;
  };
  let inbox = 0;
  let failedRequests = 0;
  // بسته‌های ۱۰تایی موازی — هم سریع است هم دیتابیس/سرویس را خفه نمی‌کند
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const rs = await Promise.allSettled(
      chunk.map(id => notifyUserMultichannel({ userId: id, eventCode, text: body, channels: ch })),
    );
    for (const r of rs) {
      if (r.status === 'fulfilled') {
        inbox++;
        for (const d of r.value.results) bump(d.channel, d.status);
      } else {
        failedRequests++;
      }
    }
  }
  return { ok: true, report: { total: ids.length, inbox, failedRequests, channels: [...stats.values()] } };
}
