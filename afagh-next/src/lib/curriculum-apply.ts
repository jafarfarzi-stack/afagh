// ════════════════════════════════════════════════════════════════════════
// فاز ۵ — Resolution DB-backed: «کدام نسخهٔ برنامه برای این دانشجو قابل اعمال است؟»
// ────────────────────────────────────────────────────────────────────────
// لایهٔ میانی بین موتورها (enroll/graduation/regulations) و Resolver خالص:
//   بارگیری نسخه‌ها از DB → فیلتر رشته/مقطع → Resolver خالص (وضعیت/نوع/پنجره/گرایش)
// → بازگرداندن ردیف کامل نسخه + دلیل (reason) برای Audit و پیام‌های صریح.
//
// قانون (بخش ۹ سند): فقط PUBLISHED و ARCHIVED نامزدند؛ DRAFT/REVIEW/APPROVED
// هرگز به انتخاب واحد، تطبیق سرفصل یا آیین‌نامه نشت نمی‌کنند.
//
// مدل دوگانهٔ کاتالوگ (مهاجرت ۰۱۳۷):
//   دانشجویی که students.compensatoryUnits > 0 دارد، **دو** نسخه می‌گیرد:
//     • کاتالوگ عادی     (catalogKind = NORMAL)      — برنامهٔ اصلیِ رشته
//     • کاتالوگ جبرانی   (catalogKind = COMPENSATORY) — فقط دروسِ کسری/جبرانی
//   این دو هرگز با هم قاطی نمی‌شوند؛ قبلاً دروس جبرانی داخل نسخهٔ عادی بودند و
//   جمع واحد ترم را از سقف می‌گذراندند.
// ════════════════════════════════════════════════════════════════════════
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { curriculum_courses, curriculum_versions, students } from '@/db/schema';
import {
  resolveApplicableCurriculum,
  type ResolutionOutcome,
  type ResolvableVersion,
} from './curriculum-resolution';
import { needsCompensatory, type CatalogKind } from './compensatory-catalog';

export type CurriculumResolutionResult = ResolutionOutcome & {
  version: (typeof curriculum_versions.$inferSelect) | null;
};

const RESOLUTION_COLUMNS = {
  id: curriculum_versions.id,
  majorId: curriculum_versions.majorId,
  degreeLevelId: curriculum_versions.degreeLevelId,
  trackId: curriculum_versions.trackId,
  versionCode: curriculum_versions.versionCode,
  status: curriculum_versions.status,
  entryYearFrom: curriculum_versions.entryYearFrom,
  entryYearTo: curriculum_versions.entryYearTo,
  entryTermId: curriculum_versions.entryTermId,
  catalogKind: curriculum_versions.catalogKind,
};

/**
 * تعیین نسخهٔ قابل اعمال برای یک دانشجو (بر اساس majorId، مقطع، سال ورود).
 * اگر دانشجو فاقد رشته باشد → NO_MAJOR_OR_DEGREE با پیام صریح.
 *
 * `catalogKind` پیش‌فرض NORMAL است؛ برای گرفتن کاتالوگ جبرانی مقدار
 * 'COMPENSATORY' بدهید (یا از resolveStudentCurricula استفاده کنید).
 */
export async function resolveStudentCurriculum(
  studentId: number,
  catalogKind: CatalogKind = 'NORMAL'
): Promise<CurriculumResolutionResult> {
  const [stu] = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
  if (!stu) return { version: null, reason: 'NO_VERSIONS', candidates: [] };
  if (!stu.majorId) return { version: null, reason: 'NO_MAJOR_OR_DEGREE', candidates: [] };

  // فقط نسخه‌های همین رشته — بقیهٔ فیلترها (وضعیت/نوع/مقطع/گرایش/پنجره) در Resolver خالص
  const rows = await db
    .select(RESOLUTION_COLUMNS)
    .from(curriculum_versions)
    .where(eq(curriculum_versions.majorId, stu.majorId));

  // ردیف‌های Drizzle از نظر ساختاری با ResolvableVersion سازگارند (فاز ۵ — بدون cast)
  const outcome = resolveApplicableCurriculum(rows as ResolvableVersion[], {
    majorId: stu.majorId,
    degreeLevelId: stu.degreeLevelId,
    trackId: null, // دانشجو گرایش ندارد → نسخهٔ گرایش‌آزاد (trackId=NULL) یا اختصاصیِ همان گرایش
    entryYear: stu.entryYear,
    entryTerm: stu.entryTerm,
    catalogKind,
  });

  if (!outcome.version) return { ...outcome, version: null };
  const [full] = await db.select().from(curriculum_versions).where(eq(curriculum_versions.id, outcome.version.id)).limit(1);
  return { ...outcome, version: full ?? null };
}

