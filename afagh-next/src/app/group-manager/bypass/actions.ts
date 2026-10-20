'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { course_offerings, courses, enroll_bypass_requests } from '@/db/schema';
import { requireDepHead } from '@/lib/group-manager';
import { assertServerActionOrigin } from '@/lib/security';
import { approveBypassRequest, rejectBypassRequest } from '@/lib/bypass-requests';

const RejectSchema = z.object({
  requestId: z.number().int().positive(),
  reasonCode: z.enum(['LOW_GPA_PREV_TERM', 'GROUP_COUNCIL_DISAGREE', 'UNRESOLVABLE_EXAM_CONFLICT', 'OTHER']),
  reasonText: z.string().max(1000).optional(),
});

/** درخواست باید متعلق به گروهی باشد که این مدیر واقعاً مدیر آن است. */
async function requestInMyDepartments(requestId: number, deptIds: number[]): Promise<boolean> {
  const [row] = await db
    .select({ deptId: courses.departmentId })
    .from(enroll_bypass_requests)
    .innerJoin(course_offerings, eq(course_offerings.id, enroll_bypass_requests.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(eq(enroll_bypass_requests.id, requestId))
    .limit(1);
  return !!row && row.deptId != null && deptIds.includes(row.deptId);
}

/** تأیید درخواست «بدون رعایت پیش‌نیاز / تداخل امتحانی» توسط مدیر گروه */
export async function approveBypassAction(requestId: number): Promise<{ ok: boolean; error?: string }> {
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const { user, depts } = await requireDepHead();
  if (!(await requestInMyDepartments(requestId, depts.map(d => d.id)))) {
    return { ok: false, error: 'این درخواست در دامنهٔ گروه شما نیست.' };
  }
  try {
    await approveBypassRequest({ requestId, actorUserId: user.id, actorRole: 'MANAGER' });
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'تأیید درخواست ناموفق بود.' };
  }
  revalidatePath('/group-manager/bypass');
  return { ok: true };
}

/** رد درخواست با دلیل الزامی */
export async function rejectBypassAction(
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
  const { user, depts } = await requireDepHead();
  if (!(await requestInMyDepartments(requestId, depts.map(d => d.id)))) {
    return { ok: false, error: 'این درخواست در دامنهٔ گروه شما نیست.' };
  }
  try {
    await rejectBypassRequest({
      requestId,
      actorUserId: user.id,
      actorRole: 'MANAGER',
      reasonCode,
      reasonText: parsed.data.reasonText,
    });
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'رد درخواست ناموفق بود.' };
  }
  revalidatePath('/group-manager/bypass');
  return { ok: true };
}
