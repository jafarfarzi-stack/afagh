export const IdentityResolution = Object.freeze({
  SAME_PERSON: 'SAME_PERSON',
  DIFFERENT_PERSON: 'DIFFERENT_PERSON',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  NEW_PERSON_PENDING: 'NEW_PERSON_PENDING',
  CONFIRMED: 'CONFIRMED',
  UNRESOLVED: 'UNRESOLVED',
});

export const MatchMethod = Object.freeze({
  NATIONAL_CODE: 'NATIONAL_CODE',
  NATIONAL_CODE_CONFLICT: 'NATIONAL_CODE_CONFLICT',
  VALID_NATIONAL_CODE_AND_NAME: 'VALID_NATIONAL_CODE_AND_NAME',
  NAME_CANDIDATE: 'NAME_CANDIDATE',
  FATHER_NAME_CANDIDATE: 'FATHER_NAME_CANDIDATE',
  BIRTH_DATE_CANDIDATE: 'BIRTH_DATE_CANDIDATE',
  NO_CANDIDATE: 'NO_CANDIDATE',
  NEW_PERSON_CREATED: 'NEW_PERSON_CREATED',
  NEW_CANONICAL_PERSON: 'NEW_CANONICAL_PERSON',
  DISTINCT_VALID_NATIONAL_CODES: 'DISTINCT_VALID_NATIONAL_CODES',
  NATIONAL_CODE_MATCH_NAME_CONFLICT: 'NATIONAL_CODE_MATCH_NAME_CONFLICT',
  INVALID_OR_MISSING_NATIONAL_CODE: 'INVALID_OR_MISSING_NATIONAL_CODE',
  FUZZY_NAME_AND_FATHER: 'FUZZY_NAME_AND_FATHER',
  FUZZY_NAME_HIGH: 'FUZZY_NAME_HIGH',
});

/**
 * @param {any} source
 * @param {any} [candidate]
 * @returns {any}
 */
export function resolveIdentity(source, candidate = null) {
  const match = evaluateCandidateMatch(source, candidate || {});
  let resolution = match.resolution;
  let method = match.matchMethod;

  if (resolution === 'EXACT_MATCH') {
    resolution = IdentityResolution.SAME_PERSON;
  } else if (resolution === 'NO_MATCH') {
    if (!candidate || Object.keys(candidate).length === 0) {
      resolution = IdentityResolution.NEW_PERSON_PENDING;
      method = MatchMethod.NO_CANDIDATE;
    }
  }

  return {
    resolution,
    method,
    confidence: match.confidence,
    canAutoMerge: match.canAutoMerge,
    reason: match.reason,
    candidateId: candidate?.personId ?? candidate?.id ?? null,
  };
}

/**
 * اعتبارسنجی استاندارد کد ملی ۱۰ رقمی جمهوری اسلامی ایران
 * @param {string|null|undefined} code 
 * @returns {boolean}
 */
export function isValidIranianNationalCode(code) {
  if (!code || typeof code !== 'string') return false;
  const cleaned = code.trim();
  if (!/^\d{10}$/.test(cleaned)) return false;

  // کدهای ساختگی با ارقام تکراری (0000000000 تا 9999999999)
  if (/^(\d)\1{9}$/.test(cleaned)) return false;

  // کدهای ساختگی متداول
  if (cleaned === '0123456789' || cleaned === '1234567890') return false;

  const digits = cleaned.split('').map(Number);
  const checkDigit = digits[9];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += digits[i] * (10 - i);
  }
  const remainder = sum % 11;
  if (remainder < 2) {
    return checkDigit === remainder;
  } else {
    return checkDigit === (11 - remainder);
  }
}

/**
 * نرمال‌سازی استاندارد متون فارسی (حذف تنوین/اعراب، یکسان‌سازی ی و ک، نیم‌فاصله‌ها)
 * @param {string|null|undefined} str 
 * @returns {string}
 */
export function normalizePersianText(str) {
  if (!str || typeof str !== 'string') return '';
  let s = str.trim();

  // تبدیل ارقام فارسی و عربی به انگلیسی
  s = s.replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776))
       .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632));

  // یکدست‌سازی ی و ک و ه و ئ
  s = s.replace(/[\u064A\u0649\u0626]/g, 'ی') // ي و ى و ئ -> ی
       .replace(/\u0643/g, 'ک')         // ك -> ک
       .replace(/\u0629/g, 'ه')         // ة -> ه
       .replace(/\u0624/g, 'و')         // ؤ -> و
       .replace(/[\u0622\u0623\u0625]/g, 'ا'); // آ، أ، إ -> ا

  // حذف اعراب و تنوین و تشدید
  s = s.replace(/[\u064B-\u065F\u0670]/g, '');

  // یکدست‌سازی نیم‌فاصله‌ها و خط تیره و فاصله‌ها
  s = s.replace(/[\u200C\u200B\u200E\u200F\uFEFF]/g, ' ')
       .replace(/[-_ـ]/g, ' ')
       .replace(/\s+/g, ' ')
       .trim();

  return s;
}

