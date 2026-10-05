// ═══════════════════════════════════════════════════════════════════════
//  فهرست مرجع کدهای «وضع نمره» سما (میز تطبیق GRADE_STATUS)
//  منبع: فایل رسمی صادرشده توسط سامانهٔ سما دانشگاه آفاق (وضع نمرات در کارنامه.txt).
//  این جدول مرجع کدگذاری سراسری است.
// ═══════════════════════════════════════════════════════════════════════

export type GradeStatusCode = {
  code: string;
  title: string;
  /** آیا این کد به‌عنوان «قبول» تلقی می‌شود (پاس شده) */
  passed: boolean;
  /** آیا در معدل کل دانشگاه اثر دارد */
  affectsGpa: boolean;
  /** آیا در معدل نیمسال اثر دارد */
  affectsTermGpa?: boolean;
  /** آیا درس حذف شده است (حذف پزشکی، شورا، اضطراری و ...) */
  isDropped?: boolean;
};

export const GRADE_STATUS_CODES: GradeStatusCode[] = [
  { code: '-91', title: 'حذف آيين نامه 91 (کارداني _ کارشناسي)', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: false },
  { code: '-6', title: 'تقلبهاي مشكوك', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: false },
  { code: '-5', title: 'انصراف', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: true },
  { code: '-4', title: 'حذف توسط استاد راهنما در حذف و اضافه', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: true },
  { code: '-3', title: 'حذف توسط استاد راهنما در انتخاب واحد', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: true },
  { code: '-1', title: 'حذف در حذف و اضافه', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: true },
  { code: '0', title: 'نامشخص', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: false },
  { code: '1', title: 'درس عادي - قبول', passed: true, affectsGpa: true, affectsTermGpa: true, isDropped: false },
  { code: '2', title: 'درس عادي - مردود', passed: false, affectsGpa: true, affectsTermGpa: true, isDropped: false },
  { code: '3', title: 'در معادل سازي پذيرفته شده با احتساب در معدل کل', passed: true, affectsGpa: true, affectsTermGpa: true, isDropped: false },
  { code: '4', title: 'در معادل سازي پذيرفته نشده', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: false },
  { code: '5', title: 'غيبت در جلسه امتحان', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: false },
  { code: '6', title: 'حذف اضطراري', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: true },
  { code: '7', title: 'حذف توسط شوراي آموزشي', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: true },
  { code: '8', title: 'حذف توسط ستاد دانشجويان شاهد و ايثارگر', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: true },
  { code: '9', title: 'حذف توسط کميسيون موارد خاص', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: true },
  { code: '10', title: 'نمره گزارش نشده', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: false },
  { code: '11', title: 'جبراني- بااحتساب درمعدل', passed: true, affectsGpa: true, affectsTermGpa: true, isDropped: false },
  { code: '12', title: 'جبراني بدون احتساب در معدل-قبول', passed: true, affectsGpa: false, affectsTermGpa: false, isDropped: false },
  { code: '13', title: 'ناتمام', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: false },
  { code: '14', title: 'حذف پزشکي', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: true },
  { code: '15', title: 'حذف‌ترم بااحتساب', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: true },
  { code: '16', title: 'در معادل سازي پذيرفته شده بدون احتساب معدل', passed: true, affectsGpa: false, affectsTermGpa: false, isDropped: false },
  { code: '17', title: 'درمعادل‌سازي‌پذيرفته‌شده‌جزواحدبدون‌احتسابمعدل', passed: true, affectsGpa: false, affectsTermGpa: false, isDropped: false },
  { code: '18', title: 'پايان نامه 941-قبول', passed: true, affectsGpa: false, affectsTermGpa: false, isDropped: false },
  { code: '19', title: 'درحال تحقيق', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: false },
  { code: '20', title: 'بدون تاثير در معدل ترم و معدل کل', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: false },
  { code: '22', title: 'جبراني بدون احتساب در معدل - مردود', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: false },
  { code: '23', title: 'پيش نياز-قبول موثر در نيمسال', passed: true, affectsGpa: false, affectsTermGpa: true, isDropped: false },
  { code: '24', title: 'پيش نياز -مردود موثر در نيمسال', passed: false, affectsGpa: false, affectsTermGpa: true, isDropped: false },
  { code: '27', title: 'رساله دکتري', passed: true, affectsGpa: true, affectsTermGpa: true, isDropped: false },
  { code: '28', title: 'بدون احتساب در معدل', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: false },
  { code: '29', title: 'دروس‌کمبودبدون‌احتساب‌درمعدل', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: false },
  { code: '32', title: 'جبراني-معادلسازي', passed: true, affectsGpa: false, affectsTermGpa: false, isDropped: false },
  { code: '40', title: 'معرفي به استاد', passed: true, affectsGpa: true, affectsTermGpa: true, isDropped: false },
  { code: '44', title: 'دروس پيش‌دانشگاهي/جبراني بدون احتساب', passed: true, affectsGpa: false, affectsTermGpa: false, isDropped: false },
  { code: '46', title: 'دروس پيش‌دانشگاهي/جبراني بدون احتساب - مردود', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: false },
  { code: '50', title: 'خودخوان - قبول', passed: true, affectsGpa: true, affectsTermGpa: true, isDropped: false },
  { code: '51', title: 'خودخوان - مردود', passed: false, affectsGpa: true, affectsTermGpa: true, isDropped: false },
  { code: '52', title: 'تخلف در امتحان', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: false },
  { code: '53', title: 'دروس‌خودخوان _قبول(جبراني‌بدون‌احتساب‌درمعدل)', passed: true, affectsGpa: false, affectsTermGpa: false, isDropped: false },
  { code: '54', title: 'فوت', passed: true, affectsGpa: true, affectsTermGpa: true, isDropped: false },
  { code: '55', title: 'حذف توسط كميته انضباطي', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: true },
  { code: '200', title: 'حذف آيين نامه اي ماده 23', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: true },
  { code: '201', title: 'حذف بدليل مرودي درترم هاي قبل', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: true },
  { code: '300', title: 'غيبت غير موجه بيش از حددر کلاس', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: false },
  { code: '400', title: 'حذف آموزشي', passed: false, affectsGpa: false, affectsTermGpa: false, isDropped: true },
  { code: '931', title: 'حذف آيين نامه 93 (کارداني _ کارشناسي)', passed: false, affectsGpa: false, affectsTermGpa: true, isDropped: false },
  { code: '941', title: 'حذف آيين نامه 94 (کارشناسي ارشد)', passed: false, affectsGpa: false, affectsTermGpa: true, isDropped: false },
  { code: '951', title: 'حذف آيين نامه 95 (دکترا)', passed: false, affectsGpa: false, affectsTermGpa: true, isDropped: false },
];

