#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  sama-student-fields — نگاشت ستون‌های MAININFO سما → ستون‌های آفاق
 *
 *  چرا این فایل جدا است: اسکریپتهای .mjs نمیتوانند مستقیماً .ts را import
 *  کنند، و این نگاشت‌ها در دو جا لازم می‌شوند:
 *    ▸ `import-new-master.mjs` — درج/غنیسازی دانشجویان تازه
 *    ▸ `migrate-legacy-students.mjs` — به‌روزرسانی وضعیت (مصرف کم)
 *  قرارداد نگاشت با `src/lib/student-labels.ts` هم‌راستاست و
 *  `tests/master-import-contract.test.ts` مقادیر کلیدی را گارد میکند.
 *
 *  ── قرارداد ذخیره‌سازی تاریخ‌ها (مهم!) ─────────────────────────────────
 *    students.entryDate  : ستون `date` ولی مقدار **شمسیِ literal** نگه داشته
 *                          میشود (`1405-07-01`) — پنل «تاریخ ورود (شمسی)»
 *                          همان را میخواند. ⛔ تبدیل میلادی ممنوع.
 *    users.birthDate     : ستون `timestamp` و مقدار **میلادی** (چون
 *                          birthDateInput() پنل میلادی را به شمسی برمیگرداند).
 *                          ⛔ پس تاریخ تولد سما باید جلالی→میلادی شود.
 *
 *  ── منشأ هر نگاشت (شواهد از دیتابیس لایو + MSSQL سما) ──────────────────
 *    SAHMN              → students.quotaType      (همان mapQuota قدیمی)
 *    TraningMethodId    → students.trainingMethod (همان کدهای TRAINING_METHOD_FA)
 *    COURSTYPE          → students.studyingMode   (همان کدهای COURSE_TYPE_FA)
 *    TuitionTypeId      → students.tuitionType    (شمارش دقیقاً یکی است)
 *    ADVISORDONCODE     → students.advisorCode    (شمارش عیناً یکی است)
 *    BOOMI              → students.nativeType     (بومی/غیربومی)
 *    NEZAM              → students.militaryStatus (عنوان فارسی)
 *    ADDRESS            → users.address
 *    HOMETELL           → students.homeTell       (تلفن ثابت؛ «موبایل» نیست)
 *    NAMEP              → users.fatherName
 *    BIRTHDATE          → users.birthDate         (شمسی → میلادی)
 *    isIranian/Nationality → users.nationality    ('120001' = ایران)
 *
 *  ── فیلدهایی که سما در MAININFO ندارد ⇒ تهی میمانند (نه ساختگی) ───────
 *    users.postalCode · users.email · users.mobile · users.birthCertNo
 *    students.acceptanceType (نحوهٔ ورود) · students.ethnicity
 *    students.documentStatus · students.acceptanceAllocation
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** تبدیل جلالی→میلادی (الگوریتم استاندارد jalaali-js). */
export function jalaliToGregorian(jy, jm, jd) {
  jy += 1595;
  let days = -355668 + 365 * jy + ~~(jy / 33) * 8 + ~~(((jy % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * ~~(days / 146097);
  days %= 146097;
  if (days > 36524) { days--; gy += 100 * ~~(days / 36524); days %= 36524; if (days >= 365) days++; }
  gy += 4 * ~~(days / 1461);
  days %= 1461;
  if (days > 365) { days -= 366; gy += 1; while (days > 364) { days -= 365; gy += 1; } }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const sal = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (; gm < 12 && gd > sal[gm]; gm++) gd -= sal[gm];
  return { gy, gm: gm + 1, gd };
}

/** طول ماه جلالی (برای اعتبارسنجی). */
export function jalaliMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return ((((jy % 4 === 3) && (jy % 100 !== 3)) || (jy % 400 === 3)) ? 30 : 29);
}

/** قالب تاریخ سما: «YYYY/MM/DD» (گاهی «YYYY-MM-DD» یا فقط «YYYY»). */
function parseSamaDate(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})[/-](\d{1,2})(?:[/-](\d{1,2}))?/);
  if (!m) return null;
  const y = Number(m[1]);
  if (y < 1300 || y > 1500) return null;
  const mo = m[2] ? Number(m[2]) : 1;
  const d = m[3] ? Number(m[3]) : 1;
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > jalaliMonthLength(y, mo)) return null;
  return { y, mo, d };
}

/**
 * تاریخ تولد سما (شمسی) → تاریخ میلادی `YYYY-MM-DD` برای users.birthDate.
 * ورودی نامعتبر ⇒ null (fail-closed: تاریخ ساختگی ننویسیم).
 */
export function birthDateToGregorian(v) {
  const p = parseSamaDate(v);
  if (!p) return null;
  const g = jalaliToGregorian(p.y, p.mo, p.d);
  return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
}

/**
 * تاریخ ورود سما (شمسی) → literal شمسی `YYYY-MM-DD` برای students.entryDate.
 * ⚠️ عمداً **بدون** تبدیل میلادی — پنل «تاریخ ورود (شمسی)» همین را میخواند.
 */
