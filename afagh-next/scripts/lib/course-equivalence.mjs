/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  منطق خالص ابزار بازبینی انسانی «معادل‌سازی درس بین دانشگاه آفاق و ۴ دانشگاه محلی»
 *
 *  قاعدهٔ طلایی این ماژول: **هرگز بین چند نامزد، بی‌صدا یکی را انتخاب نکن.**
 *  فاز اندازه‌گیری نشان داد یک درس آفاق می‌تواند تا ۱۸ نامزد محلی داشته باشد
 *  و یک درس محلی می‌تواند از ۲ درس آفاق ادعا شود. پس خروجی این ماژول فهرست
 *  کامل نامزدها به‌همراه پرچم ابهام است، نه یک برندهٔ top-1.
 *
 *  این فایل «خالص» است: نه DB، نه fs، نه process. هر چیزی که اینجا نیست باید
 *  قابل تست واحد باشد. scripts/*.mjs زیر `node` خام اجرا می‌شوند و نمی‌توانند
 *  از `src/*.ts` ایمپورت کنند (ERR_UNKNOWN_FILE_EXTENSION تأیید شد)، پس نرمال‌سازی
 *  حروف اینجا آینهٔ `src/lib/migration/normalize.ts` است و یک تست، همسانیِ رفتار
 *  این دو را نگه می‌دارد.
 *
 *  استفاده:
 *    import { normTitle, titleKey, findCandidates, parseCsv, planImport }
 *           from './lib/course-equivalence.mjs';
 * ══════════════════════════════════════════════════════════════════════════════
 */

// ───────────────────────────────────────────────────────────────────────────
//  ۱) ترتیب روش‌ها — از قابل‌اتکاترین به کم‌اتکاترین
// ───────────────────────────────────────────────────────────────────────────

/** روش‌های ماشینی، به ترتیب اعتبار (اندیس ۰ = معتبرترین). MANUAL انسانی است و در این ترتیب نیست. */
export const MATCH_METHODS = [
  'CODE_EXACT',
  'TITLE_EXACT',
  'TITLE_WORD_CONTAINMENT',
  'TITLE_FUZZY',
];

export const METHOD_MANUAL = 'MANUAL';

/** رتبهٔ اعتبار: هرچه بزرگ‌تر، محکم‌تر. برای مرتب‌سازی و تشخیص «هم‌ترازی» استفاده می‌شود. */
export const METHOD_RANK = Object.freeze({
  CODE_EXACT: 40,
  TITLE_EXACT: 30,
  TITLE_WORD_CONTAINMENT: 20,
  TITLE_FUZZY: 10,
  MANUAL: 0,
});

export const METHOD_LABELS_FA = Object.freeze({
  CODE_EXACT: 'کد یکسان',
  TITLE_EXACT: 'عنوان یکسان (نرمال‌شده)',
  TITLE_WORD_CONTAINMENT: 'شامل‌بودنِ کلمه‌به‌کلمه',
  TITLE_FUZZY: 'شباهت تقریبی (توکن/دوگرام)',
  MANUAL: 'تصمیم انسانی',
});

/** آستانهٔ پیش‌فرضِ فاز تقریبی — همان ۰٫۸۵ که فاز اندازه‌گیری با آن کار کرد. */
export const DEFAULT_MIN_FUZZY = 0.85;
/** آستانهٔ پذیرش شامل‌بودنِ کلمه‌به‌کلمه. */
export const DEFAULT_MIN_CONTAINMENT = 0.6;

// ───────────────────────────────────────────────────────────────────────────
//  ۲) نرمال‌سازی عنوان فارسی
// ───────────────────────────────────────────────────────────────────────────

/**
 * تبدیل گونه‌های عربی/فارسی به یک شکل. آینهٔ ARABIC_LETTERS در
 * src/lib/migration/normalize.ts — ولی اینجا + «آ/أ/إ/ؤ/ة» را هم یکدست می‌کند
 * چون در عنوان درس‌ها «ة» و «آ» واقعاً دیده می‌شود.
 */
