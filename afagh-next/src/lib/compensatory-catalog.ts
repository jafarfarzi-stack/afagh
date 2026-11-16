// ════════════════════════════════════════════════════════════════════════════
//  مدلِ دوگانهٔ کاتالوگ — عادی (NORMAL) و جبرانی (COMPENSATORY)
// ────────────────────────────────────────────────────────────────────────────
//  چرا این فایل وجود دارد:
//  تا پیش از این، درسِ «جبرانی» فقط یک نقش (roleType = COMPENSATORY) داخلِ
//  همان نسخهٔ عادی بود. نتیجهٔ عملی:
//    • جمع واحدِ ترم برای دانشجوی عادی باد می‌کرد و از سقف می‌گذشت؛
//    • موتور آیین‌نامه سقف را به‌اندازهٔ students.compensatoryUnits بالا می‌برد
//      تا همان دروسِ جبرانی جا شوند — یعنی سقف برای چیزی باز می‌شد که نباید
//      در کاتالوگ عادی باشد (دورِ منطقی)؛
//    • کاتالوگ جبرانی مستقل قابل انتشار و نسخه‌بندی نبود.
//
//  این ماژول عمداً Pure است (بدون DB/React/Next) تا کل قانون در CI تست شود:
//    ۱) needsCompensatory  — چه کسی کاتالوگ جبرانی لازم دارد؟
//    ۲) splitCatalogRows   — تفکیک ردیف‌های یک چارت به دو مدل
//    ۳) checkTermCaps      — کدام ترم‌ها از سقف واحد می‌گذرند؟
//    ۴) rebalanceTerms     — الگوریتمِ «سقف ترم» با حفظ شمارهٔ ترم‌ها
//    ۵) packTerms          — چیدمانِ ترتیبی از ترم ۱ (برای کاتالوگ جبرانی)
//    ۶) planCompensatoryCatalog — تولیدکنندهٔ کاتالوگ جبرانی + مدل عادیِ تمیز
//
//  قاعدهٔ سقف (منبع: degree_level_configs.maxUnitsPerTerm → override نسخه):
//  هیچ ترمی نباید از سقف بگذرد. اگر تک‌درسی به‌تنهایی از سقف بزرگ‌تر باشد،
//  آن ترم «قابل اصلاح نیست» و به‌عنوان نقص دادهٔ مبدأ گزارش می‌شود — نه
//  اینکه بی‌صدا رد شود.
// ════════════════════════════════════════════════════════════════════════════

/** نوع کاتالوگ — آینهٔ ستون curriculum_versions.catalogKind */
export const CATALOG_KINDS = ['NORMAL', 'COMPENSATORY'] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];

export const CATALOG_KIND_LABEL: Record<CatalogKind, string> = {
  NORMAL: 'عادی',
  COMPENSATORY: 'جبرانی',
};

/** کد نقشِ جبرانی در curriculum_courses.roleType */
export const COMPENSATORY_ROLE = 'COMPENSATORY';

/** سقف پیش‌فرض وقتی نه override نسخه هست و نه degree_level_configs */
export const DEFAULT_TERM_CAP = 20;

// ───────────────────────────── ابزارهای پایه ─────────────────────────────

const faDigits = (n: number | string | null | undefined): string =>
  String(n ?? '').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

function normRole(role: unknown): string {
  if (role == null) return '';
  return String(role)
    .replace(/[\u200c\u200d\s_-]+/g, '')
    .toUpperCase();
}

const ROLE_FA: Record<string, string> = {
  'پایه': 'CORE',
  'اصلی': 'MAJOR',
  'تخصصی': 'SPECIALIZED',
  'اختیاری': 'ELECTIVE',
  'انتخابی': 'ELECTIVE',
  'عمومی': 'GENERAL',
  'مشترک': 'GENERAL',
  'پایان‌نامه': 'THESIS',
  'پایاننامه': 'THESIS',
  'کارآموزی': 'INTERNSHIP',
  'کارورزی': 'INTERNSHIP',
  'کارگاه': 'WORKSHOP',
  'جبرانی': 'COMPENSATORY',
};