/** کدهای سمای بدون اثر در معدل کل (مجموعهٔ سریع برای فیلتر) */
export const NON_GPA_CODES = new Set(
  GRADE_STATUS_CODES.filter(g => !g.affectsGpa).map(g => g.code),
);

/**
 * کدهای سمایی که «قبولی»‌اند ولی نمره‌شان در معدل اثر ندارد — زیرمجموعهٔ
 * {@link NON_GPA_CODES}. همین زیرمجموعه «تعریف مرجع» است: ردیفی که چنین کدی
 * دارد، واحدش قبولی است ولی نمره‌اش نه در صورت و نه در مخرج معدل کل می‌آید
 * (معادل‌سازی/خودخوان/جبرانیِ بدون احتساب و پایان‌نامه).
 * ⚠️ واحدهای این ردیف‌ها در هر دو موتور قبولی شمرده می‌شوند — عمدی: درس منتقل‌شده
 * باید واحد بدهد حتی اگر نمره‌اش وارد معدل نشود.
 */
export const NON_GPA_PASS_CODES: ReadonlySet<string> = new Set(
  GRADE_STATUS_CODES.filter(g => g.passed && !g.affectsGpa).map(g => g.code),
);

/** کدهای سمای بدون اثر در معدل نیمسال */
export const NON_TERM_GPA_CODES = new Set(
  GRADE_STATUS_CODES.filter(g => !g.affectsTermGpa).map(g => g.code),
);

/** کدهای دروسی که حذف شده‌اند (نه قبولی است نه مردودی) */
export const DROPPED_CODES = new Set(
  GRADE_STATUS_CODES.filter(g => g.isDropped).map(g => g.code),
);

/** برچسب نمایشی «کد — عنوان» برای dropdown */
export function gradeStatusOptionLabel(g: GradeStatusCode): string {
  return `${g.code} — ${g.title}`;
}

/** جست‌وجوی عنوان از روی کد (برای نمایش/tooltip) */
export function gradeStatusTitleOf(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.trim();
  return GRADE_STATUS_CODES.find(g => g.code === c)?.title ?? null;
}