const FOLD_PAIRS = [
  ['ي', 'ی'], // ي عربی
  ['ى', 'ی'], // ى
  ['ۍ', 'ی'], // ۍ
  ['ے', 'ی'], // ے
  ['ك', 'ک'], // ك عربی
  ['ڪ', 'ک'], // ڪ
  ['ګ', 'ک'], // ګ
  ['ة', 'ه'], // ة
  ['ۀ', 'ه'], // ۀ
  ['أ', 'ا'], // أ
  ['إ', 'ا'], // إ
  ['ؤ', 'و'], // ؤ
  // ⚠️ «آ» عمداً به «ا» تبدیل نمی‌شود. آ یک حرفِ مستقلِ فارسی است و تاکردنش
  // «آمار» را «امار» می‌کند و «آباد» را «اباد»؛ در عنوانِ درس این یعنی تولیدِ
  // معادلِ کاذب. src/lib/migration/normalize.ts هم به همین دلیل می‌گوید
  // «faLetters: بدون دست‌زدن به آ/ا». أ/إ/ؤ اما شکلِ نوشتاریِ عربیِ ا/ا/و هستند
  // و در داده‌های وارداتیِ windows-1256 فراوان‌اند، پس یکدست می‌شوند.
];

const ZWNJ_RE = /[‌‏‎‏]/g; // ZWNJ و RLM و LRM → فاصله
const DIACRITIC_RE = /[\u064B-\u0655\u0670\u06D6-\u06ED]/g; // اعراب و علامت‌های کشیده
const BIDI_RE = /[‪-‮⁦-⁩]/g; // کنترلیِ دوطرفه
const PUNCT_RE = /[«»"'()\[\]{}\-–—_/\\.,:;!*؟،؛٪٫٬+&|=<>@#$%^~`]/g;

/** یکدست‌سازی حروف و حذف نویزِ بصری. فاصله‌ها را نگه می‌دارد. */
export function foldFa(s) {
  let out = s == null ? '' : String(s);
  out = out.replace(BIDI_RE, '');
  for (const [from, to] of FOLD_PAIRS) out = out.split(from).join(to);
  out = out.replace(DIACRITIC_RE, '');
  out = out.replace(ZWNJ_RE, ' ');
  out = out.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)); // ۰-۹ عربی
  out = out.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0)); // ۰-۹ فارسی
  out = out.replace(/\s+/g, ' ');
  return out.trim();
}

/** عنوان نرمال‌شدهٔ قابل‌خواندن: حروف یکدست، نیم‌فاصله→فاصله، نشانه‌گذاری حذف. */
export function normTitle(s) {
  return foldFa(s).replace(PUNCT_RE, ' ').replace(/\s+/g, ' ').trim();
}

/** کلید فشردهٔ مقایسه: همهٔ جداکننده‌ها حذف می‌شوند. «الف/ب» و «الف-ب» یکی می‌شوند. */
export function titleKey(s) {
  return normTitle(s).replace(/\s+/g, '');
}

/** آرایهٔ توکن‌های عنوان نرمال‌شده (برای شامل‌بودنِ کلمه‌به‌کلمه و Jaccard). */
export function titleTokens(s) {
  const n = normTitle(s);
  return n ? n.split(' ').filter(Boolean) : [];
}

// ───────────────────────────────────────────────────────────────────────────
//  ۳) سنجه‌های شباهت
// ───────────────────────────────────────────────────────────────────────────

