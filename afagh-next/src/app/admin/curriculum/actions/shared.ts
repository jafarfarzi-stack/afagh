// ════════════════════════════════════════════════════════════════════════
//  لایهٔ مشترک اکشن‌های برنامهٔ درسی — تایپ‌های نتیجه، فهرست نقش‌ها و
//  helperهای DB‌دار (بارگذاری نسخه + گاردِ دانشگاهی/چندمؤسسه‌ای، گارد DRAFT،
//  یکتایی کد نسخه، ورودی موتور اعتبارسنجی، کپی عمیق، revalidate).
//  «use server» ندارد: عمداً این‌جا هیچ اکشنی export نمی‌شود تا فایل‌های
//  اکشن فقط «تابع async» export کنند (قانون Next) و ممیز CI (audit-actions)
//  هم هر اکشن را با گارد مستقیم خودش ببیند.
//  (پیش از این همه در یک فایل ۱۱۸۰ سطری بود؛ این دور جدا شد — متن بدنه عیناً منتقل شده.)
// ════════════════════════════════════════════════════════════════════════

import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { course_rules, courses, curriculum_courses, curriculum_versions, degree_level_configs, majors, staff } from '@/db/schema';
import { type SessionUser } from '@/lib/auth';
import { CheckResult, CurriculumVersionStatus, assertTransition, canDeleteStatus, canEditStatus, collectCourseCodes } from '@/lib/curriculum-types';
import { defaultMinRoles, parseRoleUnitTargets, validateCurriculumCore } from '@/lib/curriculum-validator';
import { buildRulesWithCatalogFallback } from '@/lib/curriculum-rules';

export type Act<T extends object = { message: string }> =
  | ({ ok: true } & T)
  | { ok: false; error: string };


export const EDITORS = ['ADMIN', 'EDU_EXPERT'];


export const APPROVERS = ['ADMIN', 'EDU_EXPERT'];


export const PHASE = 'curriculum';

// ─────────────────────────── helpers (غیر export — گارد CI) ───────────────────────────


// ─────────────────────────── گاردِ چندمؤسسه‌ای (تنها درِ ورود) ───────────────────────────
//
// چرا این‌جاست: شناسهٔ نسخه از کلاینت می‌آید و پیش‌تر فقط با کلید اصلی خوانده
// می‌شد؛ یعنی ADMIN/EDU_EXPERT دانشگاه A می‌توانست با حدسِ id، چارت دانشگاه B
// را ویرایش/تأیید/منتشر/بایگانی/حذف کند. حالا هر مسیری که به یک نسخه دست
// می‌زند از `getVersionOrThrow` می‌گذرد و آن هم این گارد را اعمال می‌کند —
// یک در، نه چند تکهٔ پراکنده.

/**
 * دانشگاهِ مالکِ یک نسخه.
 * اولویت: `universityId` خودِ نسخه؛ اگر NULL بود، `universityId` رشتهٔ مالک.
 * خروجی `null` یعنی «مالک نامشخص» و هرگز نباید به «همهٔ دانشگاه‌ها» ترجمه شود.
 */
export async function resolveVersionUniversityId(
  version: { universityId: number | null; majorId: number },
): Promise<number | null> {
  const { isRealUniversityId } = await import('@/lib/university-scope');
  if (isRealUniversityId(version.universityId)) return version.universityId;
  const [m] = await db
    .select({ universityId: majors.universityId })
    .from(majors)
    .where(eq(majors.id, version.majorId))
    .limit(1);
  return isRealUniversityId(m?.universityId) ? m.universityId : null;
}

/**
 * گاردِ مالکیتِ دانشگاهی — در صورت تخلف **throw** می‌کند (نه خروجیِ boolean)،
 * چون همهٔ اکشن‌های این ماژول خطا را از catch خودشان به پیام فارسی تبدیل
 * می‌کنند و شکل خروجی‌شان تغییر نمی‌کند.
 *
 * @returns شناسهٔ دانشگاهِ مالک (واقعی) — برای کوئری‌های هم‌دامنه در ادامهٔ اکشن
 */
export async function assertVersionTenant(
  version: { universityId: number | null; majorId: number },
): Promise<number> {
  const { getCurrentUniversity, isRealUniversityId } = await import('@/lib/university-scope');
  const actingUniId = (await getCurrentUniversity().catch(() => null))?.id ?? null;
  if (!isRealUniversityId(actingUniId)) {
    throw new Error('دانشگاه فعال مشخص نیست.');
  }
  const ownerUniId = await resolveVersionUniversityId(version);
  if (!isRealUniversityId(ownerUniId)) {
    throw new Error('دانشگاهِ مالکِ این نسخهٔ چارت مشخص نیست؛ نسخه باید به یک دانشگاه تعلق داشته باشد.');
  }
  if (ownerUniId !== actingUniId) {
    throw new Error('این نسخهٔ چارت متعلق به دانشگاه دیگری است.');
  }
  return ownerUniId;
}

