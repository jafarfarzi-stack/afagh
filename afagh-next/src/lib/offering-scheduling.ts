// ═══ قواعد مشترک «زمان‌بندی و مرزهای ارائه» ═══
// این توابع مرجع یگانهٔ (single source of truth) گاردهای ارائه هستند تا
// پنل مدیر گروه، ادیتور ادمین و هارنس تست همه یک منطق بسازند:
//   - اعتبارسنجی پنجرهٔ زمانی (پایان > شروع)
//   - اعتبارسنجی بازهٔ سال ورودی هدف‌گیری (شروع <= پایان)
//   - تشخیص تداخل سالن/استاد جلسات CLASS در یک ترم
//   - مرز دانشگاه برای سالن و استاد
//   - یونیک بودن (درس+گروه) در ترم
//   - هشدار ظرفیت سالن کمتر از ظرفیت ارائه
import { and, eq, ne } from 'drizzle-orm';
import { classrooms, course_offerings, schedules, staff } from '@/db/schema';

/** ساعت «HH:MM» — مقایسهٔ زمان فقط روی HH:MM معنا دارد (نه ثانیه) */
export const toHM = (t: string | Date | null | undefined): string => String(t ?? '').slice(0, 5);

/** دو بازهٔ هم‌پوشان دارند؟ (مرز مشترک تداخل نیست: ۱۰–۱۲ و ۱۲–۱۳ تداخل ندارند) */
export function timesOverlap(aS: string, aE: string, bS: string, bE: string): boolean {
  return aS < bE && bS < aE;
}

/** پنجرهٔ زمانی معتبر است؟ اگر نه، پیام خطا؛ وگرنه null */
export function validateScheduleWindow(start: string, end: string): string | null {
  const st = toHM(start), en = toHM(end);
  if (!st || !en) return 'ساعت شروع و پایان الزامی است.';
  if (en <= st) return 'ساعت پایان باید بعد از شروع باشد.';
  return null;
}

/**
 * بازهٔ سال ورودی معتبر است؟ (H3)
 * بازهٔ وارونه (ys > ye) در offeringVisible برای هیچ دانشجویی «در هدف» نمی‌شود،
 * پس ارائه برای همه نامرئی می‌شد — خطای پیکربندی است، نه «بدون محدودیت».
 * null در هر دو سمت = بدون محدودیت (مجاز).
 */
export function validateEntryYearRange(ys: number | null, ye: number | null): string | null {
  if (ys != null && ye != null && ys > ye)
    return 'بازهٔ سال ورودی نامعتبر است: سال شروع (' + ys + ') بعد از سال پایان (' + ye + ') است — چنین ارائه‌ای برای هیچ دانشجویی نامرئی می‌شود.';
  return null;
}

export type ScheduleCandidate = {
  offeringId: number;
  termId: number;
  day: number;
  start: string;
  end: string;
  roomId: number | null;
  professorId: number | null;
};

/**
 * تداخلات یک جلسهٔ CLASS پیشنهادی با جلسات سایر ارائه‌های همان ترم.
 * قواعد (یکسان در پنل مدیر گروه و ادیتور ادمین):
 *   - تداخل سالن: همان روز + هم‌پوشانی زمانی + همان سالن
 *   - تداخل استاد: همان روز + هم‌پوشانی زمانی + همان استاد
 * جلسات خودِ این ارائه نادیده گرفته می‌شوند تا ویرایش، خودش را تداخل نبیند.
 */
export async function detectScheduleConflicts(exec: any, input: ScheduleCandidate): Promise<string[]> {
  const conflicts: string[] = [];
  const st = toHM(input.start), en = toHM(input.end);
  const others = await exec
    .select({
      offeringId: schedules.offeringId, dayOfWeek: schedules.dayOfWeek,
      startTime: schedules.startTime, endTime: schedules.endTime,
      roomId: schedules.roomId, professorId: course_offerings.professorId,
    })
    .from(schedules)
    .innerJoin(course_offerings, eq(course_offerings.id, schedules.offeringId))
    .where(and(
      eq(course_offerings.termId, input.termId),
      ne(schedules.offeringId, input.offeringId),
      eq(schedules.scheduleType, 'CLASS'),
    ));
  for (const o of others) {
    if (o.dayOfWeek !== input.day) continue;
    if (!timesOverlap(st, en, toHM(o.startTime), toHM(o.endTime))) continue;
    if (input.roomId != null && o.roomId === input.roomId)
      conflicts.push('تداخل سالن: این سالن در همین روز و ساعت برای ارائهٔ دیگری رزرو شده است.');
    if (input.professorId != null && o.professorId === input.professorId)
      conflicts.push('تداخل استاد: استاد این ارائه در همین روز و ساعت کلاس دیگری دارد.');
  }
  return conflicts;
}