/** Jaccard روی مجموعهٔ توکن‌ها. */
export function tokenJaccard(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const A = new Set(aTokens);
  const B = new Set(bTokens);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Dice روی دوگرام‌ها (بیشتر برای غلط‌های تایپی فارسی حساس است). */
export function diceBigrams(aKey, bKey) {
  if (!aKey || !bKey) return 0;
  if (aKey === bKey) return 1;
  if (aKey.length < 2 || bKey.length < 2) return aKey === bKey ? 1 : 0;
  const grams = new Map();
  for (let i = 0; i < aKey.length - 1; i++) {
    const g = aKey.slice(i, i + 2);
    grams.set(g, (grams.get(g) || 0) + 1);
  }
  let hit = 0;
  for (let i = 0; i < bKey.length - 1; i++) {
    const g = bKey.slice(i, i + 2);
    const c = grams.get(g) || 0;
    if (c > 0) {
      hit++;
      grams.set(g, c - 1);
    }
  }
  return (2 * hit) / (aKey.length - 1 + bKey.length - 1);
}

/** امتیاز تقریبی = بیشینهٔ (Jaccard توکن، Dice دوگرام) — همان تعریف فاز اندازه‌گیری. */
export function fuzzyScore(a, b) {
  return Math.max(tokenJaccard(titleTokens(a), titleTokens(b)), diceBigrams(titleKey(a), titleKey(b)));
}

/**
 * شامل‌بودنِ کلمه‌به‌کلمه: آیا دنبالهٔ پیوستهٔ توکن‌های `needle` داخل `haystack` هست؟
 * «آمار و احتمال» داخل «آمار و احتمال مهندسی» بله؛ «احتمال آمار» نه.
 */
export function containsWordSequence(haystack, needle) {
  if (!needle.length || needle.length > haystack.length) return false;
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * امتیاز شامل‌بودن، متناسب با پوششِ توکن‌ها.
 * پوشش ۱٫۰ (کلِ عنوانِ کوتاه داخل بلندتر است) ⇒ ۰٫۹۰. نیم‌پوشش ⇒ ~۰٫۷۵.
 */
export function containmentScore(haystack, needle) {
  if (!containsWordSequence(haystack, needle)) return 0;
  return 0.6 + 0.3 * (needle.length / Math.max(haystack.length, needle.length));
}

// ───────────────────────────────────────────────────────────────────────────
//  ۴) نامزدیابی — قلب ابزار
// ───────────────────────────────────────────────────────────────────────────

const round4 = (n) => Math.round(n * 10000) / 10000;

/**
 * قوی‌ترین روشی که بین دو درس «شمعی» است + امتیازش. `null` اگر هیچ روشی شمعی نیست.
 * ترتیب اعتبار رعایت می‌شود: هرچه زودتر در MATCH_METHODS، محکم‌تر.
 */
export function scorePair(afagh, local, opts = {}) {
  const minFuzzy = opts.minFuzzy ?? DEFAULT_MIN_FUZZY;
  const minContain = opts.minContainment ?? DEFAULT_MIN_CONTAINMENT;

  const aCode = foldFa(afagh.code || '').replace(/\s+/g, '');
  const bCode = foldFa(local.code || '').replace(/\s+/g, '');
  if (aCode && bCode && aCode === bCode) {
    return { method: 'CODE_EXACT', score: 1 };
  }

  const aKey = titleKey(afagh.title);
  const bKey = titleKey(local.title);
  if (!aKey || !bKey) return null;
  if (aKey === bKey) return { method: 'TITLE_EXACT', score: 1 };

  const aTok = titleTokens(afagh.title);
  const bTok = titleTokens(local.title);
  const cont = Math.max(
    containmentScore(bTok, aTok),
    containmentScore(aTok, bTok),
  );
  if (cont >= minContain) return { method: 'TITLE_WORD_CONTAINMENT', score: round4(cont) };

  const fz = fuzzyScore(afagh.title, local.title);
  if (fz >= minFuzzy) return { method: 'TITLE_FUZZY', score: round4(fz) };

  return null;
}

/**
 * همهٔ نامزدهای «به‌اندازهٔ کافی محتمل» برای یک درس آفاق.
 * هرگز بریدنِ فهرست به یک نفر نیست؛ خروجی مرتب‌شده بر اساس (رتبهٔ روش، امتیاز) است.
 */
export function findCandidates(afagh, locals, opts = {}) {
  const out = [];
  for (const local of locals) {
    const hit = scorePair(afagh, local, opts);
    if (!hit) continue;
    out.push({
      courseIdB: local.id,
      codeB: local.code,
      titleB: local.title,
      method: hit.method,
      methodRank: METHOD_RANK[hit.method],
      score: hit.score,
    });
  }
  out.sort(
    (x, y) => y.methodRank - x.methodRank || y.score - x.score || x.courseIdB - y.courseIdB,
  );
  return out;
}

/**
 * پرچم‌گذاری ابهام، دوطرفه:
 *   ۱) واگرایی (fan-out): یک درس آفاق با بیش از یک نامزد محتمل ⇒ همه پرچم می‌خورند.
 *   ۲) رقابت بر سر مقصد (fan-in): یک درس محلی که بیش از یک درس آفاق آن را ادعا می‌کند.
 * هیچ‌کدام خودبه‌خود به برنده تبدیل نمی‌شود؛ فقط گزارش می‌شوند.
 */
export function markAmbiguity(candidates) {
  // رقابت بر سر مقصد (fan-in): هر درس محلی چند درس آفاق آن را ادعا می‌کنند؟
  const claims = new Map(); // courseIdB → courseIdAهایی که ادعایش را کرده‌اند
  for (const c of candidates) {
    if (!claims.has(c.courseIdB)) claims.set(c.courseIdB, []);
    claims.get(c.courseIdB).push(c.courseIdA);
  }
  // واگرایی (fan-out): نامزدهای هر درس آفاق فقط با خودِ او رقیب‌اند — نه با درسِ آفاقِ دیگر.
  const bySource = new Map(); // courseIdA → [candidate]
  for (const c of candidates) {
    if (!bySource.has(c.courseIdA)) bySource.set(c.courseIdA, []);
    bySource.get(c.courseIdA).push(c);
  }
  const out = [];
  for (const [courseIdA, mine] of bySource) {
    mine.forEach((c, idx) => {
      const rivals = mine.filter((_, j) => j !== idx);
      const contenders = claims.get(c.courseIdB) || [courseIdA];
      const reasons = [];
      if (rivals.length > 0) reasons.push(`MULTI_CANDIDATE(${rivals.length + 1})`);
      if (contenders.length > 1) reasons.push(`CONTESTED_LOCAL(${contenders.length})`);
      out.push({
        ...c,
        rank: idx + 1,
        ambiguous: reasons.length > 0,
        ambiguityReasons: reasons,
        candidateCount: rivals.length + 1,
        competingCourseIdsA:
          contenders.length > 1 ? [...new Set(contenders)].sort((a, b) => a - b) : [],
        competingCandidates: rivals.map(describeCandidate),
      });
    });
  }
  return out;
}

/** توصیفِ فشردهٔ یک رقیب، برای ستون `competing_candidates` در CSV. */
export function describeCandidate(c) {
  return `${c.method}@${c.score}:${c.courseIdB}:${c.codeB}:${c.titleB}`;
}

/**
 * اطمینان پیشنهادی ماشین. فقط عددِ قابل‌انتقال به ستون `confidence` است؛
 * تصمیم نهایی با انسان است و برای MANUAL اصلاً confidence نوشته نمی‌شود.
 */
export function confidenceFor(method, score) {
  if (method === METHOD_MANUAL) return null;
  if (method === 'CODE_EXACT') return 0.99;
  if (method === 'TITLE_EXACT') return 0.95;
  if (method === 'TITLE_WORD_CONTAINMENT') {
    return round3(Math.min(0.9, 0.6 + 0.35 * (score - 0.6)));
  }
  if (method === 'TITLE_FUZZY') {
    return round3(Math.min(0.85, Math.max(0.5, (score - 0.5) * 1.4)));
  }
  return null;
}

const round3 = (n) => Math.round(n * 1000) / 1000;

/** حالت تصمیم یک سطر جدول. decidedAt NULL ⇒ هنوز PROPOSED است. */
export function stateOf(row) {
  if (!row) return 'ABSENT';
  if (row.rejected === 1 || row.rejected === '1' || row.rejected === true) return 'REJECTED';
  if (row.decidedAt) return 'APPROVED';
  return 'PROPOSED';
}

// ───────────────────────────────────────────────────────────────────────────
//  ۵) کلیدهای نرمالِ مقطع و رشته (برای تعریف جمعیتِ آماده‌سازی)
// ───────────────────────────────────────────────────────────────────────────

/**
 * کلیدِ مقطع. اولویت با `standardCode` است (تنها کلیدی که بین دانشگاه‌ها معنا دارد).
 * اگر هیچ‌کدام `standardCode` نداشته باشند — که در dev که snapshot قدیمی است دقیقاً همین
 * است — به عنوانِ نرمال‌شده عقب می‌نشینیم و `source` را برمی‌گردانیم تا گزارش، شفاف بگوید
 * کدام مسیر رفت. بازگشتِ خاموش، دقیقاً همان چیزی است که نباید بگذاریم پیش بیاید.
 */
export function levelKey(dlc) {
  if (!dlc) return { key: null, source: 'MISSING' };
  const std = foldFa(dlc.standardCode || '').replace(/\s+/g, '');
  if (std) return { key: `SC:${std}`, source: 'STANDARD_CODE' };
  const code = foldFa(dlc.code || '').replace(/[\s-]+/g, '').toUpperCase();
  if (['AD', 'BS', 'MS', 'PHD'].includes(code)) return { key: `MC:${code}`, source: 'MINISTRY_CODE' };
  const t = normTitle(dlc.title);
  if (!t) return { key: null, source: 'MISSING' };
  return { key: `TT:${t.replace(/\s+/g, '')}`, source: 'TITLE' };
}

/**
 * کلیدِ رشته. نام‌های رشته در دادهٔ وارداتی به‌شدت کثیف‌اند
 * («الف/ب» در برابر «الف-ب»، ي در برابر ی، فاصله‌های اضافه) پس
 * جداکننده‌ها حذف و حروف یکدست می‌شوند.
 */
export function majorKey(name) {
  const n = normTitle(name);
  if (!n) return null;
  return `MJ:${n.replace(/\s+/g, '')}`;
}

// ───────────────────────────────────────────────────────────────────────────
//  ۶) CSV
// ───────────────────────────────────────────────────────────────────────────

/** ستون‌های ثابتِ فایلِ بازبینی. ترتیبشان = ترتیبِ فایل خروجی. */
export const COLUMNS = [
  'university_id_a',
  'course_id_a',
  'course_code_a',
  'course_title_a',
  'university_b',
  'university_id_b',
  'course_id_b',
  'course_code_b',
  'course_title_b',
  'match_method',
  'match_score',
  'confidence',
  'ambiguous',
  'ambiguity_reasons',
  'candidate_count',
  'competing_candidates',
  'competing_course_ids_a',
  'affected_students',
  'affected_items',
  'state',
  'decided_by',
  'decided_at',
  'rejected',
  'decided_reason',
  'rank',
  // ── ستون‌های قابل‌ویرایش توسط آموزش ──
  'review_decision',
  'review_match_method',
  'review_course_id_b',
  'review_confidence',
  'review_reason',
];

const CSV_QUOTE = /[",\r\n]/;

/** یک فیلد را به شکل امنِ CSV درمی‌آورد (بدون BOM در ابتدای فایل — جداکننده‌اش \n است). */
export function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return CSV_QUOTE.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** ساخت متن CSV از سطرهای شیء‌ای. `columns` پیش‌فرض = COLUMNS. */
export function toCsv(rows, columns = COLUMNS) {
  const lines = [columns.join(',')];
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c])).join(','));
  return lines.join('\n') + '\n';
}

