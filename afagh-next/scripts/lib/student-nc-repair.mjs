/**
 * ════════════════════════════════════════════════════════════════════════
 *  منطق خالص «ترمیم کد ملی دانشجو» — بدون I/O و بدون دیتابیس
 *
 *  مصرف‌کننده: scripts/fix-student-nc-v2.mjs (رابط خط فرمان)
 *              tests/student-nc-repair.test.ts (تست واحد)
 *
 *  چرا ماژول جدا؟ چون قاعدهٔ «کدام ردیف AUTO_FIX است و کدام REVIEW» باید
 *  قابل تست باشد بدون اینکه به فایل وین۱۲۵۶ یا به دیتابیس وصل شویم.
 *
 *  اصل حاکم بر کل ماژول: «هیچ‌وقت حدس نمی‌زنیم». هر چیزی که ۱۰ رقم
 *  ASCII + چک‌سام mod-11 معتبر + غیربنچمارک نباشد، به سطل REVIEW می‌رود.
 * ════════════════════════════════════════════════════════════════════════
 */
import { isValidIranianNationalCode } from '../migration-v2/identity/candidate-matcher.mjs';

export { isValidIranianNationalCode };

/**
 * نگاشت صریح «کد دانشگاه» → «نام پوشهٔ داده».
 * عمداً با الحاق رشته‌ای ساخته نشده: نام پوشه‌ها با کد دانشگاه فرق دارد
 * (allameh در برابر ALLAME). الگوی convert-all-universities.mjs.
 */
export const UNIVERSITY_DATA_DIRS = Object.freeze({
  AFAGH: 'information-afagh',
  ZARINE: 'information-zarine',
  ALLAME: 'information-allameh',
  SHAMS: 'information-shams',
  NAZHAND: 'information-nazhand',
});

/** ستون‌هایی که هرگز نباید به‌عنوان «کد ملی» استفاده شوند. */
export const FORBIDDEN_NC_COLUMNS = Object.freeze(['IDNO']);

/** نام‌های مجاز برای ستون کد ملی (پس از یکسان‌سازی: کوچک، بدون فاصله). */
const NC_HEADER_ALIASES = Object.freeze(['nationalcode', 'کدملی']);

/** نام‌های مجاز برای ستون کلید الحاق (شمارهٔ دانشجویی). */
const STNO_HEADER_ALIASES = Object.freeze(['stno']);

export const SOURCE_STATES = Object.freeze({
  OK: 'OK',
  MISSING: 'MISSING',
  EMPTY: 'EMPTY',
  MALFORMED: 'MALFORMED',
  AMBIGUOUS: 'AMBIGUOUS',
});

export const VERDICTS = Object.freeze({
  AUTO_FIX: 'AUTO_FIX',
  ALREADY_CORRECT: 'ALREADY_CORRECT',
  NO_CHANGE: 'NO_CHANGE',
  CONFLICT_WITH_DB: 'CONFLICT_WITH_DB',
  COLLISION: 'COLLISION',
  AMBIGUOUS_SOURCE: 'AMBIGUOUS_SOURCE',
  SOURCE_MISSING: 'SOURCE_MISSING',
  SOURCE_EMPTY: 'SOURCE_EMPTY',
  SOURCE_MALFORMED: 'SOURCE_MALFORMED',
  SOURCE_AMBIGUOUS: 'SOURCE_AMBIGUOUS',
  SOURCE_INVALID_CHECKSUM: 'SOURCE_INVALID_CHECKSUM',
  SOURCE_SENTINEL: 'SOURCE_SENTINEL',
});

/** سطل‌هایی که یعنی «این ردیف فقط گزارش می‌شود، هرگز نوشته نمی‌شود». */
export const REVIEW_VERDICTS = Object.freeze(
  Object.values(VERDICTS).filter((v) => v !== VERDICTS.AUTO_FIX),
);

/** بنچمارک‌هایی که هرگز «کد ملی واقعی» محسوب نمی‌شوند. */
export const SENTINEL_CODES = Object.freeze(new Set(['0000000000', '1111111111', '0123456789', '1234567890']));

