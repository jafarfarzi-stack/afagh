'use server';

// ════════════════════════════════════════════════════════════════════════
// فاز ۳ — Server Actions برنامهٔ درسی (Curriculum)
// ────────────────────────────────────────────────────────────────────────
// تصمیم D3: الگوی استاندارد ماژول‌ها «Server Actions» است — هر اکشن:
//   ① requireRole مستقیم (گارد CI: audit-actions.mjs)
//   ② تراکنش اتمی + appendAudit (زنجیرهٔ حسابرسی) در همان تراکنش
//   ③ assertTransition از State Machine فاز ۱ (گذار غیرمجاز = خطای صریح)
//   ④ فقط DRAFT قابل ویرایش (نسخهٔ تأییدشده هرگز Mutable نیست)
//
// خطاها: هرگز throw خام به Client نمی‌رود؛ { ok:false, error } فارسی.
// ════════════════════════════════════════════════════════════════════════

import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import {
  course_offerings, course_rules, courses, curriculum_approvals, curriculum_courses,
  curriculum_tracks, curriculum_versions, degree_level_configs, enrollments, majors,
  staff,
} from '@/db/schema';
import { requireRole, type SessionUser } from '@/lib/auth';
import { appendAudit } from '@/lib/audit';
import {
  assertTransition, canEditStatus, nextRevisionCode, normalizeLogicNode,
  type CheckResult, type CurriculumVersionStatus, type LogicNode,
} from '@/lib/curriculum-types';
import { validateCurriculumCore, hasBlockingErrors } from '@/lib/curriculum-validator';

/**
 * نتیجهٔ استاندارد اکشن (الگوی فاز ۳+).
 * TypeScript 5.9 literal-type در return inference اکشن‌ها را به boolean
 * گسترش می‌دهد؛ این annotation صریح، narrowing «ok» را در Client تضمین می‌کند.
 */
export type Act<T extends object = { message: string }> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const EDITORS = ['ADMIN', 'EDU_EXPERT'];
const APPROVERS = ['ADMIN', 'EDU_EXPERT'];
const PHASE = 'curriculum';

// ─────────────────────────── helpers (غیر export — گارد CI) ───────────────────────────

async function getVersionOrThrow(versionId: number) {
  const [v] = await db.select().from(curriculum_versions).where(eq(curriculum_versions.id, versionId)).limit(1);
  if (!v) throw new Error('نسخهٔ برنامهٔ درسی یافت نشد.');
  return v;
}

/** قاعدهٔ طلایی: ویرایش فقط در DRAFT؛ هر گذار با assertTransition قفل شده */
async function assertEditable(versionId: number) {
  const v = await getVersionOrThrow(versionId);
  if (!canEditStatus(v.status as CurriculumVersionStatus)) {
    throw new Error(`ویرایش نسخه در وضعیت «${v.status}» مجاز نیست؛ ابتدا نسخه را به DRAFT برگردانید (فقط قبل از تأیید) یا نسخهٔ جدید (R1) بسازید.`);
  }
  return v;
}

/** برای ثبت رویداد تأیید، حساب کاربر باید به پروندهٔ کارکنان متصل باشد */
async function requireActorStaff(user: SessionUser): Promise<number> {
  const [st] = await db.select({ id: staff.id }).from(staff).where(eq(staff.userId, user.id)).limit(1);
  if (!st) {
    throw new Error('حساب شما به پروندهٔ کارکنان (staff) متصل نیست؛ برای تأیید/انتشار برنامهٔ درسی این اتصال الزامی است.');
  }
  return st.id;
}

