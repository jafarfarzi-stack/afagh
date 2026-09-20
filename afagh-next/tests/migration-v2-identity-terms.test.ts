/**
 * ══════════════════════════════════════════════════════════════════════
 *  تست‌های واحد Migration V2:
 *  ۱. اعتبارسنجی و پالایش کدهای ملی ایران و مقابله با کدهای ساختگی
 *  ۲. نرمال‌سازی متون فارسی و محاسبه تشابه هویتی
 *  ۳. تصمیم‌گیری‌های تطبیق هویت (SAME_PERSON, DIFFERENT_PERSON, REVIEW_REQUIRED)
 *  ۴. ساخت ساختار هویت مبدأ (Source Identity) بدون آلودگی با کدهای جعلی
 *  ۵. نرمال‌سازی ترتیبی ترم‌ها و تضمین تقدم و تأخر زمانی (مانند ۱۴۰۱۵ قبل از ۱۴۰۲۱)
 * ══════════════════════════════════════════════════════════════════════
 */
import {
  isValidIranianNationalCode,
  normalizePersianText,
  stringSimilarity,
  evaluateCandidateMatch,
  resolveIdentity,
  IdentityResolution,
  MatchMethod,
} from '../scripts/migration-v2/identity/candidate-matcher.mjs';

import {
  sanitizeNationalCode,
  buildSourceIdentity,
} from '../scripts/migration-v2/identity/source-identity.mjs';

import {
  normalizeTerm,
  compareTerms,
  sanitizeTermCode,
} from '../scripts/migration-v2/terms/term-normalizer.mjs';

let pass = 0;
let fail = 0;

const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);
  }
};

const okTrue = (name: string, val: unknown) => eq(name, Boolean(val), true);
const okFalse = (name: string, val: unknown) => eq(name, Boolean(val), false);

console.log('\n--- ۱. تست‌های اعتبارسنجی و پالایش کد ملی ایران ---');

// کدهای ملی معتبر
okTrue('کد ملی معتبر 0010376811', isValidIranianNationalCode('0010376811'));
okTrue('کد ملی معتبر 1270384211', isValidIranianNationalCode('1270384211'));
okTrue('کد ملی معتبر 0499370899', isValidIranianNationalCode('0499370899'));

// کدهای نامعتبر و ساختگی
okFalse('کد خالی', isValidIranianNationalCode(''));
okFalse('کد با رقم کنترل اشتباه', isValidIranianNationalCode('0010376812'));
okFalse('کد ۱۰ رقمی با ارقام یکسان 0000000000', isValidIranianNationalCode('0000000000'));
okFalse('کد ۱۰ رقمی با ارقام یکسان 1111111111', isValidIranianNationalCode('1111111111'));
okFalse('کد تستی 0123456789', isValidIranianNationalCode('0123456789'));
okFalse('کد سما با پیشوند S78001234', isValidIranianNationalCode('S78001234'));

// پالایش کد ملی
eq('پالایش کد معتبر', sanitizeNationalCode('0010376811'), '0010376811');
eq('پالایش کد نامعتبر ساختگی S78001234 به null', sanitizeNationalCode('S78001234'), null);
eq('پالایش کد تکراری 0000000000 به null', sanitizeNationalCode('0000000000'), null);
eq('پالایش کد نامعتبر با ارقام فارسی', sanitizeNationalCode('۰۰۱۰۳۷۶۸۱۱'), '0010376811');

console.log('\n--- ۲. تست‌های نرمال‌سازی متون فارسی و تشابه ---');

eq('تبدیل ي و ى عربی به ی', normalizePersianText('علي رضائي'), 'علی رضایی');
eq('تبدیل ك عربی به ک', normalizePersianText('كميل كيا'), 'کمیل کیا');
eq('حذف اعراب و تنوین', normalizePersianText('مُحَمَّدٌ عَبْدُاللّهِ'), 'محمد عبدالله');
eq('حذف نیم‌فاصله‌ها و خط تیره', normalizePersianText('علی‌رضا میر-زائی'), 'علی رضا میر زایی');

const simExact = stringSimilarity('علی رضایی', 'علي رضائي');
eq('شباهت نام یکسان با حروف عربی/فارسی = 1.0', simExact, 1.0);

const simClose = stringSimilarity('سید علی موسوی', 'سید علی موسوی نسب');
okTrue('شباهت بالا برای نام‌های نزدیک', simClose >= 0.75);

console.log('\n--- ۳. تصمیم‌گیری‌های تطبیق هویت (Identity Resolution) ---');

// ۳.۱ کد ملی معتبر و یکسان با نام هماهنگ -> SAME_PERSON
const matchSame = resolveIdentity(
  { nationalCode: '0010376811', firstName: 'علی', lastName: 'رضایی' },
  { nationalCode: '0010376811', firstName: 'علی', lastName: 'رضایی', personId: 501 }
);
eq('تطابق قطعی: SAME_PERSON', matchSame.resolution, IdentityResolution.SAME_PERSON);
eq('روش تطابق: VALID_NATIONAL_CODE_AND_NAME', matchSame.method, MatchMethod.VALID_NATIONAL_CODE_AND_NAME);
eq('شناسه شخص انتخاب شده = 501', matchSame.candidateId, 501);
okTrue('اجازه ادغام خودکار: بله', matchSame.canAutoMerge);

// ۳.۲ کدهای ملی معتبر متفاوت -> DIFFERENT_PERSON
const matchDiff = resolveIdentity(
  { nationalCode: '0010376811', firstName: 'علی', lastName: 'رضایی' },
  { nationalCode: '1270384211', firstName: 'علی', lastName: 'رضایی', personId: 502 }
);
eq('تضاد کد ملی: DIFFERENT_PERSON', matchDiff.resolution, IdentityResolution.DIFFERENT_PERSON);
okFalse('اجازه ادغام خودکار: خیر', matchDiff.canAutoMerge);

