'use server';

// ════════════════════════════════════════════════════════════════════════
//  چرخهٔ حیات مصوب: اعتبارسنجی، ارسال برای تأیید، تأیید، رد، انتشار و
//  بایگانی — هر گذار با assertTransition (ماشین حالت فاز ۱) قفل می‌شود و
//  رویدادش append-only در curriculum_approvals ثبت می‌گردد.
// ════════════════════════════════════════════════════════════════════════

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { curriculum_approvals, curriculum_versions } from '@/db/schema';
import { appendAudit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { CheckResult, CurriculumVersionStatus, assertTransition } from '@/lib/curriculum-types';
import { hasBlockingErrors } from '@/lib/curriculum-validator';
import { APPROVERS, type Act, EDITORS, PHASE, type SubmitForApprovalResult, getVersionOrThrow, requireActorStaff, revalidateCurriculumPaths, runChecks } from './shared';

// ─────────────────────────── اعتبارسنجی و چرخهٔ حیات ───────────────────────────

export async function validateCurriculumAction(versionId: number): Promise<Act<{ data: { checks: CheckResult[]; blocked: boolean } }>> {
  await requireRole(EDITORS);
  try {
    await getVersionOrThrow(versionId);
    const checks = await runChecks(versionId);
    return { ok: true, data: { checks, blocked: hasBlockingErrors(checks) } };
  } catch (err: any) {
    console.error('validateCurriculumAction:', err);
    return { ok: false, error: err.message || 'خطا در اعتبارسنجی' };
  }
}


export async function submitCurriculumForApprovalAction(versionId: number, note?: string): Promise<SubmitForApprovalResult> {
  await requireRole(EDITORS);
  try {
    const version = await getVersionOrThrow(versionId);
    assertTransition(version.status as CurriculumVersionStatus, 'REVIEW', 'submit');

    const checks = await runChecks(versionId);
    const blocking = checks.filter((c) => c.severity === 'ERROR');
    if (blocking.length > 0) {
      return {
        ok: false,
        checks,
        error: `برنامهٔ درسی ${blocking.length} مانع جدی دارد و قابل ارجاع به تأیید نیست: ${blocking.map((c) => c.check).join('، ')}`,
      };
    }

    const user = await requireRole(EDITORS);
    return await db.transaction(async (tx) => {
      const [ev] = await tx.insert(curriculum_approvals).values({
        curriculumVersionId: versionId,
        approvalType: 'DRAFT_SUBMIT',
        fromStatus: 'DRAFT',
        toStatus: 'REVIEW',
        approvedByStaffId: await requireActorStaff(user),
        approvedByUserId: user.id,
        decisionNote: note ?? null,
      }).returning({ id: curriculum_approvals.id });
      await tx.update(curriculum_versions).set({ status: 'REVIEW', approvalId: ev.id, updatedAt: new Date() })
        .where(eq(curriculum_versions.id, versionId));
      await appendAudit(tx, {
        actorUserId: user.id,
        action: 'CURRICULUM_SUBMITTED_FOR_APPROVAL', entityType: PHASE, entityId: versionId,
        details: JSON.stringify({ checks: checks.length, warns: checks.length - blocking.length }),
      });
      revalidateCurriculumPaths();
      return { ok: true, message: 'نسخه به بازبینی (REVIEW) ارجاع شد.', data: { checks } };
    });
  } catch (err: any) {
    console.error('submitCurriculumForApprovalAction:', err);
    return { ok: false, error: err.message || 'خطا در ارجاع به تأیید' };
  }
}


export async function approveCurriculumAction(versionId: number, note?: string): Promise<Act<{ message: string }>> {
  await requireRole(APPROVERS);
  try {
    const version = await getVersionOrThrow(versionId);
    assertTransition(version.status as CurriculumVersionStatus, 'APPROVED', 'approve');
    const user = await requireRole(APPROVERS);
    return await db.transaction(async (tx) => {
      const [ev] = await tx.insert(curriculum_approvals).values({
        curriculumVersionId: versionId,
        approvalType: 'HEAD_APPROVE',
        fromStatus: 'REVIEW',
        toStatus: 'APPROVED',
        approvedByStaffId: await requireActorStaff(user),
        approvedByUserId: user.id,
        decisionNote: note ?? null,
      }).returning({ id: curriculum_approvals.id });
      await tx.update(curriculum_versions).set({ status: 'APPROVED', approvalId: ev.id, updatedAt: new Date() })
        .where(eq(curriculum_versions.id, versionId));
      await appendAudit(tx, {
        actorUserId: user.id,
        action: 'CURRICULUM_APPROVED', entityType: PHASE, entityId: versionId, details: note ?? null,
      });
      revalidateCurriculumPaths();
      return { ok: true, message: 'نسخه تأیید شد (APPROVED).' };
    });
  } catch (err: any) {
    console.error('approveCurriculumAction:', err);
    return { ok: false, error: err.message || 'خطا در تأیید' };
  }
}


export async function rejectCurriculumAction(versionId: number, note: string): Promise<Act<{ message: string }>> {
  await requireRole(APPROVERS);
  try {
    if (!note?.trim()) return { ok: false, error: 'دلیل بازگشت الزامی است.' };
    const version = await getVersionOrThrow(versionId);
    assertTransition(version.status as CurriculumVersionStatus, 'DRAFT', 'reject');
    const user = await requireRole(APPROVERS);
    return await db.transaction(async (tx) => {
      const [ev] = await tx.insert(curriculum_approvals).values({
        curriculumVersionId: versionId,
        approvalType: 'REJECT',
        fromStatus: 'REVIEW',
        toStatus: 'DRAFT',
        approvedByStaffId: await requireActorStaff(user),
        approvedByUserId: user.id,
        decisionNote: note.trim(),
      }).returning({ id: curriculum_approvals.id });
      await tx.update(curriculum_versions).set({ status: 'DRAFT', approvalId: ev.id, updatedAt: new Date() })
        .where(eq(curriculum_versions.id, versionId));
      await appendAudit(tx, {
        actorUserId: user.id,
        action: 'CURRICULUM_REJECTED', entityType: PHASE, entityId: versionId, details: note.trim(),
      });
      revalidateCurriculumPaths();
      return { ok: true, message: 'نسخه برای اصلاح به DRAFT بازگشت.' };
    });
  } catch (err: any) {
    console.error('rejectCurriculumAction:', err);
    return { ok: false, error: err.message || 'خطا در بازگشت نسخه' };
  }
}


export async function publishCurriculumAction(versionId: number, note?: string): Promise<Act<{ message: string; data: { superseded: string[] } }>> {
  await requireRole(APPROVERS);
  try {
    const version = await getVersionOrThrow(versionId);
    assertTransition(version.status as CurriculumVersionStatus, 'PUBLISHED', 'publish');
    const user = await requireRole(APPROVERS);
    const staffId = await requireActorStaff(user);

    return await db.transaction(async (tx) => {
      // ⚠ قید «فقط یک PUBLISHED فعال» (ایندکس جزئی): اگر رقیبی هست، اول آرشیو می‌شود
      const rivals = await tx.select({ id: curriculum_versions.id, versionCode: curriculum_versions.versionCode })
        .from(curriculum_versions)
        .where(and(
          eq(curriculum_versions.majorId, version.majorId),
          eq(curriculum_versions.degreeLevelId, version.degreeLevelId),
          sql`coalesce(${curriculum_versions.trackId}, 0) = ${version.trackId ?? 0}`,
          eq(curriculum_versions.status, 'PUBLISHED'),
          sql`${curriculum_versions.id} <> ${versionId}`,
        ));
      for (const r of rivals) {
        const [ev] = await tx.insert(curriculum_approvals).values({
          curriculumVersionId: r.id,
          approvalType: 'ARCHIVE',
          fromStatus: 'PUBLISHED',
          toStatus: 'ARCHIVED',
          approvedByStaffId: staffId,
          approvedByUserId: user.id,
          decisionNote: `با انتشار نسخهٔ ${version.versionCode} بایگانی شد.`,
        }).returning({ id: curriculum_approvals.id });
        await tx.update(curriculum_versions).set({ status: 'ARCHIVED', approvalId: ev.id, updatedAt: new Date() })
          .where(eq(curriculum_versions.id, r.id));
      }
      const [ev] = await tx.insert(curriculum_approvals).values({
        curriculumVersionId: versionId,
        approvalType: 'PUBLISH',
        fromStatus: 'APPROVED',
        toStatus: 'PUBLISHED',
        approvedByStaffId: staffId,
        approvedByUserId: user.id,
        decisionNote: note ?? null,
      }).returning({ id: curriculum_approvals.id });
      await tx.update(curriculum_versions).set({ status: 'PUBLISHED', approvalId: ev.id, updatedAt: new Date() })
        .where(eq(curriculum_versions.id, versionId));
      await appendAudit(tx, {
        actorUserId: user.id,
        action: 'CURRICULUM_PUBLISHED', entityType: PHASE, entityId: versionId,
        details: JSON.stringify({ superseded: rivals.map((r) => r.versionCode) }),
      });
      revalidateCurriculumPaths();
      return { ok: true, message: rivals.length > 0
        ? `نسخه منتشر شد و ${rivals.length} نسخهٔ رقیب بایگانی گردید.`
        : 'نسخه منتشر شد (PUBLISHED).', data: { superseded: rivals.map((r) => r.versionCode) } };
    });
  } catch (err: any) {
    console.error('publishCurriculumAction:', err);
    return { ok: false, error: err.message || 'خطا در انتشار نسخه' };
  }
}


export async function archiveCurriculumAction(versionId: number, note?: string): Promise<Act<{ message: string }>> {
  await requireRole(APPROVERS);
  try {
    const version = await getVersionOrThrow(versionId);
    assertTransition(version.status as CurriculumVersionStatus, 'ARCHIVED', 'archive');
    const user = await requireRole(APPROVERS);
    return await db.transaction(async (tx) => {
      const [ev] = await tx.insert(curriculum_approvals).values({
        curriculumVersionId: versionId,
        approvalType: 'ARCHIVE',
        fromStatus: 'PUBLISHED',
        toStatus: 'ARCHIVED',
        approvedByStaffId: await requireActorStaff(user),
        approvedByUserId: user.id,
        decisionNote: note ?? null,
      }).returning({ id: curriculum_approvals.id });
      await tx.update(curriculum_versions).set({ status: 'ARCHIVED', approvalId: ev.id, updatedAt: new Date() })
        .where(eq(curriculum_versions.id, versionId));
      await appendAudit(tx, {
        actorUserId: user.id,
        action: 'CURRICULUM_ARCHIVED', entityType: PHASE, entityId: versionId, details: note ?? null,
      });
      revalidateCurriculumPaths();
      return { ok: true, message: 'نسخه بایگانی شد (ARCHIVED).' };
    });
  } catch (err: any) {
    console.error('archiveCurriculumAction:', err);
    return { ok: false, error: err.message || 'خطا در بایگانی' };
  }
}
