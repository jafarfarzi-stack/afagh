/**
 * «کلاس ادغامی» در سطحِ سرور — گروه‌بندی برای نمایش و انتشارِ ثبت.
 *
 * منطقِ خالصِ تشخیص در `merged-class-core.ts` است؛ این‌جا فقط داده می‌آید و
 * دو کار می‌کند:
 *
 *   ۱) **نمایش تک‌ردیفی**: جلساتِ یک اتاق/یک روز را به «کلاس فیزیکی» گروه
 *      می‌کند تا UI فقط ردیفِ نماینده را با نشان 🔗 ببیند.
 *   ۲) **ثبتِ خودکار روی بقیه**: وقتی کاربر روی ردیفِ نماینده «ثبت حضور»
 *      زد، همهٔ جلسه‌های عضو هم ثبت می‌شوند. اگر عضوی جلسهٔ امروز را نداشته
 *      باشد (مثلاً چون ژنراتورِ جلسات برایش سانس نساخته)، این‌جا از روی
 *      برنامهٔ هفتگیِ خودش ساخته می‌شود — وگرنه آن کلاس برای همیشه بدون
 *      حضور می‌ماند و محاسبهٔ حق‌التدریس ناقص می‌شود.
 *
 * ⚠ خودکارِ ساختِ جلسه فقط برای اعضای یک **ادغامِ دستی** (`K:`) انجام
 *   می‌شود؛ ادغامِ خودکارِ ساعت/استاد/اتاق (`A:`) هرگز جلسهٔ تازه نمی‌سازد،
 *   چون در آن حالت هر طرف جلسهٔ خودش را از قبل دارد.
 */

import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { class_sessions, course_offerings, schedules } from '@/db/schema';
import { iranDowFromJalali } from '@/lib/room-checkin';
import {
  groupSessionsIntoMerged,
  type MergableSessionRow,
  type MergedSessionGroup,
} from '@/lib/merged-class-core';
import { listSessionsInRoom, type RoomSessionRow } from '@/lib/room-session-lookup';

/** جلسه به‌همراه عنوان درس — برای متنِ نشانِ ادغام */
export type MergableRoomSession = RoomSessionRow & { title?: string | null };

/** `RoomSessionRow` (با `id`) → شکلِ خالصِ `MergableSessionRow` (با `sessionId`) */
const toMergable = (r: MergableRoomSession): MergableSessionRow => ({
  sessionId: r.id,
  offeringId: r.offeringId,
  roomId: r.roomId,
  startTime: r.startTime,
  endTime: r.endTime,
  professorId: r.professorId,
  sharedScheduleGroupKey: r.sharedScheduleGroupKey,
});

/**
 * جلساتِ امروزِ یک اتاق، گروه‌بندی‌شده به «کلاس فیزیکی».
 * ترتیب خروجی = ترتیب ساعت شروع (همان `listSessionsInRoom`).
 */
export async function listMergedSessionsInRoom(
  roomId: number,
  jalaliDate: string,
): Promise<MergedSessionGroup<MergableRoomSession>[]> {
  const rows = await listSessionsInRoom(roomId, jalaliDate);
  return groupSessionsIntoMerged(rows.map(r => ({ ...r, title: r.courseTitle })).map(toMergableWithRow))
    .map(g => ({ ...g, members: g.members.map(m => m.row) }));
}

/** گروه‌بندی با حفظِ ردیفِ اصلی در `row` تا UI عنوان/استاد را از همان بگیرد */
function toMergableWithRow(r: MergableRoomSession): MergableSessionRow & { row: MergableRoomSession } {
  return { ...toMergable(r), row: r };
}

/** کلیدِ ادغامِ دستیِ یک ارائه — `null` اگر جدا (`SOLO-`) یا خالی باشد */
async function manualKeyOf(offeringId: number): Promise<string | null> {
  const [o] = await db
    .select({ k: course_offerings.sharedScheduleGroupKey })
    .from(course_offerings)
    .where(eq(course_offerings.id, offeringId))
    .limit(1);
  const k = String(o?.k ?? '').trim();
  if (!k || k.startsWith('SOLO-')) return null;
  return k;
}

