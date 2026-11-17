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
import { APPROVERS, type Act, EDITORS, PHASE, type SubmitForApprovalResult, getVersionOrThrow, requireActorStaff, resolveVersionUniversityId, revalidateCurriculumPaths, runChecks } from './shared';

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
        error: `برنامهٔ درسی ${blocking.length} مانع جدی دارد و قابل ارجاع به تأیید نیست: ${blocking.map((c) => c.message).join('؛ ')}`,
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
    const version = await getVersionOrThrow(versionId);   // ← گارد چندمؤسسه‌ای
    assertTransition(version.status as CurriculumVersionStatus, 'PUBLISHED', 'publish');

    // ── انتشار بدون اعتبارسنجی ممنوع ──
    // پیش‌تر فقط مسیر «ارجاع به تأیید» چک‌ها را اجرا می‌کرد و می‌شد با فراخوانی
    // مستقیم publish یک نسخهٔ APPROVEDِ معیوب (یا ویرایش‌شده پس از تأیید) را
    // منتشر کرد. همان موتور، همان آستانه (ERROR = مانع)، ولی متنِ فارسیِ یافته‌ها.
    const checks = await runChecks(versionId);
    const blocking = checks.filter((c) => c.severity === 'ERROR');
    if (blocking.length > 0) {
      return {
        ok: false,
        error: `برنامهٔ درسی ${blocking.length} مانع جدی دارد و قابل انتشار نیست: ${blocking.map((c) => c.message).join('؛ ')}`,
      };
    }

    const user = await requireRole(APPROVERS);
    const staffId = await requireActorStaff(user);
    // دانشگاهِ مالک (از همان درِ گارد؛ برای هم‌دامنه‌کردن کوئری رقبا)
    const tenantUniId = await resolveVersionUniversityId(version);
    if (tenantUniId == null) throw new Error('دانشگاهِ مالکِ این نسخهٔ چارت مشخص نیست.');

    return await db.transaction(async (tx) => {
      // ⚠ قید «فقط یک PUBLISHED فعال»: رقیب فقط وقتی بایگانی می‌شود که
      //   ۱) همان دانشگاه باشد — هرگز چارت دانشگاه دیگر بایگانی نمی‌شود،
      //   ۲) همان نوع کاتالوگ باشد — انتشار کاتالوگ جبرانی، عادی را بایگانی نمی‌کند،
      //   ۳) پنجرهٔ ورودی‌اش با این نسخه **هم‌پوشانی** داشته باشد — چارت ۱۴۰۵
      //      نباید چارت ۱۴۰۲ (کوهورت قدیمی که هنوز دانشجوی شاغل دارد) را بایگانی کند.
      //      «تا» خالی = به‌بعد (۹۹۹۹).
      const rivals = await tx.select({ id: curriculum_versions.id, versionCode: curriculum_versions.versionCode })
        .from(curriculum_versions)
        .where(and(
          eq(curriculum_versions.universityId, tenantUniId),
          eq(curriculum_versions.majorId, version.majorId),
          eq(curriculum_versions.degreeLevelId, version.degreeLevelId),
          sql`coalesce(${curriculum_versions.trackId}, 0) = ${version.trackId ?? 0}`,
          eq(curriculum_versions.catalogKind, version.catalogKind),
          eq(curriculum_versions.status, 'PUBLISHED'),
          sql`${curriculum_versions.entryYearFrom} <= coalesce(${version.entryYearTo}::int, 9999)`,
          sql`coalesce(${curriculum_versions.entryYearTo}, 9999) >= ${version.entryYearFrom}`,
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
    // قیدِ یکتاییِ جزئیِ فعلی پایگاه‌داده (`uq_curriculum_versions_published` از
    // مهاجرت ۰۱۳۷: رشته/مقطع/گرایش/نوع — **بدون** پنجرهٔ ورودی) با مدلِ
    // «یک چارت منتشرشده به ازای هر کوهورت» هم‌خوان نیست. حالا که رقیبِ
    // خارج از پنجرهٔ ورودی عمداً بایگانی نمی‌شود، ممکن است UPDATE با
    // «duplicate key» (SQLSTATE 23505) بخورد. به‌جای پیام خامِ پایگاه‌داده،
    // کاربر را به بایگانیِ آگاهانهٔ نسخهٔ قبلی هدایت می‌کنیم (هیچ داده‌ای
    // خودکار بایگانی نمی‌شود). رفع کاملِ این ناسازگاری نیاز به مهاجرت دارد و
    // خارج از دامنهٔ این تغییر است.
    const pgCode = err?.code ?? err?.cause?.code;
    if (pgCode === '23505') {
      return {
        ok: false,
        error: 'انتشار انجام نشد: برای همین رشته/مقطع/گرایش نسخهٔ منتشرشدهٔ دیگری وجود دارد و قید یکتایی پایگاه‌داده انتشار هم‌زمان را نمی‌پذیرد؛ ابتدا نسخهٔ منتشرشدهٔ قبلی را بایگانی کنید و سپس دوباره منتشر کنید.',
      };
    }
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