// ۳.۳ کد ملی یکسان با تضاد شدید در نام -> REVIEW_REQUIRED
const matchConflictName = resolveIdentity(
  { nationalCode: '0010376811', firstName: 'کامران', lastName: 'افشار' },
  { nationalCode: '0010376811', firstName: 'زهرا', lastName: 'حسینی', personId: 503 }
);
eq('کد ملی یکسان با نام کاملاً متفاوت: REVIEW_REQUIRED', matchConflictName.resolution, IdentityResolution.REVIEW_REQUIRED);
okFalse('اجازه ادغام خودکار: خیر', matchConflictName.canAutoMerge);

// ۳.۴ کد ملی نامعتبر یا خالی با شباهت نام و نام پدر -> REVIEW_REQUIRED
const matchFuzzy = resolveIdentity(
  { nationalCode: 'S78001234', firstName: 'محمد', lastName: 'کریمی', fatherName: 'حسین' },
  { nationalCode: '0499370899', firstName: 'محمد', lastName: 'کریمی', fatherName: 'حسین', personId: 504 }
);
eq('کد ملی خالی/جعلی با نام مشابه: REVIEW_REQUIRED', matchFuzzy.resolution, IdentityResolution.REVIEW_REQUIRED);
okFalse('اجازه ادغام خودکار در غیاب کد ملی: هرگز خیر', matchFuzzy.canAutoMerge);

// ۳.۵ کد ملی خالی و بدون نامزد -> NEW_PERSON_PENDING
const matchNoCand = resolveIdentity(
  { nationalCode: '0000000000', firstName: 'فرد', lastName: 'ناشناس' },
  null
);
eq('بدون مدرک قطعی و بدون نامزد: NEW_PERSON_PENDING', matchNoCand.resolution, IdentityResolution.NEW_PERSON_PENDING);

console.log('\n--- ۴. تست ساخت منبع هویت (Source Identity) و مصونیت از کدهای جعلی ---');

const srcWithDummy = buildSourceIdentity({
  universityId: 1,
  sourceStudentCode: '87012345',
  sourceNationalCode: 'S78001234',
  sourceFirstName: 'علي',
  sourceLastName: 'محمدي',
});
eq('کد ملی جعلی نباید ذخیره شود', srcWithDummy.sourceNationalCode, null);
eq('نام نرمال‌شده', srcWithDummy.normalizedFirstName, 'علی');
eq('نام خانوادگی نرمال‌شده', srcWithDummy.normalizedLastName, 'محمدی');
eq('وضعیت اولیه بدون کد ملی', srcWithDummy.identityStatus, 'NEW_PERSON_PENDING');

console.log('\n--- ۵. تست‌های نرمال‌سازی ترتیبی ترم‌ها و تقدم زمانی ---');

// ۵.۱ کدهای ۳ رقمی (زرینه)
const term871 = normalizeTerm('871');
eq('زرینه 871 -> 13871', term871.canonicalCode, '13871');
eq('زرینه 871 سال 1387', term871.academicYear, 1387);
eq('زرینه 871 نیمسال 1', term871.semesterPart, 1);
eq('زرینه 871 نوع NORMAL', term871.termType, 'NORMAL');

const term012 = normalizeTerm('012');
eq('زرینه 012 -> 14012', term012.canonicalCode, '14012');
eq('زرینه 012 سال 1401', term012.academicYear, 1401);
eq('زرینه 012 نیمسال 2', term012.semesterPart, 2);

const term023 = normalizeTerm('023');
eq('زرینه 023 -> تابستان 1402', term023.termType, 'SUMMER');
eq('زرینه 023 نشانگر تابستان', term023.isSummer, 1);

// ۵.۲ کد معادل‌سازی ۱۴۰۱۵
const term14015 = normalizeTerm('14015');
eq('ترم 14015 نوع EQUIVALENCE', term14015.termType, 'EQUIVALENCE');
eq('ترتیب عددی 14015', term14015.sortOrder, 14015);

// ۵.۳ تقدم زمانی دقیق: ۱۴۰۱۵ باید قبل از ۱۴۰۲۱ قرار گیرد!
const cmp14015_14021 = compareTerms('14015', '14021');
okTrue('ترم 14015 اکیداً پیش از ترم 14021 است', cmp14015_14021 < 0);

// بررسی توالی کامل سال تحصیلی
okTrue('13871 < 13872', compareTerms('13871', '13872') < 0);
okTrue('13872 < 13873 (تابستان)', compareTerms('13872', '13873') < 0);
okTrue('13873 (تابستان 87) < 13881 (مهر 88)', compareTerms('13873', '13881') < 0);

// ۵.۴ عناوین استاندارد ترم
eq('عنوان نیمسال اول', normalizeTerm('14011').title, 'نیمسال اول ۱۴۰۱-۱۴۰۲');
eq('عنوان نیمسال دوم', normalizeTerm('14012').title, 'نیمسال دوم ۱۴۰۱-۱۴۰۲');
eq('عنوان تابستان', normalizeTerm('14013').title, 'تابستان ۱۴۰۲');
eq('عنوان معادل‌سازی', normalizeTerm('14015').title, 'معادل‌سازی ۱۴۰۱-۱۴۰۲');

console.log(`\n========================================`);
console.log(`نتیجه تست‌ها: ${pass} موفق | ${fail} شکست`);
console.log(`========================================\n`);

if (fail > 0) {
  process.exit(1);
}
