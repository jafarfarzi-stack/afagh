// ════════════════════════════════════════════════════════════════════════
//  تجزیهٔ متنِ «پیش‌نیاز / هم‌نیاز / دروس هم‌ارز» از فایل سیستم قدیمی.
//
//  چرا: در سامانهٔ قدیمی این سه ستون داخل «جدول دروس» بود و در مهاجرت
//  به کل نادیده گرفته شد (مهاجرت فقط کد/نام/واحد/نوع/مقطع/گروه را می‌خواند).
//  نتیجه: `course_rules` خالی ماند و هیچ هشدار پیش‌نیازی روی چارت دیده نشد.
//  این ماژول خالص است تا هم مهاجرت و هم تست واحد از آن استفاده کنند.
// ════════════════════════════════════════════════════════════════════════

export interface LogicLeaf { course: string }
export interface LogicGroup { operator: 'AND' | 'OR'; conditions: (LogicLeaf | LogicGroup)[] }
export type ParsedLogic = LogicGroup;

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** یکسان‌سازی: ارقام فارسی/عربی → لاتین، حروف عربی → فارسی، فاصله‌های عجیب */
export function normalizeRequisiteText(raw: string | null | undefined): string {
  let s = String(raw ?? '');
  s = s.replace(/[۰-۹]/g, d => String(FA_DIGITS.indexOf(d)));
  s = s.replace(/[٠-٩]/g, d => String(AR_DIGITS.indexOf(d)));
  s = s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\u200c/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** عبارت‌هایی که یعنی «پیش‌نیازی ندارد» */
const EMPTY_TOKENS = ['', '-', '—', '–', 'ندارد', 'هیچ', 'بدون پیش نیاز', 'بدون پیش‌نیاز', 'ندارد.', '0'];

/** برچسب‌های ابتدای سلول که باید حذف شوند («پیش‌نیاز: …») */
const LABEL_RE = /^\s*(پیش\s*نیاز|پیشنیاز|هم\s*نیاز|همنیاز|هم\s*ارز|همارز|معادل|دروس\s*معادل|prereq(?:uisite)?s?|co-?req(?:uisite)?s?|equivalent)\s*[:：\-–]?\s*/i;

/**
 * جداکنندهٔ «یا» (OR). تنها جداکننده‌ای است که باید تشخیص داده شود، چون
 * AND «همهٔ کدها» است و extractCourseCodes خودش همهٔ کدهای متن را جمع می‌کند
 * (با هر جداکننده‌ای: «،» «و» «+» «/» «|» خط تیره یا فاصله).
 * «|» در خروجی «جدول دروس» سما جداکنندهٔ AND است (مثال واقعی: `1100|27007`)
 * و «||» به‌صورت OR تفسیر می‌شود.
 */
const OR_SPLIT_RE = /\s*(?:\s+یا\s+|\s+or\s+|\|\|)\s*/i;

/**
 * استخراج کدهای درس از یک متن آزاد.
 * الگو: حروف لاتین اختیاری + ۲ تا ۶ رقم؛ طول کل دست‌کم ۳ (تا «۱۲» اشتباهی کد نشود).
 */
export function extractCourseCodes(text: string | null | undefined): string[] {
  const s = normalizeRequisiteText(text);
  if (!s) return [];
  const out: string[] = [];
  const re = /[A-Za-z]{0,6}\d{2,6}/g;
  for (const m of s.matchAll(re)) {
    const code = m[0].toUpperCase();
    if (code.replace(/\D/g, '').length < 2) continue;
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

/**
 * متن پیش‌نیاز/هم‌نیاز → درخت منطقی (همان ساختار course_rules.logicTree).
 *  • «یا» → OR ، بقیه (ویرگول/و/+) → AND
 *  • اگر کدی پیدا نشود → null (یعنی قاعده‌ای ثبت نشود)
 */
export function parseRequisiteText(text: string | null | undefined): ParsedLogic | null {
  const s = normalizeRequisiteText(text).replace(LABEL_RE, '');
  if (EMPTY_TOKENS.includes(s.toLowerCase())) return null;

  const orParts = s.split(OR_SPLIT_RE).filter(p => p.trim() !== '');
  if (orParts.length > 1) {
    const codes: string[] = [];
    for (const p of orParts) for (const c of extractCourseCodes(p)) if (!codes.includes(c)) codes.push(c);
    if (codes.length === 0) return null;
    return { operator: 'OR', conditions: codes.map(course => ({ course })) };
  }

  const codes = extractCourseCodes(s);
  if (codes.length === 0) return null;
  return { operator: 'AND', conditions: codes.map(course => ({ course })) };
}

/** متن «دروس هم‌ارز» → فهرست کدها (بدون خودِ درس) */
export function parseEquivalentCodes(text: string | null | undefined, selfCode?: string | null): string[] {
  const codes = extractCourseCodes(text);
  const self = (selfCode ?? '').toUpperCase().trim();
  return self ? codes.filter(c => c !== self) : codes;
}

/** آیا این متن اصلاً حاوی کد درس است؟ (برای هشدار «ستون بود ولی خالی/بی‌کد») */
export function hasAnyCourseCode(text: string | null | undefined): boolean {
  return extractCourseCodes(text).length > 0;
}