export async function getVersionOrThrow(versionId: number) {
  const [v] = await db.select().from(curriculum_versions).where(eq(curriculum_versions.id, versionId)).limit(1);
  if (!v) throw new Error('نسخهٔ برنامهٔ درسی یافت نشد.');
  // 🔒 گارد چندمؤسسه‌ای — همهٔ اکشن‌ها (ویرایش، تأیید، انتشار، بایگانی، حذف، خواندن)
  // از همین‌جا ارث می‌برند؛ هیچ مسیری نباید جداگانه و بی‌گارد نسخه بخواند.
  await assertVersionTenant(v);
  return v;
}

/** قاعدهٔ طلایی: ویرایش فقط در DRAFT؛ هر گذار با assertTransition قفل شده */
export async function assertEditable(versionId: number) {
  const v = await getVersionOrThrow(versionId);
  if (!canEditStatus(v.status as CurriculumVersionStatus)) {
    throw new Error(`ویرایش نسخه در وضعیت «${v.status}» مجاز نیست؛ ابتدا نسخه را به DRAFT برگردانید (فقط قبل از تأیید) یا نسخهٔ جدید (R1) بسازید.`);
  }
  return v;
}

/**
 * گاردِ «برداشتن درس از چارت» — یک پله بازتر از ویرایش.
 *
 * چرا: اگر درسی اشتباهی به کاتالوگ اضافه شده باشد، حذفش یک **اصلاح** است نه
 * تغییرِ محتوا؛ و تا وقتی نسخه منتشر نشده، سابقهٔ تحصیلی هیچ دانشجویی به آن
 * گره نخورده. پس همان قاعدهٔ «حذف نسخه» این‌جا هم اعمال می‌شود:
 * DRAFT / REVIEW / APPROVED مجاز، PUBLISHED / ARCHIVED ممنوع.
 */
export async function assertRemovable(versionId: number) {
  const v = await getVersionOrThrow(versionId);
  if (!canDeleteStatus(v.status as CurriculumVersionStatus)) {
    throw new Error(
      `نسخه در وضعیت «${v.status}» منتشر/بایگانی شده است و برداشتن درس از آن مجاز نیست؛ `
      + 'برای تغییر چارتِ منتشرشده، ابتدا نسخهٔ جدید (R+1) بسازید.',
    );
  }
  return v;
}

/** برای ثبت رویداد تأیید، حساب کاربر باید به پروندهٔ کارکنان متصل باشد */
export async function requireActorStaff(user: SessionUser): Promise<number> {
  const [st] = await db.select({ id: staff.id }).from(staff).where(eq(staff.userId, user.id)).limit(1);
  if (!st) {
    throw new Error('حساب شما به پروندهٔ کارکنان (staff) متصل نیست؛ برای تأیید/انتشار برنامهٔ درسی این اتصال الزامی است.');
  }
  return st.id;
}


