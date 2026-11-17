'use server';

// ════════════════════════════════════════════════════════════════════════
//  حذف کاتالوگِ منتشرنشده (DRAFT / REVIEW / APPROVED).
//
//  چرا جدا از lifecycle.ts: «حذف» یک گذارِ وضعیت نیست، یک عملیاتِ
//  مخربِ برگشت‌ناپذیر است؛ جدا نگه‌داشتنش باعث می‌شود در بازبینی، مسیرِ
//  حذف داده مستقل از ماشین حالت دیده شود.
//
//  قواعد ایمنی (به ترتیب چک شدن):
//    ۱) فقط نقش‌های ویرایشگر (ADMIN / EDU_EXPERT)
//    ۲) فقط نسخه‌ای که هنوز منتشر نشده — DRAFT / REVIEW / APPROVED.
//       نسخهٔ PUBLISHED (در حال اجرا برای دانشجو) و ARCHIVED (سابقهٔ
//       تاریخی) هرگز حذف نمی‌شوند؛ مسیر درستشان «بایگانی» است.
//    ۳) اگر دانشجویی به این نسخه گره خورده باشد (student_course_grants)
//       حذف انجام نمی‌شود؛ پیام می‌دهد چند رکورد وابسته است.
//    ۴) حذف آبشاریِ صریح و در یک تراکنش: approvals → rules → courses →
//       نسخه. (هر سه FK بدون onDelete هستند، پس پاک‌سازی دستی الزامی است.)
//    ۵) ثبت رویداد در audit_logs + پاک‌سازی کش مسیرها.
// ════════════════════════════════════════════════════════════════════════

import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  course_rules,
  curriculum_approvals,
  curriculum_courses,
  curriculum_versions,
  majors,
  student_course_grants,
} from '@/db/schema';
import { appendAudit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { type CurriculumVersionStatus, canDeleteStatus } from '@/lib/curriculum-types';
import { type Act, EDITORS, PHASE, getVersionOrThrow, revalidateCurriculumPaths } from './shared';

export type DeleteVersionResult = Act<{
  message: string;
  data: { versionCode: string; title: string; courses: number; rules: number; approvals: number };
}>;

/** یک «انتقال/کپی» قابل لغو — نسخهٔ DRAFT که با کپی عمیق از نسخهٔ دیگر ساخته شده */
export interface UndoableTransfer {
  id: number;
  versionCode: string;
  title: string;
  majorName: string;
  /** متن رویداد کپی: «کپی از نسخهٔ 1402 (PUBLISHED)» */
  sourceNote: string | null;
  createdAt: string | null;
  courseCount: number;
}

export type UndoableTransfersResult =
  | { ok: true; data: UndoableTransfer[] }
  | { ok: false; error: string };

/**
 * فهرست «انتقال‌های اخیر» برای دکمهٔ «لغو انتقال» در تب انتقال کاتالوگ.
 *
 * معیارِ تشخیص: نسخه‌ای که وضعیتش DRAFT است و در `curriculum_approvals` یک
 * رویداد `CREATE_REVISION` با متنِ «کپی از نسخهٔ …» دارد. این متن را خودِ
 * `createCurriculumVersionAction` هنگام کپی عمیق می‌نویسد (مسیر «انتقال
 * کاتالوگ» و «کپی عمیق از نسخهٔ دیگر»). نسخه‌های R+1 متنِ «ویرایش از
 * نسخهٔ …» دارند و عمداً در این فهرست نمی‌آیند، چون حذفشان معادلِ از دست
 * دادنِ بازنگریِ یک نسخهٔ منتشرشده است.
 *
 * فقط DRAFTها برمی‌گردند: چیزی که یک‌بار تأیید/منتشر شده «لغو انتقال»
 * نمی‌شود، بایگانی می‌شود.
 */
export async function listUndoableTransfersAction(): Promise<UndoableTransfersResult> {
  await requireRole(EDITORS);
  try {
    // 🔒 هم‌دامنه‌سازی: فهرست «انتقال‌های اخیر» فقط نسخه‌های دانشگاه فعال را
    // نشان می‌دهد. پیش‌تر DRAFTهای همهٔ دانشگاه‌ها برمی‌گشتند و دکمهٔ «لغو
    // انتقال» می‌توانست نسخهٔ دانشگاه دیگر را هدف بگیرد. فرعِ NULL عمداً
    // وجود ندارد: دانشگاهِ نامشخص = هیچ ردیفی (fail-closed، نه fail-open).
    const { getCurrentUniversity, isRealUniversityId } = await import('@/lib/university-scope');
    const actingUniId = (await getCurrentUniversity().catch(() => null))?.id ?? null;
    if (!isRealUniversityId(actingUniId)) {
      return { ok: false, error: 'دانشگاه فعال مشخص نیست.' };
    }

    const rows = await db
      .select({
        id: curriculum_versions.id,
        versionCode: curriculum_versions.versionCode,
        title: curriculum_versions.title,
        majorName: majors.name,
        createdAt: curriculum_versions.createdAt,
        sourceNote: sql<string | null>`(
          select ca."decisionNote" from curriculum_approvals ca
          where ca."curriculumVersionId" = ${curriculum_versions.id}
            and ca."approvalType" = 'CREATE_REVISION'
          order by ca.id limit 1
        )`,
        courseCount: sql<number>`(
          select count(*)::int from curriculum_courses cc
          where cc."curriculumVersionId" = ${curriculum_versions.id}
        )`,
      })
      .from(curriculum_versions)
      .innerJoin(majors, eq(majors.id, curriculum_versions.majorId))
      .where(and(
        eq(curriculum_versions.universityId, actingUniId),
        eq(curriculum_versions.status, 'DRAFT'),
        sql`exists (
          select 1 from curriculum_approvals ca2
          where ca2."curriculumVersionId" = ${curriculum_versions.id}
            and ca2."approvalType" = 'CREATE_REVISION'
            and ca2."decisionNote" like 'کپی از نسخهٔ%'
        )`,
      ))
      .orderBy(desc(curriculum_versions.id))
      .limit(25);

    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        versionCode: r.versionCode,
        title: r.title,
        majorName: r.majorName,
        sourceNote: r.sourceNote,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
        courseCount: Number(r.courseCount ?? 0),
      })),
    };
  } catch (err: any) {
    console.error('listUndoableTransfersAction:', err);
    return { ok: false, error: err?.message || 'خطا در خواندن فهرست انتقال‌ها' };
  }
}

