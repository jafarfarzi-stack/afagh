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

  // گارد سال شمسی معتبر: جلوگیری از ورود کدهای سما (مثل ۱۲۳۰/۱۳۳۰) به‌جای سال
  const from = Number(data.effectiveFromYear);
  const to = data.effectiveToYear != null && (data.effectiveToYear as unknown as string) !== '' ? Number(data.effectiveToYear) : null;
  if (!Number.isInteger(from) || from < 1350 || from > 1500) {
    return { ok: false, error: `سال شروع اعتبار باید سال شمسی معتبر (۱۳۵۰ تا ۱۵۰۰) باشد؛ مقدار «${data.effectiveFromYear}» پذیرفته نیست.` };
  }
  if (to != null && (!Number.isInteger(to) || to < from || to > 1500)) {
    return { ok: false, error: `سال پایان اعتبار باید بین سال شروع (${from}) و ۱۵۰۰ باشد.` };
  }

  try {
    const configStr = JSON.stringify(data.rulesConfig);

    if (data.id) {
      await db
        .update(educational_regulations)
        .set({
          title: data.title,
          degreeLevelId: data.degreeLevelId,
          effectiveFromYear: from,
          effectiveToYear: to,
          rulesConfig: configStr,
        })
        .where(eq(educational_regulations.id, data.id));
    } else {
      await db.insert(educational_regulations).values({
        title: data.title,
        degreeLevelId: data.degreeLevelId,
        effectiveFromYear: from,
        effectiveToYear: to,
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
