'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { student_requests } from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';
import { advanceWorkflowStep } from '@/lib/workflow-engine';
import { EQUIV_MIN_GRADE } from '@/lib/enroll-engine';

export type MappingItem = {
  sourceTitle: string;
  sourceUnits: number | null;
  sourceGrade: number | null;
  targetCourseCode: string;
  targetCourseTitle?: string;
  headComment?: string;
};

/** ذخیرهٔ نگاشت معادل‌سازی توسط مدیر گروه و تأیید گام علمی */
export async function submitEquivalenceMappingAction(
  requestId: number,
  items: MappingItem[],
  note?: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole(['DEP_HEAD', 'ADMIN']);
  await getStaffByUser(user.id);

  const valid = items.filter(i => i.targetCourseCode && i.sourceTitle);
  if (valid.length === 0) return { ok: false, error: 'حداقل یک درس نگاشت‌شده با کد مقصد الزامی است.' };
  const badGrade = valid.find(i => i.sourceGrade === null || i.sourceGrade < EQUIV_MIN_GRADE);
  if (badGrade) {
    return { ok: false, error: `بر اساس آیین‌نامه، نمرهٔ «${badGrade.sourceTitle}» باید ${EQUIV_MIN_GRADE} یا بالاتر باشد.` };
  }

  const [req] = await db.select().from(student_requests).where(eq(student_requests.id, requestId)).limit(1);
  if (!req) return { ok: false, error: 'درخواست یافت نشد.' };

  let formData: Record<string, any> = {};
  try {
    if (req.formData) formData = JSON.parse(req.formData);
  } catch (_) {}
  formData.items = valid;
  formData.headMappedBy = user.name;
  formData.headMappedAt = new Date().toISOString();

  await db.update(student_requests).set({ formData: JSON.stringify(formData) }).where(eq(student_requests.id, requestId));

  try {
    await advanceWorkflowStep({
      requestId,
      actorRole: 'DEPARTMENT_HEAD',
      actorStaffId: (await getStaffByUser(user.id))?.id ?? undefined,
      action: 'APPROVE',
      note: note || 'تأیید علمی و انطباق سرفصل توسط مدیر گروه',
    });
  } catch (e: any) {
    return { ok: false, error: 'خطا در تأیید گام: ' + (e?.message || '') };
  }

  revalidatePath('/group-manager/equivalence');
  revalidatePath('/admin/workflows');
  return { ok: true };
}