/**
 * محاسبه فاصله لون‌اشتاین بین دو رشته
 */
export function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * ضریب شباهت نرمال‌شده (۰.۰ تا ۱.۰)
 */
export function stringSimilarity(a, b) {
  const normA = normalizePersianText(a);
  const normB = normalizePersianText(b);
  if (!normA && !normB) return 1.0;
  if (!normA || !normB) return 0.0;
  if (normA === normB) return 1.0;

  const maxLen = Math.max(normA.length, normB.length);
  const dist = levenshteinDistance(normA, normB);
  return Math.max(0, parseFloat((1 - dist / maxLen).toFixed(4)));
}

/**
 * مقایسه و تطبیق دو موجودیت هویتی
 * @param {Object} source - داده ورودی منبع
 * @param {Object} candidate - نامزد شخص موجود یا رکورد مرجع
 * @returns {Object} نتیجه ارزیابی تطبیق
 */
export function evaluateCandidateMatch(source, candidate) {
  const srcNational = source.sourceNationalCode || source.canonicalNationalCode || source.nationalCode || '';
  const candNational = candidate.canonicalNationalCode || candidate.sourceNationalCode || candidate.nationalCode || '';

  const isSrcValidNat = isValidIranianNationalCode(srcNational);
  const isCandValidNat = isValidIranianNationalCode(candNational);

  const srcName = `${source.sourceFirstName || source.canonicalFirstName || source.firstName || ''} ${source.sourceLastName || source.canonicalLastName || source.lastName || ''}`;
  const candName = `${candidate.canonicalFirstName || candidate.sourceFirstName || candidate.firstName || ''} ${candidate.canonicalLastName || candidate.sourceLastName || candidate.lastName || ''}`;

  const nameSim = stringSimilarity(srcName, candName);

  const srcFather = source.sourceFatherName || source.canonicalFatherName || source.fatherName || '';
  const candFather = candidate.canonicalFatherName || candidate.sourceFatherName || candidate.fatherName || '';
  const fatherSim = (srcFather && candFather) ? stringSimilarity(srcFather, candFather) : null;

  // ۱. بررسی تطابق کد ملی معتبر
  if (isSrcValidNat && isCandValidNat) {
    if (srcNational === candNational) {
      if (nameSim >= 0.70) {
        return {
          resolution: 'EXACT_MATCH',
          matchMethod: 'VALID_NATIONAL_CODE_AND_NAME',
          confidence: 1.0,
          reason: 'کد ملی معتبر و یکسان به همراه همخوانی نام و نام خانوادگی',
          canAutoMerge: true,
        };
      } else {
        return {
          resolution: 'REVIEW_REQUIRED',
          matchMethod: 'NATIONAL_CODE_MATCH_NAME_CONFLICT',
          confidence: 0.50,
          reason: `کد ملی یکسان (${srcNational}) ولی مغایرت در نام: "${srcName}" در برابر "${candName}" (شباهت: ${nameSim})`,
          canAutoMerge: false,
        };
      }
    } else {
      // هر دو کد ملی معتبر دارند اما با هم متفاوتند -> قطعا دو شخص متفاوت
      return {
        resolution: 'DIFFERENT_PERSON',
        matchMethod: 'DISTINCT_VALID_NATIONAL_CODES',
        confidence: 0.0,
        reason: 'کدهای ملی معتبر متفاوت هستند',
        canAutoMerge: false,
      };
    }
  }

  // ۲. یکی از کدهای ملی نامعتبر یا خالی است اما نام و نام پدر شباهت دارند
  if (nameSim >= 0.85) {
    if (fatherSim !== null && fatherSim >= 0.80) {
      return {
        resolution: 'REVIEW_REQUIRED',
        matchMethod: 'FUZZY_NAME_AND_FATHER',
        confidence: parseFloat((nameSim * 0.6 + fatherSim * 0.4).toFixed(4)),
        reason: `شباهت بالای نام (${nameSim}) و نام پدر (${fatherSim}) بدون تأیید کد ملی یکتا`,
        canAutoMerge: false,
      };
    } else if (fatherSim === null && nameSim >= 0.95) {
      return {
        resolution: 'REVIEW_REQUIRED',
        matchMethod: 'FUZZY_NAME_HIGH',
        confidence: parseFloat((nameSim * 0.75).toFixed(4)),
        reason: `شباهت بسیار بالای نام (${nameSim}) در غیاب مشخصات نام پدر یا کد ملی معتبر`,
        canAutoMerge: false,
      };
    }
  }

  return {
    resolution: 'NO_MATCH',
    matchMethod: 'NONE',
    confidence: 0.0,
    reason: 'عدم احراز شباهت هویتی کافی',
    canAutoMerge: false,
  };
}
