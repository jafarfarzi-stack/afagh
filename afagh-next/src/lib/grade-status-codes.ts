/**
 * ═══════════════════════════════════════════════════════════════════
 *  کد وضعیت نمره — مرجع واحد «کد ↔ عنوان ↔ وضعیت داخلی»
 * ═══════════════════════════════════════════════════════════════════
 *  چرا این ماژول؟
 *  در کارنامهٔ چاپی، ستون «وضع» عنوان کامل وضعیت را نشان می‌داد
 *  («درمعادل‌سازی پذیرفته‌شده جزو واحد بدون احتساب معدل»). عنوان بلند، ستون را
 *  باز می‌کند و چون سه نیمسال کنار هم چاپ می‌شوند، جدول‌ها به هم می‌ریزند.
 *  راه‌حل همان چیزی است که سیستم قدیمی هم می‌کرد: داخل جدول فقط «کد»
 *  می‌آید و راهنمای کدها پایین کارنامه.
 *
 *  این ماژول عمداً خالص است (بدون db، بدون server-only) تا سرور و کلاینت
 *  از یک مرجع واحد استفاده کنند. همین فهرست، جدول مرجعِ
 *  «grade_status_codes» را در دیتابیس می‌سازد (Master Data).
 *
 *  منبع کدها و عنوان‌ها: فایل مرجع «وضع نمره» سیستم قدیمی (۴۷ کد) — عیناً
 *  وارد شده، فقط «ي/ك/ة» عربی به «ی/ک/ه» فارسی یکسان شده (همان normTxt که
 *  موتور واردسازی استفاده می‌کند). وضعیت داخلی هر کد همان دسته‌بندیِ خودِ
 *  ETL سما است (scripts/import-sama-afagh.mjs) و پرچم‌های اثرِ هر کد
 *  (اثر در معدل، واحد گذرانده، پاس‌شده، جمع کل، نمایش در کارنامه، عدم حذف با
 *  قبولی مجدد) هم نگه داشته شده‌اند تا اطلاعات مهاجرت‌شده از بین نرود.
 */

/** منشأ کد: عددی‌ها از سیستم قدیمی، N*ها وضعیت‌های داخلی سامانهٔ جدید */
export type GradeStatusOrigin = 'LEGACY' | 'INTERNAL';

/** یک ردیف از فایل مرجع «وضع نمره» سیستم قدیمی */
export type LegacyCodeRow = {
  /** کد عددی قدیمی (همان MarkStat فایل نمرات) */
  code: string;
  /** عین عنوان فایل مرجع */
  title: string;
  /** وضعیت داخلی سامانهٔ جدید (همان دسته‌بندی ETL سما) */
  status: string;
  /** تأثير در معدل */
  gpa: boolean;
  /** تأثير در تعداد واحد گذرانده */
  unitPassed: boolean;
  /** پاس شده تلقي شود */
  assumedPassed: boolean;
  /** تأثير در جمع کل در کارنامه */
  totalSum: boolean;
  /** نمايش در کارنامه */
  showInTranscript: boolean;
  /** عدم حذف با قبولي مجدد درس */
  keepAfterRetake: boolean;
};