// ── نرمال‌سازی ────────────────────────────────────────────────────────────

/** ارقام فارسی (۰-۹) → ASCII */
const PERSIAN_DIGITS = /[۰-۹]/g;
/** ارقام عربی-هندی (٠-٩) → ASCII */
const ARABIC_DIGITS = /[٠-٩]/g;
/**
 * بیش‌جهت‌نما / نامرئی / NBSP / فاصلهٔ باریک / NUL — هیچ‌کدام رقم نیستند.
 * شامل: U+200C نیم‌فاصله، U+200B، U+200E/200F، U+202A-202E، U+2066-2069،
 *        U+FEFF، U+00A0، U+2007، U+202F، U+0000.
 */
const INVISIBLE = /[\u0000\u000C\u00A0\u2007\u200B\u200C\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\u202F\uFEFF]/g;

/**
 * نرمال‌سازی مقدار خام منبع به رشتهٔ ارقام ASCII.
 * صفرهای ابتدایی حفظ می‌شوند (چون فقط حذف می‌کنیم، تبدیل به عدد نمی‌کنیم).
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeDigits(raw) {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(PERSIAN_DIGITS, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(INVISIBLE, '')
    .replace(/[^\x30-\x39]/g, '');
}

/**
 * آیا مقدار خام، به‌جز ارقام و فاصله‌های نامرئی، چیزِ «دیدنیِ» اضافه دارد؟
 * (مثل «۱۲۳-۴۵۶» یا «3036/1234») — چنین مقداری حدس‌زدنی است و نباید
 * با چسباندن ارقام به یک «کد ۱۰ رقمی» تبدیل شود.
 * @param {unknown} raw
 * @returns {boolean}
 */
export function hasVisibleNoise(raw) {
  if (raw === null || raw === undefined) return false;
  const stripped = String(raw)
    .replace(PERSIAN_DIGITS, '0')
    .replace(ARABIC_DIGITS, '0')
    .replace(INVISIBLE, '')
    .replace(/\s+/g, '');
  return /[^\x30-\x39]/.test(stripped);
}

// ── تفکیک ستون‌ها ─────────────────────────────────────────────────────────