/**
 * حذف کاملِ یک کاتالوگِ پیش‌نویس (DRAFT) با همهٔ داده‌های وابسته.
 *
 * @param versionId شناسهٔ نسخه در curriculum_versions
 */
export async function deleteCurriculumVersionAction(versionId: number): Promise<DeleteVersionResult> {
  const user = await requireRole(EDITORS);
  try {
    if (!Number.isInteger(versionId) || versionId <= 0) {
      return { ok: false, error: 'شناسهٔ نسخهٔ برنامهٔ درسی نامعتبر است.' };
    }

    const version = await getVersionOrThrow(versionId);

    // ── گارد ۲: هر چیزی که هنوز منتشر نشده (DRAFT / REVIEW / APPROVED) ──
    if (!canDeleteStatus(version.status as CurriculumVersionStatus)) {
      return {
        ok: false,
        error: `نسخهٔ «${version.versionCode}» در وضعیت «${version.status}» است و حذف نمی‌شود. `
          + 'حذف فقط برای کاتالوگ‌هایی مجاز است که هنوز منتشر نشده‌اند (پیش‌نویس / در بازبینی / تأییدشده)؛ '
          + 'برای نسخهٔ منتشرشده یا بایگانی‌شده از «بایگانی» استفاده کنید.',
      };
    }

    // ── گارد ۳: وابستگی دانشجو (تخصیص درس ترم بالاتر به همین نسخه) ──
    const [grants] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(student_course_grants)
      .where(eq(student_course_grants.curriculumVersionId, versionId));
    if ((grants?.n ?? 0) > 0) {
      return {
        ok: false,
        error: `این نسخه به ${grants.n} تخصیصِ درسِ دانشجو گره خورده است؛ ابتدا آن تخصیص‌ها را بردارید. `
          + 'حذف در این حالت مجاز نیست تا سابقهٔ انتخاب واحد دانشجو ناقص نشود.',
      };
    }

    // شمارش برای پیام و سابقهٔ حسابرسی (قبل از حذف)
    const [counts] = await db
      .select({
        courses: sql<number>`(select count(*)::int from curriculum_courses cc where cc."curriculumVersionId" = ${versionId})`,
        rules: sql<number>`(select count(*)::int from course_rules cr where cr."syllabusId" = ${versionId})`,
        approvals: sql<number>`(select count(*)::int from curriculum_approvals ca where ca."curriculumVersionId" = ${versionId})`,
      })
      .from(curriculum_versions)
      .where(eq(curriculum_versions.id, versionId));

    const courses = counts?.courses ?? 0;
    const rules = counts?.rules ?? 0;
    const approvals = counts?.approvals ?? 0;

    await db.transaction(async (tx) => {
      // ترتیب مهم است: ارجاع دوریِ curriculum_versions.approvalId → curriculum_approvals.id
      // باید اول قطع شود، وگرنه حذفِ approvals با خطای FK شکست می‌خورد.
      await tx.update(curriculum_versions).set({ approvalId: null }).where(eq(curriculum_versions.id, versionId));
      await tx.delete(curriculum_approvals).where(eq(curriculum_approvals.curriculumVersionId, versionId));
      await tx.delete(course_rules).where(eq(course_rules.syllabusId, versionId));
      await tx.delete(curriculum_courses).where(eq(curriculum_courses.curriculumVersionId, versionId));
      await tx.delete(curriculum_versions).where(eq(curriculum_versions.id, versionId));

      await appendAudit(tx, {
        actorUserId: user.id,
        action: 'CURRICULUM_VERSION_DELETED',
        entityType: PHASE,
        entityId: versionId,
        details: JSON.stringify({
          versionCode: version.versionCode,
          title: version.title,
          status: version.status,
          majorId: version.majorId,
          entryYearFrom: version.entryYearFrom,
          courses,
          rules,
          approvals,
        }),
      });
    });

    revalidateCurriculumPaths();

    return {
      ok: true,
      message: `کاتالوگ «${version.versionCode}» حذف شد`
        + (courses > 0 ? ` (${courses} درس، ${rules} قاعدهٔ پیش‌نیاز)` : ' (خالی بود)') + '.',
      data: { versionCode: version.versionCode, title: version.title, courses, rules, approvals },
    };
  } catch (err: any) {
    console.error('deleteCurriculumVersionAction:', err);
    return { ok: false, error: err?.message || 'خطا در حذف کاتالوگ' };
  }
}
