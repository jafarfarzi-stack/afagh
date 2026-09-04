// ════════════════════════════════════════════════════════════════════════════
// فاز ۱ — Resolution نسخهٔ برنامهٔ درسی (Pure — بدون DB)
// ────────────────────────────────────────────────────────────────────────────
// مسئولیت: از میان نسخه‌های یک رشته/مقطع/گرایش، «نسخهٔ قابل اعمال» برای یک
// دانشجوی مشخص (بر اساس سال ورود) را تعیین کند.
//
// قانون (بخش ۹ سند طراحی):
//   ۱) فقط وضعیت‌های PUBLISHED و ARCHIVED نامزد هستند (DRAFT/REVIEW/APPROVED هرگز).
//   ۲) رشته و مقطع باید دقیقاً یکسان باشند.
//   ۳) تطبیق گرایش: اول نسخهٔ دقیقِ همان گرایش؛ اگر نبود، نسخهٔ گرایش‌آزاد (trackId=NULL).
//   ۴) پنجرهٔ ورودی: entryYearFrom ≤ سال ورود دانشجو ≤ (entryYearTo ?? ∞)
//   ۵) ترتیب برتری (رتبه‌بندی): وضعیت فعال < آرشیو ← نسخهٔ جدیدتر (base و revision) ←
//      از لحاظ «نزدیکی به سال ورود» و در نهایت id (قطعی و قابل پیش‌بینی).
//      نمونه: 1404-R1 جایگزین 1404 می‌شود (revision جدیدتر)، و PUBLISHED بر ARCHIVED مقدم است.
//
// خروجی همیشه شامل reason و candidates است — برای Audit و خطاهای صریح لایهٔ Actions.
// ════════════════════════════════════════════════════════════════════════════

import {
  compareVersionCodes,
  type CurriculumVersion,
  type CurriculumVersionStatus,
} from './curriculum-types';

/** وضعیت‌هایی که در Resolution لحاظ می‌شوند */
export const RESOLUTION_STATUSES: readonly CurriculumVersionStatus[] = ['PUBLISHED', 'ARCHIVED'];

/** ترتیب برتری وضعیت در رتبه‌بندی (کمتر = مقدم‌تر) */
const STATUS_RANK: Record<CurriculumVersionStatus, number> = {
  PUBLISHED: 0,
  ARCHIVED: 1,
  APPROVED: 2,
  REVIEW: 3,
  DRAFT: 4,
};

export interface CurriculumResolutionContext {
  majorId: number;
  degreeLevelId: number;
  /** NULL = گرایش آزاد (فقط نسخه‌های trackId=NULL در نظر گرفته می‌شوند) */
  trackId: number | null;
  /** سال ورود دانشجو (entryYear در students) */
  entryYear: number;
}

export type ResolutionReason =
  | 'RESOLVED'
  | 'NO_VERSIONS'          // هیچ نسخه‌ای برای کل سیستم ثبت نشده
  | 'NO_ACTIVE_STATUS'     // نسخه‌ها هست، ولی هیچ‌کدام PUBLISHED/ARCHIVED نیستند
  | 'NO_MAJOR_OR_DEGREE'   // هیچ نسخه‌ای برای این رشته/مقطع نیست
  | 'NO_ENTRY_WINDOW'      // نسخه هست ولی سال ورود خارج از پنجرهٔ همه است
  | 'NO_TRACK';            // نسخهٔ گرایش−آزاد یا همان گرایش وجود ندارد

export interface ResolutionOutcome {
  version: CurriculumVersion | null;
  reason: ResolutionReason;
  /** شناسهٔ نسخه‌هایی که وارد مرحلهٔ رتبه‌بندی شدند (برای Audit) */
  candidates: number[];
}

