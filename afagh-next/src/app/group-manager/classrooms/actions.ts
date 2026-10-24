'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { classrooms, faculties, schedules } from '@/db/schema';
import { back, num, requireDepHead, str } from '@/lib/group-manager';
import { classroomOwnedBy, readClassroomUni } from '@/lib/offering-scheduling';

export async function saveClassroomAction(fd: FormData) {
  const { staff: me } = await requireDepHead();
  const id = num(fd, 'id');
  const name = str(fd, 'name'), cap = num(fd, 'cap');
  if (!name || cap <= 0) back('/group-manager/classrooms', 'err', 'نام کلاس و ظرفیت مثبت الزامی است.');
  const myUni = me.universityId ?? null;
  // ویرایش فقط روی کلاسِ همین دانشگاه (G3) — کلاس عام/سیستمی (universityId=NULL)
  // هم برای مدیر گروه قابل ویرایش نیست؛ آن‌ها را آموزش می‌سازد.
  if (id) {
    const room = await readClassroomUni(db, id);
    if (!room || !classroomOwnedBy(room.universityId ?? null, myUni))
      back('/group-manager/classrooms', 'err', 'این کلاس متعلق به دانشگاه شما نیست.');
  }
  const isActiveRaw = fd.get('isActive');
  const isActive = isActiveRaw == null ? 1 : (Number(isActiveRaw) ? 1 : 0);
  // دانشکده — جای «ساختمان» (ساختمان در سامانه تعریف ندارد)؛ فقط دانشکدهٔ همین دانشگاه
  let facultyId: number | null = null;
  let facultyName: string | null = null;
  const facultyRaw = str(fd, 'facultyId');
  if (facultyRaw) {
    const fid = Number(facultyRaw);
    const owned = Number.isInteger(fid) && fid > 0 && myUni != null
      ? await db
          .select({ id: faculties.id, name: faculties.name })
          .from(faculties)
          .where(and(eq(faculties.id, fid), eq(faculties.universityId, myUni)))
          .limit(1)
      : [];
    if (!owned.length) back('/group-manager/classrooms', 'err', 'دانشکدهٔ انتخاب‌شده متعلق به دانشگاه شما نیست.');
    facultyId = fid;
    facultyName = owned[0].name;
  }
  // نام دانشکده در ستون قدیمی `buildingName` هم نوشته می‌شود تا صفحه‌هایی که
  // هنوز «ساختمان» را نمایش می‌دهند خالی نمانند (منبع حقیقت: facultyId).
  const vals = { name, capacity: cap, roomType: str(fd, 'roomType') || null, facultyId, buildingName: facultyName, floor: str(fd, 'floor') || null, rowsCount: num(fd, 'rows') || null, colsCount: num(fd, 'cols') || null, isActive };
  if (id) await db.update(classrooms).set(vals).where(eq(classrooms.id, id));
  else await db.insert(classrooms).values({ ...vals, universityId: myUni });
  revalidatePath('/group-manager/classrooms');
  revalidatePath('/group-manager/offerings');
  back('/group-manager/classrooms', 'msg', 'کلاس «' + name + '» ذخیره شد.');
}

export async function deleteClassroomAction(fd: FormData) {
  const { staff: me } = await requireDepHead();
  const id = num(fd, 'id');
  const myUni = me.universityId ?? null;
  const room = await readClassroomUni(db, id);
  if (!room || !classroomOwnedBy(room.universityId ?? null, myUni))
    back('/group-manager/classrooms', 'err', 'این کلاس متعلق به دانشگاه شما نیست.');
  const used = await db.select({ id: schedules.id }).from(schedules).where(eq(schedules.roomId, id)).limit(1);
  if (used.length) back('/group-manager/classrooms', 'err', 'این کلاس در برنامهٔ هفتگی استفاده می‌شود — ابتدا برنامه را حذف کنید.');
  await db.delete(classrooms).where(eq(classrooms.id, id));
  revalidatePath('/group-manager/classrooms');
  back('/group-manager/classrooms', 'msg', 'کلاس حذف شد.');
}