/**
 * تجزیهٔ CSV با پشتیبانی از BOM، CRLF، گیومهٔ دوگانه و سلول چندخطی.
 * خروجی، نگاشتِ ستون‌به‌مقدار است (`__line` شمارهٔ سطر در فایل است، برای گزارشِ خطا).
 */
export function parseCsv(text) {
  let src = String(text);
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };
  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      pushField();
      i++;
      continue;
    }
    if (ch === '\r' && src[i + 1] === '\n') {
      pushRow();
      i += 2;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      pushRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== '' || row.length) pushRow();
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells, idx) => {
    const o = /** @type {Record<string, string | number>} */ ({ __line: idx + 2 });
    header.forEach((h, j) => {
      o[h] = (cells[j] ?? '').trim();
    });
    return o;
  });
}

// ───────────────────────────────────────────────────────────────────────────
//  ۷) اعتبارسنجی و برنامه‌ریزیِ واردکردنِ تصمیمِ انسانی
// ───────────────────────────────────────────────────────────────────────────

export const REVIEW_DECISIONS = ['PENDING', 'APPROVE', 'REJECT'];

const toNum = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[٫]/g, '.'));
  return Number.isFinite(n) ? n : NaN;
};

/**
 * اعتبارسنجیِ یک سطرِ CSV بازبینی‌شده. `ctx` = { decidedBy: number|null, userExists: boolean }.
 * خروجی: { errors: string[], normalized: {...}|null }
 * قاعده: خطا ⇒ سطر اصلاً نوشته نمی‌شود. هیچ ردّ سطری هم بی‌صدا «درست‌شدن» ندارد.
 */
