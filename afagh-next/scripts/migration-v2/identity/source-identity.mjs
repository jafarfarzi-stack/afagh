/**
 * ══════════════════════════════════════════════════════════════════════
 *  Migration V2: Source Identity Builder & Sanitizer
 *  — جلوگیری از ورود کدهای ملی جعلی/ساختگی (Synthetic/Dummy IDs)
 *  — پاکسازی و نرمال‌سازی اسامی
 * ══════════════════════════════════════════════════════════════════════
 */
import {
  isValidIranianNationalCode,
  normalizePersianText,
} from './candidate-matcher.mjs';

/**
 * پالایش کد ملی مبدأ جهت جلوگیری از انتقال کدهای ساختگی
 * @param {string|null|undefined} code 
 * @returns {string|null}
 */
export function sanitizeNationalCode(code) {
  if (!code || typeof code !== 'string') return null;
  const cleaned = code.trim().replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776));

  // الگوهای کدهای جعلی و قدیمی سما (مانند S780..., 0000000000, 1234567890)
  if (/^[a-zA-Z]/.test(cleaned)) return null;
  if (/^0+$/.test(cleaned)) return null;
  if (/^(\d)\1{9}$/.test(cleaned)) return null;

  if (isValidIranianNationalCode(cleaned)) {
    return cleaned;
  }
  return null;
}

/**
 * ساخت ساختار داده منبع هویت جهت درج در دیتابیس
 * @param {any} input 
 * @returns {any}
 */
export function buildSourceIdentity(input) {
  if (!input.universityId) {
    throw new Error('universityId is required to build source identity');
  }
  if (!input.sourceStudentCode) {
    throw new Error('sourceStudentCode is required to build source identity');
  }

  const validNatCode = sanitizeNationalCode(input.sourceNationalCode || input.nationalCode);
  const normFirst = normalizePersianText(input.sourceFirstName || input.firstName);
  const normLast = normalizePersianText(input.sourceLastName || input.lastName);
  const normFather = normalizePersianText(input.sourceFatherName || input.fatherName);

  return {
    universityId: Number(input.universityId),
    studentId: input.studentId ? Number(input.studentId) : null,
    sourceStudentCode: String(input.sourceStudentCode).trim(),
    sourceNationalCode: validNatCode,
    sourceFirstName: input.sourceFirstName || input.firstName || null,
    sourceLastName: input.sourceLastName || input.lastName || null,
    sourceFatherName: input.sourceFatherName || input.fatherName || null,
    sourceBirthDate: input.sourceBirthDate || input.birthDate || null,
    normalizedFirstName: normFirst || null,
    normalizedLastName: normLast || null,
    normalizedFatherName: normFather || null,
    identityStatus: validNatCode ? 'UNRESOLVED' : 'NEW_PERSON_PENDING',
  };
}