export async function assertUniqueVersionCode(majorId: number, degreeLevelId: number, trackId: number | null, versionCode: string, excludeId?: number) {
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

/** بارگیری کامل دادهٔ یک نسخه + دروس + قواعد + کدهای بانکِ ارجاع‌شده — برای اعتبارسنجی */


/** بارگیری کامل دادهٔ یک نسخه + دروس + قواعد + کدهای بانکِ ارجاع‌شده — برای اعتبارسنجی */
export async function loadVersionData(versionId: number) {
  const { getCurrentUniversity, isRealUniversityId } = await import('@/lib/university-scope');
  // چهار خواندنِ مستقل با هم (پیش‌تر سریالی بود ⇒ چهار رفت‌وبرگشتِ جدا به DB).
  // گاردِ چندمؤسسه‌ای همچنان `getVersionOrThrow` است؛ اگر رد کند، نتیجهٔ بقیهٔ
  // خواندن‌ها هرگز به کلاینت برنمی‌گردد.
  const [version, rows, rulesRows, uni] = await Promise.all([
    getVersionOrThrow(versionId),
    db
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
        minGrade: curriculum_courses.minGrade,                    // کف قبولی خاص نسخه (numeric → number|null)
        autoCorequisiteAllowed: curriculum_courses.autoCorequisiteAllowed,
        passGradeStatusCode: curriculum_courses.passGradeStatusCode,
        failGradeStatusCode: curriculum_courses.failGradeStatusCode,
        // منبعِ سراسری قواعد از «جدول دروس» — برای fallback پایین
        prereqText: courses.prereqText,
        coRequisites: courses.coRequisites,
        courseType: courses.courseType,
        equivalentCourseCodes: courses.equivalentCourseCodes,
        prereqMinUnits: courses.prereqMinUnits,
        prereqMinTerm: courses.prereqMinTerm,
      })
      .from(curriculum_courses)
      .innerJoin(courses, eq(courses.id, curriculum_courses.courseId))
      .where(eq(curriculum_courses.curriculumVersionId, versionId))
      .orderBy(asc(curriculum_courses.recommendedSemester)),
    db
      .select()
      .from(course_rules)
      .where(eq(course_rules.syllabusId, versionId)),
    getCurrentUniversity().catch(() => null),
  ]);

  const rules = buildRulesWithCatalogFallback(rows, rulesRows);

  // ── بانک کدها: فقط کدهای ارجاع‌شده، نه اسکنِ کلِ `courses` ────────────────
  // پیش‌تر `db.select().from(courses)` بدون هیچ فیلتری اجرا می‌شد و در دانشگاه
  // بزرگ، کلِ بانک دروس (چندهزار ردیف) برای ساختن یک Set خوانده می‌شد؛ در حالی
  // که فقط دو چیز لازم است:
  //   ۱) `existingCodes` برای چک «ارجاع نامعتبر» (فقط کدهای داخل درخت قواعد)،
  //   ۲) `extraTitles` برای کدهای ارجاع‌شده‌ای که در این چارت نیستند.
  // پس همان مجموعهٔ ارجاع‌شده (کدهای چارت + کدهای درخت قواعد) با inArray
  // خوانده می‌شود. اعتبارسنجی تضعیف نمی‌شود: کدی که در این مجموعه نباشد،
  // قبلاً هم فقط «در بانک نیست» شمرده می‌شد و اکنون هم در existingCodes نیست
  // ⇒ همان خطای PREREQ_REFERENCES_VALID.
  const inVersion = new Set(rows.map((r) => r.code));
  const referenced = new Set<string>(inVersion);
  for (const r of rules) for (const code of collectCourseCodes(r.logicTree)) referenced.add(code);
  const referencedCodes = [...referenced].filter((c) => c.length > 0);
  // فیلتر دانشگاهِ فعال؛ دروسِ بدون دانشگاه (رکوردهای مهاجرت قدیم) معتبر می‌مانند
  // (همان قاعدهٔ admin/codes و api/admin/curriculum/bank). شناسهٔ غیرواقعی (۰) =
  // بدون فیلتر، تا DENY_UNI باعث خطای کاذب «کد ناموجود» نشود.
  const uniId = uni?.id ?? null;
  const actingUniId = isRealUniversityId(uniId) ? uniId : null;
  const bankQuery = () => db.select({ code: courses.code, title: courses.title }).from(courses);
  let bankCodes: { code: string; title: string | null }[] = referencedCodes.length === 0
    ? []
    : await bankQuery().where(and(
      inArray(courses.code, referencedCodes),
      actingUniId != null
        ? or(eq(courses.universityId, actingUniId), isNull(courses.universityId))
        : undefined,
    ));
  // کدهای ارجاع‌شده‌ای که در دامنهٔ این دانشگاه پیدا نشدند ممکن است در بانک
  // (دانشگاه دیگر / رکورد بی‌مالکِ مهاجرت) موجود باشند. برای اینکه چک
  // PREREQ_REFERENCES_VALID هیچ خطای کاذبی ندهد، فقط همان چند کدِ گمشده را
  // بدون فیلتر می‌پرسیم — مسیر رایج (صفرِ گمشده) کوئری دومی اجرا نمی‌کند.
  const foundCodes = new Set(bankCodes.map((b) => b.code));
  const missingCodes = referencedCodes.filter((c) => !foundCodes.has(c));
  if (missingCodes.length > 0) {
    const extra = await bankQuery().where(inArray(courses.code, missingCodes));
    bankCodes = [...bankCodes, ...extra];
  }

  // عنوانِ دروسِ ارجاع‌شده در قواعد که در این چارت نیستند (از بانک) — تا ستون
  // «پیش‌نیاز / هم‌نیاز» به‌جای کدِ خالی، نام درس را نشان دهد.
  const extraTitles: Record<string, string> = {};
  for (const b of bankCodes) {
    if (referenced.has(b.code) && !inVersion.has(b.code) && b.title) extraTitles[b.code] = b.title;
  }

  // کدهای خودِ چارت با innerJoin قطعاً در بانک موجودند؛ افزودنشان به مجموعه
  // باعث می‌شود فیلتر دانشگاهِ بالا هرگز «کد چارت = ناموجود» نسازد، پس
  // اعتبارسنجی هیچ‌جا تضعیف نمی‌شود — فقط دامنهٔ اسکن کوچک شده است.
  const existingCodes = new Set<string>(inVersion);
  for (const b of bankCodes) existingCodes.add(b.code);

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
      minGrade: r.minGrade != null ? Number(r.minGrade) : null,
      autoCorequisiteAllowed: r.autoCorequisiteAllowed ?? 0,
      passGradeStatusCode: r.passGradeStatusCode,
      failGradeStatusCode: r.failGradeStatusCode,
      courseType: r.courseType,
      equivalentCourseCodes: r.equivalentCourseCodes,
      prereqMinUnits: r.prereqMinUnits != null ? Number(r.prereqMinUnits) : null,
      prereqMinTerm: r.prereqMinTerm != null ? Number(r.prereqMinTerm) : null,
    })),
    rules,
    extraTitles,
    existingCodes,
  };
}