/** ارائه‌های عضوِ یک ادغامِ دستی (به‌جز خودِ ارائهٔ ورودی) */
async function siblingOfferingIds(key: string, selfOfferingId: number): Promise<number[]> {
  const rows = await db
    .select({ id: course_offerings.id })
    .from(course_offerings)
    .where(eq(course_offerings.sharedScheduleGroupKey, key));
  return rows.map(r => r.id).filter(id => id !== selfOfferingId);
}

/**
 * آیا این ارائه در این اتاق و این روز/ساعت کلاس دارد؟ (از برنامهٔ هفتگی)
 * شرطِ لازم برای ساختِ جلسهٔ گم‌شده — بدون این شرط، ارائه‌ای که اصلاً در آن
 * اتاق برنامه ندارد را به زور وارد گروه می‌کردیم.
 */
async function hasWeeklySlot(
  offeringId: number,
  roomId: number,
  dow: number,
  startTime: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: schedules.id })
    .from(schedules)
    .where(and(
      eq(schedules.offeringId, offeringId),
      eq(schedules.roomId, roomId),
      eq(schedules.scheduleType, 'CLASS'),
      eq(schedules.dayOfWeek, dow),
      eq(schedules.startTime, startTime),
    ))
    .limit(1);
  return !!row;
}

export interface MergedSessionTargets {
  /** همهٔ جلسه‌هایی که «ثبت» باید روی آن‌ها اعمال شود (نماینده اول است) */
  sessionIds: number[];
  /** آن‌هایی که همین حالا ساخته شدند (برای لاگ/پیام) */
  createdSessionIds: number[];
  /** آیا این جلسه جزءِ یک کلاسِ ادغامی است؟ */
  merged: boolean;
}

/**
 * گسترشِ یک جلسه به کلِ کلاسِ ادغامی‌اش.
 *
 * `roomSessions` = همان فهرستی که صفحه/اکشن از قبل برای این اتاق گرفته
 * (تا کوئریِ تکراری نزنیم و صفحه و اکشن هرگز واگرا نشوند).
 */
export async function resolveMergedSessionTargets(px: {
  roomId: number;
  sessionId: number;
  offeringId: number;
  sessionDate: string;
  startTime: string;
  endTime: string;
  roomSessions: RoomSessionRow[];
}): Promise<MergedSessionTargets> {
  const { roomId, sessionId, offeringId, sessionDate, startTime, endTime, roomSessions } = px;

  const groups = groupSessionsIntoMerged(roomSessions.map(toMergable));
  const mine = groups.find(g => g.memberSessionIds.includes(sessionId));
  const sessionIds = mine ? [...mine.memberSessionIds] : [sessionId];
  const merged = mine?.merged === true;
  const createdSessionIds: number[] = [];

  // ── تکمیلِ عضوهای بی‌جلسه (فقط برای ادغامِ دستی) ──
  const key = await manualKeyOf(offeringId);
  if (key) {
    const siblings = await siblingOfferingIds(key, offeringId);
    const present = new Set(sessionIds);
    const dow = iranDowFromJalali(sessionDate);
    const missing = siblings.filter(id => !present.has(id) && !roomSessions.some(r => r.offeringId === id));
    for (const oid of missing) {
      if (dow == null) continue;
      if (!(await hasWeeklySlot(oid, roomId, dow, startTime))) continue;
      const [offering] = await db
        .select({ universityId: course_offerings.universityId })
        .from(course_offerings)
        .where(eq(course_offerings.id, oid))
        .limit(1);
      const [created] = await db
        .insert(class_sessions)
        .values({
          offeringId: oid,
          sessionDate,
          startTime,
          endTime,
          status: 'HELD',
          roomId,
          universityId: offering?.universityId ?? null,
        })
        .returning({ id: class_sessions.id });
      if (created) {
        createdSessionIds.push(created.id);
        sessionIds.push(created.id);
      }
    }
  }

  return { sessionIds, createdSessionIds, merged };
}

