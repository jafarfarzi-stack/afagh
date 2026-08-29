'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { courses } from '@/db/schema';
import { back, courseInDept, num, requireDepHead, str } from '@/lib/group-manager';

export async function createCourseAction(fd: FormData) {
  const { staff: me, deptId } = await requireDepHead();
  const code = str(fd, 'code'), title = str(fd, 'title');
  const theo = num(fd, 'theo'), prac = num(fd, 'prac');
  const type = str(fd, 'type') || 'تخصصی', grading = str(fd, 'grading') || 'NUMERIC';
  if (!code || !title) back('/group-manager/courses', 'err', 'کد و عنوان درس الزامی است.');
  if (theo < 0 || prac < 0 || theo + prac === 0) back('/group-manager/courses', 'err', 'واحد درس نامعتبر است.');
  const [dup] = await db.select({ id: courses.id }).from(courses).where(eq(courses.code, code)).limit(1);
  if (dup) back('/group-manager/courses', 'err', 'کد درس تکراری است: ' + code);
  await db.insert(courses).values({
    code, title, theoreticalUnits: String(theo), practicalUnits: String(prac), units: String(theo + prac),
    courseType: type, gradingType: grading, affectsGpa: fd.get('gpa') ? 1 : 0, departmentId: deptId,
  });
  revalidatePath('/group-manager/courses');
  back('/group-manager/courses', 'msg', 'درس «' + title + '» تعریف شد (' + (theo + prac) + ' واحد).');
}

export async function updateCourseAction(fd: FormData) {
  const { staff: me, deptId } = await requireDepHead();
  const id = num(fd, 'id');
  if (!(await courseInDept(id, deptId))) back('/group-manager/courses', 'err', 'این درس متعلق به گروه شما نیست.');
  const code = str(fd, 'code'), title = str(fd, 'title');
  const theo = num(fd, 'theo'), prac = num(fd, 'prac');
  await db.update(courses).set({
    code, title, theoreticalUnits: String(theo), practicalUnits: String(prac), units: String(theo + prac),
    courseType: str(fd, 'type') || 'تخصصی', gradingType: str(fd, 'grading') || 'NUMERIC',
    affectsGpa: fd.get('gpa') ? 1 : 0,
  }).where(eq(courses.id, id));
  revalidatePath('/group-manager/courses');
  back('/group-manager/courses', 'msg', 'درس «' + title + '» به‌روزرسانی شد.');
}

export async function deleteCourseAction(fd: FormData) {
  const { staff: me, deptId } = await requireDepHead();
  const id = num(fd, 'id');
  if (!(await courseInDept(id, deptId))) back('/group-manager/courses', 'err', 'این درس متعلق به گروه شما نیست.');
  const offers = await db.query.course_offerings.findMany({ where: (o, { eq }) => eq(o.courseId, id) });
  if (offers.length) back('/group-manager/courses', 'err', 'حذف ممکن نیست — این درس ' + offers.length + ' ارائهٔ ثبت‌شده دارد. ابتدا ارائه را حذف/غیرفعال کنید.');
  await db.delete(courses).where(eq(courses.id, id));
  revalidatePath('/group-manager/courses');
  back('/group-manager/courses', 'msg', 'درس حذف شد.');
}