export function validateDecisionRow(row, ctx = {}) {
  const errors = [];
  const rawDecision = (row.review_decision || 'PENDING').toUpperCase();
  if (!REVIEW_DECISIONS.includes(rawDecision)) {
    errors.push(`review_decision نامعتبر: «${row.review_decision}» (مجاز: ${REVIEW_DECISIONS.join('|')})`);
  }

  const idA = toNum(row.course_id_a);
  const idB = toNum(row.review_course_id_b || row.course_id_b);
  const uniA = toNum(row.university_id_a);
  const method = (row.review_match_method || row.match_method || '').toUpperCase() || null;

  if (!uniA || uniA <= 0) errors.push('university_id_a نامعتبر/خالی است');
  const uniB = toNum(row.university_id_b);
  if (!uniB || uniB <= 0) errors.push('university_id_b نامعتبر/خالی است');
  if (!idA || idA <= 0) errors.push('course_id_a نامعتبر/خالی است');
  if (!method || !Object.prototype.hasOwnProperty.call(METHOD_RANK, method)) {
    errors.push(`match_method نامعتبر: «${row.review_match_method || row.match_method}»`);
  }
  if (method === METHOD_MANUAL && (!idA || !idB)) {
    errors.push('سطر MANUAL باید هر دو course_id_a و course_id_b را داشته باشد');
  }
  if (uniA && idB && idA && idA === idB && Number.isFinite(uniA)) {
    // محافظِ آدرس‌دهی: معادل باید بین دو دانشگاه باشد، نه درونِ یک دانشگاه.
    // (درونِ یک دانشگاه، یکسان‌بودنِ id یعنی «همان درس» — که اینجا بی‌معناست.)
    errors.push(`course_id_a و course_id_b یکی‌اند (${idA}) — معادل باید بین دو دانشگاه متفاوت باشد`);
  }

  const rejected = rawDecision === 'REJECT' ? 1 : 0;
  const reason = (row.review_reason || '').trim();
  if (rejected === 1 && !reason) {
    errors.push('سطرِ رد‌شده (rejected=1) بدونِ review_reason مجاز نیست');
  }
  if (reason.length > 200) errors.push(`review_reason بلندتر از ۲۰۰ نویسه است (${reason.length})`);

  let confidence = null;
  const rawConf = (row.review_confidence || '').trim();
  if (rawConf) {
    confidence = toNum(rawConf);
    if (Number.isNaN(confidence)) errors.push(`review_confidence عدد نیست: «${rawConf}»`);
    else if (confidence < 0 || confidence > 1) errors.push(`review_confidence باید بین ۰ و ۱ باشد (${rawConf})`);
    if (method === METHOD_MANUAL && rawConf) {
      // ستون confidence برای MANUAL در DDL مقدار NULL دارد؛ هشدار نه خطا.
    }
  }

  if (rawDecision !== 'PENDING') {
    if (!ctx.decidedBy) errors.push('برای ثبتِ تصمیم، --decided-by <userId> لازم است');
    else if (ctx.userExists === false) errors.push(`users.id=${ctx.decidedBy} وجود ندارد`);
  }

  if (errors.length) return { errors, normalized: null };
  return {
    errors,
    normalized: {
      decision: rawDecision,
      universityIdA: Math.trunc(uniA),
      courseIdA: Math.trunc(idA),
      courseIdB: idB == null ? null : Math.trunc(idB),
      universityIdB: Math.trunc(uniB),
      matchMethod: method,
      confidence: method === METHOD_MANUAL ? null : confidence,
      rejected,
      decidedReason: reason || null,
    },
  };
}