/** رتبه‌بندی دو نسخه: خروجی منفی یعنی a مقدم است (برای sort صعودی) */
export function rankVersions(a: CurriculumVersion, b: CurriculumVersion): number {
  // ۱) وضعیت: PUBLISHED اول
  const st = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (st !== 0) return st;
  // ۲) نسخهٔ جدیدتر (base سپس revision): مثلاً 1404-R1 مقدم بر 1404
  const vc = compareVersionCodes(b.versionCode, a.versionCode);
  if (vc !== 0) return vc;
  // ۳) پنجرهٔ شروعِ نزدیک‌تر به ورود دانشجو (مقدم = شروع دیرتر)
  if (a.entryYearFrom !== b.entryYearFrom) return b.entryYearFrom - a.entryYearFrom;
  // ۴) قطعیت نهایی
  return b.id - a.id;
}

/**
 * تعیین نسخهٔ قابل اعمال برای یک دانشجو.
 * `versions` می‌تواند خروجی یک کوئری سادهٔ `SELECT * FROM curriculum_versions WHERE major_id=…`
 * باشد — فیلترینگ کامل (وضعیت/مقطع/گرایش/پنجره) همین‌جا به‌صورت Pure انجام می‌شود
 * تا منطق «قانون» در CI تست شود، نه در کوئری SQL پیچیده.
 */
export function resolveApplicableCurriculum(
  versions: CurriculumVersion[],
  ctx: CurriculumResolutionContext
): ResolutionOutcome {
  if (!versions || versions.length === 0) {
    return { version: null, reason: 'NO_VERSIONS', candidates: [] };
  }

  // فیلتر ۱ — وضعیت
  const byStatus = versions.filter((v) => RESOLUTION_STATUSES.includes(v.status));
  if (byStatus.length === 0) {
    return { version: null, reason: 'NO_ACTIVE_STATUS', candidates: [] };
  }

  // فیلتر ۲ — رشته و مقطع
  const byMajor = byStatus.filter(
    (v) => v.majorId === ctx.majorId && v.degreeLevelId === ctx.degreeLevelId
  );
  if (byMajor.length === 0) {
    return { version: null, reason: 'NO_MAJOR_OR_DEGREE', candidates: [] };
  }

  // فیلتر ۳ — گرایش: دقیق ترجیح دارد؛ اگر نبود، گرایش‌آزاد (NULL)
  const exactTrack = byMajor.filter((v) => v.trackId === ctx.trackId);
  const genericTrack = byMajor.filter((v) => v.trackId == null);
  const byTrack = exactTrack.length > 0 ? exactTrack : genericTrack;
  if (byTrack.length === 0) {
    return { version: null, reason: 'NO_TRACK', candidates: [] };
  }

  // فیلتر ۴ — پنجرهٔ سال ورود
  const inWindow = byTrack.filter(
    (v) => v.entryYearFrom <= ctx.entryYear && (v.entryYearTo == null || v.entryYearTo >= ctx.entryYear)
  );
  if (inWindow.length === 0) {
    return { version: null, reason: 'NO_ENTRY_WINDOW', candidates: [] };
  }

  // فیلتر ۵ — رتبه‌بندی قطعی
  const sorted = [...inWindow].sort(rankVersions);
  const best = sorted[0];
  if (!best) {
    // غیرممکن است (inWindow خالی نیست)، ولی برای قطعیت نوع‌ها:
    return { version: null, reason: 'NO_ENTRY_WINDOW', candidates: [] };
  }
  return {
    version: best,
    reason: 'RESOLVED',
    candidates: sorted.map((v) => v.id),
  };
}

/** آیا نسخه‌ای که «آرشیو» است هنوز می‌تواند برای دانشجویان قدیمی سرویس بدهد؟ */
export function isApplicableForStudent(v: CurriculumVersion, entryYear: number): boolean {
  return (
    RESOLUTION_STATUSES.includes(v.status) &&
    v.entryYearFrom <= entryYear &&
    (v.entryYearTo == null || v.entryYearTo >= entryYear)
  );
}