/** نقش را به کد متعارف تبدیل می‌کند (فارسی → کد، و نرمال‌سازی فاصله/نیم‌فاصله) */
export function normalizeRole(role: unknown): string {
  const raw = role == null ? '' : String(role).trim();
  if (!raw) return '';
  const fa = ROLE_FA[raw.replace(/[\u200c\u200d\s]+/g, '')] ?? ROLE_FA[raw];
  if (fa) return fa;
  return normRole(raw);
}

/** آیا این ردیف، درسِ جبرانی است؟ */
export function isCompensatoryRole(role: unknown): boolean {
  return normalizeRole(role) === COMPENSATORY_ROLE;
}

/**
 * آیا این دانشجو به کاتالوگ جبرانی نیاز دارد؟
 *
 * منبع حقیقت `students.compensatoryUnits` است (تعداد واحدِ کسری که باید
 * جبران شود). `students.needsCompensatory` فقط آینهٔ قابلِ کوئریِ همین است
 * و با تریگر هم‌گام می‌ماند؛ اینجا هر دو پذیرفته می‌شوند تا اگر یکی از دو
 * مسیر در دسترس نبود، نتیجه عوض نشود.
 */
export function needsCompensatory(
  student: { compensatoryUnits?: number | string | null; needsCompensatory?: boolean | number | null } | null | undefined
): boolean {
  if (!student) return false;
  const units = Number(student.compensatoryUnits ?? 0);
  if (Number.isFinite(units) && units > 0) return true;
  const flag = student.needsCompensatory;
  return flag === true || flag === 1;
}

/** «1404» → «1404-C» · «1404-R1» → «1404-R1-C» · اگر از قبل -C دارد، همان */
export function compensatoryVersionCode(baseCode: string): string {
  const b = String(baseCode ?? '').trim();
  if (!b) throw new Error('کد نسخهٔ پایه نمی‌تواند خالی باشد');
  if (/-C$/.test(b)) return b;
  // طول ستون versionCode = 20؛ با پیشوند -C هم باید جا شود.
  return (b.length > 18 ? b.slice(0, 18) : b) + '-C';
}

// ───────────────────────────── ردیف کاتالوگ ─────────────────────────────

/** حداقلِ شکلِ یک ردیف چارت که این ماژول به آن نیاز دارد */
export interface CatalogRow {
  courseCode: string;
  /** NULL = از courses.units خوانده شود (اینجا ۰ حساب می‌شود و هشدار می‌گیرد) */
  units: number | null;
  roleType: string | null;
  /** ۱..۸ و ۹=تابستان؛ NULL = بدون ترم‌بندی */
  recommendedSemester: number | null;
  isRequired?: number | boolean | null;
  title?: string | null;
}