/** دو تصمیم از نظر اثر روی جدول یکسان‌اند؟ (decidedAt را عمداً نمی‌بینیم تا idempotent بماند.) */
export function sameDecision(existing, norm) {
  if (!existing) return false;
  const rej = (v) => (v === 1 || v === '1' || v === true ? 1 : 0);
  const conf = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const sameReason = (v) => (v == null || v === '' ? null : String(v));
  return (
    String(existing.matchMethod) === norm.matchMethod &&
    rej(existing.rejected) === norm.rejected &&
    conf(existing.confidence) === norm.confidence &&
    sameReason(existing.decidedReason) === norm.decidedReason &&
    Math.trunc(Number(existing.courseIdB)) === norm.courseIdB
  );
}

/** آیا این سطر قبلاً تصمیمِ مخالف گرفته بود؟ (تأیید ↔ رد، یا تغییرِ مقصد) */
export function isFlip(existing, norm) {
  if (!existing || !existing.decidedAt) return false;
  if (!sameDecision(existing, norm)) return true;
  return false;
}

export const IMPORT_ACTIONS = {
  INSERT: 'INSERT', // سطر تازه (معمولاً MANUAL)
  UPDATE: 'UPDATE', // ثبتِ تصمیمِ انسانی روی یک پیشنهاد
  NOOP: 'NOOP', // همین CSV قبلاً اعمال شده — هیچ کاری نمی‌کنیم
  FLIP: 'FLIP', // تصمیمِ قبلی را برعکس می‌کند — گزارش می‌شود، اعمال نمی‌شود مگر با --allow-flip
  SKIP: 'SKIP', // review_decision = PENDING
  ERROR: 'ERROR', // اعتبارسنجی رد کرد
};

