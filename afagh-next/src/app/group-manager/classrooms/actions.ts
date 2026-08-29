'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { classrooms, schedules } from '@/db/schema';
import { back, num, requireDepHead, str } from '@/lib/group-manager';

export async function saveClassroomAction(fd: FormData) {
  await requireDepHead();
  const id = num(fd, 'id');
  const name = str(fd, 'name'), cap = num(fd, 'cap');
  if (!name || cap <= 0) back('/group-manager/classrooms', 'err', 'نام کلاس و ظرفیت مثبت الزامی است.');
  const vals = { name, capacity: cap, roomType: str(fd, 'roomType') || null, buildingName: str(fd, 'building') || null, rowsCount: num(fd, 'rows') || null, colsCount: num(fd, 'cols') || null };
  if (id) await db.update(classrooms).set(vals).where(eq(classrooms.id, id));
  else await db.insert(classrooms).values(vals);
  revalidatePath('/group-manager/classrooms');
  revalidatePath('/group-manager/offerings');
  back('/group-manager/classrooms', 'msg', 'کلاس «' + name + '» ذخیره شد.');
}

export async function deleteClassroomAction(fd: FormData) {
  await requireDepHead();
  const id = num(fd, 'id');
  const used = await db.select({ id: schedules.id }).from(schedules).where(eq(schedules.roomId, id)).limit(1);
  if (used.length) back('/group-manager/classrooms', 'err', 'این کلاس در برنامهٔ هفتگی استفاده می‌شود — ابتدا برنامه را حذف کنید.');
  await db.delete(classrooms).where(eq(classrooms.id, id));
  revalidatePath('/group-manager/classrooms');
  back('/group-manager/classrooms', 'msg', 'کلاس حذف شد.');
}
