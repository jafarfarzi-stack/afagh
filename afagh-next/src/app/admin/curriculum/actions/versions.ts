'use server';

// ════════════════════════════════════════════════════════════════════════
//  خودِ نسخه‌ها: ایجاد (با کپی عمیق)، ویرایش متادیتای سقف واحد/سهم نقش،
//  و ساخت بازنگری (R+1) از یک نسخهٔ منتشرشده.
// ════════════════════════════════════════════════════════════════════════

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { curriculum_approvals, curriculum_versions, majors } from '@/db/schema';
import { appendAudit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { nextRevisionCode } from '@/lib/curriculum-types';
import { parseRoleUnitTargets } from '@/lib/curriculum-validator';
import { type Act, type CreateVersionInput, EDITORS, PHASE, assertEditable, assertUniqueVersionCode, deepCopyCourseData, getVersionOrThrow, requireActorStaff, revalidateCurriculumPaths } from './shared';

export async function createCurriculumVersionAction(input: CreateVersionInput): Promise<Act<{ message: string; data: { id: number } }>> {
  await requireRole(EDITORS);
  try {
    const [majorRow] = await db.select().from(majors).where(eq(majors.id, input.majorId)).limit(1);
    if (!majorRow) return { ok: false, error: 'رشتهٔ انتخابی یافت نشد.' };
    const degreeLevelId = input.degreeLevelId ?? majorRow.degreeLevelId;
    const trackId = input.trackId ?? null;
    const versionCode = input.versionCode.trim();
    const title = input.title?.trim() || `برنامهٔ ${majorRow.name} ${versionCode}`;
    await assertUniqueVersionCode(input.majorId, degreeLevelId, trackId, versionCode);
    const user = await requireRole(EDITORS);

    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(curriculum_versions).values({
        majorId: input.majorId,
        degreeLevelId,
        trackId,
        versionCode,
        title,
        status: 'DRAFT',
        entryYearFrom: input.entryYearFrom,
        entryYearTo: input.entryYearTo ?? null,
        totalRequiredUnits: String(input.totalRequiredUnits ?? 0),
        maxUnitsPerTerm: input.maxUnitsPerTerm ?? null,
      }).returning({ id: curriculum_versions.id });

      let clonedFrom: number | null = null;
      if (input.cloneFromId) {
        const src = await getVersionOrThrow(input.cloneFromId);
        await deepCopyCourseData(tx, src.id, created.id);
        await tx.insert(curriculum_approvals).values({
          curriculumVersionId: created.id,
          approvalType: 'CREATE_REVISION',
          fromStatus: src.status as string,
          toStatus: 'DRAFT',
          approvedByStaffId: await requireActorStaff(user),
          approvedByUserId: user.id,
          decisionNote: `کپی از نسخهٔ ${src.versionCode} (${src.status})`,
        });
        clonedFrom = src.id;
      }
      await appendAudit(tx, {
        actorUserId: user.id,
        action: 'CURRICULUM_VERSION_CREATED',
        entityType: PHASE,
        entityId: created.id,
        details: JSON.stringify({ majorId: input.majorId, versionCode, clonedFrom }),
      });
      revalidateCurriculumPaths();
      return { ok: true, message: `نسخهٔ ${versionCode} ساخته شد.`, data: { id: created.id } };
    });
  } catch (err: any) {
    console.error('createCurriculumVersionAction:', err);
    return { ok: false, error: err.message || 'خطا در ساخت نسخه' };
  }
}