/**
 * برنامهٔ کاملِ import: هر سطر CSV → یک کنش. خالص و قابل تست.
 * `existingByKey` نگاشتِ کلیدِ ۴ستونیِ یکتا → سطر فعلیِ جدول.
 */
export function planImport(csvRows, existingByKey, opts = {}) {
  const ctx = { decidedBy: opts.decidedBy ?? null, userExists: opts.userExists };
  const plan = [];
  for (const row of csvRows) {
    const decision = (row.review_decision || 'PENDING').toUpperCase();
    const { errors, normalized } = validateDecisionRow(row, ctx);
    if (errors.length) {
      plan.push({ line: row.__line, action: IMPORT_ACTIONS.ERROR, errors, row });
      continue;
    }
    const key = `${normalized.universityIdA}:${normalized.courseIdA}:${normalized.universityIdB ?? ''}:${normalized.courseIdB}`;
    const existing =
      existingByKey.get(key) ??
      existingByKey.get(
        `${normalized.universityIdA}:${normalized.courseIdA}:*:${normalized.courseIdB}`,
      );
    if (decision === 'PENDING') {
      plan.push({ line: row.__line, action: IMPORT_ACTIONS.SKIP, normalized, existing, row });
      continue;
    }
    if (!existing) {
      plan.push({ line: row.__line, action: IMPORT_ACTIONS.INSERT, normalized, existing: null, row });
      continue;
    }
    if (sameDecision(existing, normalized)) {
      plan.push({ line: row.__line, action: IMPORT_ACTIONS.NOOP, normalized, existing, row });
      continue;
    }
    if (isFlip(existing, normalized)) {
      plan.push({ line: row.__line, action: IMPORT_ACTIONS.FLIP, normalized, existing, row });
      continue;
    }
    plan.push({ line: row.__line, action: IMPORT_ACTIONS.UPDATE, normalized, existing, row });
  }
  return plan;
}