function rowUnits(row: CatalogRow): number {
  const u = Number(row.units ?? 0);
  return Number.isFinite(u) && u > 0 ? u : 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ─────────────────────── تفکیک دو مدل از یک چارت ───────────────────────

export interface SplitResult {
  normal: CatalogRow[];
  compensatory: CatalogRow[];
  /** ردیف‌هایی که نه نقش دارند و نه واحد — برای گزارش، نه حذف */
  suspicious: CatalogRow[];
}

/**
 * یک چارتِ خام را به دو مدل تفکیک می‌کند.
 *
 * ⚠ ردیف‌های بی‌نقش حذف نمی‌شوند: در ورود، نقشِ خالی به CORE تبدیل می‌شود
 *   و حذفِ بی‌صدای آن‌ها سابقهٔ چارت را تغییر می‌داد.
 */
export function splitCatalogRows(rows: readonly CatalogRow[]): SplitResult {
  const normal: CatalogRow[] = [];
  const compensatory: CatalogRow[] = [];
  const suspicious: CatalogRow[] = [];
  for (const r of rows) {
    if (!r || !r.courseCode) continue;
    if (isCompensatoryRole(r.roleType)) compensatory.push(r);
    else normal.push(r);
    if (!normalizeRole(r.roleType) && rowUnits(r) === 0) suspicious.push(r);
  }
  return { normal, compensatory, suspicious };
}

// ───────────────────────────── سقف واحد ترم ─────────────────────────────

export interface TermBucket {
  term: number;
  units: number;
  courses: number;
  rows: CatalogRow[];
}

/** جمع واحد هر ترم — فقط ردیف‌های ترم‌بندی‌شده (بدون ترم در هیچ ترمی نمی‌نشیند) */
export function termBuckets(rows: readonly CatalogRow[]): Map<number, TermBucket> {
  const m = new Map<number, TermBucket>();
  for (const r of rows) {
    const t = r.recommendedSemester;
    if (t == null || !Number.isFinite(Number(t))) continue;
    const term = Number(t);
    const b = m.get(term) ?? { term, units: 0, courses: 0, rows: [] };
    b.units = round1(b.units + rowUnits(r));
    b.courses += 1;
    b.rows.push(r);
    m.set(term, b);
  }
  return m;
}

/** اولویت جابه‌جایی: عدد کمتر = زودتر منتقل می‌شود. بدون اولویت = جابه‌جانشدنی. */
const MOVABLE_PRIORITY: Record<string, number> = {
  COMPENSATORY: 0,
  ELECTIVE: 1,
  WORKSHOP: 2,
};

function movePriority(row: CatalogRow): number | null {
  const role = normalizeRole(row.roleType);
  const p = MOVABLE_PRIORITY[role];
  return p == null ? null : p;
}

export interface TermCapViolation {
  term: number;
  units: number;
  cap: number;
  excess: number;
  courses: number;
  /** واحدی که با جابه‌جایی ردیف‌های متحرک آزاد می‌شود */
  movableUnits: number;
  /** آیا حتی با جابه‌جایی همهٔ ردیف‌های متحرک هم زیر سقف نمی‌آید؟ */
  unfixable: boolean;
  /** کد دروسی که به‌تنهایی بزرگ‌تر از سقف‌اند (نقص دادهٔ مبدأ) */
  oversized: string[];
  rows: CatalogRow[];
}

/** کدام ترم‌ها از سقف می‌گذرند؟ (خروجی پایدار: مرتب بر اساس شمارهٔ ترم) */
export function checkTermCaps(rows: readonly CatalogRow[], cap: number): TermCapViolation[] {
  const limit = Number(cap) > 0 ? Number(cap) : DEFAULT_TERM_CAP;
  const out: TermCapViolation[] = [];
  for (const b of [...termBuckets(rows).values()].sort((a, c) => a.term - c.term)) {
    if (b.units <= limit) continue;
    const movableUnits = round1(
      b.rows.reduce((s, r) => (movePriority(r) == null ? s : s + rowUnits(r)), 0)
    );
    const oversized = b.rows.filter((r) => rowUnits(r) > limit).map((r) => r.courseCode);
    out.push({
      term: b.term,
      units: b.units,
      cap: limit,
      excess: round1(b.units - limit),
      courses: b.courses,
      movableUnits,
      unfixable: round1(b.units - movableUnits) > limit,
      oversized,
      rows: b.rows,
    });
  }
  return out;
}

export interface TermMove {
  courseCode: string;
  from: number;
  to: number;
  units: number;
  role: string;
  reason: string;
}

export interface RebalanceResult {
  rows: CatalogRow[];
  moves: TermMove[];
  /** ترم‌هایی که پس از جابه‌جایی هنوز بالای سقف‌اند (نقص دادهٔ مبدأ) */
  remaining: TermCapViolation[];
  /** ترم‌هایی که برای جا دادن ردیف‌های منتقل‌شده ساخته شدند */
  createdTerms: number[];
}

/**
 * الگوریتمِ «سقف واحد ترم» با **حفظ شمارهٔ ترم‌ها**.
 *
 * چرا حفظ شماره: شمارهٔ ترم بخشی از چارتِ مصوب است؛ بازشماره‌گذاری کل چارت
 * یعنی تغییرِ برنامهٔ درسی، که نیاز به تأیید شورا دارد. پس فقط ردیف‌هایی که
 * «جابه‌جانشدنشان بی‌خطر است» (جبرانی → اختیاری → کارگاه) به ترمی با ظرفیت
 * منتقل می‌شوند.
 *
 * ترتیب جابه‌جایی: نقش (اولویت پایین‌تر = متحرک‌تر) → واحد بیشتر → کد درس
 * (قطعی و قابل بازتولید؛ همان ورودی همیشه همان خروجی).
 */
export function rebalanceTerms(
  rows: readonly CatalogRow[],
  cap: number,
  opts: { allowNewTerms?: boolean } = {}
): RebalanceResult {
  const limit = Number(cap) > 0 ? Number(cap) : DEFAULT_TERM_CAP;
  const allowNewTerms = opts.allowNewTerms !== false;

  // کپی سطحی تا ورودی دست‌نخورده بماند
  const out: CatalogRow[] = rows.map((r) => ({ ...r }));
  const moves: TermMove[] = [];
  const createdTerms: number[] = [];

  const buckets = () => termBuckets(out);
  let guard = 0;
  const GUARD_MAX = 10_000;

  for (;;) {
    if (++guard > GUARD_MAX) break;
    const over = [...buckets().values()]
      .filter((b) => b.units > limit)
      .sort((a, b) => a.term - b.term)[0];
    if (!over) break;

    // نامزدهای جابه‌جایی در همین ترم
    const candidates = over.rows
      .filter((r) => movePriority(r) != null)
      .sort((a, b) => {
        const pa = movePriority(a) as number;
        const pb = movePriority(b) as number;
        if (pa !== pb) return pa - pb;
        const ua = rowUnits(a);
        const ub = rowUnits(b);
        if (ua !== ub) return ub - ua; // بزرگ‌تر اول: ظرفیت سریع‌تر آزاد می‌شود
        return String(a.courseCode).localeCompare(String(b.courseCode), 'en');
      });

    if (candidates.length === 0) break; // جابه‌جانشدنی — به remaining می‌رود

    const snap = buckets();
    const need = round1(over.units - limit);
    let movedAny = false;

    for (const cand of candidates) {
      const u = rowUnits(cand);
      if (u <= 0) continue;
      // ظرفیت آزادِ ترم‌های بعدی (به ترتیب شمارهٔ ترم)
      const targets = [...snap.values()]
        .filter((b) => b.term > over.term && round1(b.units + u) <= limit)
        .sort((a, b) => a.term - b.term);
      let target: number | null = targets[0]?.term ?? null;

      if (target == null && allowNewTerms) {
        const maxTerm = Math.max(...[...snap.keys()], over.term);
        target = maxTerm + 1;
        createdTerms.push(target);
      }
      if (target == null) continue;

      // جابه‌جایی روی آرایهٔ خروجی
      const idx = out.indexOf(cand);
      if (idx < 0) continue;
      const from = Number(cand.recommendedSemester);
      out[idx] = { ...out[idx], recommendedSemester: target };
      moves.push({
        courseCode: cand.courseCode,
        from,
        to: target,
        units: u,
        role: normalizeRole(cand.roleType) || 'CORE',
        reason: `ترم ${faDigits(from)} با ${faDigits(over.units)} واحد از سقف ${faDigits(limit)} گذشته بود`,
      });

      // بازسازی snapshot تا ظرفیت ترم مقصد در گام بعد لحاظ شود
      const dest = snap.get(target);
      if (dest) {
        dest.units = round1(dest.units + u);
        dest.courses += 1;
      } else {
        // ترم تازه‌ساخته‌شده هنوز در snapshot نیست
        snap.set(target, { term: target, units: u, courses: 1, rows: [] });
      }
      const srcBucket = snap.get(over.term);
      if (srcBucket) {
        srcBucket.units = round1(srcBucket.units - u);
        srcBucket.courses -= 1;
      }
      movedAny = true;
      if (round1(snap.get(over.term)!.units) <= limit) break;
      void need;
    }

    if (!movedAny) break; // چیزی جابه‌جا نشد → جلوگیری از حلقهٔ بی‌پایان
  }

  return {
    rows: out,
    moves,
    remaining: checkTermCaps(out, limit),
    createdTerms: [...new Set(createdTerms)].sort((a, b) => a - b),
  };
}

export interface PackResult {
  rows: CatalogRow[];
  warnings: string[];
  terms: number;
}

/**
 * چیدمانِ ترتیبی از ترم ۱ با رعایت سقف — برای **کاتالوگ جبرانی**.
 *
 * کاتالوگ جبرانی، برنامهٔ مستقلِ یک دانشجوی انتقالی/کسری است؛ شمارهٔ ترمِ
 * چارت مبدأ برایش معنا ندارد (آن دانشجو ترم ۱ خودش را از نو شروع می‌کند).
 * پس ترتیب نسبیِ دروس حفظ می‌شود و ترم‌ها از ۱ تا N پر می‌شوند، به‌شرطی که
 * جمعِ واحدِ هیچ ترمی از سقف نگذرد.
 */
export function packTerms(rows: readonly CatalogRow[], cap: number): PackResult {
  const limit = Number(cap) > 0 ? Number(cap) : DEFAULT_TERM_CAP;
  const warnings: string[] = [];

  const indexed = rows.map((r, i) => ({ r, i }));
  indexed.sort((a, b) => {
    const sa = a.r.recommendedSemester ?? Number.POSITIVE_INFINITY;
    const sb = b.r.recommendedSemester ?? Number.POSITIVE_INFINITY;
    if (sa !== sb) return Number(sa) - Number(sb);
    return a.i - b.i;
  });

  const out: CatalogRow[] = [];
  let term = 1;
  let used = 0;
  for (const { r } of indexed) {
    const u = rowUnits(r);
    if (u > limit) {
      // تک‌درسِ بزرگ‌تر از سقف: تنها در یک ترم می‌نشیند و گزارش می‌شود
      if (used > 0) { term += 1; used = 0; }
      out.push({ ...r, recommendedSemester: term });
      warnings.push(
        `درس ${r.courseCode} به‌تنهایی ${faDigits(u)} واحد است و از سقف ${faDigits(limit)} واحدِ ترم می‌گذرد — نقص دادهٔ مبدأ.`
      );
      term += 1;
      used = 0;
      continue;
    }
    if (used + u > limit) { term += 1; used = 0; }
    out.push({ ...r, recommendedSemester: term });
    used = round1(used + u);
  }

  const noUnits = out.filter((r) => rowUnits(r) === 0).map((r) => r.courseCode);
  if (noUnits.length) {
    warnings.push(
      `${faDigits(noUnits.length)} درس بدون واحدِ معلوم در کاتالوگ جبرانی: ${noUnits.slice(0, 12).join('، ')}` +
        (noUnits.length > 12 ? ' …' : '') +
        ' — واحد این دروس در بانک دروس تعریف نشده است.'
    );
  }

  return { rows: out, warnings, terms: Math.max(0, ...out.map((r) => Number(r.recommendedSemester ?? 0))) };
}

// ─────────────────── تولیدکنندهٔ کاتالوگ جبرانی (Plan) ───────────────────

export interface CatalogModelSummary {
  kind: CatalogKind;
  versionCode: string;
  title: string;
  rows: CatalogRow[];
  totalCourses: number;
  totalUnits: number;
  /** جمع واحد به تفکیک نقش — همان ساختار minRoleUnits */
  byRole: Record<string, number>;
  terms: { term: number; units: number; courses: number }[];
  /** ترم‌های بالای سقف که پس از الگوریتم هم باقی مانده‌اند (نقص دادهٔ مبدأ) */
  violations: TermCapViolation[];
  moves: TermMove[];
  warnings: string[];
}

export interface CompensatoryPlanInput {
  rows: readonly CatalogRow[];
  /** سقف واحد هر ترم (override نسخه → degree_level_configs → ۲۰) */
  cap: number;
  versionCode: string;
  title: string;
  /** اگر true، کاتالوگ جبرانی فقط شامل دروسِ COMPENSATORY است (پیش‌فرض) */
  includeOnlyCompensatory?: boolean;
}

export interface CompensatoryPlan {
  normal: CatalogModelSummary;
  compensatory: CatalogModelSummary | null;
  /** آیا برای این چارت اصلاً درس جبرانی وجود دارد؟ */
  hasCompensatory: boolean;
  /** آیا دو مدل از هم جدا شده‌اند (کاتالوگ جبرانی مستقل ساخته شد)؟ */
  split: boolean;
  warnings: string[];
}

function summarize(
  kind: CatalogKind,
  versionCode: string,
  title: string,
  rows: CatalogRow[],
  moves: TermMove[],
  warnings: string[]
): CatalogModelSummary {
  const byRole: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    const role = normalizeRole(r.roleType) || 'CORE';
    const u = rowUnits(r);
    if (u <= 0) continue;
    byRole[role] = round1((byRole[role] ?? 0) + u);
    total = round1(total + u);
  }
  const buckets = termBuckets(rows);
  return {
    kind,
    versionCode,
    title,
    rows,
    totalCourses: rows.length,
    totalUnits: total,
    byRole,
    terms: [...buckets.values()]
      .sort((a, b) => a.term - b.term)
      .map((b) => ({ term: b.term, units: b.units, courses: b.courses })),
    violations: [], // بعد از محاسبهٔ نهایی پر می‌شود
    moves,
    warnings,
  };
}