/** 47 کد وضع نمرهٔ سیستم قدیمی — عینِ فایل مرجع «وضع نمره» (کد، عنوان، وضعیت داخلی، پرچم‌های اثر) */
const LEGACY_ROWS: LegacyCodeRow[] = [
  { code: '-91', title: 'حذف آیین نامه 91 (کاردانی _ کارشناسی)', status: 'DROPPED', gpa: false, unitPassed: false, assumedPassed: false, totalSum: true, showInTranscript: false, keepAfterRetake: false },
  { code: '-6', title: 'تقلبهای مشکوک', status: 'DROPPED', gpa: false, unitPassed: false, assumedPassed: false, totalSum: false, showInTranscript: false, keepAfterRetake: false },
  { code: '-5', title: 'انصراف', status: 'DROPPED', gpa: false, unitPassed: false, assumedPassed: false, totalSum: false, showInTranscript: false, keepAfterRetake: false },
  { code: '-4', title: 'حذف توسط استاد راهنما در حذف و اضافه', status: 'DROPPED', gpa: false, unitPassed: false, assumedPassed: false, totalSum: true, showInTranscript: false, keepAfterRetake: false },
  { code: '-3', title: 'حذف توسط استاد راهنما در انتخاب واحد', status: 'DROPPED', gpa: false, unitPassed: false, assumedPassed: false, totalSum: true, showInTranscript: false, keepAfterRetake: false },
  { code: '-1', title: 'حذف در حذف و اضافه', status: 'DROPPED', gpa: false, unitPassed: false, assumedPassed: false, totalSum: false, showInTranscript: false, keepAfterRetake: false },
  { code: '0', title: 'نامشخص', status: 'PENDING', gpa: false, unitPassed: false, assumedPassed: false, totalSum: true, showInTranscript: false, keepAfterRetake: false },
  { code: '1', title: 'درس عادی - قبول', status: 'FINALIZED', gpa: true, unitPassed: true, assumedPassed: true, totalSum: true, showInTranscript: false, keepAfterRetake: true },
  { code: '2', title: 'درس عادی - مردود', status: 'FAILED_NO_GRADE', gpa: true, unitPassed: false, assumedPassed: false, totalSum: true, showInTranscript: true, keepAfterRetake: false },
  { code: '3', title: 'در معادل سازی پذیرفته شده با احتساب در معدل کل', status: 'EXEMPT', gpa: true, unitPassed: true, assumedPassed: true, totalSum: true, showInTranscript: false, keepAfterRetake: true },
  { code: '4', title: 'در معادل سازی پذیرفته نشده', status: 'DROPPED', gpa: false, unitPassed: false, assumedPassed: false, totalSum: false, showInTranscript: false, keepAfterRetake: false },
  { code: '5', title: 'غیبت در جلسه امتحان', status: 'DROPPED', gpa: false, unitPassed: false, assumedPassed: false, totalSum: false, showInTranscript: false, keepAfterRetake: false },
  { code: '6', title: 'حذف اضطراری', status: 'DROPPED', gpa: false, unitPassed: false, assumedPassed: false, totalSum: true, showInTranscript: false, keepAfterRetake: false },
  { code: '7', title: 'حذف توسط شورای آموزشی', status: 'DROPPED', gpa: false, unitPassed: false, assumedPassed: false, totalSum: true, showInTranscript: false, keepAfterRetake: false },
  { code: '8', title: 'حذف توسط ستاد دانشجویان شاهد و ایثارگر', status: 'DROPPED', gpa: false, unitPassed: false, assumedPassed: false, totalSum: false, showInTranscript: false, keepAfterRetake: false },
  { code: '9', title: 'حذف توسط کمیسیون موارد خاص', status: 'DROPPED', gpa: false, unitPassed: false, assumedPassed: false, totalSum: false, showInTranscript: false, keepAfterRetake: false },
  { code: '10', title: 'نمره گزارش نشده', status: 'TEMPORARY', gpa: false, unitPassed: false, assumedPassed: false, totalSum: true, showInTranscript: false, keepAfterRetake: false },
  { code: '11', title: 'جبرانی- بااحتساب درمعدل', status: 'FINALIZED', gpa: true, unitPassed: true, assumedPassed: true, totalSum: true, showInTranscript: false, keepAfterRetake: true },
  { code: '12', title: 'جبرانی بدون احتساب در معدل-قبول', status: 'PASSED_NO_GRADE', gpa: false, unitPassed: true, assumedPassed: true, totalSum: true, showInTranscript: false, keepAfterRetake: false },
  { code: '13', title: 'ناتمام', status: 'TEMPORARY', gpa: false, unitPassed: false, assumedPassed: false, totalSum: true, showInTranscript: false, keepAfterRetake: false },
  { code: '14', title: 'حذف پزشکی', status: 'DROPPED', gpa: false, unitPassed: false, assumedPassed: false, totalSum: true, showInTranscript: false, keepAfterRetake: false },
  { code: '15', title: 'حذف‌ترم بااحتساب', status: 'DROPPED', gpa: false, unitPassed: false, assumedPassed: false, totalSum: true, showInTranscript: false, keepAfterRetake: false },
  { code: '16', title: 'در معادل سازی پذیرفته شده بدون احتساب معدل', status: 'EXEMPT', gpa: false, unitPassed: false, assumedPassed: false, totalSum: false, showInTranscript: false, keepAfterRetake: false },
  { code: '17', title: 'درمعادل‌سازی‌پذیرفته‌شده‌جزواحدبدون‌احتسابمعدل', status: 'EXEMPT', gpa: false, unitPassed: true, assumedPassed: true, totalSum: true, showInTranscript: false, keepAfterRetake: true },
  { code: '18', title: 'پایان نامه 941-قبول', status: 'PASSED_NO_GRADE', gpa: false, unitPassed: true, assumedPassed: true, totalSum: true, showInTranscript: false, keepAfterRetake: false },
  { code: '19', title: 'درحال تحقیق', status: 'TEMPORARY', gpa: false, unitPassed: false, assumedPassed: false, totalSum: false, showInTranscript: false, keepAfterRetake: false },
  { code: '20', title: 'بدون تاثیر در معدل ترم و معدل کل', status: 'DROPPED', gpa: false, unitPassed: false, assumedPassed: false, totalSum: false, showInTranscript: false, keepAfterRetake: false },
  { code: '22', title: 'جبرانی بدون احتساب در معدل - مردود', status: 'FAILED_NO_GRADE', gpa: false, unitPassed: false, assumedPassed: false, totalSum: false, showInTranscript: false, keepAfterRetake: false },
  { code: '23', title: 'پیش نیاز-قبول موثر در نیمسال', status: 'PASSED_NO_GRADE', gpa: false, unitPassed: true, assumedPassed: true, totalSum: false, showInTranscript: false, keepAfterRetake: true },
  { code: '24', title: 'پیش نیاز -مردود موثر در نیمسال', status: 'FAILED_NO_GRADE', gpa: false, unitPassed: false, assumedPassed: false, totalSum: false, showInTranscript: false, keepAfterRetake: false },
  { code: '27', title: 'رساله دکتری', status: 'PASSED_NO_GRADE', gpa: true, unitPassed: true, assumedPassed: true, totalSum: true, showInTranscript: false, keepAfterRetake: true },
  { code: '28', title: 'بدون احتساب در معدل', status: 'DROPPED', gpa: false, unitPassed: false, assumedPassed: false, totalSum: true, showInTranscript: false, keepAfterRetake: false },
  { code: '29', title: 'دروس‌کمبودبدون‌احتساب‌درمعدل', status: 'DROPPED', gpa: false, unitPassed: false, assumedPassed: false, totalSum: true, showInTranscript: false, keepAfterRetake: false },
  { code: '32', title: 'جبرانی-معادلسازی', status: 'EXEMPT', gpa: false, unitPassed: true, assumedPassed: true, totalSum: true, showInTranscript: false, keepAfterRetake: false },
  { code: '40', title: 'معرفی به استاد', status: 'PASSED_NO_GRADE', gpa: true, unitPassed: true, assumedPassed: true, totalSum: true, showInTranscript: false, keepAfterRetake: true },
  { code: '50', title: 'خودخوان - قبول', status: 'PASSED_NO_GRADE', gpa: true, unitPassed: true, assumedPassed: true, totalSum: true, showInTranscript: false, keepAfterRetake: true },
  { code: '51', title: 'خودخوان - مردود', status: 'FAILED_NO_GRADE', gpa: true, unitPassed: false, assumedPassed: false, totalSum: true, showInTranscript: false, keepAfterRetake: false },
  { code: '52', title: 'تخلف در امتحان', status: 'DROPPED', gpa: false, unitPassed: false, assumedPassed: false, totalSum: false, showInTranscript: false, keepAfterRetake: false },
  { code: '53', title: 'دروس‌خودخوان _قبول(جبرانی‌بدون‌احتساب‌درمعدل)', status: 'PASSED_NO_GRADE', gpa: false, unitPassed: false, assumedPassed: false, totalSum: false, showInTranscript: false, keepAfterRetake: false },
  { code: '54', title: 'فوت', status: 'PASSED_NO_GRADE', gpa: true, unitPassed: true, assumedPassed: true, totalSum: true, showInTranscript: false, keepAfterRetake: true },
  { code: '55', title: 'حذف توسط کمیته انضباطی', status: 'DROPPED', gpa: false, unitPassed: false, assumedPassed: false, totalSum: false, showInTranscript: false, keepAfterRetake: false },
  { code: '200', title: 'حذف آیین نامه ای ماده 23', status: 'DROPPED', gpa: false, unitPassed: true, assumedPassed: false, totalSum: false, showInTranscript: false, keepAfterRetake: false },
  { code: '201', title: 'حذف بدلیل مرودی درترم های قبل', status: 'DROPPED', gpa: false, unitPassed: true, assumedPassed: false, totalSum: false, showInTranscript: false, keepAfterRetake: false },
  { code: '300', title: 'غیبت غیر موجه بیش از حددر کلاس', status: 'DROPPED', gpa: false, unitPassed: false, assumedPassed: false, totalSum: false, showInTranscript: false, keepAfterRetake: false },
  { code: '931', title: 'حذف آیین نامه 93 (کاردانی _ کارشناسی)', status: 'DROPPED', gpa: false, unitPassed: false, assumedPassed: false, totalSum: true, showInTranscript: false, keepAfterRetake: false },
  { code: '941', title: 'حذف آیین نامه 94 (کارشناسی ارشد)', status: 'DROPPED', gpa: false, unitPassed: false, assumedPassed: false, totalSum: true, showInTranscript: false, keepAfterRetake: false },
  { code: '951', title: 'حذف آیین نامه 95 (دکترا)', status: 'DROPPED', gpa: false, unitPassed: false, assumedPassed: false, totalSum: true, showInTranscript: false, keepAfterRetake: false },
];

