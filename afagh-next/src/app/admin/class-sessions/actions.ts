'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { class_sessions, course_offerings } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { canActOnUniversity, getCurrentUniversity } from '@/lib/university-scope';

/**
 * تغییر پرچم‌های یک جلسهٔ کلاس از صفحهٔ «مدیریت جلسات درس».
 *
 * سه پرچم (مهاجرت ۰۱۰۱):
 *   • isHoliday      → جلسه به‌خاطر تعطیلی برگزار نشد (جدا از غیبت استاد)
 *   • isExtraSession → جلسهٔ فوق‌برنامه بیرون از جلسات استاندارد ترم
 *   • isActive       → جلسهٔ لغوشده/منقضی از فهرست عملیاتی کنار برود
 *
 * مرز دانشگاه و نقش اجباری است (جلسه → ارائه → دانشگاه) و `updatedAt` هم به‌روز
 * می‌شود تا ممیزی «آخرین تغییر» معنا داشته باشد.
 */
export async function toggleSessionFlagAction(px: {
  sessionId: number;
  flag: 'isHoliday' | 'isExtraSession' | 'isActive';
}): Promise<{ ok: boolean; error?: string; value?: number }> {
  try {
    await requireRole(['ADMIN', 'EDU_EXPERT', 'DEP_HEAD']);
    const sessionId = Number(px.sessionId);
    if (!sessionId) return { ok: false, error: 'جلسه نامعتبر است.' };
    if (!['isHoliday', 'isExtraSession', 'isActive'].includes(px.flag)) {
      return { ok: false, error: 'پرچم نامعتبر است.' };
    }

    const [row] = await db
      .select({
        id: class_sessions.id,
        isHoliday: class_sessions.isHoliday,
        isExtraSession: class_sessions.isExtraSession,
        isActive: class_sessions.isActive,
        universityId: course_offerings.universityId,
      })
      .from(class_sessions)
      .innerJoin(course_offerings, eq(course_offerings.id, class_sessions.offeringId))
      .where(eq(class_sessions.id, sessionId))
      .limit(1);
    if (!row) return { ok: false, error: 'جلسه یافت نشد.' };

    const uni = await getCurrentUniversity().catch(() => null);
    if (!uni) return { ok: false, error: 'دانشگاه فعال مشخص نیست.' };
    if (row.universityId != null && !(await canActOnUniversity(row.universityId))) {
      return { ok: false, error: 'این جلسه در دانشگاه شما نیست.' };
    }

    const current = px.flag === 'isHoliday' ? row.isHoliday : px.flag === 'isExtraSession' ? row.isExtraSession : row.isActive;
    const next = Number(current ?? 0) === 1 ? 0 : 1;

    await db
      .update(class_sessions)
      .set({ [px.flag]: next, updatedAt: new Date() })
      .where(eq(class_sessions.id, sessionId));

    revalidatePath('/admin/class-sessions');
    revalidatePath('/professor/attendance');
    return { ok: true, value: next };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'تغییر پرچم ممکن نشد.' };
  }
}
