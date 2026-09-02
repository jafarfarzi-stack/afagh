'use server';

import { revalidatePath } from 'next/cache';
import { getStudentByUser, requireRole } from '@/lib/auth';
import {
  ensureDefaultProcesses,
  submitRequestSatisfaction,
  submitStudentRequest,
} from '@/lib/workflow-engine';
import { archiveKey, putArchiveObject } from '@/lib/objectStore';

/** آپلود پیوست درخواست (مثل کارنامه ممهور) در Object Storage — فقط متادیتا در فرم ذخیره می‌شود */
export async function uploadRequestAttachmentAction(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
  attachment?: { key: string; name: string; size: number; mimeType: string };
}> {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  if (!me) return { ok: false, error: 'پروندهٔ دانشجویی یافت نشد.' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'فایلی انتخاب نشده است.' };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: 'حجم پیوست نباید بیش از ۱۰ مگابایت باشد.' };

  const buf = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const key = `requests/${me.id}/attach-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}.${ext}`;
  try {
    await putArchiveObject(key, buf, file.type || 'application/octet-stream');
  } catch (e: any) {
    return { ok: false, error: 'خطا در ذخیرهٔ پیوست (Object Storage در دسترس نیست): ' + (e?.message || '') };
  }
  return { ok: true, attachment: { key, name: file.name, size: file.size, mimeType: file.type || '' } };
}

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
