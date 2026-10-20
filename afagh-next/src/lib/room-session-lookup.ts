/**
 * حلِ «کدام جلسه در این اتاق برگزار می‌شود» از روی برنامهٔ هفتگی.
 *
 * چرا این ماژول لازم شد: `class_sessions.roomId` عملاً خالی است. ژنراتورِ جلسات
 * (`class-session-generator.ts`) فقط offeringId/تاریخ/ساعت/شمارهٔ جلسه را می‌نویسد
 * و اتاق را کپی نمی‌کند؛ در دیتابیسِ پروداکشن از ۵۸٬۴۲۳ جلسه تنها ۱ ردیف اتاق دارد.
 * منبعِ حقیقتِ اتاق، `schedules` است (۲۱٬۷۷۵ ردیف از ۲۵٬۲۳۸ ردیفِ CLASS اتاق دارند).
 *
 * پس اتاق را در زمانِ خواندن حل می‌کنیم:
 *   جلسهٔ امروزِ یک ارائه، در اتاقِ X است اگر
 *     (الف) خودش roomId = X داشته باشد (جلسات جبرانیِ کارتابلی)، یا
 *     (ب) roomId خالی باشد و اسلاتِ هفتگیِ همان ارائه در همان روزِ هفته و
 *          همان ساعتِ شروع، اتاقش X باشد.
 *
 * مزیت: هیچ مایگریشن یا backfill لازم نیست، روی ۵۸ هزار جلسهٔ موجود کار می‌کند و
 * اگر برنامهٔ هفتگی عوض شود خودش درست می‌ماند.
 */

import { and, asc, eq, gt, inArray, or } from 'drizzle-orm';
import { db } from '@/db';
import { class_sessions, classrooms, course_offerings, courses, schedules } from '@/db/schema';
import { iranDowFromJalali } from '@/lib/room-checkin';

export interface RoomSessionRow {
  id: number;
  offeringId: number;
  sessionDate: string;
  /** 'HH:MM' */
  startTime: string;
  /** 'HH:MM' */
  endTime: string;
  professorId: number | null;
  courseTitle: string;
  courseCode: string;
  groupNumber: number;
  /** اتاقی که برای این جلسه حل شد (همیشه = roomId ورودی) */
  roomId: number;
}

/** 'HH:MM:SS' یا 'HH:MM' → 'HH:MM' */
function hm5(value: string | null | undefined): string {
  return String(value ?? '').slice(0, 5);
}

const slotKey = (offeringId: number, startTime: string): string => `${offeringId}|${hm5(startTime)}`;

/**
 * اسلات‌های هفتگیِ یک اتاق در یک روزِ هفته.
 * کلید = «offeringId|HH:MM» تا تطابق با جلسهٔ همان ساعت ممکن شود.
 */
async function roomSlots(roomId: number, dow: number): Promise<{ keys: Set<string>; offeringIds: number[] }> {
  const rows = await db
    .select({ offeringId: schedules.offeringId, startTime: schedules.startTime })
    .from(schedules)
    .where(and(
      eq(schedules.roomId, roomId),
      eq(schedules.scheduleType, 'CLASS'),
      eq(schedules.dayOfWeek, dow),
    ));

  const keys = new Set<string>();
  const offeringIds = new Set<number>();
  for (const r of rows) {
    keys.add(slotKey(r.offeringId, r.startTime));
    offeringIds.add(r.offeringId);
  }
  return { keys, offeringIds: [...offeringIds] };
}

/**
 * جلساتِ یک اتاق در یک تاریخِ شمسی ('YYYY/MM/DD')، مرتب بر اساس ساعت شروع.
 */