/** آیا کد داده شده نشان‌دهندهٔ قبولی است؟ */
export function isPassedStatusCode(code: string | null | undefined): boolean {
  if (!code) return false;
  const c = code.trim();
  const found = GRADE_STATUS_CODES.find(g => g.code === c);
  return found ? found.passed : false;
}

/** آیا کد داده شده نشان‌دهندهٔ حذف درس است؟ */
export function isDroppedStatusCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return DROPPED_CODES.has(code.trim());
}

/** آیا کد، قبولیِ «بدون احتساب در معدل» است (۱۲، ۱۶، ۱۷، ۱۸، ۲۳، ۳۲، ۴۴، ۵۳)؟ */
export function isNonGpaPassCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return NON_GPA_PASS_CODES.has(code.trim());
}

/**
 * ═══ قاعدهٔ مرجعِ ورودِ نمره به معدل ═══
 *
 * تنها تعریف «این ردیف نمره‌اش را به معدل نمی‌دهد» در کل پروژه. هر دو موتور
 * (آیین‌نامه = calculateOfficialGPA و فارغ‌التحصیلی = auditStudent) همین تابع را
 * صدا می‌زنند، پس «معدل رسمی» و «معدلِ دروازهٔ فارغ‌التحصیلی» دیگر نمی‌توانند
 * برای یک ردیف یکی را بگویند و دیگری را نه.
 *
 * سه شرطِ AND — هر سه مستقل و معتبر:
 *   ۱) کد سمای ردیف در {@link NON_GPA_CODES} نباشد (۱۲: جبرانی بدون احتساب، ...)
 *   ۲) سوییچ دورهٔ درس `courses.affectsGpa` صفر نباشد (اهرم مستقل و مجاز)
 *   ۳) درس توصیفی نباشد (نمرهٔ توصیفی = ۱ است، نه نمرهٔ ۲۰ مقیاسی)
 *
 * واحدهای ردیف از این قاعده مستقل‌اند: قبولیِ ردیف در passedUnits شمرده می‌شود
 * حتی وقتی نمره‌اش وارد معدل نمی‌شود.
 */
export function rowCountsTowardGpa(row: {
  samaGradeStatusCode?: string | null;
  courseAffectsGpa?: number | null;
  gradingType?: string | null;
}): boolean {
  if (row.gradingType === 'DESCRIPTIVE') return false;
  if (row.courseAffectsGpa === 0) return false;
  const code = row.samaGradeStatusCode?.trim() || null;
  if (code && NON_GPA_CODES.has(code)) return false;
  return true;
}

/**
 * حد نصاب «قبولی مجدد» برای حذف مردودی قبلی:
 * فقط تبصره ۱۳۹۱ از retakeMinGrade استفاده می‌کند (وگرنه کف عادی همان درس).
 * خروجی null یعنی همان کف قبولی عادی ملاک است.
 */
export function resolveRetakeBar(
  policy: string | null | undefined,
  retakeMinGrade: number | null | undefined,
  passingGrade: number,
): number | null {
  if (policy !== 'EXCLUDE_IF_PASSED_1391') return null;
  const b = retakeMinGrade != null ? Number(retakeMinGrade) : NaN;
  if (Number.isFinite(b) && (b as number) > 0) return b as number;
  const p = Number(passingGrade);
  return Number.isFinite(p) && p > 0 ? p : null;
}

/**
 * کدهای وضعی که منطق آیین‌نامه هرگز نباید بازنویسی کند — حتی اگر همان درس
 * بعداً پاس شود: حذف‌ها و انصراف‌ها (۶،۷،۸،۹،۱۴،۱۵،-۱،-۳،-۴،-۵،۲۰۰،۲۰۱،۴۰۰،۵۵)،
 * غیبت (۵)، جبرانی مردود بدون احتساب (۲۲) و معادل‌سازی/خودخوان/نامشخص‌ها.
 * بازنویسی این‌ها به ۹۳۱/-۹۱/۹۴۱/۹۵۱ (که در معدل ترم اثر دارند) معدل را به‌هم می‌ریزد.
 * همین مجموعه در sync مبنای «دست‌نخورده ماندن» است.
 */
export const REGULATION_FROZEN_CODES: ReadonlySet<string> = new Set([
  '3', '4', '5', '6', '7', '8', '9', '10', '13', '14', '15', '16', '17', '18', '19', '20',
  '22', '28', '29', '32', '36', '40', '44', '46', '50', '51', '52', '53', '55',
  '200', '201', '300', '400', '-1', '-3', '-4', '-5', '0',
]);