/** وضعیت‌های داخلی سامانهٔ جدید که در سیستم قدیمی کد عددی ندارند */
const INTERNAL_CODES: { code: string; status: string; title: string }[] = [
  { code: 'N1', status: 'DRAFT', title: 'پیش‌نویس' },
  { code: 'N2', status: 'APPEALED', title: 'اعتراض' },
  // «حذف» در سیستم قدیمی یک کد واحد ندارد (حذف اضطراری/پزشکی/شورا/آیین‌نامه‌ای/…)؛
  // پس برای رکورد حذف‌شدهٔ samانهٔ جدید کد قدیمیِ دلخواه جعل نمی‌کنیم.
  { code: 'N3', status: 'DROPPED', title: 'حذف‌شده' },
];

/** برچسب فارسی وضعیت‌های داخلی (برای fallback وقتی کد ناشناخته است) */
export const INTERNAL_STATUS_FA: Record<string, string> = {
  FINALIZED: 'نهایی',
  TEMPORARY: 'موقت',
  DRAFT: 'پیش‌نویس',
  APPEALED: 'اعتراض',
  PENDING: 'ثبت‌نشده',
  EXEMPT: 'معاف',
  PASSED_NO_GRADE: 'قبول بدون نمره',
  FAILED_NO_GRADE: 'مردود بدون نمره',
  DROPPED: 'حذف‌شده',
};

