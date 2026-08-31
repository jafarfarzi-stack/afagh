'use server';

import { revalidatePath } from 'next/cache';
import { getStudentByUser, requireRole } from '@/lib/auth';
import {
  ensureDefaultProcesses,
  submitRequestSatisfaction,
  submitStudentRequest,
} from '@/lib/workflow-engine';

export async function submitStudentRequestAction(processCode: string, formData: Record<string, any>) {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  if (!me) return { ok: false, error: 'پرونده دانشجویی یافت نشد.' };

  try {
    const created = await submitStudentRequest({
      studentId: me.id,
      userId: user.id,
      processCode,
      formData,
    });

    revalidatePath('/student/requests');
    revalidatePath('/admin');
    revalidatePath('/admin/workflows');
    return { ok: true, trackingCode: created.trackingCode, status: created.status };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'خطا در ثبت درخواست.' };
  }
}

export async function submitSatisfactionRatingAction(requestId: number, score: number, feedback?: string) {
  const user = await requireRole(['STUDENT']);

  try {
    await submitRequestSatisfaction({
      requestId,
      score,
      feedback,
    });

    revalidatePath('/student/requests');
    revalidatePath('/admin/workflows');
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'خطا در ثبت امتیاز نظرسنجی.' };
  }
}