/** منبعِ دروس جبرانیِ یک دانشجو */
export type CompensatorySource =
  | 'DEDICATED'  // نسخهٔ مستقل با catalogKind=COMPENSATORY (مسیر درست)
  | 'EMBEDDED'   // نسخهٔ عادی هنوز ردیف‌های COMPENSATORY دارد (دادهٔ مهاجرت‌شدهٔ قدیمی)
  | 'NONE';      // دانشجو نیازی ندارد، یا هیچ درس جبرانی‌ای تعریف نشده

export interface StudentCurricula {
  needsCompensatory: boolean;
  normal: CurriculumResolutionResult;
  /** نسخهٔ جبرانی — فقط اگر دانشجو نیاز داشته باشد و نسخه‌ای موجود باشد */
  compensatory: CurriculumResolutionResult | null;
  compensatorySource: CompensatorySource;
}

/**
 * نسخه‌های قابل اعمال برای یک دانشجو — **هر دو مدل**.
 *
 * اگر نسخهٔ جبرانیِ مستقل منتشر نشده باشد ولی نسخهٔ عادی ردیف‌های
 * COMPENSATORY داشته باشد (وضعیتِ دادهٔ مهاجرت‌شده پیش از ۰۱۳۷)، به‌جای
 * شکست، همان نسخهٔ عادی با منبع EMBEDDED برگردانده می‌شود تا رفتار فعلی
 * دانشجو عوض نشود؛ اما UI و گزارش می‌توانند هشدار «کاتالوگ جبرانی تفکیک
 * نشده» را نشان دهند.
 */
export async function resolveStudentCurricula(studentId: number): Promise<StudentCurricula> {
  const [stu] = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
  const normal = await resolveStudentCurriculum(studentId, 'NORMAL');

  if (!stu || !needsCompensatory(stu)) {
    return { needsCompensatory: false, normal, compensatory: null, compensatorySource: 'NONE' };
  }

  const dedicated = await resolveStudentCurriculum(studentId, 'COMPENSATORY');
  if (dedicated.version) {
    return {
      needsCompensatory: true,
      normal,
      compensatory: dedicated,
      compensatorySource: 'DEDICATED',
    };
  }

  // عقب‌نشینیِ سازگار: نسخهٔ عادی هنوز ردیف جبرانیِ چسبیده دارد؟
  if (normal.version) {
    const [embedded] = await db
      .select({ id: curriculum_courses.id })
      .from(curriculum_courses)
      .where(
        and(
          eq(curriculum_courses.curriculumVersionId, normal.version.id),
          eq(curriculum_courses.roleType, 'COMPENSATORY')
        )
      )
      .limit(1);
    if (embedded) {
      return {
        needsCompensatory: true,
        normal,
        compensatory: { ...normal, reason: 'RESOLVED' },
        compensatorySource: 'EMBEDDED',
      };
    }
  }

  return {
    needsCompensatory: true,
    normal,
    compensatory: dedicated.version ? dedicated : null,
    compensatorySource: 'NONE',
  };
}

/** پیام فارسیِ صریح برای هر دلیلِ حل‌نشدن — برای reasons در موتورها و UI */
export function resolutionReasonMessage(reason: ResolutionOutcome['reason']): string {
  switch (reason) {
    case 'NO_VERSIONS': return 'برای این رشته هیچ نسخهٔ برنامهٔ درسی ثبت نشده است.';
    case 'NO_ACTIVE_STATUS': return 'نسخه‌ها ثبت شده‌اند ولی هیچ‌کدام منتشر نشده‌اند (وضعیت PUBLISHED/ARCHIVED ندارند).';
    case 'NO_MAJOR_OR_DEGREE': return 'نسخهٔ برنامه‌ای برای این رشته/مقطع ثبت نشده است.';
    case 'NO_ENTRY_WINDOW': return 'سال ورود دانشجو خارج از پنجرهٔ ورودی همهٔ نسخه‌های این رشته است.';
    case 'NO_TRACK': return 'نسخهٔ گرایش‌آزاد و نسخهٔ اختصاصی این گرایش ثبت نشده است.';
    case 'NO_COMPENSATORY_CATALOG': return 'کاتالوگ جبرانی برای این رشته/مقطع/سال ورود منتشر نشده است.';
    case 'RESOLVED': return '';
  }
}
