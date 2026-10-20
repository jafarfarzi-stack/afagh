'use server';

import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { course_offerings, offering_professors, professor_class_attendance } from '@/db/schema';
import { getSessionUser, getStaffByUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { checkinState, parseRoomCode, tehranNow } from '@/lib/room-checkin';
import { getRoomContext, listSessionsInRoom } from '@/lib/room-session-lookup';

/**
 * ثبت حضور استاد با اسکن QR سردر کلاسی.
 *
 * ⚠ این تابع تنها مرجعِ تصمیم است. صفحهٔ `/p/room-*` فقط «نمایش» می‌دهد؛ هر
 * درخواستی — حتی اگر از UI دستکاری‌شده بیاید — اینجا دوباره کامل بررسی می‌شود:
 *   ۱) کاربر وارد شده و پروندهٔ هیئت علمی دارد.
 *   ۲) جلسه واقعاً در همین اتاق و در «امروزِ تهران» است
 *      (با همان تابعِ حلِ اتاق که صفحه استفاده می‌کند، تا هرگز واگرا نشوند).
 *   ۳) اکنون داخل پنجرهٔ مجاز است (نه زودتر، نه بعد از مهلت).
 *   ۴) استاد واقعاً استادِ همان درس است (مالک یا استاد مشترک).
 *   ۵) مرزِ بین‌دانشگاهی رعایت شده است.
 *   ۶) ثبت تکراری انجام نمی‌شود (به‌ازای هر جلسه یک ردیف برای هر استاد).
 */
export async function recordRoomAttendance(formData: FormData): Promise<void> {
  const rawCode = String(formData.get('code') ?? '').trim();
  const roomId = parseRoomCode(rawCode);
  // مسیرِ بازگشت همیشه از کدِ خودِ فرم ساخته می‌شود تا کاربر به صفحهٔ درست برگردد.
  const back = `/p/${roomId ? `room-${roomId}` : 'room-0'}`;

  if (!roomId) redirect(`${back}?err=badroom`);

  const sessionId = Number(formData.get('sessionId'));
  if (!Number.isInteger(sessionId) || sessionId <= 0) redirect(`${back}?err=nosession`);

  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);

  const me = await getStaffByUser(user.id);
  if (!me) redirect(`${back}?err=notstaff`);

  const now = tehranNow();

  // همان منبعِ حقیقتی که صفحه استفاده می‌کند: اتاق از برنامهٔ هفتگی حل می‌شود.
  const todaySessions = await listSessionsInRoom(roomId, now.jalali);
  const session = todaySessions.find(s => s.id === sessionId);
  if (!session) redirect(`${back}?err=nosession`);

  if (checkinState(session.startTime, session.endTime, now.minutes) !== 'OPEN') {
    redirect(`${back}?err=window`);
  }

  const [offering] = await db
    .select({ professorId: course_offerings.professorId })
    .from(course_offerings)
    .where(eq(course_offerings.id, session.offeringId))
    .limit(1);
  if (!offering) redirect(`${back}?err=nosession`);

  let owns = offering.professorId === me.id;
  if (!owns) {
    const [shared] = await db
      .select({ id: offering_professors.id })
      .from(offering_professors)
      .where(and(
        eq(offering_professors.offeringId, session.offeringId),
        eq(offering_professors.staffId, me.id),
      ))
      .limit(1);
    owns = !!shared;
  }
  if (!owns) redirect(`${back}?err=notyours`);

  // مرزِ بین‌دانشگاهی — همان گاردِ صفحه، اینجا هم چون سرور مرجعِ نهاییِ تصمیم است.
  const room = await getRoomContext(roomId);
  if (!room) redirect(`${back}?err=badroom`);

  const myUni = me.universityId ?? user.universityId ?? null;
  if (myUni != null && room.universityId != null && myUni !== room.universityId) {
    redirect(`${back}?err=wronguni`);
  }

  // ثبت تکراری: دوباره‌اسکن نباید ردیف دوم بسازد و نباید مهرِ زمانی اول را خراب کند.
  const [existing] = await db
    .select({ id: professor_class_attendance.id })
    .from(professor_class_attendance)
    .where(and(
      eq(professor_class_attendance.sessionId, session.id),
      eq(professor_class_attendance.staffId, me.id),
    ))
    .limit(1);
  if (existing) redirect(`${back}?msg=already`);

  const h = await headers();
  const forwarded = (h.get('x-forwarded-for') ?? '').split(',')[0].trim();
  const ip = (forwarded || h.get('x-real-ip') || '').slice(0, 50) || null;
  const ua = (h.get('user-agent') ?? '').slice(0, 500) || null;

  await db.insert(professor_class_attendance).values({
    sessionId: session.id,
    staffId: me.id,
    // همان مقداری که کامنتِ ستون در schema برای اسکن QR نام برده است.
    verificationMethod: 'QR_SCAN',
    status: 'VALID',
    recordedIpAddress: ip,
    deviceUserAgent: ua,
    universityId: room.universityId ?? null,
  });

  logger.info('professor_qr_checkin', {
    sessionId: session.id,
    staffId: me.id,
    roomId,
    offeringId: session.offeringId,
    at: now.jalali,
    minutes: now.minutes,
  });

  revalidatePath(back);
  revalidatePath('/professor/attendance');
  redirect(`${back}?msg=ok`);
}