/** یکسان‌سازی نام هدر: کوچک، حذف نیم‌فاصله/فاصله، حذف کاراکترهای نامرئی */
const canonHeader = (h) =>
  String(h ?? '')
    .replace(INVISIBLE, '')
    .replace(/[\u200C\u200F]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();

/**
 * تفکیک ستون‌ها «فقط بر اساس نام هدر». هرگز ایندکس ثابت.
 *
 * @param {string[]} headerCols آرایهٔ نام ستون‌ها (سطر اول فایل)
 * @returns {{ ok: true, nationalCodeIndex: number, nationalCodeName: string, stnoIndex: number, stnoName: string, ignoredColumns: string[] }
 *          | { ok: false, error: string, code: string }}
 */
export function resolveColumnsByHeader(headerCols) {
  if (!Array.isArray(headerCols) || headerCols.length === 0) {
    return { ok: false, error: 'هدر فایل خالی است (AFAGH-style) — ستون کد ملی قابل تفکیک نیست', code: 'EMPTY_HEADER' };
  }
  const canon = headerCols.map(canonHeader);
  const named = headerCols.map((h, i) => ({ h: String(h ?? '').trim(), i })).filter((x) => x.h !== '');
  if (named.length === 0) {
    return {
      ok: false,
      error:
        'سطر اول فایل تماماً خالی است؛ تفکیک ستون کد ملی ممکن نیست. ' +
        'این دانشگاه به «اندیس دستیِ تأییدشده» نیاز دارد — حدس نمی‌زنیم.',
      code: 'BLANK_HEADER_ROW',
    };
  }

  // ── refuse IDNO explicitly ──
  const forbidden = canon
    .map((c, i) => ({ c, i }))
    .filter((x) => FORBIDDEN_NC_COLUMNS.includes(x.c.toUpperCase()));
  if (forbidden.length && !canon.some((c) => NC_HEADER_ALIASES.includes(c))) {
    return {
      ok: false,
      error:
        `فقط ستون ${forbidden.map((f) => headerCols[f.i]).join('/')} پیدا شد و این ستون «شمارهٔ شناسنامه» است، نه کد ملی — ` +
        'طبق قاعدهٔ پروژه هرگز به‌عنوان کد ملی استفاده نمی‌شود.',
      code: 'REFUSED_IDNO',
    };
  }

  const ncIdx = canon
    .map((c, i) => ({ c, i }))
    .filter((x) => NC_HEADER_ALIASES.includes(x.c));
  if (ncIdx.length === 0) {
    const ignored = forbidden.map((f) => headerCols[f.i]);
    return {
      ok: false,
      error:
        'ستون «NationalCode» / «کد ملی» در هدر پیدا نشد' +
        (ignored.length ? ` (ستون ${ignored.join('/')} عمداً نادیده گرفته شد — شناسهٔ شناسنامه است)` : '') +
        '.',
      code: 'NO_NC_COLUMN',
    };
  }
  if (ncIdx.length > 1) {
    return {
      ok: false,
      error: `ستون کد ملی مبهم است: ${ncIdx.map((x) => `#${x.i}:${headerCols[x.i]}`).join(' , ')}`,
      code: 'AMBIGUOUS_NC_COLUMN',
    };
  }
  // safety net: the winner must never be a forbidden column
  if (FORBIDDEN_NC_COLUMNS.includes(String(headerCols[ncIdx[0].i]).trim().toUpperCase())) {
    return { ok: false, error: 'ستون انتخاب‌شده IDNO است — رد شد.', code: 'REFUSED_IDNO' };
  }

  const stnoIdx = canon
    .map((c, i) => ({ c, i }))
    .filter((x) => STNO_HEADER_ALIASES.includes(x.c));
  if (stnoIdx.length !== 1) {
    return {
      ok: false,
      error: `ستون کلید الحاق «Stno» ${stnoIdx.length === 0 ? 'پیدا نشد' : 'مبهم است'}.`,
      code: stnoIdx.length === 0 ? 'NO_STNO_COLUMN' : 'AMBIGUOUS_STNO_COLUMN',
    };
  }

  return {
    ok: true,
    nationalCodeIndex: ncIdx[0].i,
    nationalCodeName: String(headerCols[ncIdx[0].i]).trim(),
    stnoIndex: stnoIdx[0].i,
    stnoName: String(headerCols[stnoIdx[0].i]).trim(),
    ignoredColumns: forbidden.map((f) => String(headerCols[f.i]).trim()),
  };
}

// ── دسته‌بندی مقدار فعلی دیتابیس ─────────────────────────────────────────

/**
 * @param {string|null|undefined} currentCode users.nationalCode
 * @param {string|null|undefined} birthCertNo users.birthCertNo
 * @returns {{ valid: boolean, synthetic: boolean, equalsBirthCertNo: boolean, notTenDigits: boolean, checksumInvalid: boolean, flags: string[], klass: string }}
 */
export function classifyCurrent(currentCode, birthCertNo) {
  const cur = currentCode === null || currentCode === undefined ? '' : String(currentCode);
  const bc = birthCertNo === null || birthCertNo === undefined ? '' : String(birthCertNo);
  const flags = [];
  const synthetic = /^s/i.test(cur.trim());
  if (synthetic) flags.push('SYNTHETIC_PLACEHOLDER');
  const equalsBirthCertNo = bc !== '' && cur === bc;
  if (equalsBirthCertNo) flags.push('EQUALS_BIRTH_CERT');
  const notTenDigits = !/^[0-9]{10}$/.test(cur);
  if (notTenDigits) flags.push('NOT_10_DIGITS');
  const valid = isValidIranianNationalCode(cur);
  const checksumInvalid = !notTenDigits && !valid;
  if (checksumInvalid) flags.push('CHECKSUM_INVALID');
  return {
    valid,
    synthetic,
    equalsBirthCertNo,
    notTenDigits,
    checksumInvalid,
    flags,
    klass: flags.length === 0 ? 'VALID' : flags.join('|'),
  };
}

// ── دسته‌بندی مقدار منبع ──────────────────────────────────────────────────

/**
 * @param {unknown} rawValue مقدار خام ستون کد ملی در فایل
 * @param {{ hasColumn?: boolean, hasRow?: boolean }} ctx
 * @returns {{ state: string, value: string, raw: string, reason: string }}
 */
export function classifySource(rawValue, ctx = {}) {
  const raw = rawValue === null || rawValue === undefined ? '' : String(rawValue);
  if (ctx.hasRow === false || (ctx.hasColumn === false && raw === '')) {
    return { state: SOURCE_STATES.MISSING, value: '', raw, reason: ctx.reason || 'NO_ROW_IN_FILE' };
  }
  // یک Stno که دو بار با دو «کد ملیِ» متفاوت آمده — هیچ‌کدام را نمی‌شود انتخاب کرد
  if (ctx.conflict) {
    return { state: SOURCE_STATES.AMBIGUOUS, value: '', raw, reason: 'DUPLICATE_STNO_WITH_CONFLICTING_VALUES' };
  }
  if (raw.trim() === '') {
    return {
      state: SOURCE_STATES.EMPTY,
      value: '',
      raw,
      reason: ctx.hasColumn === false ? 'NO_RESOLVABLE_SOURCE_COLUMN' : 'EMPTY_CELL',
    };
  }
  if (hasVisibleNoise(raw)) {
    return { state: SOURCE_STATES.MALFORMED, value: normalizeDigits(raw), raw, reason: 'VISIBLE_SEPARATORS_IN_CELL' };
  }
  const digits = normalizeDigits(raw);
  if (!/^[0-9]{10}$/.test(digits)) {
    return {
      state: SOURCE_STATES.MALFORMED,
      value: digits,
      raw,
      reason: digits === '' ? 'NO_DIGITS_IN_CELL' : `DIGITS_LENGTH_${digits.length}`,
    };
  }
  return { state: SOURCE_STATES.OK, value: digits, raw, reason: 'OK' };
}

// ── تصمیم‌گیری ────────────────────────────────────────────────────────────

/**
 * تصمیم نهایی برای یک کاربر (کد ملی در سطح users است، نه students).
 *
 * ترتیب تقدم قاعده‌ها (اولین شرط برنده):
 *  ۱) منبع معتبر و معتبرChecksum و ≠ مقدار فعلی → پیشنهاد (AUTO_FIX یا COLLISION)
 *  ۲) منبع معتبر و = مقدار فعلی → ALREADY_CORRECT
 *  ۳) منبع معتبر ولی مقدار فعلی دیتابیس هم معتبر است → CONFLICT_WITH_DB (هرگز بازنویسی نمی‌شود)
 *  ۴) منبع غیرقابل استفاده ولی مقدار فعلی معتبر → NO_CHANGE
 *  ۵) بقیه → سطل REVIEW بر اساس وضعیت منبع
 *
 * @param {object} p
 * @param {ReturnType<typeof classifyCurrent>} p.current
 * @param {string} p.currentCode
 * @param {ReturnType<typeof classifySource>} p.source
 * @param {boolean} [p.ambiguous] بیش از یک کد معتبرِ متفاوت از چند stno
 * @param {boolean} [p.collidesWithOtherUser]
 * @param {number|null} [p.collisionUserId]
 * @param {string|null} [p.collisionCode]
 * @returns {{ verdict: string, reason: string, proposedCode: string|null, promote: boolean }}
 */
export function decideRepair({ current, currentCode, source, ambiguous = false, collidesWithOtherUser = false, collisionUserId = null, collisionCode = null }) {
  const src = source || { state: SOURCE_STATES.MISSING, value: '', raw: '', reason: 'NO_SOURCE' };

  if (ambiguous) {
    return {
      verdict: VERDICTS.AMBIGUOUS_SOURCE,
      reason: 'MULTIPLE_DISTINCT_VALID_SOURCE_CODES_ACROSS_STUDENT_ROWS',
      proposedCode: null,
      promote: false,
    };
  }

  if (src.state === SOURCE_STATES.OK) {
    const sentinel = SENTINEL_CODES.has(src.value);
    const checksumOk = isValidIranianNationalCode(src.value);
    if (!sentinel && checksumOk) {
      if (src.value === currentCode) {
        return { verdict: VERDICTS.ALREADY_CORRECT, reason: 'SOURCE_MATCHES_CURRENT', proposedCode: src.value, promote: false };
      }
      if (current.valid) {
        return {
          verdict: VERDICTS.CONFLICT_WITH_DB,
          reason: 'CURRENT_DB_CODE_IS_VALID_AND_DIFFERS_FROM_SOURCE',
          proposedCode: src.value,
          promote: false,
        };
      }
      if (collidesWithOtherUser) {
        return {
          verdict: VERDICTS.COLLISION,
          reason: collisionUserId === null ? 'PROPOSED_CODE_OWNED_BY_ANOTHER_STUDENT_ROW' : `PROPOSED_CODE_OWNED_BY_USER_${collisionUserId}`,
          proposedCode: src.value,
          promote: false,
        };
      }
      return { verdict: VERDICTS.AUTO_FIX, reason: `SOURCE_VALID_REPLACES_${current.klass}`, proposedCode: src.value, promote: true };
    }
    // منبع ۱۰ رقمی است ولی…
    const badVerdict = sentinel ? VERDICTS.SOURCE_SENTINEL : VERDICTS.SOURCE_INVALID_CHECKSUM;
    const badReason = sentinel ? `BLACKLISTED_SENTINEL_${src.value}` : 'MOD11_CHECKSUM_FAILED';
    if (current.valid) {
      return { verdict: VERDICTS.NO_CHANGE, reason: `CURRENT_DB_CODE_VALID_BUT_${badReason}`, proposedCode: null, promote: false };
    }
    return { verdict: badVerdict, reason: badReason, proposedCode: null, promote: false };
  }

  // منبع غیرقابل استفاده
  if (current.valid) {
    return { verdict: VERDICTS.NO_CHANGE, reason: `CURRENT_DB_CODE_VALID_SOURCE_${src.state}_${src.reason}`, proposedCode: null, promote: false };
  }
  const map = {
    [SOURCE_STATES.MISSING]: VERDICTS.SOURCE_MISSING,
    [SOURCE_STATES.EMPTY]: VERDICTS.SOURCE_EMPTY,
    [SOURCE_STATES.MALFORMED]: VERDICTS.SOURCE_MALFORMED,
    [SOURCE_STATES.AMBIGUOUS]: VERDICTS.SOURCE_AMBIGUOUS,
  };
  return {
    verdict: map[src.state] || VERDICTS.SOURCE_MISSING,
    reason: src.reason,
    proposedCode: null,
    promote: false,
  };
}

/**
 * بررسی برخورد یک کد پیشنهادی با کدهای موجود در users.
 * کلید = کد → userId (نگاشت کامل، سراسری و نه فقط همان دانشگاه).
 * @param {Map<string, number>} codeOwners
 * @param {number} userId
 * @param {string|null} proposedCode
 * @returns {{ collides: boolean, withUserId: number|null }}
 */
export function checkCollision(codeOwners, userId, proposedCode) {
  if (!proposedCode) return { collides: false, withUserId: null };
  const owner = codeOwners.get(proposedCode);
  if (owner === undefined || owner === userId) return { collides: false, withUserId: null };
  return { collides: true, withUserId: owner };
}

/**
 * آیا کدِ پیشنهادیِ ردیف الف با کدِ پیشنهادیِ ردیف ب یکی است؟
 * (دو دانشجو نمی‌توانند یک کد ملی داشته باشند — حتی اگر هیچ‌کدام هنوز در DB نباشد)
 * @param {Map<string, number>} proposedOwners proposedCode → userId
 * @param {number} userId
 * @param {string|null} proposedCode
 * @returns {{ collides: boolean, withUserId: number|null }}
 */
export function checkPlanCollision(proposedOwners, userId, proposedCode) {
  if (!proposedCode) return { collides: false, withUserId: null };
  const owner = proposedOwners.get(proposedCode);
  if (owner === undefined || owner === userId) return { collides: false, withUserId: null };
  return { collides: true, withUserId: owner };
}