export type GradeStatusCodeDef = {
  /** کدی که در ستون «وضع» کارنامه چاپ می‌شود */
  code: string;
  /** عنوان (راهنمای پایین کارنامه) */
  title: string;
  /** وضعیت داخلی سامانه (enrollments.gradeStatus / legacy_grades.gradeStatus) */
  status: string;
  origin: GradeStatusOrigin;
  /** پرچم‌های اثر (فقط کدهای قدیمی) */
  flags?: Omit<LegacyCodeRow, 'code' | 'title' | 'status'>;
};

/** فهرست تخت همهٔ کدها (قدیمی + داخلی) */
export const GRADE_STATUS_CODES: GradeStatusCodeDef[] = [
  ...LEGACY_ROWS.map(r => ({
    code: r.code, title: r.title, status: r.status, origin: 'LEGACY' as const,
    flags: {
      gpa: r.gpa, unitPassed: r.unitPassed, assumedPassed: r.assumedPassed,
      totalSum: r.totalSum, showInTranscript: r.showInTranscript, keepAfterRetake: r.keepAfterRetake,
    },
  })),
  ...INTERNAL_CODES.map(c => ({ code: c.code, title: c.title, status: c.status, origin: 'INTERNAL' as const })),
];

/** کد → عنوان */
export const GRADE_STATUS_CODE_TITLE: Record<string, string> = Object.fromEntries(
  GRADE_STATUS_CODES.map(c => [c.code, c.title]),
);