async function assertUniqueVersionCode(majorId: number, degreeLevelId: number, trackId: number | null, versionCode: string, excludeId?: number) {
  const dup = await db
    .select({ id: curriculum_versions.id })
    .from(curriculum_versions)
    .where(
      and(
        eq(curriculum_versions.majorId, majorId),
        eq(curriculum_versions.degreeLevelId, degreeLevelId),
        sql`coalesce(${curriculum_versions.trackId}, 0) = ${trackId ?? 0}`,
        eq(curriculum_versions.versionCode, versionCode),
        excludeId ? sql`${curriculum_versions.id} <> ${excludeId}` : undefined
      )
    )
    .limit(1);
  if (dup.length > 0) {
    throw new Error(`نسخهٔ «${versionCode}» برای این رشته/مقطع/گرایش از قبل ثبت شده است. (کد نسخه باید یکتا باشد)`);
  }
}

/** بارگیری کامل دادهٔ یک نسخه + دروس + قواعد + بانک کدها — برای اعتبارسنجی */
async function loadVersionData(versionId: number) {
  const version = await getVersionOrThrow(versionId);
  const rows = await db
    .select({
      courseId: curriculum_courses.courseId,
      code: courses.code,
      title: courses.title,
      clusterId: courses.clusterId,                            // خوشهٔ هم‌ارزی — چک ۱۰
      units: courses.units,                                    // واحد بانک (numeric → number)
      versionUnits: curriculum_courses.units,                  // override نسخه
      roleType: curriculum_courses.roleType,
      isRequired: curriculum_courses.isRequired,
      isElective: curriculum_courses.isElective,
      isGraduationRequired: curriculum_courses.isGraduationRequired,
      recommendedSemester: curriculum_courses.recommendedSemester,
      autoCorequisiteAllowed: curriculum_courses.autoCorequisiteAllowed,
    })
    .from(curriculum_courses)
    .innerJoin(courses, eq(courses.id, curriculum_courses.courseId))
    .where(eq(curriculum_courses.curriculumVersionId, versionId))
    .orderBy(asc(curriculum_courses.recommendedSemester));
  const rulesRows = await db
    .select()
    .from(course_rules)
    .where(eq(course_rules.syllabusId, versionId));
  const bankCodes = await db.select({ code: courses.code }).from(courses);

  return {
    version,
    courses: rows.map((r) => ({
      courseId: r.courseId,
      code: r.code,
      title: r.title,
      clusterId: r.clusterId,
      units: Number(r.versionUnits ?? r.units ?? 0),
      roleType: r.roleType,
      isRequired: r.isRequired ?? 1,
      isElective: r.isElective ?? 0,
      isGraduationRequired: r.isGraduationRequired ?? 0,
      recommendedSemester: r.recommendedSemester,
      autoCorequisiteAllowed: r.autoCorequisiteAllowed ?? 0,
    })),
    rules: rulesRows.map((r) => {
      let tree: LogicNode;
      try { tree = normalizeLogicNode(JSON.parse(r.logicTree)); }
      catch { tree = { operator: 'AND', conditions: [] }; }
      return { courseId: r.courseId, ruleType: r.ruleType, logicTree: tree };
    }),
    existingCodes: new Set(bankCodes.map((c) => c.code)),
  };
}

/** حداقل مقرر از هر نقش در یک برنامهٔ درسی (قابل گسترش بعدی از تنظیمات) */
const DEFAULT_MIN_ROLES: Record<string, number> = { GENERAL: 1, CORE: 1, MAJOR: 1 };

/**
 * تکمیل ورودی خالص Validator از دادهٔ بارگیری‌شده:
 * سقف واحد ترم: override نسخه → مقطع → ۲۰ (پیش‌فرض سیستم)؛
 * برای مقاطع ارشد/دکتری وجود پایان‌نامه نیز الزامی‌شده (چک ۸).
 */