/** حداقل مقرر از هر نقش در یک برنامهٔ درسی (قابل گسترش بعدی از تنظیمات) */
export const DEFAULT_MIN_ROLES: Record<string, number> = defaultMinRoles();

/**
 * تکمیل ورودی خالص Validator از دادهٔ بارگیری‌شده:
 * سقف واحد ترم: override نسخه → مقطع → ۲۰ (پیش‌فرض سیستم)؛
 * برای مقاطع ارشد/دکتری وجود پایان‌نامه نیز الزامی‌شده (چک ۸) و درس «عمومی» حذف می‌شود
 * (ارشد/دکتری درس عمومی ندارد — هشدار قبلی کاذب بود).
 */
export async function buildCheckInput(data: Awaited<ReturnType<typeof loadVersionData>>) {
  let maxUnitsPerTerm: number | null = data.version.maxUnitsPerTerm;
  const [deg] = await db
    .select({ code: degree_level_configs.code, title: degree_level_configs.title, maxUnitsPerTerm: degree_level_configs.maxUnitsPerTerm, isGraduate: degree_level_configs.isGraduate })
    .from(degree_level_configs)
    .where(eq(degree_level_configs.id, data.version.degreeLevelId))
    .limit(1);
  if (maxUnitsPerTerm == null) maxUnitsPerTerm = deg?.maxUnitsPerTerm ?? 20;
  // ترکیب انواع درس از خودِ چارت خوانده می‌شود، نه از یک فهرست ثابت:
  // هیچ «حداقل ۱ درس اصلی»ی تحمیل نمی‌شود؛ فقط نقش‌هایی که خودِ نسخه برایشان
  // «سهم واحد» تعیین کرده، باید در چارت درسی داشته باشند (چک ۸).
  const minRoleCounts: Partial<Record<string, number>> = {};
  const parsedTargets = parseRoleUnitTargets((data.version as { minRoleUnits?: unknown }).minRoleUnits);
  return {
    totalRequiredUnits: Number(data.version.totalRequiredUnits ?? 0),
    maxUnitsPerTerm,
    trackId: data.version.trackId,
    versionCode: data.version.versionCode,
    courses: data.courses,
    rules: data.rules,
    existingCodes: data.existingCodes,
    minRoleCounts,
    minRoleUnits: Object.keys(parsedTargets).length > 0 ? parsedTargets : undefined,
  };
}


export async function runChecks(versionId: number): Promise<CheckResult[]> {
  const data = await loadVersionData(versionId);
  return validateCurriculumCore(await buildCheckInput(data));
}

/** کپی عمیق دروس و قواعد از یک نسخه به نسخهٔ جدید (برای clone / revision) */