/** کد → وضعیت داخلی */
export const GRADE_STATUS_CODE_STATUS: Record<string, string> = Object.fromEntries(
  GRADE_STATUS_CODES.map(c => [c.code, c.status]),
);

/** کد → پرچم‌های اثر (برای گزارش‌ها و موتور آیین‌نامه) */
export const GRADE_STATUS_FLAGS: Record<string, NonNullable<GradeStatusCodeDef['flags']>> = Object.fromEntries(
  LEGACY_ROWS.map(r => [r.code, {
    gpa: r.gpa, unitPassed: r.unitPassed, assumedPassed: r.assumedPassed,
    totalSum: r.totalSum, showInTranscript: r.showInTranscript, keepAfterRetake: r.keepAfterRetake,
  }]),
);

/**
 * کد مرجع هر وضعیت داخلی — *آگاهانه* انتخاب شده، نه «اولین کد دسته».
 *
 * فقط وضعیتی کد قدیمی می‌گیرد که معنای آن کد در فایل مرجع دقیقاً همان باشد؛
 * وگرنه کد داخلی (N*) می‌گیرد تا برای رکورد جدید، کد قدیمیِ بی‌ربط جعل نشود.
 * نمونه: DROPPED در قدیم یک کد واحد ندارد (حذف اضطراری/پزشکی/شورا/آیین‌نامه‌ای)
 * پس کد قدیمی نمی‌گیرد.
 */
export const CANONICAL_CODE_BY_STATUS: Record<string, string> = {
  FINALIZED: '1',        // درس عادی - قبول
  FAILED_NO_GRADE: '2',  // درس عادی - مردود
  EXEMPT: '3',           // در معادل‌سازی پذیرفته شده با احتساب در معدل کل
  TEMPORARY: '10',       // نمره گزارش نشده
  PASSED_NO_GRADE: '12', // جبرانی بدون احتساب در معدل - قبول
  PENDING: '0',          // نامشخص
  DRAFT: 'N1',
  APPEALED: 'N2',
  DROPPED: 'N3',
};

/**
 * کدی که باید در ستون «وضع» چاپ شود.
 * اولویت با کد واقعی سیستم قدیمی است (همان markStat فایل نمرات)؛ اگر ردیف
 * در سامانهٔ جدید ثبت شده و کد قدیمی ندارد، کد مرجعِ وضعیت داخلی می‌آید.
 */
export function gradeStatusCodeOf(
  internalStatus: string | null | undefined,
  legacyCode?: string | null,
): string {
  const legacy = String(legacyCode ?? '').trim();
  if (legacy) return legacy;
  const st = String(internalStatus ?? '').trim();
  return CANONICAL_CODE_BY_STATUS[st] ?? '';
}

/** عنوان یک کد: عنوان میز تطبیق (اگر داده شود) ← عنوان مرجع ← برچسب وضعیت ← خود کد */
export function gradeStatusCodeTitle(
  code: string | null | undefined,
  internalStatus?: string | null,
  mappedTitle?: string | null,
): string {
  const c = String(code ?? '').trim();
  const mapped = String(mappedTitle ?? '').trim();
  if (mapped) return mapped;
  if (c && GRADE_STATUS_CODE_TITLE[c]) return GRADE_STATUS_CODE_TITLE[c];
  const st = String(internalStatus ?? '').trim();
  if (st && INTERNAL_STATUS_FA[st]) return INTERNAL_STATUS_FA[st];
  if (c) return c;
  return st ? (INTERNAL_STATUS_FA[st] ?? st) : 'نامشخص';
}

export type GradeStatusLegendEntry = { title: string; codes: string[] };

/** ترتیب راهنما: کدهای عددی صعودی (منفی‌ها آخر)، سپس کدهای داخلی */
function codeRank(code: string): number {
  const n = Number(code);
  if (!Number.isFinite(n)) return Number.MAX_SAFE_INTEGER;
  return n < 0 ? 1e9 + n : n;
}

