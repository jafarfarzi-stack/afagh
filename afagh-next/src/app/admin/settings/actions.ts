'use server';

import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { classrooms, schedules } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { classroomOwnedBy, readClassroomUni } from '@/lib/offering-scheduling';

/**
 * ذخیره/ویرایش کلاس از سطح تنظیمات (ادمین). هم‌راستا با group-manager/classrooms
 * اما با گارد ادمین؛ فقط کلاسِ همین دانشگاه (fail-closed).
 */
export async function adminSaveClassroomAction(fd: FormData) {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  const id = fd.get('id') ? Number(fd.get('id')) : 0;
  const name = String(fd.get('name') ?? '').trim();
  const cap = Number(fd.get('cap')) || 0;
  if (!name || cap <= 0) {
    redirect('/admin/settings?err=' + encodeURIComponent('نام کلاس و ظرفیت مثبت الزامی است.'));
  }
  const uni = await getCurrentUniversity().catch(() => null);
  const myUni = uni?.id ?? null;
  if (id) {
    const room = await readClassroomUni(db, id);
    if (!room || !classroomOwnedBy(room.universityId ?? null, myUni)) {
      redirect('/admin/settings?err=' + encodeURIComponent('این کلاس متعلق به دانشگاه شما نیست.'));
    }
  }
  const vals = {
    name,
    capacity: cap,
    roomType: String(fd.get('roomType') ?? '') || null,
    buildingName: String(fd.get('building') ?? '') || null,
    floor: String(fd.get('floor') ?? '') || null,
    rowsCount: Number(fd.get('rows')) || null,
    colsCount: Number(fd.get('cols')) || null,
    isActive: fd.get('isActive') == null ? 1 : (Number(fd.get('isActive')) ? 1 : 0),
  };
  if (id) await db.update(classrooms).set(vals).where(eq(classrooms.id, id));
  else await db.insert(classrooms).values({ ...vals, universityId: myUni });
  revalidatePath('/admin/settings');
  revalidatePath('/admin/weekly-board');
  redirect('/admin/settings?msg=' + encodeURIComponent(`کلاس «${name}» ذخیره شد.`));
}

export async function adminDeleteClassroomAction(fd: FormData) {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  const id = Number(fd.get('id'));
  const uni = await getCurrentUniversity().catch(() => null);
  const myUni = uni?.id ?? null;
  const room = await readClassroomUni(db, id);
  if (!room || !classroomOwnedBy(room.universityId ?? null, myUni)) {
    redirect('/admin/settings?err=' + encodeURIComponent('این کلاس متعلق به دانشگاه شما نیست.'));
  }
  const used = await db.select({ id: schedules.id }).from(schedules).where(eq(schedules.roomId, id)).limit(1);
  if (used.length) {
    redirect('/admin/settings?err=' + encodeURIComponent('این کلاس در برنامهٔ هفتگی استفاده می‌شود — ابتدا برنامه را حذف کنید.'));
  }
  await db.delete(classrooms).where(eq(classrooms.id, id));
  revalidatePath('/admin/settings');
  revalidatePath('/admin/weekly-board');
  redirect('/admin/settings?msg=' + encodeURIComponent('کلاس حذف شد.'));
}