/** سالن در «زمان‌بندی» مجاز است: متعلق به دانشگاهِ من یا سالن سیستمیِ عام (NULL) */
export function roomAllowedForSchedule(roomUni: number | null, myUni: number | null): boolean {
  return roomUni == null || roomUni === myUni;
}

/** مالکیت کلاس در پنل مدیر گروه: تطابق دقیق دانشگاه (کلاس عام به کسی تعلق ندارد) */
export function classroomOwnedBy(roomUni: number | null, myUni: number | null): boolean {
  return roomUni === myUni;
}

/** استاد را از پایگاه داده بخوان: {universityId, isActive} یا null */
export async function readProfessor(exec: any, profId: number) {
  const [p] = await exec.select({ universityId: staff.universityId, isActive: staff.isActive })
    .from(staff).where(eq(staff.id, profId)).limit(1);
  return p ?? null;
}

/** استاد باید کارمندی فعالِ همان دانشگاه باشد (G6). null = «بی‌استاد»، همیشه مجاز */
export async function professorInUniversity(exec: any, profId: number | null, myUni: number | null): Promise<boolean> {
  if (profId == null) return true;
  const p = await readProfessor(exec, profId);
  return !!p && !!p.isActive && (p.universityId ?? null) === myUni;
}

/** کلاس را از پایگاه داده بخوان: {universityId, capacity} یا null */
export async function readClassroom(exec: any, roomId: number) {
  const [r] = await exec.select({ universityId: classrooms.universityId, capacity: classrooms.capacity })
    .from(classrooms).where(eq(classrooms.id, roomId)).limit(1);
  return r ?? null;
}

/** فقط دانشگاهِ یک کلاس را بخوان (برای بررسی مالکیت G3) یا null اگر کلاس نیست */
export async function readClassroomUni(exec: any, roomId: number) {
  const [r] = await exec.select({ universityId: classrooms.universityId })
    .from(classrooms).where(eq(classrooms.id, roomId)).limit(1);
  return r ?? null;
}

/** تکراری بودن (درس+گروه) در ترم (G1/D1/G5). excludeId: ردیفی که خودش است (در ویرایش)
 *  فقط ارائه‌های «فعال» — هم‌راستا با ایندکس یکتای جزئی مهاجرت 0103:
 *  ارائهٔ غیرفعال‌شده تاریخچه است و مانع ساخت ارائهٔ جدید نمی‌شود. */
export async function findDuplicateOffering(
  exec: any,
  args: { termId: number; courseId: number; groupNumber: number; excludeId?: number | null },
): Promise<number | null> {
  const conds = [
    eq(course_offerings.termId, args.termId),
    eq(course_offerings.courseId, args.courseId),
    eq(course_offerings.groupNumber, args.groupNumber),
    eq(course_offerings.isActive, 1),
  ];
  if (args.excludeId != null) conds.push(ne(course_offerings.id, args.excludeId) as any);
  const [dup] = await exec.select({ id: course_offerings.id }).from(course_offerings).where(and(...conds)).limit(1);
  return dup ? Number(dup.id) : null;
}

/** هشدار ظرفیت (G7) — پیام یا null */
export function capacityWarning(roomCapacity: number | null, offeringCapacity: number): string | null {
  if (roomCapacity != null && roomCapacity < offeringCapacity)
    return 'برنامهٔ هفتگی ثبت شد. ⚠ توجه: ظرفیت سالن (' + roomCapacity + ') کمتر از ظرفیت ارائه (' + offeringCapacity + ') است.';
  return null;
}

/** فهرست کلاس‌های همان دانشگاه (G3) — کلاس عام/سیستمی در پنل مدیر گروه دیده نمی‌شود */
export async function listClassroomsForUniversity(exec: any, myUni: number | null): Promise<typeof classrooms.$inferSelect[]> {
  if (myUni == null) return [];
  return exec.select().from(classrooms).where(eq(classrooms.universityId, myUni)).orderBy(classrooms.name);
}