async function buildCheckInput(data: Awaited<ReturnType<typeof loadVersionData>>) {
  let maxUnitsPerTerm: number | null = data.version.maxUnitsPerTerm;
  let minRoleCounts: Partial<Record<string, number>> = { ...DEFAULT_MIN_ROLES };
  const [deg] = await db
    .select({ code: degree_level_configs.code, title: degree_level_configs.title, maxUnitsPerTerm: degree_level_configs.maxUnitsPerTerm })
    .from(degree_level_configs)
    .where(eq(degree_level_configs.id, data.version.degreeLevelId))
    .limit(1);
  if (maxUnitsPerTerm == null) maxUnitsPerTerm = deg?.maxUnitsPerTerm ?? 20;
  if (deg && (deg.code?.includes('MASTER') || deg.code?.includes('PHD') || deg.title?.includes('ارشد') || deg.title?.includes('دکتری'))) {
    minRoleCounts = { ...minRoleCounts, THESIS: 1 };
  }
  return {
    totalRequiredUnits: Number(data.version.totalRequiredUnits ?? 0),
    maxUnitsPerTerm,
    trackId: data.version.trackId,
    versionCode: data.version.versionCode,
    courses: data.courses,
    rules: data.rules,
    existingCodes: data.existingCodes,
    minRoleCounts,
  };
}

async function runChecks(versionId: number): Promise<CheckResult[]> {
  const data = await loadVersionData(versionId);
  return validateCurriculumCore(await buildCheckInput(data));
}

/** کپی عمیق دروس و قواعد از یک نسخه به نسخهٔ جدید (برای clone / revision) */
async function deepCopyCourseData(tx: any, fromVersionId: number, toVersionId: number) {
  const srcCourses = await tx
    .select()
    .from(curriculum_courses)
    .where(eq(curriculum_courses.curriculumVersionId, fromVersionId));
  for (const c of srcCourses) {
    await tx.insert(curriculum_courses).values({
      curriculumVersionId: toVersionId,
      courseId: c.courseId,
      roleType: c.roleType,
      units: c.units,
      theoryUnits: c.theoryUnits,
      practicalUnits: c.practicalUnits,
      isRequired: c.isRequired,
      isElective: c.isElective,
      isGraduationRequired: c.isGraduationRequired,
      recommendedSemester: c.recommendedSemester,
      minGrade: c.minGrade,
      autoCorequisiteAllowed: c.autoCorequisiteAllowed,
    });
  }
  const srcRules = await tx
    .select()
    .from(course_rules)
    .where(eq(course_rules.syllabusId, fromVersionId));
  for (const r of srcRules) {
    await tx.insert(course_rules).values({
      courseId: r.courseId,
      syllabusId: toVersionId,
      ruleType: r.ruleType,
      logicTree: r.logicTree,
      customPassingGrade: r.customPassingGrade,
    });
  }
}

function revalidateCurriculumPaths() {
  revalidatePath('/admin/curriculum');
  revalidatePath('/admin/scheduling');
  revalidatePath('/student/enroll');
  revalidatePath('/admin/graduation');
}

// ─────────────────────────── خواندن (برای Thin Client فاز ۷) ───────────────────────────

export interface CurriculumOverviewData {
  majors: { id: number; code: string | null; name: string; degreeLevelId: number; degreeTitle: string | null }[];
  versions: {
    id: number; majorId: number; degreeLevelId: number; trackId: number | null;
    versionCode: string; title: string; status: string;
    entryYearFrom: number; entryYearTo: number | null;
    totalRequiredUnits: string; courseCount: number;
  }[];
  tracks: { id: number; code: string | null; title: string; majorId: number }[];
}
export type CurriculumOverviewResult =
  | { ok: true; data: CurriculumOverviewData }
  | { ok: false; error: string };

export type CurriculumVersionDetailData = {
  version: Awaited<ReturnType<typeof getVersionOrThrow>>;
  courses: Awaited<ReturnType<typeof loadVersionData>>['courses'];
  rules: Awaited<ReturnType<typeof loadVersionData>>['rules'];
  approvals: {
    id: number; approvalType: string | null; fromStatus: string | null; toStatus: string | null;
    decisionNote: string | null; approvedAt: Date | null;
  }[];
  checks: CheckResult[];
};
export type CurriculumVersionDetailResult =
  | { ok: true; data: CurriculumVersionDetailData }
  | { ok: false; error: string };