/** کپی عمیق دروس و قواعد از یک نسخه به نسخهٔ جدید (برای clone / revision) */
export async function deepCopyCourseData(tx: any, fromVersionId: number, toVersionId: number) {
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


/**
 * باطل‌سازی کش مسیرهای وابسته به چارت پس از یک نوشتن.
 *
 * `scope`:
 *  • `'full'` (پیش‌فرض) — تغییر ساختاری/انتشار: چارت، برنامه‌ریزی، انتخاب واحد،
 *    فارغ‌التحصیلی. رفتار پیش‌فرض عیناً همان ۴ مسیر قبلی است تا هیچ فراخوانیِ
 *    موجودی تغییر نکند.
 *  • `'light'` — ویرایش تک‌فیلدیِ یک ردیف (نقش/الزامی/شرط فارغ‌التحصیلی/ترم/کد
 *    نمره): این‌ها فقط نمای خودِ پنل برنامهٔ درسی را عوض می‌کنند و نباید کش
 *    برنامه‌ریزی/انتخاب واحد/فارغ‌التحصیلی را بی‌دلیل بشکنند.
 */
export function revalidateCurriculumPaths(scope: 'light' | 'full' = 'full') {
  revalidatePath('/admin/curriculum');
  if (scope === 'light') return;
  revalidatePath('/admin/scheduling');
  revalidatePath('/student/enroll');
  revalidatePath('/admin/graduation');
}

// ─────────────────────────── خواندن (برای Thin Client فاز ۷) ───────────────────────────


// ─────────────────────────── خواندن (برای Thin Client فاز ۷) ───────────────────────────

export interface CurriculumOverviewData {
  majors: {
    id: number; code: string | null; name: string; degreeLevelId: number; degreeTitle: string | null;
    degreeCode: string | null; degreeTermCount: number | null; degreeIsGraduate: number | null;
  }[];
  versions: {
    id: number; majorId: number; degreeLevelId: number; trackId: number | null;
    versionCode: string; title: string; status: string;
    entryYearFrom: number; entryYearTo: number | null;
    totalRequiredUnits: string; courseCount: number;
  }[];
  tracks: { id: number; code: string | null; title: string; majorId: number }[];
  /** نیم‌سال‌های مالیِ فعال — برای انتخاب «نیم‌سال ورودی» نسخه در انتقال/ایجاد */
  terms: { id: number; termCode: string; title: string }[];
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
  /** عنوان دروس ارجاع‌شده که در این چارت نیستند (کد → عنوان از بانک) */
  extraTitles: Record<string, string>;
};


export type CurriculumVersionDetailResult =
  | { ok: true; data: CurriculumVersionDetailData }
  | { ok: false; error: string };


/** بانک دروس دانشگاه — برای افزودن درس به نسخهٔ DRAFT (Thin Client فاز ۷)
 *  `total` = تعداد کلِ دروسِ هم‌خوان با فیلتر (برای برچسبِ «X از Y») */
export type CourseBankResult =
  | { ok: true; total: number; data: { id: number; code: string; title: string; units: string; courseType: string }[] }
  | { ok: false; error: string };


/** فهرست گروه‌های آموزشی — برای فرم «تعریف درس جدید در بانک» (معادل فیلد «گروه آموزشی» سامانهٔ قدیم) */
export type DepartmentListResult =
  | { ok: true; data: { id: number; name: string }[] }
  | { ok: false; error: string };


export interface CreateBankCourseInput {
  code: string;
  title: string;
  theoreticalUnits: number;
  practicalUnits: number;
  courseType?: string;
  gradingType?: 'NUMERIC' | 'PASS_FAIL';
  affectsGpa?: number;
  departmentId?: number | null;
}

/**
 * تعریف درس جدید از صفر در بانک دروس (معادل «معرفی درس جدید» سامانهٔ قدیم).
 * بانک سراسری است و به نسخه گره نخورده؛ پیش‌نیاز/هم‌نیاز هر درس در سطح
 * کاتالوگ (course_rules هر نسخه) تعریف می‌شود نه روی رکورد بانک.
 */


// ─────────────────────────── ساخت و ویرایش (فقط DRAFT) ───────────────────────────

export interface CreateVersionInput {
  majorId: number;
  degreeLevelId?: number;
  trackId?: number | null;
  versionCode: string;
  title?: string;
  entryYearFrom: number;
  entryYearTo?: number | null;
  /** نیم‌سال ورودی (financial_terms.id) — در انتقال/کپی هم قابل تعیین است */
  entryTermId?: number | null;
  totalRequiredUnits?: number;
  maxUnitsPerTerm?: number | null;
  cloneFromId?: number; // کپی عمیق (دروس + قواعد) از نسخهٔ مرجع
}


export interface AddCourseInput {
  courseId: number;
  roleType?: string;
  recommendedSemester?: number | null;
  isRequired?: number; isElective?: number; isGraduationRequired?: number;
  minGrade?: number | null;
  autoCorequisiteAllowed?: number;
  /** کد وضع نمرهٔ سما (میز تطبیق GRADE_STATUS) برای قبولی/مردودی در همین تخصیص درس؛ null = پیش‌فرض سیستم (۱/۲) */
  passGradeStatusCode?: string | null;
  failGradeStatusCode?: string | null;
}


export type SubmitForApprovalResult =
  | { ok: true; message: string; data: { checks: CheckResult[] } }
  | { ok: false; error: string; checks?: CheckResult[] };