export async function updateCurriculumMetaAction(
  versionId: number,
  patch: {
    title?: string; versionCode?: string; trackId?: number | null;
    entryYearFrom?: number; entryYearTo?: number | null;
    effectiveFrom?: string | null; effectiveTo?: string | null;
    totalRequiredUnits?: number; maxUnitsPerTerm?: number | null;
    /** سهم واحد مقرر هر نقش، مثل {GENERAL: 22, CORE: 25} — خالی/{} یعنی پاک‌سازی */
    minRoleUnits?: Record<string, number> | null;
  }
) {
  await requireRole(EDITORS);
  try {
    const v = await assertEditable(versionId);
    if (patch.versionCode && patch.versionCode.trim() !== v.versionCode) {
      await assertUniqueVersionCode(v.majorId, v.degreeLevelId, v.trackId, patch.versionCode.trim(), versionId);
    }
    await db.update(curriculum_versions).set({
      title: patch.title?.trim() ?? v.title,
      versionCode: patch.versionCode?.trim() ?? v.versionCode,
      trackId: patch.trackId !== undefined ? patch.trackId : v.trackId,
      entryYearFrom: patch.entryYearFrom ?? v.entryYearFrom,
      entryYearTo: patch.entryYearTo !== undefined ? patch.entryYearTo : v.entryYearTo,
      effectiveFrom: patch.effectiveFrom !== undefined ? patch.effectiveFrom : v.effectiveFrom,
      effectiveTo: patch.effectiveTo !== undefined ? patch.effectiveTo : v.effectiveTo,
      totalRequiredUnits: patch.totalRequiredUnits != null ? String(patch.totalRequiredUnits) : v.totalRequiredUnits,
      maxUnitsPerTerm: patch.maxUnitsPerTerm !== undefined ? patch.maxUnitsPerTerm : v.maxUnitsPerTerm,
      minRoleUnits: patch.minRoleUnits !== undefined
        ? (patch.minRoleUnits && Object.keys(patch.minRoleUnits).length > 0 ? JSON.stringify(parseRoleUnitTargets(patch.minRoleUnits)) : null)
        : v.minRoleUnits,
      updatedAt: new Date(),
    }).where(eq(curriculum_versions.id, versionId));
    await db.transaction(async (tx) => {
      await appendAudit(tx, {
        actorUserId: (await requireRole(EDITORS)).id,
        action: 'CURRICULUM_VERSION_META_UPDATED', entityType: PHASE, entityId: versionId,
        details: JSON.stringify(patch),
      });
    });
    revalidateCurriculumPaths();
    return { ok: true, message: 'مشخصات نسخه بهروزرسانی شد.' };
  } catch (err: any) {
    console.error('updateCurriculumMetaAction:', err);
    return { ok: false, error: err.message || 'خطا در بهروزرسانی مشخصات' };
  }
}


export async function createCurriculumRevisionAction(versionId: number): Promise<Act<{ message: string; data: { id: number; versionCode: string } }>> {
  await requireRole(EDITORS);
  try {
    const src = await getVersionOrThrow(versionId);
    if (!['APPROVED', 'PUBLISHED'].includes(src.status)) {
      return { ok: false, error: `ساخت ویرایش فقط از نسخهٔ تأییدشده/منتشرشده ممکن است (وضعیت فعلی: ${src.status}).` };
    }
    const user = await requireRole(EDITORS);
    const newCode = nextRevisionCode(src.versionCode);
    await assertUniqueVersionCode(src.majorId, src.degreeLevelId, src.trackId, newCode);

    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(curriculum_versions).values({
        majorId: src.majorId,
        degreeLevelId: src.degreeLevelId,
        trackId: src.trackId,
        versionCode: newCode,
        title: src.title.replace(src.versionCode, newCode),
        status: 'DRAFT',
        entryYearFrom: src.entryYearFrom,
        entryYearTo: src.entryYearTo,
        effectiveFrom: src.effectiveFrom,
        effectiveTo: src.effectiveTo,
        totalRequiredUnits: src.totalRequiredUnits,
        maxUnitsPerTerm: src.maxUnitsPerTerm,
      }).returning({ id: curriculum_versions.id });
      await deepCopyCourseData(tx, src.id, created.id);
      const [ev] = await tx.insert(curriculum_approvals).values({
        curriculumVersionId: created.id,
        approvalType: 'CREATE_REVISION',
        fromStatus: src.status,
        toStatus: 'DRAFT',
        approvedByStaffId: await requireActorStaff(user),
        approvedByUserId: user.id,
        decisionNote: `ویرایش از نسخهٔ ${src.versionCode} (${src.status})`,
      }).returning({ id: curriculum_approvals.id });
      await tx.update(curriculum_versions).set({ approvalId: ev.id })
        .where(eq(curriculum_versions.id, created.id));
      await appendAudit(tx, {
        actorUserId: user.id,
        action: 'CURRICULUM_REVISION_CREATED', entityType: PHASE, entityId: created.id,
        details: JSON.stringify({ sourceId: src.id, sourceCode: src.versionCode, newCode }),
      });
      revalidateCurriculumPaths();
      return { ok: true, message: `نسخهٔ ${newCode} (DRAFT) از روی ${src.versionCode} ساخته شد.`, data: { id: created.id, versionCode: newCode } };
    });
  } catch (err: any) {
    console.error('createCurriculumRevisionAction:', err);
    return { ok: false, error: err.message || 'خطا در ساخت ویرایش' };
  }
}
