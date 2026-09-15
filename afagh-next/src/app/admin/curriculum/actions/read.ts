'use server';

// ════════════════════════════════════════════════════════════════════════
//  خواندن‌های پنل برنامهٔ درسی — نمای کلی (رشته/نسخه/گرایش)، جزئیات نسخه +
//  یافته‌های اعتبارسنجی، بانک دروس و فهرست گروه‌ها.
//  همه فقط‌خواندنی‌اند و گاردشان requireRole(EDITORS) است.
// ════════════════════════════════════════════════════════════════════════

import { asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { courses, curriculum_approvals, curriculum_courses, curriculum_tracks, curriculum_versions, degree_level_configs, departments, majors } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { validateCurriculumCore } from '@/lib/curriculum-validator';
import { type CourseBankResult, type CurriculumOverviewResult, type CurriculumVersionDetailResult, type DepartmentListResult, EDITORS, buildCheckInput, loadVersionData } from './shared';

export async function getCurriculumOverviewAction(): Promise<CurriculumOverviewResult> {
  await requireRole(EDITORS);
  try {
    const [majorRows, versionRows, trackRows] = await Promise.all([
      db.select({
        id: majors.id, code: majors.majorCode, name: majors.name,
        degreeLevelId: majors.degreeLevelId, degreeTitle: degree_level_configs.title,
        degreeCode: degree_level_configs.code,
        degreeTermCount: degree_level_configs.termCount,
        degreeIsGraduate: degree_level_configs.isGraduate,
      }).from(majors)
        .leftJoin(degree_level_configs, eq(degree_level_configs.id, majors.degreeLevelId))
        .orderBy(asc(majors.name)),
      db.select({
        id: curriculum_versions.id,
        majorId: curriculum_versions.majorId,
        degreeLevelId: curriculum_versions.degreeLevelId,
        trackId: curriculum_versions.trackId,
        versionCode: curriculum_versions.versionCode,
        title: curriculum_versions.title,
        status: curriculum_versions.status,
        entryYearFrom: curriculum_versions.entryYearFrom,
        entryYearTo: curriculum_versions.entryYearTo,
        totalRequiredUnits: curriculum_versions.totalRequiredUnits,
        courseCount: sql<number>`(select count(*) from ${curriculum_courses} where ${curriculum_courses.curriculumVersionId} = ${curriculum_versions.id})`,
      }).from(curriculum_versions).orderBy(desc(curriculum_versions.id)),
      db.select().from(curriculum_tracks).orderBy(asc(curriculum_tracks.title)),
    ]);
    return { ok: true, data: { majors: majorRows, versions: versionRows, tracks: trackRows } };
  } catch (err: any) {
    console.error('getCurriculumOverviewAction:', err);
    return { ok: false, error: 'خطا در بارگیری نمای کلی برنامهٔ درسی' };
  }
}

/** بانک دروس دانشگاه — برای افزودن درس به نسخهٔ DRAFT (Thin Client فاز ۷) */


export async function listCourseBankAction(): Promise<CourseBankResult> {
  await requireRole(EDITORS);
  try {
    const rows = await db
      .select({ id: courses.id, code: courses.code, title: courses.title, units: courses.units, courseType: courses.courseType })
      .from(courses)
      .orderBy(asc(courses.code));
    return {
      ok: true,
      data: rows.map((r) => ({ id: r.id, code: r.code, title: r.title, units: String(r.units), courseType: r.courseType ?? '—' })),
    };
  } catch (err: any) {
    console.error('listCourseBankAction:', err);
    return { ok: false, error: 'خطا در بارگیری بانک دروس' };
  }
}

/** فهرست گروه‌های آموزشی — برای فرم «تعریف درس جدید در بانک» (معادل فیلد «گروه آموزشی» سامانهٔ قدیم) */


export async function listDepartmentsAction(): Promise<DepartmentListResult> {
  await requireRole(EDITORS);
  try {
    const rows = await db
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .orderBy(asc(departments.name));
    return { ok: true, data: rows };
  } catch (err: any) {
    console.error('listDepartmentsAction:', err);
    return { ok: false, error: 'خطا در بارگیری گروه‌های آموزشی' };
  }
}


export async function getCurriculumVersionDetailAction(versionId: number): Promise<CurriculumVersionDetailResult> {
  await requireRole(EDITORS);
  try {
    const data = await loadVersionData(versionId);
    const approvals = await db
      .select({ id: curriculum_approvals.id, approvalType: curriculum_approvals.approvalType, fromStatus: curriculum_approvals.fromStatus, toStatus: curriculum_approvals.toStatus, decisionNote: curriculum_approvals.decisionNote, approvedAt: curriculum_approvals.approvedAt })
      .from(curriculum_approvals)
      .where(eq(curriculum_approvals.curriculumVersionId, versionId))
      .orderBy(desc(curriculum_approvals.approvedAt));
    return {
      ok: true,
      data: {
        version: data.version,
        courses: data.courses,
        rules: data.rules,
        approvals,
        checks: validateCurriculumCore(await buildCheckInput(data)),
      },
    };
  } catch (err: any) {
    console.error('getCurriculumVersionDetailAction:', err);
    return { ok: false, error: err.message || 'خطا در بارگیری جزئیات نسخه' };
  }
}

// ─────────────────────────── ساخت و ویرایش (فقط DRAFT) ───────────────────────────
