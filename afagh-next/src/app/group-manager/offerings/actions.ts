'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { course_offerings, schedules } from '@/db/schema';
import { back, courseInDept, num, optNum, requireDepHead, str } from '@/lib/group-manager';

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
  if (!courseId || !(await courseInDept(courseId, deptId))) back('/group-manager/offerings', 'err', 'درس انتخاب‌شده متعلق به گروه شما نیست.');
  if (cap <= 0) back('/group-manager/offerings', 'err', 'ظرفیت باید مثبت باشد.');
  const termId = num(fd, 'termId');
  const all = await db.select({ courseId: course_offerings.courseId, groupNumber: course_offerings.groupNumber })
    .from(course_offerings).where(eq(course_offerings.termId, termId));
  if (all.some(o => o.courseId === courseId && o.groupNumber === group))
    back('/group-manager/offerings', 'err', 'این درس با همین گروه در ترم جاری قبلاً ارائه شده است.');
  const [created] = await db.insert(course_offerings).values({
    termId, courseId, groupNumber: group, capacity: cap,
    waitlistCapacity: num(fd, 'waitCap'), professorId: optNum(fd, 'professorId'),
    targetDegreeLevelId: optNum(fd, 'deg'), targetMajorId: optNum(fd, 'major'),
    entryYearStart: optNum(fd, 'ys'), entryYearEnd: optNum(fd, 'ye'),
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
  const [cur] = await db.select().from(course_offerings).where(eq(course_offerings.id, id)).limit(1);
  if (cap < cur.enrolledCount) back('/group-manager/offerings', 'err', 'ظرفیت نمی‌تواند کمتر از ثبت‌نام‌های انجام‌شده (' + cur.enrolledCount + ') باشد.');
  await db.update(course_offerings).set({
    capacity: cap, waitlistCapacity: num(fd, 'waitCap'), groupNumber: num(fd, 'group') || 1,
    professorId: optNum(fd, 'professorId'),
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
  await db.insert(schedules).values({ offeringId, scheduleType: 'CLASS', dayOfWeek: day, startTime: st, endTime: en, roomId: optNum(fd, 'roomId') });
  revalidatePath('/group-manager/offerings');
  revalidatePath('/student/enroll');
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