export async function getCurriculumOverviewAction(): Promise<CurriculumOverviewResult> {
  await requireRole(EDITORS);
  try {
    const [majorRows, versionRows, trackRows] = await Promise.all([
      db.select({
        id: majors.id, code: majors.majorCode, name: majors.name,
        degreeLevelId: majors.degreeLevelId, degreeTitle: degree_level_configs.title,
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
export type CourseBankResult =
  | { ok: true; data: { id: number; code: string; title: string; units: string; courseType: string }[] }
  | { ok: false; error: string };

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

export interface CreateVersionInput {
  majorId: number;
  degreeLevelId?: number;
  trackId?: number | null;
  versionCode: string;
  title?: string;
  entryYearFrom: number;
  entryYearTo?: number | null;
  totalRequiredUnits?: number;
  maxUnitsPerTerm?: number | null;
  cloneFromId?: number; // کپی عمیق (دروس + قواعد) از نسخهٔ مرجع
}

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

export interface AddCourseInput {
  courseId: number;
  roleType?: string;
  recommendedSemester?: number | null;
  isRequired?: number; isElective?: number; isGraduationRequired?: number;
  minGrade?: number | null;
  autoCorequisiteAllowed?: number;
}

export async function addCourseToCurriculumAction(versionId: number, item: AddCourseInput): Promise<Act<{ message: string }>> {
  await requireRole(EDITORS);
  try {
    await assertEditable(versionId);
    const [courseRow] = await db.select().from(courses).where(eq(courses.id, item.courseId)).limit(1);
    if (!courseRow) return { ok: false, error: 'درس انتخابی در بانک دروس یافت نشد.' };
    const dup = await db.select({ id: curriculum_courses.id }).from(curriculum_courses)
      .where(and(eq(curriculum_courses.curriculumVersionId, versionId), eq(curriculum_courses.courseId, item.courseId))).limit(1);
    if (dup.length > 0) return { ok: false, error: 'این درس از قبل در نسخه وجود دارد.' };

    await db.insert(curriculum_courses).values({
      curriculumVersionId: versionId,
      courseId: item.courseId,
      roleType: item.roleType ?? 'CORE',
      recommendedSemester: item.recommendedSemester ?? null,
      isRequired: item.isRequired ?? 1,
      isElective: item.isElective ?? 0,
      isGraduationRequired: item.isGraduationRequired ?? 0,
      minGrade: item.minGrade != null ? String(item.minGrade) : null,
      autoCorequisiteAllowed: item.autoCorequisiteAllowed ?? 0,
    });
    await db.transaction(async (tx) => {
      await appendAudit(tx, {
        actorUserId: (await requireRole(EDITORS)).id,
        action: 'CURRICULUM_COURSE_ADDED', entityType: PHASE, entityId: versionId,
        details: JSON.stringify({ courseId: item.courseId, code: courseRow.code }),
      });
    });
    revalidateCurriculumPaths();
    return { ok: true, message: `درس «${courseRow.title}» به نسخه افزوده شد.` };
  } catch (err: any) {
    console.error('addCourseToCurriculumAction:', err);
    return { ok: false, error: err.message || 'خطا در افزودن درس' };
  }
}

export async function bulkAddCoursesAction(versionId: number, items: AddCourseInput[]) {
  await requireRole(EDITORS);
  try {
    await assertEditable(versionId);
    let added = 0; const skipped: number[] = [];
    for (const it of items) {
      const dup = await db.select({ id: curriculum_courses.id }).from(curriculum_courses)
        .where(and(eq(curriculum_courses.curriculumVersionId, versionId), eq(curriculum_courses.courseId, it.courseId))).limit(1);
      if (dup.length > 0) { skipped.push(it.courseId); continue; }
      await db.insert(curriculum_courses).values({
        curriculumVersionId: versionId,
        courseId: it.courseId,
        roleType: it.roleType ?? 'CORE',
        recommendedSemester: it.recommendedSemester ?? null,
        isRequired: it.isRequired ?? 1,
        isElective: it.isElective ?? 0,
        isGraduationRequired: it.isGraduationRequired ?? 0,
        minGrade: it.minGrade != null ? String(it.minGrade) : null,
        autoCorequisiteAllowed: it.autoCorequisiteAllowed ?? 0,
      });
      added++;
    }
    await db.transaction(async (tx) => {
      await appendAudit(tx, {
        actorUserId: (await requireRole(EDITORS)).id,
        action: 'CURRICULUM_COURSES_BULK_ADDED', entityType: PHASE, entityId: versionId,
        details: JSON.stringify({ added, skipped }),
      });
    });
    revalidateCurriculumPaths();
    return { ok: true, message: `${added} درس افزوده شد.`, data: { added, skipped } };
  } catch (err: any) {
    console.error('bulkAddCoursesAction:', err);
    return { ok: false, error: err.message || 'خطا در افزودن گروهی دروس' };
  }
}

export async function removeCourseFromCurriculumAction(versionId: number, courseId: number): Promise<Act<{ message: string }>> {
  await requireRole(EDITORS);
  try {
    await assertEditable(versionId);
    const [courseRow] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
    if (!courseRow) return { ok: false, error: 'درس یافت نشد.' };

    // گارد وابستگی: اگر این درس در هر ارائهٔ ثبتنامشدهٔ فعال باشد، حذف مجاز نیست
    const dep = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
      .where(eq(course_offerings.courseId, courseId))
      .limit(5);
    if (dep.length > 0) {
      return { ok: false, error: 'این درس دارای ثبتنام فعال است و امکان حذف از نسخه وجود ندارد.' };
    }

    await db.transaction(async (tx) => {
      await tx.delete(curriculum_courses).where(and(
        eq(curriculum_courses.curriculumVersionId, versionId),
        eq(curriculum_courses.courseId, courseId),
      ));
      // قواعد وابسته به این درس در همین نسخه هم پاک می‌شوند
      await tx.delete(course_rules).where(and(
        eq(course_rules.syllabusId, versionId),
        eq(course_rules.courseId, courseId),
      ));
      await appendAudit(tx, {
        actorUserId: (await requireRole(EDITORS)).id,
        action: 'CURRICULUM_COURSE_REMOVED', entityType: PHASE, entityId: versionId,
        details: JSON.stringify({ courseId, code: courseRow.code }),
      });
    });
    revalidateCurriculumPaths();
    return { ok: true, message: `درس «${courseRow.title}» از نسخه حذف شد.` };
  } catch (err: any) {
    console.error('removeCourseFromCurriculumAction:', err);
    return { ok: false, error: err.message || 'خطا در حذف درس' };
  }
}

export async function updateCourseInCurriculumAction(
  versionId: number,
  courseId: number,
  patch: {
    roleType?: string; units?: number | null; theoryUnits?: number | null; practicalUnits?: number | null;
    isRequired?: number; isElective?: number; isGraduationRequired?: number;
    minGrade?: number | null; autoCorequisiteAllowed?: number;
  }
): Promise<Act<{ message: string }>> {
  await requireRole(EDITORS);
  try {
    await assertEditable(versionId);
    const existing = await db.select().from(curriculum_courses)
      .where(and(eq(curriculum_courses.curriculumVersionId, versionId), eq(curriculum_courses.courseId, courseId))).limit(1);
    if (existing.length === 0) return { ok: false, error: 'درس در این نسخه وجود ندارد.' };
    const row = existing[0];

    await db.update(curriculum_courses).set({
      roleType: patch.roleType ?? row.roleType,
      units: patch.units !== undefined ? (patch.units != null ? String(patch.units) : null) : row.units,
      theoryUnits: patch.theoryUnits !== undefined ? (patch.theoryUnits != null ? String(patch.theoryUnits) : null) : row.theoryUnits,
      practicalUnits: patch.practicalUnits !== undefined ? (patch.practicalUnits != null ? String(patch.practicalUnits) : null) : row.practicalUnits,
      isRequired: patch.isRequired ?? row.isRequired,
      isElective: patch.isElective ?? row.isElective,
      isGraduationRequired: patch.isGraduationRequired ?? row.isGraduationRequired,
      minGrade: patch.minGrade !== undefined ? (patch.minGrade != null ? String(patch.minGrade) : null) : row.minGrade,
      autoCorequisiteAllowed: patch.autoCorequisiteAllowed ?? row.autoCorequisiteAllowed,
    }).where(and(
      eq(curriculum_courses.curriculumVersionId, versionId),
      eq(curriculum_courses.courseId, courseId),
    ));
    await db.transaction(async (tx) => {
      await appendAudit(tx, {
        actorUserId: (await requireRole(EDITORS)).id,
        action: 'CURRICULUM_COURSE_UPDATED', entityType: PHASE, entityId: versionId,
        details: JSON.stringify({ courseId, patch }),
      });
    });
    revalidateCurriculumPaths();
    return { ok: true, message: 'مشخصات درس بهروزرسانی شد.' };
  } catch (err: any) {
    console.error('updateCourseInCurriculumAction:', err);
    return { ok: false, error: err.message || 'خطا در بهروزرسانی درس' };
  }
}

export async function assignCourseToSemesterAction(versionId: number, courseId: number, semesterNo: number | null): Promise<Act<{ message: string }>> {
  await requireRole(EDITORS);
  try {
    await assertEditable(versionId);
    if (semesterNo != null && (semesterNo < 1 || semesterNo > 8)) {
      return { ok: false, error: 'شماره ترم باید بین ۱ تا ۸ باشد (۰/خالی = نامشخص).' };
    }
    await db.update(curriculum_courses).set({ recommendedSemester: semesterNo })
      .where(and(eq(curriculum_courses.curriculumVersionId, versionId), eq(curriculum_courses.courseId, courseId)));
    revalidateCurriculumPaths();
    return { ok: true, message: semesterNo ? `درس به ترم ${semesterNo} تخصیص یافت.` : 'ترم درس آزاد شد.' };
  } catch (err: any) {
    console.error('assignCourseToSemesterAction:', err);
    return { ok: false, error: err.message || 'خطا در تخصیص ترم' };
  }
}

export async function bulkAssignSemestersAction(versionId: number, assignments: { courseId: number; semesterNo: number | null }[]) {
  await requireRole(EDITORS);
  try {
    await assertEditable(versionId);
    for (const a of assignments) {
      if (a.semesterNo != null && (a.semesterNo < 1 || a.semesterNo > 8)) {
        return { ok: false, error: `ترم نامعتبر برای درس ${a.courseId}: باید بین ۱ تا ۸ باشد.` };
      }
      await db.update(curriculum_courses).set({ recommendedSemester: a.semesterNo })
        .where(and(eq(curriculum_courses.curriculumVersionId, versionId), eq(curriculum_courses.courseId, a.courseId)));
    }
    revalidateCurriculumPaths();
    return { ok: true, message: `${assignments.length} تخصیص ترمی ثبت شد.` };
  } catch (err: any) {
    console.error('bulkAssignSemestersAction:', err);
    return { ok: false, error: err.message || 'خطا در تخصیص گروهی ترم' };
  }
}

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

export type SubmitForApprovalResult =
  | { ok: true; message: string; data: { checks: CheckResult[] } }
  | { ok: false; error: string; checks?: CheckResult[] };

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
