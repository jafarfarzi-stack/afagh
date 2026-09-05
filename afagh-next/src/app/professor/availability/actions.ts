'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { professor_availabilities, professor_availability_notes } from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';

export interface AvailabilityCell {
  dayIndex: number; // 0..5 (شنبه..پنجشنبه)
  slotIndex: number; // 1..6
  status: 'PREF' | 'AVAIL' | 'UNAVAIL';
}

/** نگاشت شیفت‌های UI به بازهٔ واقعی ساعت (هم‌راستا با موتور زمان‌بندی که بازه می‌خواند) */
const SLOT_TIMES: Record<number, { start: string; end: string } | null> = {
  1: { start: '08:00', end: '10:00' },
  2: { start: '10:00', end: '12:00' },
  3: null, // نیمروز/نماز و ناهار — ذخیره نمی‌شود
  4: { start: '13:30', end: '15:30' },
  5: { start: '15:30', end: '17:30' },
  6: { start: '17:30', end: '19:30' },
};

/** بارگذاری ماتریس از professor_availabilities (جدولی که موتور زمان‌بندی می‌خواند) */
export async function loadAvailabilityAction(termId: number): Promise<{ ok: boolean; cells?: AvailabilityCell[]; notes?: string; error?: string }> {
  try {
    const user = await requireRole(['PROFESSOR']);
    const me = await getStaffByUser(user.id);
    if (!me) return { ok: false, error: 'پروندهٔ هیئت علمی یافت نشد.' };
    const rows = await db.select().from(professor_availabilities)
      .where(and(eq(professor_availabilities.staffId, me.id), eq(professor_availabilities.termId, Number(termId))));
    const [noteRow] = await db.select().from(professor_availability_notes)
      .where(and(eq(professor_availability_notes.staffId, me.id), eq(professor_availability_notes.termId, Number(termId)))).limit(1);

    const cells: AvailabilityCell[] = [];
    for (const r of rows) {
      const dayIndex = r.dayOfWeek ?? -1;
      if (dayIndex < 0 || dayIndex > 5) continue;
      const slot = Object.entries(SLOT_TIMES).find(([, t]) => t && t.start === String(r.startTime).slice(0, 5) && t.end === String(r.endTime).slice(0, 5));
      if (!slot) continue;
      cells.push({ dayIndex, slotIndex: Number(slot[0]), status: (r.status as 'PREF' | 'AVAIL') || 'AVAIL' });
    }
    // سلول‌های ذخیره‌نشده → UNAVAIL (استاد باید فعال علامت بزند)
    for (let d = 0; d < 6; d++) {
      for (let s = 1; s <= 6; s++) {
        if (s === 3) continue; // شیفت نیمروز ثابت است
        if (!cells.some(c => c.dayIndex === d && c.slotIndex === s)) cells.push({ dayIndex: d, slotIndex: s, status: 'UNAVAIL' });
      }
    }
    return { ok: true, cells, notes: noteRow?.note ?? '' };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'خطا در بارگذاری.' };
  }
}

/** ذخیره — ردیف‌های PREF/AVAIL نوشته می‌شوند؛ UNAVAIL حذف/نوشته نمی‌شود (قرارداد موتور زمان‌بندی) */
export async function saveAvailabilityAction(termId: number, cells: AvailabilityCell[], notes: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireRole(['PROFESSOR']);
    const me = await getStaffByUser(user.id);
    if (!me) return { ok: false, error: 'پروندهٔ هیئت علمی یافت نشد.' };

    const t = Number(termId);
    if (!t) return { ok: false, error: 'ترم نامعتبر است.' };
    const valid = cells.filter(c =>
      Number.isInteger(c.dayIndex) && c.dayIndex >= 0 && c.dayIndex <= 5 &&
      Number.isInteger(c.slotIndex) && c.slotIndex >= 1 && c.slotIndex <= 6 &&
      ['PREF', 'AVAIL', 'UNAVAIL'].includes(c.status),
    );
    if (valid.length !== cells.length) return { ok: false, error: 'سلول‌های نامعتبر در ماتریس.' };

    await db.transaction(async tx => {
      await tx.delete(professor_availabilities)
        .where(and(eq(professor_availabilities.staffId, me.id), eq(professor_availabilities.termId, t)));
      const toInsert = valid
        .filter(c => c.status !== 'UNAVAIL' && SLOT_TIMES[c.slotIndex])
        .map(c => ({
          staffId: me.id, termId: t, dayOfWeek: c.dayIndex,
          startTime: SLOT_TIMES[c.slotIndex]!.start as unknown as string,
          endTime: SLOT_TIMES[c.slotIndex]!.end as unknown as string,
          status: c.status,
        })) as (typeof professor_availabilities.$inferInsert)[];
      if (toInsert.length) await tx.insert(professor_availabilities).values(toInsert);
      await tx.insert(professor_availability_notes).values({ staffId: me.id, termId: t, note: String(notes ?? '').slice(0, 2000) })
        .onConflictDoUpdate({
          target: [professor_availability_notes.staffId, professor_availability_notes.termId],
          set: { note: String(notes ?? '').slice(0, 2000), updatedAt: new Date() },
        });
    });

    revalidatePath('/professor/availability');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'خطا در ذخیرهٔ ماتریس.' };
  }
}