/**
 * تولیدکنندهٔ کاتالوگ جبرانی از یک چارتِ خام.
 *
 * خروجی، **دو مدلِ مستقل** است:
 *   • normal       — چارت عادی بدون هیچ درس جبرانی، با ترم‌های تنظیم‌شده روی سقف
 *   • compensatory — فقط دروس جبرانی، از ترم ۱ و با رعایت سقف
 *
 * این همان چیزی است که در کد نبود: کاتالوگ جبرانی به‌عنوان موجودیتِ مستقلِ
 * قابل انتشار، نه چند ردیفِ COMPENSATORY چسبیده به چارت عادی.
 */
export function planCompensatoryCatalog(input: CompensatoryPlanInput): CompensatoryPlan {
  const cap = Number(input.cap) > 0 ? Number(input.cap) : DEFAULT_TERM_CAP;
  const baseCode = String(input.versionCode ?? '').trim();
  if (!baseCode) throw new Error('کد نسخه برای تولید کاتالوگ الزامی است');

  const { normal, compensatory, suspicious } = splitCatalogRows(input.rows);
  const warnings: string[] = [];

  if (suspicious.length) {
    warnings.push(
      `${faDigits(suspicious.length)} ردیف هم نقش ندارد و هم واحدِ معلوم — به‌عنوان «پایه» در مدل عادی می‌نشیند.`
    );
  }

  // ── مدل عادی: حذف جبرانی + تنظیم ترم‌ها روی سقف ──
  const normalReb = rebalanceTerms(normal, cap);
  const normalSummary = summarize(
    'NORMAL',
    baseCode,
    input.title,
    normalReb.rows,
    normalReb.moves,
    []
  );
  normalSummary.violations = normalReb.remaining;

  if (normalReb.moves.length) {
    warnings.push(
      `در مدل عادی ${faDigits(normalReb.moves.length)} درس جابه‌جا شد تا جمع واحد هیچ ترمی از ${faDigits(cap)} واحد نگذرد.`
    );
  }
  if (normalReb.createdTerms.length) {
    warnings.push(
      `برای جا دادن دروس جابه‌جاشده، ترم(های) ${normalReb.createdTerms.map(faDigits).join('، ')} ساخته شد.`
    );
  }
  if (normalReb.remaining.length) {
    warnings.push(
      `${faDigits(normalReb.remaining.length)} ترم حتی پس از جابه‌جایی هم بالای سقف ماند — نقص دادهٔ مبدأ (تک‌درسِ بزرگ‌تر از سقف یا ترمِ کاملاً غیرقابل‌جابه‌جایی).`
    );
  }

  // ── مدل جبرانی ──
  let compSummary: CatalogModelSummary | null = null;
  if (compensatory.length) {
    const packed = packTerms(compensatory, cap);
    compSummary = summarize(
      'COMPENSATORY',
      compensatoryVersionCode(baseCode),
      `کاتالوگ جبرانی — ${input.title}`,
      packed.rows,
      [],
      packed.warnings
    );
    compSummary.violations = checkTermCaps(packed.rows, cap);
  }

  return {
    normal: normalSummary,
    compensatory: compSummary,
    hasCompensatory: compensatory.length > 0,
    split: compSummary != null,
    warnings,
  };
}

