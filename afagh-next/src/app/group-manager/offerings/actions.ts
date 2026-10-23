'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { getBool } from '@/lib/settings';
import { cart_items, course_offerings, schedules } from '@/db/schema';
import { back, courseInDept, num, optNum, requireDepHead, str } from '@/lib/group-manager';
import {
  capacityWarning, detectScheduleConflicts, findDuplicateOffering,
  professorInUniversity, readClassroom, roomAllowedForSchedule, validateEntryYearRange,
  validateScheduleWindow,
} from '@/lib/offering-scheduling';

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
  if (!(await professorInUniversity(db, professorId, me.universityId ?? null))) back('/group-manager/offerings', 'err', 'استاد انتخاب‌شده در این دانشگاه یافت نشد.');
  const termId = num(fd, 'termId');
  // H3: بازهٔ وارونهٔ سال ورودی ارائه را برای همه نامرئی می‌کند — خطای پیکربندی
  const ys = optNum(fd, 'ys'), ye = optNum(fd, 'ye');
  const eyErr = validateEntryYearRange(ys, ye);
  if (eyErr) back('/group-manager/offerings', 'err', eyErr);
  // وقتی چارت تحصیلی در انتخاب واحد الزامی نیست، هدف‌گیریِ هر ارائه تنها راه
  // کنترلِ دسترسی است → رشتهٔ مجاز و بازهٔ ورودی باید حتماً مشخص شوند.
  const requireChart = await getBool('ENROLL_REQUIRE_CURRICULUM_CHART').catch(() => true);
  if (!requireChart) {
    if (optNum(fd, 'major') == null) back('/group-manager/offerings', 'err', 'چون چارت تحصیلی در انتخاب واحد الزامی نیست، باید «رشتهٔ مجاز» هر ارائه مشخص شود.');
    if (optNum(fd, 'ys') == null) back('/group-manager/offerings', 'err', 'چون چارت تحصیلی الزامی نیست، باید «ورودی مجاز از» هر ارائه مشخص شود.');
  }
  const dupId = await findDuplicateOffering(db, { termId, courseId, groupNumber: group });
  if (dupId != null)
    back('/group-manager/offerings', 'err', 'این درس با همین گروه در ترم جاری قبلاً ارائه شده است.');
  const [created] = await db.insert(course_offerings).values({
    termId, courseId, groupNumber: group, capacity: cap,
    waitlistCapacity: num(fd, 'waitCap'), professorId,
    targetDegreeLevelId: optNum(fd, 'deg'), targetMajorId: optNum(fd, 'major'),
    entryYearStart: ys, entryYearEnd: ye,
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
  if (!(await professorInUniversity(db, professorId, me.universityId ?? null))) back('/group-manager/offerings', 'err', 'استاد انتخاب‌شده در این دانشگاه یافت نشد.');
  // G5: تغییر شمارهٔ گروه نباید (درس+گروه) را در ترم تکراری کند
  const dupId = await findDuplicateOffering(db, { termId: cur.termId, courseId: cur.courseId, groupNumber: group, excludeId: id });
  if (dupId != null) back('/group-manager/offerings', 'err', 'این درس با همین گروه در ترم جاری قبلاً ارائه شده است.');
  // H3: بازهٔ وارونهٔ سال ورودی — خطای پیکربندی (ارائه برای همه نامرئی می‌شود)
  const ys = optNum(fd, 'ys'), ye = optNum(fd, 'ye');
  const eyErr = validateEntryYearRange(ys, ye);
  if (eyErr) back('/group-manager/offerings', 'err', eyErr);
  // وقتی چارت تحصیلی در انتخاب واحد الزامی نیست، هدف‌گیریِ هر ارائه تنها راه
  // کنترلِ دسترسی است → رشتهٔ مجاز و بازهٔ ورودی باید حتماً مشخص شوند.
  const requireChart = await getBool('ENROLL_REQUIRE_CURRICULUM_CHART').catch(() => true);
  if (!requireChart) {
    if (optNum(fd, 'major') == null) back('/group-manager/offerings', 'err', 'چون چارت تحصیلی در انتخاب واحد الزامی نیست، باید «رشتهٔ مجاز» هر ارائه مشخص شود.');
    if (optNum(fd, 'ys') == null) back('/group-manager/offerings', 'err', 'چون چارت تحصیلی الزامی نیست، باید «ورودی مجاز از» هر ارائه مشخص شود.');
  }
  await db.update(course_offerings).set({
    capacity: cap, waitlistCapacity: num(fd, 'waitCap'), groupNumber: group,
    professorId,
    targetDegreeLevelId: optNum(fd, 'deg'), targetMajorId: optNum(fd, 'major'),
    entryYearStart: ys, entryYearEnd: ye,
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
  const windowErr = validateScheduleWindow(st, en);
  if (windowErr) back('/group-manager/offerings', 'err', windowErr);
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
    const room = await readClassroom(db, roomId);
    if (!room) back('/group-manager/offerings', 'err', 'سالن نامعتبر است.');
    if (!roomAllowedForSchedule(room.universityId ?? null, me.universityId ?? null))
      back('/group-manager/offerings', 'err', 'این سالن متعلق به دانشگاه دیگری است.');
    roomCapacity = room.capacity ?? null;
  }

  // گارد تداخل (G2) — منطق مشترک با ادیتور ادمین (offering-scheduling)
  const conflicts = await detectScheduleConflicts(db, {
    offeringId, termId: off.termId, day, start: st, end: en,
    roomId, professorId: off.professorId ?? null,
  });
  if (conflicts.length > 0) back('/group-manager/offerings', 'err', conflicts[0]);

  await db.insert(schedules).values({ offeringId, scheduleType: 'CLASS', dayOfWeek: day, startTime: st, endTime: en, roomId, universityId: me.universityId ?? null });
  revalidatePath('/group-manager/offerings');
  revalidatePath('/student/enroll');
  back('/group-manager/offerings', 'msg', capacityWarning(roomCapacity, off.capacity) ?? 'برنامهٔ هفتگی ثبت شد.');
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