export async function listSessionsInRoom(roomId: number, jalaliDate: string): Promise<RoomSessionRow[]> {
  const dow = iranDowFromJalali(jalaliDate);
  if (dow == null) return [];

  const { keys, offeringIds } = await roomSlots(roomId, dow);

  // جلسه‌ای که خودش اتاق دارد همیشه معتبر است؛ جلساتِ بی‌اتاق فقط از مسیر اسلات.
  const scope = [eq(class_sessions.roomId, roomId)];
  if (offeringIds.length > 0) scope.push(inArray(class_sessions.offeringId, offeringIds));

  const rows = await db
    .select({
      id: class_sessions.id,
      offeringId: class_sessions.offeringId,
      sessionDate: class_sessions.sessionDate,
      startTime: class_sessions.startTime,
      endTime: class_sessions.endTime,
      explicitRoomId: class_sessions.roomId,
      professorId: course_offerings.professorId,
      courseTitle: courses.title,
      courseCode: courses.code,
      groupNumber: course_offerings.groupNumber,
    })
    .from(class_sessions)
    .innerJoin(course_offerings, eq(course_offerings.id, class_sessions.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(and(
      eq(class_sessions.sessionDate, jalaliDate),
      eq(class_sessions.isActive, 1),
      or(...scope),
    ))
    .orderBy(asc(class_sessions.startTime));

  return rows
    .filter(r =>
      r.explicitRoomId === roomId ||
      (r.explicitRoomId == null && keys.has(slotKey(r.offeringId, r.startTime))),
    )
    .map(r => ({
      id: r.id,
      offeringId: r.offeringId,
      sessionDate: r.sessionDate,
      startTime: hm5(r.startTime),
      endTime: hm5(r.endTime),
      professorId: r.professorId,
      courseTitle: r.courseTitle,
      courseCode: r.courseCode,
      groupNumber: r.groupNumber,
      roomId,
    }));
}

/** آیا این جلسه واقعاً در این اتاق و در این تاریخ برگزار می‌شود؟ (گاردِ سرور اکشن) */
export async function isSessionInRoom(sessionId: number, roomId: number, jalaliDate: string): Promise<boolean> {
  const list = await listSessionsInRoom(roomId, jalaliDate);
  return list.some(s => s.id === sessionId);
}

/**
 * نزدیک‌ترین جلساتِ آیندهٔ یک اتاق (برای وقتی امروز کلاسی نیست).
 * چون هر جلسهٔ آینده می‌تواند روزِ هفتهٔ متفاوتی داشته باشد، اسلات‌ها برای هر
 * روزِ هفته جدا حل می‌شوند و بعد با تاریخِ خودِ جلسه تطبیق داده می‌شوند.
 */
export async function listUpcomingSessionsInRoom(
  roomId: number,
  afterJalali: string,
  limit = 3,
): Promise<RoomSessionRow[]> {
  const slotsByDow = new Map<number, Set<string>>();
  const allOfferingIds = new Set<number>();

  for (let dow = 0; dow <= 6; dow++) {
    const { keys, offeringIds } = await roomSlots(roomId, dow);
    slotsByDow.set(dow, keys);
    offeringIds.forEach(id => allOfferingIds.add(id));
  }

  const explicit = [eq(class_sessions.roomId, roomId)];
  if (allOfferingIds.size > 0) explicit.push(inArray(class_sessions.offeringId, [...allOfferingIds]));

  const rows = await db
    .select({
      id: class_sessions.id,
      offeringId: class_sessions.offeringId,
      sessionDate: class_sessions.sessionDate,
      startTime: class_sessions.startTime,
      endTime: class_sessions.endTime,
      explicitRoomId: class_sessions.roomId,
      professorId: course_offerings.professorId,
      courseTitle: courses.title,
      courseCode: courses.code,
      groupNumber: course_offerings.groupNumber,
    })
    .from(class_sessions)
    .innerJoin(course_offerings, eq(course_offerings.id, class_sessions.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(and(
      gt(class_sessions.sessionDate, afterJalali),
      eq(class_sessions.isActive, 1),
      or(...explicit),
    ))
    .orderBy(asc(class_sessions.sessionDate), asc(class_sessions.startTime))
    .limit(400);

  const out: RoomSessionRow[] = [];
  for (const r of rows) {
    let ok = r.explicitRoomId === roomId;
    if (!ok && r.explicitRoomId == null) {
      const dow = iranDowFromJalali(r.sessionDate);
      if (dow != null) ok = slotsByDow.get(dow)?.has(slotKey(r.offeringId, r.startTime)) ?? false;
    }
    if (!ok) continue;
    out.push({
      id: r.id,
      offeringId: r.offeringId,
      sessionDate: r.sessionDate,
      startTime: hm5(r.startTime),
      endTime: hm5(r.endTime),
      professorId: r.professorId,
      courseTitle: r.courseTitle,
      courseCode: r.courseCode,
      groupNumber: r.groupNumber,
      roomId,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** اتاق + نام دانشگاه — برای سرصفحهٔ صفحه */
export async function getRoomContext(roomId: number) {
  const [room] = await db
    .select({
      id: classrooms.id,
      name: classrooms.name,
      buildingName: classrooms.buildingName,
      floor: classrooms.floor,
      isActive: classrooms.isActive,
      universityId: classrooms.universityId,
    })
    .from(classrooms)
    .where(eq(classrooms.id, roomId))
    .limit(1);
  return room ?? null;
}
