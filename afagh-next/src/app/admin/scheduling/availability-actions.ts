'use server';

// ویرایش «برنامهٔ اعلامی استاد» توسط مدیر گروه / کارشناس آموزش.
// چرا: فرم اعلام حضور فقط از پرتال استاد ثبت می‌شد و مدیر گروه اگر استاد
// اعلام نمی‌کرد یا اشتباه اعلام می‌کرد، دستش بسته بود. این اکشن همان داده را
// برای یک staffId مشخص می‌نویسد (با ثبت اینکه چه کسی ویرایش کرده).
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { professor_availabilities, professor_availability_notes, staff } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getTimeSlots } from '@/lib/schedule-config';

export interface ManagerAvailabilityCell {
  dayIndex: number; // 0..6
  slotIndex: number; // شناسهٔ زنگ از buildTimeSlots
  status: 'PREF' | 'AVAIL' | 'UNAVAIL';
  startTime?: string;
  endTime?: string;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** ذخیرهٔ ماتریس حضور استاد به‌نام او (فقط مدیر/کارشناس) */
export async function saveProfessorAvailabilityForStaffAction(
  staffId: number,
  termId: number,
  cells: ManagerAvailabilityCell[],
  notes?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireRole(['ADMIN', 'EDU_EXPERT', 'DEP_HEAD', 'VICE_EDU']);

    const sid = Number(staffId);
    const t = Number(termId);
    if (!Number.isInteger(sid) || sid <= 0) return { ok: false, error: 'استاد نامعتبر است.' };
    if (!Number.isInteger(t) || t <= 0) return { ok: false, error: 'ترم نامعتبر است.' };

    const [prof] = await db.select({ id: staff.id }).from(staff).where(eq(staff.id, sid)).limit(1);
    if (!prof) return { ok: false, error: 'پروندهٔ استاد یافت نشد.' };

    const teaching = (await getTimeSlots()).filter(s => !s.isBreak);
    const byId = new Map(teaching.map(s => [s.id, s]));
    const timeOf = (c: ManagerAvailabilityCell): { start: string; end: string } | null => {
      if (c.startTime && c.endTime && TIME_RE.test(c.startTime) && TIME_RE.test(c.endTime)) {
        return { start: c.startTime, end: c.endTime };
      }
      const slot = byId.get(c.slotIndex);
      return slot ? { start: slot.startTime, end: slot.endTime } : null;
    };

    const valid = cells.filter(c =>
      Number.isInteger(c.dayIndex) && c.dayIndex >= 0 && c.dayIndex <= 6 &&
      Number.isInteger(c.slotIndex) && c.slotIndex >= 1 &&
      ['PREF', 'AVAIL', 'UNAVAIL'].includes(c.status) &&
      (c.status === 'UNAVAIL' || timeOf(c) != null),
    );
    if (valid.length !== cells.length) return { ok: false, error: 'سلول‌های نامعتبر در ماتریس.' };

    await db.transaction(async tx => {
      await tx.delete(professor_availabilities)
        .where(and(eq(professor_availabilities.staffId, sid), eq(professor_availabilities.termId, t)));
      const toInsert = valid
        .filter(c => c.status !== 'UNAVAIL')
        .map(c => {
          const times = timeOf(c)!;
          return {
            staffId: sid, termId: t, dayOfWeek: c.dayIndex,
            startTime: times.start, endTime: times.end,
            status: c.status,
          };
        }) as (typeof professor_availabilities.$inferInsert)[];
      if (toInsert.length) await tx.insert(professor_availabilities).values(toInsert);

      if (notes != null) {
        await tx.insert(professor_availability_notes)
          .values({ staffId: sid, termId: t, note: String(notes).slice(0, 2000) })
          .onConflictDoUpdate({
            target: [professor_availability_notes.staffId, professor_availability_notes.termId],
            set: { note: String(notes).slice(0, 2000), updatedAt: new Date() },
          });
      }
    });

    revalidatePath('/admin/scheduling');
    revalidatePath('/professor/availability');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'خطا در ذخیرهٔ ماتریس استاد.' };
  }
}
