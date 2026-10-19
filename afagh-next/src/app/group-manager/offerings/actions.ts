'use server';

import { and, eq, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { cart_items, classrooms, course_offerings, schedules, staff as staffTable } from '@/db/schema';
import { back, courseInDept, num, optNum, requireDepHead, str } from '@/lib/group-manager';

/** استاد باید کارمندی فعالِ همین دانشگاه باشد (G6) */
async function professorInMyUni(profId: number | null, myUni: number | null): Promise<boolean> {
  if (profId == null) return true;
  const [p] = await db.select({ universityId: staffTable.universityId, isActive: staffTable.isActive })
    .from(staffTable).where(eq(staffTable.id, profId)).limit(1);
  return !!p && !!p.isActive && (p.universityId ?? null) === myUni;
}

async function offeringInDept(offeringId: number, deptId: number): Promise<boolean> {
  const [o] = await db.select({ courseId: course_offerings.courseId }).from(course_offerings).where(eq(course_offerings.id, offeringId)).limit(1);
  return !!o && courseInDept(o.courseId, deptId);
}

async function scheduleInDept(scheduleId: number, deptId: number): Promise<boolean> {
  const [s] = await db.select({ offeringId: schedules.offeringId }).from(schedules).where(eq(schedules.id, scheduleId)).limit(1);
  return !!s && offeringInDept(s.offeringId, deptId);
}

export async function createOfferingAction(fd: FormData) {
  const { staff: me, deptId } = await requireDepHead();
  const courseId = num(fd, 'courseId');
  const group = num(fd, 'group') || 1;
  const cap = num(fd, 'cap');
  const professorId = optNum(fd, 'professorId');
  if (!courseId || !(await courseInDept(courseId, deptId))) back('/group-manager/offerings', 'err', 'درس انتخاب‌شده متعلق به گروه شما نیست.');
  if (cap <= 0) back('/group-manager/offerings', 'err', 'ظرفیت باید مثبت باشد.');
  if (!(await professorInMyUni(professorId, me.universityId ?? null))) back('/group-manager/offerings', 'err', 'استاد انتخاب‌شده در این دانشگاه یافت نشد.');
  const termId = num(fd, 'termId');
  const all = await db.select({ courseId: course_offerings.courseId, groupNumber: course_offerings.groupNumber })
    .from(course_offerings).where(eq(course_offerings.termId, termId));
  if (all.some(o => o.courseId === courseId && o.groupNumber === group))
    back('/group-manager/offerings', 'err', 'این درس با همین گروه در ترم جاری قبلاً ارائه شده است.');
  const [created] = await db.insert(course_offerings).values({
    termId, courseId, groupNumber: group, capacity: cap,
    waitlistCapacity: num(fd, 'waitCap'), professorId,
    targetDegreeLevelId: optNum(fd, 'deg'), targetMajorId: optNum(fd, 'major'),
    entryYearStart: optNum(fd, 'ys'), entryYearEnd: optNum(fd, 'ye'),
    universityId: me.universityId ?? null,
  }).returning({ id: course_offerings.id });
  revalidatePath('/group-manager/offerings');
  revalidatePath('/student/enroll');
  back('/group-manager/offerings', 'msg', 'ارائه ساخته شد — حالا برنامهٔ هفتگی و کلاس آن را تعریف کنید.');
}

export async function updateOfferingAction(fd: FormData) {
  const { staff: me, deptId } = await requireDepHead();
  const id = num(fd, 'id');
  if (!(await offeringInDept(id, deptId))) back('/group-manager/offerings', 'err', 'این ارائه متعلق به گروه شما نیست.');
  const cap = num(fd, 'cap');
  const professorId = optNum(fd, 'professorId');
  const group = num(fd, 'group') || 1;
  const [cur] = await db.select().from(course_offerings).where(eq(course_offerings.id, id)).limit(1);
  if (cap < cur.enrolledCount) back('/group-manager/offerings', 'err', 'ظرفیت نمی‌تواند کمتر از ثبت‌نام‌های انجام‌شده (' + cur.enrolledCount + ') باشد.');
  if (!(await professorInMyUni(professorId, me.universityId ?? null))) back('/group-manager/offerings', 'err', 'استاد انتخاب‌شده در این دانشگاه یافت نشد.');
  // G5: تغییر شمارهٔ گروه نباید (درس+گروه) را در ترم تکراری کند
  const dup = await db.select({ id: course_offerings.id }).from(course_offerings)
    .where(and(
      eq(course_offerings.termId, cur.termId),
      eq(course_offerings.courseId, cur.courseId),
      eq(course_offerings.groupNumber, group),
      ne(course_offerings.id, id),
    )).limit(1);
  if (dup) back('/group-manager/offerings', 'err', 'این درس با همین گروه در ترم جاری قبلاً ارائه شده است.');
  await db.update(course_offerings).set({
    capacity: cap, waitlistCapacity: num(fd, 'waitCap'), groupNumber: group,
    professorId,
    targetDegreeLevelId: optNum(fd, 'deg'), targetMajorId: optNum(fd, 'major'),
    entryYearStart: optNum(fd, 'ys'), entryYearEnd: optNum(fd, 'ye'),
  }).where(eq(course_offerings.id, id));
  revalidatePath('/group-manager/offerings');
  revalidatePath('/student/enroll');
  back('/group-manager/offerings', 'msg', 'ارائه به‌روزرسانی شد.');
}

export async function deactivateOfferingAction(fd: FormData) {
  const { staff: me, deptId } = await requireDepHead();
  const id = num(fd, 'id');
  if (!(await offeringInDept(id, deptId))) back('/group-manager/offerings', 'err', 'این ارائه متعلق به گروه شما نیست.');
  const [cur] = await db.select().from(course_offerings).where(eq(course_offerings.id, id)).limit(1);
  // سبدهای کهنه حاوی این ارائه در هر دو مسیر پاک می‌شوند (G4): ثبت نهایی
  // دیگر isActive=0 را قبول نمی‌کند و سبد نباید ردیف مرده نگه دارد.
  await db.delete(cart_items).where(eq(cart_items.offeringId, id));
  if (cur.enrolledCount > 0) {
    await db.update(course_offerings).set({ isActive: 0 }).where(eq(course_offerings.id, id));
    revalidatePath('/group-manager/offerings');
    back('/group-manager/offerings', 'msg', 'ارائه دارای ' + cur.enrolledCount + ' ثبت‌نام است → غیرفعال شد (حذف نشد).');
  }
  await db.delete(schedules).where(eq(schedules.offeringId, id));
  await db.delete(course_offerings).where(eq(course_offerings.id, id));
  revalidatePath('/group-manager/offerings');
  revalidatePath('/student/enroll');
  back('/group-manager/offerings', 'msg', 'ارائه بدون ثبت‌نام بود → کاملاً حذف شد.');
}

export async function addScheduleAction(fd: FormData) {
  const { staff: me, deptId } = await requireDepHead();
  const offeringId = num(fd, 'offeringId');
  if (!(await offeringInDept(offeringId, deptId))) back('/group-manager/offerings', 'err', 'این ارائه متعلق به گروه شما نیست.');
  const st = str(fd, 'start'), en = str(fd, 'end');
  const day = num(fd, 'day');
  if (!st || !en || en <= st) back('/group-manager/offerings', 'err', 'ساعت پایان باید بعد از شروع باشد.');
  const roomId = optNum(fd, 'roomId');

  const [off] = await db.select({
    termId: course_offerings.termId,
    professorId: course_offerings.professorId,
    capacity: course_offerings.capacity,
  }).from(course_offerings).where(eq(course_offerings.id, offeringId)).limit(1);
  if (!off) back('/group-manager/offerings', 'err', 'این ارائه متعلق به گروه شما نیست.');

  // سالن باید متعلق به همین دانشگاه (یا سالن سیستمیِ عام) باشد
  let roomCapacity: number | null = null;
  if (roomId != null) {
    const [room] = await db.select({ universityId: classrooms.universityId, capacity: classrooms.capacity })
      .from(classrooms).where(eq(classrooms.id, roomId)).limit(1);
    if (!room) back('/group-manager/offerings', 'err', 'سالن نامعتبر است.');
    if (room.universityId != null && room.universityId !== (me.universityId ?? null))
      back('/group-manager/offerings', 'err', 'این سالن متعلق به دانشگاه دیگری است.');
    roomCapacity = room.capacity ?? null;
  }

  // گارد تداخل (G2) — همان قاعدهٔ ادیتور ادمین: جلسات CLASS سایر ارائه‌های
  // همین ترم با روز/ساعت هم‌پوشان؛ تداخل سالن یا استاد → رد.
  const st5 = st.slice(0, 5), en5 = en.slice(0, 5);
  const others = await db
    .select({
      offeringId: schedules.offeringId, dayOfWeek: schedules.dayOfWeek,
      startTime: schedules.startTime, endTime: schedules.endTime,
      roomId: schedules.roomId, professorId: course_offerings.professorId,
    })
    .from(schedules)
    .innerJoin(course_offerings, eq(course_offerings.id, schedules.offeringId))
    .where(and(
      eq(course_offerings.termId, off.termId),
      ne(schedules.offeringId, offeringId),
      eq(schedules.scheduleType, 'CLASS'),
    ));
  for (const o of others) {
    if (o.dayOfWeek !== day) continue;
    const oS = String(o.startTime).slice(0, 5), oE = String(o.endTime).slice(0, 5);
    if (!(st5 < oE && oS < en5)) continue;
    if (roomId != null && o.roomId === roomId)
      back('/group-manager/offerings', 'err', 'تداخل سالن: این سالن در همین روز و ساعت برای ارائهٔ دیگری رزرو شده است.');
    if (off.professorId != null && o.professorId === off.professorId)
      back('/group-manager/offerings', 'err', 'تداخل استاد: استاد این ارائه در همین روز و ساعت کلاس دیگری دارد.');
  }

  await db.insert(schedules).values({ offeringId, scheduleType: 'CLASS', dayOfWeek: day, startTime: st, endTime: en, roomId, universityId: me.universityId ?? null });
  revalidatePath('/group-manager/offerings');
  revalidatePath('/student/enroll');
  if (roomCapacity != null && roomCapacity < off.capacity) {
    back('/group-manager/offerings', 'msg', 'برنامهٔ هفتگی ثبت شد. ⚠ توجه: ظرفیت سالن (' + roomCapacity + ') کمتر از ظرفیت ارائه (' + off.capacity + ') است.');
  }
  back('/group-manager/offerings', 'msg', 'برنامهٔ هفتگی ثبت شد.');
}

export async function deleteScheduleAction(fd: FormData) {
  const { staff: me, deptId } = await requireDepHead();
  const id = num(fd, 'id');
  if (!(await scheduleInDept(id, deptId))) back('/group-manager/offerings', 'err', 'این برنامه متعلق به گروه شما نیست.');
  await db.delete(schedules).where(eq(schedules.id, id));
  revalidatePath('/group-manager/offerings');
  revalidatePath('/student/enroll');
  back('/group-manager/offerings', 'msg', 'برنامه حذف شد.');
}
