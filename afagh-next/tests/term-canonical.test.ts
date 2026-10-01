/**
 * تست نگاشت کاننیکال کد ترم (استاندارد آفاق — مطابق مهاجرت ۲۰۲۶-۱۰-۰۱)
 * اجرا: npx tsx tests/term-canonical.test.ts
 */
import {
  normalizeTermCode, sortTermsForTranscript, groupTermsByAcademicYear,
  termTypeFromDigit, EQUIVALENCE_GROUP_YEAR,
} from '../src/lib/scheduling-core.ts';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};

console.log('--- ۱. نوع ترم از رقم آخر (۵ رقمی کاننیکال) ---');
eq('13851 نیمسال اول ۱۳۸۵', normalizeTermCode('13851')?.termType, 'NORMAL');
eq('13851 سال', normalizeTermCode('13851')?.academicYear, 1385);
eq('13851 نیمسال', normalizeTermCode('13851')?.semester, 1);
eq('13921 NORMAL', normalizeTermCode('13921')?.termType, 'NORMAL');
eq('13922 NORMAL', normalizeTermCode('13922')?.termType, 'NORMAL');
eq('13923 SUMMER', normalizeTermCode('13923')?.termType, 'SUMMER');
eq('14013 SUMMER سال ۱۴۰۱', normalizeTermCode('14013')?.academicYear, 1401);
eq('13920 EQUIVALENCE', normalizeTermCode('13920')?.termType, 'EQUIVALENCE');
eq('13900 EQUIVALENCE', normalizeTermCode('13900')?.termType, 'EQUIVALENCE');
eq('13967 EQUIVALENCE (نه SUMMER)', normalizeTermCode('13967')?.termType, 'EQUIVALENCE');
eq('14000 EQUIVALENCE', normalizeTermCode('14000')?.termType, 'EQUIVALENCE');

console.log('--- ۲. نگاشت قدیمی شمس (مطابق مهاجرت DB) ---');
eq('891 → 13891', normalizeTermCode('891')?.normalizedCode, '13891');
eq('891 NORMAL', normalizeTermCode('891')?.termType, 'NORMAL');
eq('902 → 13902', normalizeTermCode('902')?.normalizedCode, '13902');
eq('993 → 13993 SUMMER', normalizeTermCode('993')?.termType, 'SUMMER');
eq('1401 → 14001 سال ۱۴۰۰', normalizeTermCode('1401')?.normalizedCode, '14001');
eq('1401 سال', normalizeTermCode('1401')?.academicYear, 1400);
eq('1403 → 14003 SUMMER', normalizeTermCode('1403')?.termType, 'SUMMER');
eq('1411 → 14011 سال ۱۴۰۱', normalizeTermCode('1411')?.normalizedCode, '14011');

console.log('--- ۳. کدهای نامعتبر → null ---');
eq('101 (بچ حذف‌شده) null', normalizeTermCode('101'), null);
eq('401 null', normalizeTermCode('401'), null);
eq('1401 چهارنویسه؟ نه — معتبر است', normalizeTermCode('1401') !== null, true);
eq('14555 سال نامعتبر null', normalizeTermCode('14555'), null);
eq('خالی null', normalizeTermCode(''), null);
eq('حروف null', normalizeTermCode('ABC'), null);

console.log('--- ۴. termTypeFromDigit ---');
eq('1 → NORMAL', termTypeFromDigit(1), 'NORMAL');
eq('2 → NORMAL', termTypeFromDigit(2), 'NORMAL');
eq('3 → SUMMER', termTypeFromDigit(3), 'SUMMER');
eq('0 → EQUIVALENCE', termTypeFromDigit(0), 'EQUIVALENCE');
eq('5 → EQUIVALENCE', termTypeFromDigit(5), 'EQUIVALENCE');

console.log('--- ۵. مرتب‌سازی: معادل‌سازی اول ---');
const sorted = sortTermsForTranscript([
  { termCode: '13961' }, { termCode: '13960' }, { termCode: '13963' }, { termCode: '14001' },
]);
eq('ترتیب', sorted.map(t => t.termCode), ['13960', '13961', '13963', '14001']);

console.log('--- ۶. بلوک معادل‌سازی اول کارنامه ---');
const groups = groupTermsByAcademicYear(
  [{ termCode: '13961' }, { termCode: '13960' }, { termCode: '14011' }],
  () => []
);
eq('اولین گروه معادل‌سازی است', groups[0].academicYear, EQUIVALENCE_GROUP_YEAR);
eq('کدهای بلوک معادل‌سازی', groups[0].terms.map(t => t.termCode), ['13960']);
eq('بعد سال جدیدتر', groups[1].academicYear, 1401);

console.log(`\nنتیجه: ${pass} موفق | ${fail} شکست`);
process.exit(fail === 0 ? 0 : 1);
