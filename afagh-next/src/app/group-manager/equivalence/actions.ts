'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { majors, process_definitions, process_steps, student_requests, students } from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';
import { requireDepHead } from '@/lib/group-manager';
import { getCurrentUniversity, isRealUniversityId } from '@/lib/university-scope';
import { advanceWorkflowStep } from '@/lib/workflow-engine';
import { EQUIV_MIN_GRADE } from '@/lib/enroll-engine';
import { effectiveEquivMinGrade } from '@/lib/compliance-integrations';

export type MappingItem = {
  sourceTitle: string;
  sourceUnits: number | null;
  sourceGrade: number | null;
  targetCourseCode: string;
  targetCourseTitle?: string;
  headComment?: string;
};

const MappingItemSchema = z.object({
  sourceTitle: z.string().max(200),
  sourceUnits: z.number().min(0).max(60).nullable(),
  sourceGrade: z.number().min(0).max(20).nullable(),
  targetCourseCode: z.string().max(50),
  targetCourseTitle: z.string().max(200).optional(),
  headComment: z.string().max(2000).optional(),
});

const SubmitArgsSchema = z.object({
  requestId: z.number().int().positive(),
  items: z.array(MappingItemSchema).max(200),
  note: z.string().max(2000).optional(),
});

/** ذخیرهٔ نگاشت معادل‌سازی توسط مدیر گروه و تأیید گام علمی */
export async function submitEquivalenceMappingAction(
  requestId: number,
  items: MappingItem[],
  note?: string
): Promise<{ ok: boolean; error?: string }> {
  const parsed = SubmitArgsSchema.safeParse({ requestId, items, note });
  if (!parsed.success) return { ok: false, error: 'ورودی نامعتبر است.' };
  const args = parsed.data;

  const user = await requireRole(['DEP_HEAD', 'ADMIN']);
  await getStaffByUser(user.id);
  const ownDepts = user.roles.includes('ADMIN') ? null : (await requireDepHead()).depts.map(d => d.id);

  const valid = args.items.filter(i => i.targetCourseCode && i.sourceTitle);
  if (valid.length === 0) return { ok: false, error: 'حداقل یک درس نگاشتشده با کد مقصد الزامی است.' };

  const [req] = await db.select().from(student_requests).where(eq(student_requests.id, args.requestId)).limit(1);
  if (!req) return { ok: false, error: 'درخواست یافت نشد.' };

  /* 🔒 درخواست باید «همان فرایند معادل‌سازی» و «همان گام مدیر گروه» باشد.
     قبلاً هر requestId (هر فرایند/هر گام) پذیرفته می‌شد و اکشن آن را جلو می‌برد. */
  const [proc] = await db
    .select({ code: process_definitions.code })
    .from(process_definitions)
    .where(eq(process_definitions.id, req.processId))
    .limit(1);
  if (proc?.code !== 'COURSE_TRANSFER') {
    return { ok: false, error: 'این درخواست از نوع معادل‌سازی دروس نیست.' };
  }
  if (req.currentStepId == null) {
    return { ok: false, error: 'این درخواست در گام قابل‌اقدام نیست.' };
  }
  const [step] = await db
    .select({ roleCode: process_steps.roleCode })
    .from(process_steps)
    .where(and(eq(process_steps.id, req.currentStepId), eq(process_steps.processId, req.processId)))
    .limit(1);
  if (step?.roleCode !== 'DEPARTMENT_HEAD') {
    return { ok: false, error: 'این درخواست در گام «بررسی مدیر گروه» نیست.' };
  }
  const [stuUni] = await db
    .select({ universityId: students.universityId })
    .from(students)
    .where(eq(students.id, req.studentId))
    .limit(1);
  const curUni = await getCurrentUniversity().catch(() => null);
  if (!isRealUniversityId(curUni?.id) || Number(stuUni?.universityId) !== curUni.id) {
    return { ok: false, error: 'این درخواست متعلق به دانشگاه شما نیست.' };
  }

  // مادهٔ ۱۲ (الف): کف نمره ۱۲ / ۱۴ / ۱۶ بر حسب مقطع، از لایهٔ سیاست (قابل اورراید)
  const equivMin = await effectiveEquivMinGrade(Number(req.studentId ?? 0)).catch(() => EQUIV_MIN_GRADE);
  const badGrade = valid.find(i => i.sourceGrade === null || i.sourceGrade < equivMin);
  if (badGrade) {
    return { ok: false, error: `بر اساس آییننامه، نمرهٔ «${badGrade.sourceTitle}» باید ${equivMin} یا بالاتر باشد.` };
  }
  if (ownDepts) {
    const [owner] = await db.select({ departmentId: majors.departmentId })
      .from(students)
      .innerJoin(majors, eq(majors.id, students.majorId))
      .where(eq(students.id, req.studentId))
      .limit(1);
    if (!owner || owner.departmentId == null || !ownDepts.includes(owner.departmentId)) {
      return { ok: false, error: 'این درخواست متعلق به گروه شما نیست.' };
    }
  }

  let formData: Record<string, any> = {};
  try {
    if (req.formData) formData = JSON.parse(req.formData);
  } catch (_) {}
  formData.items = valid;
  formData.headMappedBy = user.name;
  formData.headMappedAt = new Date().toISOString();

  await db.update(student_requests).set({ formData: JSON.stringify(formData) }).where(eq(student_requests.id, args.requestId));

  try {
    await advanceWorkflowStep({
      requestId: args.requestId,
      actorRole: 'DEPARTMENT_HEAD',
      actorStaffId: (await getStaffByUser(user.id))?.id ?? undefined,
      action: 'APPROVE',
      note: args.note || 'تأیید علمی و انطباق سرفصل توسط مدیر گروه',
    });
  } catch (e: any) {
    return { ok: false, error: 'خطا در تأیید گام: ' + (e?.message || '') };
  }

  revalidatePath('/group-manager/equivalence');
  revalidatePath('/admin/workflows');
  return { ok: true };
}
