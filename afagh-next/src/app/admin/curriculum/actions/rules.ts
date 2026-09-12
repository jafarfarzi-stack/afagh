'use server';

// ════════════════════════════════════════════════════════════════════════
//  قواعد درس (تصمیم D2): پیش‌نیاز/هم‌نیاز به‌صورت درخت منطقی در course_rules
//  و کف نمرهٔ اختصاصی درس در همان نسخه. فقط DRAFT.
// ════════════════════════════════════════════════════════════════════════

import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { course_rules, curriculum_courses } from '@/db/schema';
import { appendAudit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { normalizeLogicNode } from '@/lib/curriculum-types';
import { EDITORS, PHASE, assertEditable, revalidateCurriculumPaths, type Act } from './shared';

// ─────────────────────────── قواعد (پیش‌نیاز/هم‌نیاز/نمره) — D2 ───────────────────────────

export async function setCoursePrerequisiteAction(versionId: number, courseId: number, treeInput: unknown) {
  await requireRole(EDITORS);
  try {
    await assertEditable(versionId);
    const inVersion = await db.select().from(curriculum_courses)
      .where(and(eq(curriculum_courses.curriculumVersionId, versionId), eq(curriculum_courses.courseId, courseId))).limit(1);
    if (inVersion.length === 0) return { ok: false, error: 'ابتدا درس را به نسخه اضافه کنید.' };

    if (treeInput == null) {
      await db.delete(course_rules).where(and(eq(course_rules.syllabusId, versionId), eq(course_rules.courseId, courseId), eq(course_rules.ruleType, 'PREREQ')));
    } else {
      const tree = normalizeLogicNode(treeInput); // fail-fast در ساختار نادرست
      const existing = await db.select().from(course_rules)
        .where(and(eq(course_rules.syllabusId, versionId), eq(course_rules.courseId, courseId), eq(course_rules.ruleType, 'PREREQ'))).limit(1);
      const payload = { courseId, syllabusId: versionId, ruleType: 'PREREQ', logicTree: JSON.stringify(tree) };
      if (existing.length > 0) {
        await db.update(course_rules).set(payload).where(eq(course_rules.id, existing[0].id));
      } else {
        await db.insert(course_rules).values(payload);
      }
    }
    await db.transaction(async (tx) => {
      await appendAudit(tx, {
        actorUserId: (await requireRole(EDITORS)).id,
        action: 'CURRICULUM_PREREQ_SET', entityType: PHASE, entityId: versionId,
        details: JSON.stringify({ courseId, cleared: treeInput == null }),
      });
    });
    revalidateCurriculumPaths();
    return { ok: true, message: treeInput == null ? 'پیش‌نیاز حذف شد.' : 'پیش‌نیاز ثبت شد.' };
  } catch (err: any) {
    console.error('setCoursePrerequisiteAction:', err);
    return { ok: false, error: err.message || 'خطا در ثبت پیش‌نیاز' };
  }
}


export async function setCourseCorequisiteAction(versionId: number, courseId: number, treeInput: unknown) {
  await requireRole(EDITORS);
  try {
    await assertEditable(versionId);
    const inVersion = await db.select().from(curriculum_courses)
      .where(and(eq(curriculum_courses.curriculumVersionId, versionId), eq(curriculum_courses.courseId, courseId))).limit(1);
    if (inVersion.length === 0) return { ok: false, error: 'ابتدا درس را به نسخه اضافه کنید.' };

    if (treeInput == null) {
      await db.delete(course_rules).where(and(eq(course_rules.syllabusId, versionId), eq(course_rules.courseId, courseId), eq(course_rules.ruleType, 'COREQ')));
    } else {
      const tree = normalizeLogicNode(treeInput);
      const existing = await db.select().from(course_rules)
        .where(and(eq(course_rules.syllabusId, versionId), eq(course_rules.courseId, courseId), eq(course_rules.ruleType, 'COREQ'))).limit(1);
      const payload = { courseId, syllabusId: versionId, ruleType: 'COREQ', logicTree: JSON.stringify(tree) };
      if (existing.length > 0) {
        await db.update(course_rules).set(payload).where(eq(course_rules.id, existing[0].id));
      } else {
        await db.insert(course_rules).values(payload);
      }
    }
    await db.transaction(async (tx) => {
      await appendAudit(tx, {
        actorUserId: (await requireRole(EDITORS)).id,
        action: 'CURRICULUM_COREQ_SET', entityType: PHASE, entityId: versionId,
        details: JSON.stringify({ courseId, cleared: treeInput == null }),
      });
    });
    revalidateCurriculumPaths();
    return { ok: true, message: treeInput == null ? 'هم‌نیاز حذف شد.' : 'هم‌نیاز ثبت شد.' };
  } catch (err: any) {
    console.error('setCourseCorequisiteAction:', err);
    return { ok: false, error: err.message || 'خطا در ثبت هم‌نیاز' };
  }
}


export async function setCoursePassingGradeAction(versionId: number, courseId: number, minGrade: number | null) {
  await requireRole(EDITORS);
  try {
    await assertEditable(versionId);
    if (minGrade != null && (minGrade < 0 || minGrade > 20)) {
      return { ok: false, error: 'کف نمره باید بین ۰ تا ۲۰ باشد.' };
    }
    await db.update(curriculum_courses).set({ minGrade: minGrade != null ? String(minGrade) : null })
      .where(and(eq(curriculum_courses.curriculumVersionId, versionId), eq(curriculum_courses.courseId, courseId)));
    revalidateCurriculumPaths();
    return { ok: true, message: 'کف نمرهٔ درس ثبت شد.' };
  } catch (err: any) {
    console.error('setCoursePassingGradeAction:', err);
    return { ok: false, error: err.message || 'خطا در ثبت کف نمره' };
  }
}

/**
 * کد وضع نمرهٔ سما (میز تطبیق GRADE_STATUS) برای قبولی/مردودیِ همین تخصیص
 * درس در همین نسخهٔ کاتالوگ. چون یک درس می‌تواند در یک کاتالوگ عادی و در
 * کاتالوگ دیگر جبرانی باشد، این مقدار سراسری نیست — روی خودِ ردیف
 * curriculum_courses ذخیره می‌شود. null = پیش‌فرض سیستم (کد ۱ قبولی / ۲ مردودی).
 */
export async function setCourseGradeStatusCodesAction(
  versionId: number,
  courseId: number,
  passGradeStatusCode: string | null,
  failGradeStatusCode: string | null,
): Promise<Act<{ message: string }>> {
  await requireRole(EDITORS);
  try {
    await assertEditable(versionId);
    await db.update(curriculum_courses).set({
      passGradeStatusCode: passGradeStatusCode || null,
      failGradeStatusCode: failGradeStatusCode || null,
    }).where(and(eq(curriculum_courses.curriculumVersionId, versionId), eq(curriculum_courses.courseId, courseId)));
    revalidateCurriculumPaths();
    return { ok: true, message: 'کد وضع نمرهٔ قبولی/مردودی این درس ثبت شد.' };
  } catch (err: any) {
    console.error('setCourseGradeStatusCodesAction:', err);
    return { ok: false, error: err.message || 'خطا در ثبت کد وضع نمره' };
  }
}


// ─────────────────────────── اعتبارسنجی و چرخهٔ حیات ───────────────────────────
