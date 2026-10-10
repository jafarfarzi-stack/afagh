'use server';

import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { departments, faculties, majors, staff, students, users } from '@/db/schema';
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
  return {
    faculties: fac,
    departments: dep,
    majors: maj.map(m => ({ ...m, departmentId: m.departmentId ?? null })),
    entryYears: years.map(r => r.y).filter((y): y is number => typeof y === 'number'),
  };
}

export interface BroadcastAudience {
  role: 'student' | 'staff' | 'both';
  facultyId: number | null;
  departmentId: number | null;
  majorId: number | null;
  entryYear: number | null;
  /** فقط فعال‌ها (دانشجوی ACTIVE / پروندهٔ پرسنلی فعال) — پیش‌فرض روشن */
  activeOnly: boolean;
}

/** شناسهٔ کاربرانِ مخاطب — حداکثر ۵۰۰۰ نفر در هر ارسال */
async function audienceUserIds(a: BroadcastAudience): Promise<{ ids: number[]; capped: boolean }> {
  const u = await uniId();
  const out = new Set<number>();
  const CAP = 5000;

  if (a.role === 'student' || a.role === 'both') {
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

  if ((a.role === 'staff' || a.role === 'both') && out.size < CAP) {
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

export async function sendBroadcast(
  a: BroadcastAudience,
  channels: Channel[],
  text: string,
): Promise<{ ok: true; sent: number; failed: number; total: number } | { ok: false; error: string }> {
  try {
    await requireRole(EDU);
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

  const eventCode = `BROADCAST_${Date.now()}`;
  let sent = 0;
  let failed = 0;
  // بسته‌های ۱۰تایی موازی — هم سریع است هم دیتابیس/سرویس را خفه نمی‌کند
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const rs = await Promise.allSettled(
      chunk.map(id => notifyUserMultichannel({ userId: id, eventCode, text: body, channels: ch })),
    );
    for (const r of rs) {
      if (r.status === 'fulfilled') sent++;
      else failed++;
    }
  }
  return { ok: true, sent, failed, total: ids.length };
}
