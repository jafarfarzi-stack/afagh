'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { academic_terms } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { assertServerActionOrigin } from '@/lib/security';
import {
  approveBypassRequest,
  bypassInboxForExpert,
  rejectBypassRequest,
  returnBypassRequest,
  type BypassActorRole,
} from '@/lib/bypass-requests';

const RejectSchema = z.object({
  requestId: z.number().int().positive(),
  reasonCode: z.enum(['LOW_GPA_PREV_TERM', 'GROUP_COUNCIL_DISAGREE', 'UNRESOLVABLE_EXAM_CONFLICT', 'OTHER']),
  reasonText: z.string().max(1000).optional(),
});

type Guard = { ok: true; userId: number; role: BypassActorRole } | { ok: false; error: string };

/**
 * معاون آموزش/مدیر سامانه می‌توانند روی هر درخواستی تصمیم بگیرند؛
 * کارشناس آموزش فقط روی درخواست‌های ارجاع‌شده در دامنهٔ رشتهٔ خودش.
 */
async function guard(requestId: number): Promise<Guard> {
  const user = await requireRole(['ADMIN', 'VICE_EDU', 'EDU_EXPERT']);
  const isVice = user.roles.includes('VICE_EDU') || user.roles.includes('ADMIN');
  if (isVice) return { ok: true, userId: user.id, role: 'VICE' };
  const inbox = await bypassInboxForExpert(user.id);
  if (!inbox.some(r => r.id === requestId)) {
    return { ok: false, error: 'این درخواست در دامنهٔ رشتهٔ شما نیست یا هنوز به شما ارجاع نشده است.' };
  }
  return { ok: true, userId: user.id, role: 'EXPERT' };
}

export async function decideApproveAction(requestId: number): Promise<{ ok: boolean; error?: string }> {
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const g = await guard(requestId);
  if (!g.ok) return { ok: false, error: g.error };
  try {
    const res = await approveBypassRequest({ requestId, actorUserId: g.userId, actorRole: g.role });
    if (!res.ok) return res;
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'تأیید درخواست ناموفق بود.' };
  }
  revalidatePath('/admin/bypass');
  return { ok: true };
}

export async function decideRejectAction(
  requestId: number,
  reasonCode: 'LOW_GPA_PREV_TERM' | 'GROUP_COUNCIL_DISAGREE' | 'UNRESOLVABLE_EXAM_CONFLICT' | 'OTHER',
  reasonText?: string,
): Promise<{ ok: boolean; error?: string }> {
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const parsed = RejectSchema.safeParse({ requestId, reasonCode, reasonText });
  if (!parsed.success) return { ok: false, error: 'دلیل رد نامعتبر است.' };
  if (reasonCode === 'OTHER' && !(reasonText ?? '').trim()) {
    return { ok: false, error: 'برای «سایر» توضیح تکمیلی الزامی است.' };
  }
  const g = await guard(requestId);
  if (!g.ok) return { ok: false, error: g.error };
  try {
    const res = await rejectBypassRequest({
      requestId,
      actorUserId: g.userId,
      actorRole: g.role,
      reasonCode,
      reasonText: parsed.data.reasonText,
    });
    if (!res.ok) return res;
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'رد درخواست ناموفق بود.' };
  }
  revalidatePath('/admin/bypass');
  return { ok: true };
}

/** ذخیرهٔ مهلت‌های تصمیم‌گیری روی تعریف نیمسال جاری (فقط مدیر سامانه) */
export async function saveBypassSettingsAction(formData: FormData): Promise<void> {
  await requireRole(['ADMIN']);
  const termId = Number(formData.get('termId'));
  const managerHours = Number(formData.get('bypassManagerHours'));
  const expertHours = Number(formData.get('bypassExpertHours'));
  const reminderHours = Number(formData.get('bypassReminderHours'));
  const clean = (n: number, fallback: number) =>
    Number.isFinite(n) && n > 0 && n <= 720 ? Math.round(n) : fallback;
  if (!Number.isInteger(termId) || termId <= 0) return;
  await db.update(academic_terms).set({
    bypassManagerHours: clean(managerHours, 48),
    bypassExpertHours: clean(expertHours, 12),
    bypassReminderHours: clean(reminderHours, 10),
  }).where(eq(academic_terms.id, termId));
  revalidatePath('/admin/bypass');
}

export async function decideReturnAction(requestId: number, target: 'MANAGER' | 'EXPERT'): Promise<{ ok: boolean; error?: string }> {
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  if (target !== 'MANAGER' && target !== 'EXPERT') return { ok: false, error: 'مقصد بازگشت نامعتبر است.' };
  const g = await guard(requestId);
  if (!g.ok) return { ok: false, error: g.error };
  if (g.role !== 'VICE') return { ok: false, error: 'بازگرداندن درخواست فقط توسط معاون آموزش انجام می‌شود.' };
  try {
    const res = await returnBypassRequest({ requestId, target, actorUserId: g.userId });
    if (!res.ok) return res;
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'بازگرداندن درخواست ناموفق بود.' };
  }
  revalidatePath('/admin/bypass');
  return { ok: true };
}
