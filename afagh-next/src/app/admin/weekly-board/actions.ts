'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { classrooms } from '@/db/schema';
import { getCurrentUniversity } from '@/lib/university-scope';

/**
 * فعال/غیرفعال‌سازی یک کلاس (اتاق) — از پنل «مدیریت وضعیت کلاس‌ها» در تب تابلوی کلاس‌ها.
 * وضعیت هدف از فیلد `active` (۰ یا ۱) خوانده می‌شود؛ زون دانشگاه جاری رعایت می‌شود (fail-closed).
 */
export async function toggleRoomActive(formData: FormData) {
  const id = Number(formData.get('roomId'));
  const active = formData.get('active') === '1' ? 1 : 0;
  if (!id || Number.isNaN(id)) return;
  const uni = await getCurrentUniversity().catch(() => null);
  const conds = uni
    ? [eq(classrooms.id, id), eq(classrooms.universityId, uni.id)]
    : [eq(classrooms.id, id)];
  await db.update(classrooms).set({ isActive: active }).where(and(...conds));
  revalidatePath('/admin/weekly-board');
}
