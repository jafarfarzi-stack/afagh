/**
 * ══════════════════════════════════════════════════════════════════════
 *  Migration V2: Term Normalizer
 *  — نرمال‌سازی ترتیبی و زمانی کدهای ترم دانشگاهی
 *  — پشتیبانی از کدهای ۳ رقمی (زرینه)، ۴ رقمی و ۵ رقمی (سما)
 *  — محاسبه دقیق sortOrder جهت تضمین تقدم و تأخر زمانی (مانند ۱۴۰۱۵ قبل از ۱۴۰۲۱)
 *  — تشخیص نوع ترم (NORMAL / SUMMER / EQUIVALENCE / SPECIAL)
 * ══════════════════════════════════════════════════════════════════════
 */

/**
 * تبدیل ارقام فارسی و عربی به انگلیسی و پاکسازی رشته
 * @param {string|number} code 
 * @returns {string}
 */
export function sanitizeTermCode(code) {
  if (code === null || code === undefined) return '';
  let s = String(code).trim();
  s = s.replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776))
       .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632));
  return s.replace(/[^a-zA-Z0-9]/g, '');
}

export function toPersianDigits(val) {
  return String(val).replace(/\d/g, d => String.fromCharCode(1776 + Number(d)));
}

/**
 * تحلیل و نرمال‌سازی کد ترم به ساختار استاندارد
 * @param {string|number} rawCode 
 * @param {number|null} [fallbackYear] 
 * @returns {any}
 */
export function normalizeTerm(rawCode, fallbackYear = null) {
  const clean = sanitizeTermCode(rawCode);
  if (!clean) {
    throw new Error(`Empty or invalid term code: "${rawCode}"`);
  }

  let canonicalCode = clean;
  let academicYear = null;
  let semesterPart = 1;
  let termType = 'NORMAL';
  let isSummer = false;

  // ۱. بررسی کدهای ۳ رقمی (مانند 871، 992، 011)
  if (/^\d{3}$/.test(clean)) {
    const yy = parseInt(clean.slice(0, 2), 10);
    const sem = parseInt(clean.slice(2), 10);
    const fullYear = yy >= 50 ? 1300 + yy : 1400 + yy;
    academicYear = fullYear;
    semesterPart = sem;
    canonicalCode = `${fullYear}${sem}`;
  }
  // ۲. بررسی کدهای ۵ رقمی استاندارد (مانند 13871، 14012، 14013، 14015)
  else if (/^\d{5}$/.test(clean)) {
    academicYear = parseInt(clean.slice(0, 4), 10);
    semesterPart = parseInt(clean.slice(4), 10);
    canonicalCode = clean;
  }
  // ۳. کدهای ۴ رقمی (سال تحصیلی خام مانند 1401 یا 1398)
  else if (/^\d{4}$/.test(clean) && (clean.startsWith('13') || clean.startsWith('14'))) {
    academicYear = parseInt(clean, 10);
    semesterPart = 1;
    canonicalCode = `${academicYear}1`;
  }
  // ۴. کدهای معادل‌سازی غیرعددی (مانند EQ، 00EQ1)
  else if (clean.toUpperCase().includes('EQ')) {
    academicYear = fallbackYear || 1390;
    semesterPart = 5;
    canonicalCode = `${academicYear}5`;
    termType = 'EQUIVALENCE';
  }
  // ۵. سایر حالت‌های متفرقه عددی
  else if (/^\d+$/.test(clean)) {
    const num = parseInt(clean, 10);
    academicYear = fallbackYear || 1400;
    semesterPart = num % 10;
    canonicalCode = clean;
  } else {
    academicYear = fallbackYear || 1400;
    semesterPart = 0;
    canonicalCode = clean;
    termType = 'SPECIAL';
  }

  // تعیین نوع ترم بر اساس بخش نیمسال
  if (termType !== 'EQUIVALENCE' && termType !== 'SPECIAL') {
    if (semesterPart === 3) {
      termType = 'SUMMER';
      isSummer = true;
    } else if (semesterPart === 5 || semesterPart === 0) {
      termType = 'EQUIVALENCE';
    } else {
      termType = 'NORMAL';
    }
  }

  // محاسبه sortOrder ترتیبی زمانی:
  // ترم‌های عادی و تابستان:
  // ۱۴۰۱۱ (نیمسال اول) -> ۱۴۰۱۱
  // ۱۴۰۱۲ (نیمسال دوم) -> ۱۴۰۱۲
  // ۱۴۰۱۳ (تابستان)    -> ۱۴۰۱۳
  // ۱۴۰۱۵ (معادل‌سازی)  -> ۱۴۰۱۵ (قبل از ۱۴۰۲۱ قرار می‌گیرد)
  const sortOrder = academicYear * 10 + semesterPart;

  // تولید عنوان استاندارد فارسی
  let title = '';
  const nextYear = academicYear + 1;
  const pYear = toPersianDigits(academicYear);
  const pNextYear = toPersianDigits(nextYear);

  switch (semesterPart) {
    case 1:
      title = `نیمسال اول ${pYear}-${pNextYear}`;
      break;
    case 2:
      title = `نیمسال دوم ${pYear}-${pNextYear}`;
      break;
    case 3:
      title = `تابستان ${pNextYear}`;
      break;
    case 5:
      title = `معادل‌سازی ${pYear}-${pNextYear}`;
      break;
    case 0:
      title = `سوابق پایه ${pYear}`;
      break;
    default:
      title = `نیمسال ${toPersianDigits(semesterPart)} دوره ${pYear}`;
  }

  return {
    rawCode: String(rawCode),
    canonicalCode,
    academicYear,
    semesterPart,
    termType,
    isSummer: isSummer ? 1 : 0,
    sortOrder,
    title,
  };
}

/**
 * مقایسه ترتیبی دو کد ترم
 * @param {string|number} termA 
 * @param {string|number} termB 
 * @returns {number} منفی اگر A قبل از B باشد، صفر اگر برابر، مثبت اگر بعد از B
 */
export function compareTerms(termA, termB) {
  const normA = normalizeTerm(termA);
  const normB = normalizeTerm(termB);
  return normA.sortOrder - normB.sortOrder;
}

/**
 * همگام‌سازی و اعمال sortOrder و فیلدهای نرمالایز روی جدول academic_terms دیتابیس
 * @param {import('pg').PoolClient | import('pg').Pool} db 
 * @param {number} [universityId] 
 * @returns {Promise<Object>}
 */
export async function syncAcademicTerms(db, universityId = null) {
  let whereClause = '';
  let params = [];
  if (universityId) {
    whereClause = 'WHERE "universityId" = $1';
    params.push(universityId);
  }

  const termsRes = await db.query(
    `SELECT id, "termCode", "title", "termType", "sortOrder", "academicYear", "universityId"
     FROM academic_terms
     ${whereClause}`,
    params
  );

  let updatedCount = 0;
  for (const row of termsRes.rows) {
    const norm = normalizeTerm(row.termCode);
    await db.query(
      `UPDATE academic_terms SET
        "sortOrder" = $1,
        "academicYear" = $2,
        "termType" = $3,
        "isSummer" = $4
       WHERE id = $5`,
      [norm.sortOrder, norm.academicYear, norm.termType, norm.isSummer, row.id]
    );
    updatedCount++;
  }

  return {
    total: termsRes.rows.length,
    updated: updatedCount,
  };
}
