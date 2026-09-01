'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { educational_regulations, degree_level_configs } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import type { RegulationConfig } from '@/lib/regulations-engine';

export async function saveRegulationAction(data: {
  id?: number;
  title: string;
  degreeLevelId: number;
  effectiveFromYear: number;
  effectiveToYear?: number | null;
  rulesConfig: RegulationConfig;
}) {
  await requireRole(['ADMIN', 'EDU_EXPERT']);

  try {
    const configStr = JSON.stringify(data.rulesConfig);

    if (data.id) {
      await db
        .update(educational_regulations)
        .set({
          title: data.title,
          degreeLevelId: data.degreeLevelId,
          effectiveFromYear: data.effectiveFromYear,
          effectiveToYear: data.effectiveToYear || null,
          rulesConfig: configStr,
        })
        .where(eq(educational_regulations.id, data.id));
    } else {
      await db.insert(educational_regulations).values({
        title: data.title,
        degreeLevelId: data.degreeLevelId,
        effectiveFromYear: data.effectiveFromYear,
        effectiveToYear: data.effectiveToYear || null,
        rulesConfig: configStr,
      });
    }

    revalidatePath('/admin/regulations');
    revalidatePath('/admin/curriculum');
    revalidatePath('/student/enroll');
    return { ok: true, message: 'آیین‌نامه با موفقیت ذخیره گردید.' };
  } catch (err: any) {
    console.error('Error saving regulation:', err);
    return { ok: false, error: err.message || 'خطا در ذخیره آیین‌نامه' };
  }
}

export async function deleteRegulationAction(id: number) {
  await requireRole(['ADMIN']);

  try {
    await db.delete(educational_regulations).where(eq(educational_regulations.id, id));
    revalidatePath('/admin/regulations');
    return { ok: true, message: 'آیین‌نامه حذف شد.' };
  } catch (err: any) {
    console.error('Error deleting regulation:', err);
    return { ok: false, error: err.message || 'خطا در حذف آیین‌نامه' };
  }
}