/**
 * راهنمای پایین کارنامه: کدهای استفاده‌شده، گروه‌شده بر اساس عنوان.
 * کدهایی که عنوان یکسانی دارند در یک ردیف می‌آیند تا راهنما کوتاه بماند.
 */
export function gradeStatusLegend(
  codes: Iterable<string | null | undefined>,
  titleOf?: (code: string) => string | null | undefined,
): GradeStatusLegendEntry[] {
  const byTitle = new Map<string, string[]>();
  for (const raw of codes) {
    const code = String(raw ?? '').trim();
    if (!code) continue;
    const title = gradeStatusCodeTitle(code, GRADE_STATUS_CODE_STATUS[code], titleOf?.(code));
    const list = byTitle.get(title);
    if (list) { if (!list.includes(code)) list.push(code); }
    else byTitle.set(title, [code]);
  }
  return [...byTitle.entries()]
    .map(([title, list]) => ({ title, codes: [...list].sort((a, b) => codeRank(a) - codeRank(b)) }))
    .sort((a, b) => codeRank(a.codes[0]) - codeRank(b.codes[0]));
}

/**
 * راهنمای تک‌خطی پایین کارنامه — تا سند طولانی نشود:
 *   «۱=درس عادی - قبول، ۲=درس عادی - مردود، ۱۰=نمره گزارش نشده»
 * کدهایی که عنوان یکسانی دارند با «/» کنار هم می‌نشینند.
 */
export function gradeStatusLegendLine(
  codes: Iterable<string | null | undefined>,
  titleOf?: (code: string) => string | null | undefined,
  prefix = 'راهنمای کد وضعیت نمره: ',
): string {
  const groups = gradeStatusLegend(codes, titleOf);
  if (!groups.length) return '';
  return prefix + groups.map(g => `${g.codes.join('/')}=${g.title}`).join('، ');
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  کد وضع نمرهٔ وابسته به درس (قبولی / مردودی)
 * ═══════════════════════════════════════════════════════════════════════
 *  وضع نمره به *درس* وابسته است: در تعریف درس سیستم قدیمی دو فیلد «وضع نمره
 *  در صورت قبولی» و «در صورت مردودی» وجود دارد، چون درس جبرانیِ بدون احتساب
 *  در معدل کد ۱۲/۲۲ می‌گیرد و نه ۱/۲. این دو تابع خالص‌اند (بدون DB) تا هم
 *  سمت سرور هنگام قفل نمرات و هم در تست واحد استفاده شوند.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type OutcomeCodeConfig = {
  passGradeStatusCodeId: number | null;
  failGradeStatusCodeId: number | null;
};

/**
 * کد وضع نمره برای یک نتیجهٔ قبول/رد.
 *
 * اولویت: کد تنظیم‌شدهٔ خودِ درس؛ در نبود آن، کد مرجعِ «درس عادی» (۱ یا ۲).
 * `ids` نگاشت کد → شناسهٔ ردیف جدول مرجع است.
 */
export function outcomeGradeStatusCodeId(
  passed: boolean,
  cfg: OutcomeCodeConfig | null | undefined,
  ids: Record<string, number | null>,
): number | null {
  const explicit = passed ? cfg?.passGradeStatusCodeId : cfg?.failGradeStatusCodeId;
  if (explicit) return explicit;
  return ids[passed ? '1' : '2'] ?? null;
}

/**
 * تعیین قبول/رد یک نمره با همان قاعدهٔ موتور آیین‌نامه:
 * نمرهٔ توصیفی با مقدار ۱ قبول است، عددی با رسیدن به حدنصاب.
 * `null` یعنی نمرهٔ قابل سنجش نیست (خالی/متنی) و نباید کدی بخورد.
 */
export function isGradePassed(
  gradeValue: unknown,
  gradingType: string | null,
  passingGrade: number,
): boolean | null {
  const n = typeof gradeValue === 'number' ? gradeValue : Number(String(gradeValue ?? '').trim());
  if (!Number.isFinite(n) || String(gradeValue ?? '').trim() === '') return null;
  if (gradingType === 'DESCRIPTIVE') return n === 1;
  return n >= passingGrade;
}