export function entryDateJalali(v) {
  const p = parseSamaDate(v);
  if (!p) return null;
  return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/**
 * سهمیه از شمارهٔ سهمیهٔ سما (SAHMN) — همان نگاشت `mapQuota` در مهاجرت
 * قدیمی (import-sama-afagh) تا سهمیهٔ دانشجوی تازه با قدیمی یکی باشد:
 *   شاهد/ایثارگر ⇒ SHAHED · کارکنان ⇒ STAFF · استعداد درخشان ⇒ TOP_TALENT
 */
export const SAMA_SHAHED_SAHM = Object.freeze(['5', '6', '7', '8', '9', '11', '12', '13', '14', '15', '19', '21']);
export const SAMA_STAFF_SAHM = Object.freeze(['4', '23']);
export const SAMA_TALENT_SAHM = Object.freeze(['17', '18', '24', '25']);

/** @param {unknown} sahm کد SAHMN سما */
export function mapQuotaSahm(sahm) {
  const s = String(sahm ?? '').trim();
  if (!s) return null;
  if (SAMA_SHAHED_SAHM.includes(s)) return 'SHAHED';
  if (SAMA_STAFF_SAHM.includes(s)) return 'STAFF';
  if (SAMA_TALENT_SAHM.includes(s)) return 'TOP_TALENT';
  return 'NORMAL';
}

/**
 * وضعیت نظام وظیفه از کد NEZAM سما — عنوان فارسی (همان گزینه‌های پنل
 * «وضعیت نظام وظیفه» در StudentProfilePanel.tsx).
 */
export const SAMA_MILITARY_FA = Object.freeze({
  '0': 'فاقد معافیت',
  '1': 'خانم است و وضعیت نظام وظیفه ندارد',
  '2': 'مشمول است و دفترچه دارد',
  '3': 'مشمول است ولی دفترچه ندارد',
  '4': 'معافیت پزشکی یا کفالت',
  '5': 'کارت پایان خدمت',
  '6': 'سرباز ترخیصی',
  '7': 'معافیت تحصیلی فعال',
  '8': 'معافیت دائم',
  '9': 'کارمند آموزش و پرورش',
  '10': 'کارمند',
  '11': 'دانشجوی انصرافی',
  '12': 'دانشجوی سال آخر مقطع قبل',
  '13': 'فارغ‌التحصیل بدون غیبت',
  '14': 'متولد ماقبل ۱۳۵۲',
  '15': 'کارکنان متعهد خدمت ارگان‌ها',
  '16': 'مشمول نیست',
  '17': 'فاقد معافیت',
});

/** @param {unknown} nezam کد NEZAM سما */
export function mapMilitaryNezam(nezam) {
  const s = String(nezam ?? '').trim();
  if (!s) return null;
  return SAMA_MILITARY_FA[s] ?? null;
}

/**
 * بومی/غیربومی از کد BOOMI سما — کد خام (۰..۳) نگه داشته میشود، درست مثل
 * داده‌های قدیمی که `students.nativeType` کد خام دارند.
 */
export function mapNativeBoomi(boomi) {
  const s = String(boomi ?? '').trim();
  if (!s) return null;
  if (!['0', '1', '2', '3'].includes(s)) return null;
  return s;
}

/**
 * ملیت: سما کد می‌دهد (Nationality=1 یا isIranian=1 ⇒ ایران). کد وزارت
 * «ایران» در آفاق `120001` است (همان مقدار داده‌های قدیمی).
 */
export function mapNationality(isIranian, nationality) {
  const nat = String(nationality ?? '').trim();
  if (nat === '1') return '120001';
  const iran = String(isIranian ?? '').trim();
  if (iran === '1') return '120001';
  return null;
}

/**
 * شیوهٔ آموزش (TraningMethodId) و نوع دوره (COURSTYPE/TuitionTypeId) — کد
 * خام نگه داشته میشود؛ پنل خودش عنوان فارسی را نشان می‌دهد.
 */
export function mapTrainingMethod(id) {
  const s = String(id ?? '').trim();
  if (!s) return null;
  return ['0', '1', '2', '3', '4', '8', '11'].includes(s) ? s : null;
}

export function mapCourseType(id) {
  const s = String(id ?? '').trim();
  if (!s) return null;
  if (!/^\d{1,3}$/.test(s)) return null;
  return s === '0' ? null : s; // ۰ = نامشخص ⇒ تهی
}

/** کد استاد راهنما (ADVISORDONCODE) — کد خام پرسنلی سما. */
export function mapAdvisorCode(v) {
  const s = String(v ?? '').trim();
  if (!s || s === '0') return null;
  if (!/^\d{1,10}$/.test(s)) return null;
  return s;
}

/** حداکثر طول ستون‌های متنی آفاق (برای برش ایمن). */
export const LIMITS = Object.freeze({
  address: 300, fatherName: 100, homeTell: 20, advisorCode: 50,
  militaryStatus: 50, scholarshipType: 100, militaryExemptionNo: 50,
});

/** برش امن رشته به سقف ستون. */
export function clip(v, max) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}