// ───────────────────────────── اعتبارسنجی نهایی ─────────────────────────────

export interface PlanIssue {
  severity: 'ERROR' | 'WARN';
  code: string;
  message: string;
}

/**
 * بررسی نهاییِ یک Plan پیش از نوشتن در DB:
 *  • هیچ ترمی بالای سقف نماند (ERROR اگر تک‌درسِ بزرگ‌تر از سقف باشد، وگرنه WARN)
 *  • کاتالوگ جبرانی نباید درسِ غیرجبرانی داشته باشد
 *  • مدل عادی نباید درسِ جبرانی داشته باشد
 *  • جمع واحد هر مدل باید با جمع byRole بخواند
 */
export function validatePlan(plan: CompensatoryPlan, cap: number): PlanIssue[] {
  const limit = Number(cap) > 0 ? Number(cap) : DEFAULT_TERM_CAP;
  const issues: PlanIssue[] = [];

  for (const model of [plan.normal, plan.compensatory]) {
    if (!model) continue;
    for (const v of model.violations) {
      const isOversized = v.oversized.length > 0;
      issues.push({
        severity: isOversized ? 'ERROR' : 'WARN',
        code: isOversized ? 'TERM_CAP_OVERSIZED_COURSE' : 'TERM_CAP_EXCEEDED',
        message:
          `${CATALOG_KIND_LABEL[model.kind]}: ترم ${faDigits(v.term)} با ${faDigits(v.units)} واحد ` +
          `از سقف ${faDigits(limit)} واحد گذشته است` +
          (isOversized ? ` — درس(های) بزرگ‌تر از سقف: ${v.oversized.join('، ')}` : '') +
          '.',
      });
    }
    const sumRoles = round1(Object.values(model.byRole).reduce((a, b) => a + b, 0));
    if (sumRoles !== model.totalUnits) {
      issues.push({
        severity: 'ERROR',
        code: 'UNITS_MISMATCH',
        message: `${CATALOG_KIND_LABEL[model.kind]}: جمع واحد (${faDigits(model.totalUnits)}) با جمع نقش‌ها (${faDigits(sumRoles)}) نمی‌خواند.`,
      });
    }
  }

  const compLeak = plan.normal.rows.filter((r) => isCompensatoryRole(r.roleType));
  if (compLeak.length) {
    issues.push({
      severity: 'ERROR',
      code: 'COMPENSATORY_LEAK_IN_NORMAL',
      message: `مدل عادی ${faDigits(compLeak.length)} درس جبرانی دارد (${compLeak.slice(0, 8).map((r) => r.courseCode).join('، ')}).`,
    });
  }

  if (plan.compensatory) {
    const wrong = plan.compensatory.rows.filter((r) => !isCompensatoryRole(r.roleType));
    if (wrong.length) {
      issues.push({
        severity: 'ERROR',
        code: 'NON_COMPENSATORY_IN_COMPENSATORY',
        message: `کاتالوگ جبرانی ${faDigits(wrong.length)} درسِ غیرجبرانی دارد (${wrong.slice(0, 8).map((r) => r.courseCode).join('، ')}).`,
      });
    }
  }

  return issues;
}