/**
 * همهٔ جلسه‌های عضوِ یک کلاسِ ادغامی، **بدون** نیاز به اتاقِ روز.
 *
 * چرا جدا از `resolveMergedSessionTargets`: آن یکی برای مسیرِ QR/کارتابل است
 * که اتاق را از قبل می‌داند؛ این‌جا (تأیید دستی حضور استاد) فقط شناسهٔ جلسه
 * را داریم و باید خودمان اتاق را از برنامهٔ هفتگیِ همان جلسه حل کنیم — همان
 * کاری که `room-session-lookup` برای صفحهٔ QR می‌کند.
 *
 * اگر اتاق حل نشد (جلسهٔ جبرانیِ بدون برنامه)، فقط ادغامِ دستی اعمال می‌شود.
 */
export async function sessionIdsInMergedGroup(sessionId: number): Promise<{
  sessionIds: number[];
  merged: boolean;
}> {
  const [session] = await db
    .select({
      id: class_sessions.id,
      offeringId: class_sessions.offeringId,
      sessionDate: class_sessions.sessionDate,
      startTime: class_sessions.startTime,
      endTime: class_sessions.endTime,
      professorId: course_offerings.professorId,
      sharedScheduleGroupKey: course_offerings.sharedScheduleGroupKey,
    })
    .from(class_sessions)
    .innerJoin(course_offerings, eq(course_offerings.id, class_sessions.offeringId))
    .where(eq(class_sessions.id, sessionId))
    .limit(1);
  if (!session) return { sessionIds: [sessionId], merged: false };

  const startTime = String(session.startTime ?? '').slice(0, 5);
  const endTime = String(session.endTime ?? '').slice(0, 5);

  // ── اتاقِ این جلسه را از برنامهٔ هفتگیِ خودش حل می‌کنیم ──
  const dow = iranDowFromJalali(session.sessionDate);
  let roomId: number | null = null;
  if (dow != null) {
    const [slot] = await db
      .select({ roomId: schedules.roomId })
      .from(schedules)
      .where(and(
        eq(schedules.offeringId, session.offeringId),
        eq(schedules.scheduleType, 'CLASS'),
        eq(schedules.dayOfWeek, dow),
        eq(schedules.startTime, startTime),
      ))
      .limit(1);
    roomId = slot?.roomId ?? null;
  }

  if (roomId != null) {
    // همان مسیری که صفحهٔ QR می‌رود → گروه‌بندی مو‌به‌مو یکسان
    const roomSessions = await listSessionsInRoom(roomId, session.sessionDate);
    const groups = groupSessionsIntoMerged(roomSessions.map(toMergable));
    const g = groups.find(x => x.memberSessionIds.includes(sessionId));
    if (g && g.merged) return { sessionIds: g.memberSessionIds, merged: true };
    return { sessionIds: [sessionId], merged: false };
  }

  // ── بدون اتاق: فقط ادغامِ دستی (همان کلید، همان روز، همان ساعت) ──
  const key = String(session.sharedScheduleGroupKey ?? '').trim();
  if (!key || key.startsWith('SOLO-')) return { sessionIds: [sessionId], merged: false };

  const siblingIds = (await db
    .select({ id: course_offerings.id })
    .from(course_offerings)
    .where(eq(course_offerings.sharedScheduleGroupKey, key)))
    .map(r => r.id);

  const rows = await db
    .select({ id: class_sessions.id })
    .from(class_sessions)
    .where(and(
      eq(class_sessions.sessionDate, session.sessionDate),
      eq(class_sessions.startTime, startTime),
      eq(class_sessions.endTime, endTime),
      eq(class_sessions.isActive, 1),
      inArray(class_sessions.offeringId, siblingIds),
    ))
    .orderBy(asc(class_sessions.id));

  const ids = [...new Set([sessionId, ...rows.map(r => r.id)])].sort((a, b) => a - b);
  return { sessionIds: ids, merged: ids.length > 1 };
}
