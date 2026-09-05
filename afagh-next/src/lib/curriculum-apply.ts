// ════════════════════════════════════════════════════════════════════════
// فاز ۵ — Resolution DB-backed: «کدام نسخهٔ برنامه برای این دانشجو قابل اعمال است؟»
// ────────────────────────────────────────────────────────────────────────
// لایهٔ میانی بین موتورها (enroll/graduation/regulations) و Resolver خالص:
//   بارگیری نسخه‌ها از DB → فیلتر رشته/مقطع → Resolver خالص (وضعیت/پنجره/گرایش)
// → بازگرداندن ردیف کامل نسخه + دلیل (reason) برای Audit و پیام‌های صریح.
//
// قانون (بخش ۹ سند): فقط PUBLISHED و ARCHIVED نامزدند؛ DRAFT/REVIEW/APPROVED
// هرگز به انتخاب واحد، تطبیق سرفصل یا آیین‌نامه نشت نمی‌کنند.
// ════════════════════════════════════════════════════════════════════════
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { curriculum_versions, students } from '@/db/schema';
import {
  resolveApplicableCurriculum,
  type ResolutionOutcome,
  type ResolvableVersion,
} from './curriculum-resolution';

export type CurriculumResolutionResult = ResolutionOutcome & {
  version: (typeof curriculum_versions.$inferSelect) | null;
};

/**
 * تعیین نسخهٔ قابل اعمال برای یک دانشجو (بر اساس majorId، مقطع، سال ورود).
 * اگر دانشجو فاقد رشته باشد → NO_MAJOR_OR_DEGREE با پیام صریح.
 */
export async function resolveStudentCurriculum(studentId: number): Promise<CurriculumResolutionResult> {
  const [stu] = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
  if (!stu) return { version: null, reason: 'NO_VERSIONS', candidates: [] };
  if (!stu.majorId) return { version: null, reason: 'NO_MAJOR_OR_DEGREE', candidates: [] };

  // فقط نسخه‌های همین رشته — بقیهٔ فیلترها (وضعیت/مقطع/گرایش/پنجره) در Resolver خالص
  const rows = await db
    .select({ id: curriculum_versions.id, majorId: curriculum_versions.majorId, degreeLevelId: curriculum_versions.degreeLevelId, trackId: curriculum_versions.trackId, versionCode: curriculum_versions.versionCode, status: curriculum_versions.status, entryYearFrom: curriculum_versions.entryYearFrom, entryYearTo: curriculum_versions.entryYearTo })
    .from(curriculum_versions)
    .where(eq(curriculum_versions.majorId, stu.majorId));

  // ردیف‌های Drizzle از نظر ساختاری با ResolvableVersion سازگارند (فاز ۵ — بدون cast)
  const outcome = resolveApplicableCurriculum(rows as ResolvableVersion[], {
    majorId: stu.majorId,
    degreeLevelId: stu.degreeLevelId,
    trackId: null, // دانشجو گرایش ندارد → نسخهٔ گرایش‌آزاد (trackId=NULL) یا اختصاصیِ همان گرایش
    entryYear: stu.entryYear,
  });

  if (!outcome.version) return { ...outcome, version: null };
  const [full] = await db.select().from(curriculum_versions).where(eq(curriculum_versions.id, outcome.version.id)).limit(1);
  return { ...outcome, version: full ?? null };
}

/** پیام فارسیِ صریح برای هر دلیلِ حل‌نشدن — برای reasons در موتورها و UI */
export function resolutionReasonMessage(reason: ResolutionOutcome['reason']): string {
  switch (reason) {
    case 'NO_VERSIONS': return 'برای این رشته هیچ نسخهٔ برنامهٔ درسی ثبت نشده است.';
    case 'NO_ACTIVE_STATUS': return 'نسخه‌ها ثبت شده‌اند ولی هیچ‌کدام منتشر نشده‌اند (وضعیت PUBLISHED/ARCHIVED ندارند).';
    case 'NO_MAJOR_OR_DEGREE': return 'نسخهٔ برنامه‌ای برای این رشته/مقطع ثبت نشده است.';
    case 'NO_ENTRY_WINDOW': return 'سال ورود دانشجو خارج از پنجرهٔ ورودی همهٔ نسخه‌های این رشته است.';
    case 'NO_TRACK': return 'نسخهٔ گرایش‌آزاد و نسخهٔ اختصاصی این گرایش ثبت نشده است.';
    case 'RESOLVED': return '';
  }
}
