import {
  compactHelpText,
  helpEntrySearchText,
  helpScoreEntry,
  helpTextTokens,
  normalizeHelpText,
  searchHelpIndex,
  toLatinDigits,
} from '../src/components/help/help-normalize';
import type { HelpIndexEntry } from '../src/components/help/help-types';

let pass = 0,
  fail = 0;
const ok = (c: boolean, m: string) => {
  if (c) {
    pass++;
    console.log('  ✓', m);
  } else {
    fail++;
    console.log('  ✗', m);
  }
};

const entry = (over: Partial<HelpIndexEntry>): HelpIndexEntry => ({
  role: 'student',
  roleLabel: 'دانشجو',
  roleIcon: '🎓',
  slug: 'enroll',
  title: 'انتخاب واحد',
  section: 'ثبت‌نام و برنامه درسی',
  sectionKey: 'enroll',
  path: '/student/enroll',
  summary: 'چیدمان خودکار دروس ترم و کنترل تداخل',
  keywords: ['سبد', 'پیش‌نیاز', 'هم‌نیاز'],
  ...over,
});

console.log('\n— toLatinDigits —');
ok(toLatinDigits('۱۴۰۳') === '1403', 'ارقام فارسی → لاتین');
ok(toLatinDigits('٤٠٢') === '402', 'ارقام عربی → لاتین');
ok(toLatinDigits('نیمسال ۲') === 'نیمسال 2', 'ارقام درون متن عربی هم تبدیل می‌شود');
ok(toLatinDigits(null) === '', 'null → رشته خالی');

console.log('\n— normalizeHelpText —');
ok(normalizeHelpText('علي') === 'علی', 'ي عربی → ی فارسی');
ok(normalizeHelpText('كتابخانه') === 'کتابخانه', 'ك عربی → ک فارسی');
ok(normalizeHelpText('مهر') === 'مهر', 'ة عربی → ه فارسی');
ok(normalizeHelpText('می‌روم') === 'می روم', 'نیم‌فاصله → فاصله');
ok(normalizeHelpText('درخواست  «گواهی»!') === 'درخواست گواهی', 'علائم نگارشی حذف می‌شوند');
ok(normalizeHelpText('انتخاب‌واحد') === 'انتخاب واحد', 'نیم‌فاصله در وسط واژه هم جدا می‌شود');
ok(normalizeHelpText('  کارنامه  ') === 'کارنامه', 'فاصله‌های اضافه و trim');
ok(normalizeHelpText(undefined) === '', 'undefined → رشته خالی');
ok(normalizeHelpText('/student/enroll') === 'student enroll', 'مسیر لاتین به واژه‌های قابل جست‌وجو تبدیل می‌شود');

console.log('\n— compactHelpText / helpTextTokens —');
ok(compactHelpText('انتخاب واحد') === 'انتخابواحد', 'نسخهٔ فشرده برای تطبیق بی‌فاصله');
ok(compactHelpText('کارنامه کل') === 'کارنامهکل', 'فاصله‌ها حذف می‌شوند');
ok(helpTextTokens('کارنامه کارنامه تحصیلی').join(',') === 'کارنامه,تحصیلی', 'توکن‌های تکراری حذف می‌شوند');
ok(helpTextTokens('').length === 0, 'ورودی خالی → بدون توکن');

console.log('\n— helpScoreEntry —');
ok(helpScoreEntry(entry({}), '') === 0, 'پرسش خالی امتیاز صفر دارد');
ok(helpScoreEntry(entry({}), 'انتخاب') > 0, 'تطبیق عنوان');
ok(helpScoreEntry(entry({}), 'نياز') > 0, 'پرسش با ي عربی به کلیدواژهٔ «هم‌نیاز» می‌خورد');
ok(helpScoreEntry(entry({}), 'پيش‌نياز') > 0, 'پرسش «پيش‌نياز» با ي و ك عربی به کلیدواژهٔ «پیش‌نیاز» می‌خورد');
ok(helpScoreEntry(entry({}), 'سبد') > 0, 'تطابق از راه کلیدواژه');
ok(helpScoreEntry(entry({}), 'ناموجودبوده') === 0, 'واژهٔ بی‌ربط امتیاز صفر');
ok(
  helpScoreEntry(entry({}), 'انتخاب') > helpScoreEntry(entry({}), 'سبد'),
  'تطابق عنوان از تطابق کلیدواژه امتیاز بالاتری دارد',
);
ok(helpScoreEntry(entry({}), 'انتخابواحد') > 0, 'جست‌وجوی بی‌فاصلهٔ «انتخابواحد» هم می‌خورد');
ok(
  helpScoreEntry(entry({ title: 'انتخاب واحد' }), 'واحد') > helpScoreEntry(entry({ title: 'انتخاب واحد' }), 'ناموجودبوده'),
  'امتیاز مثبت برای تطابق واقعی',
);

console.log('\n— searchHelpIndex —');
const index: HelpIndexEntry[] = [
  entry({}),
  entry({ role: 'admin', roleLabel: 'مدیر سامانه', slug: 'terms', title: 'مدیریت نیمسال‌ها', section: 'زیرساخت', path: '/admin/terms', keywords: ['ترم', 'پرچم فعال'] }),
  entry({ role: 'professor', roleLabel: 'استاد', slug: 'grades', title: 'بارم‌بندی و ثبت نمرات', section: 'ارزشیابی', path: '/professor/grades', keywords: ['نمره', 'میان‌ترم'] }),
];
ok(searchHelpIndex(index, '').length === 3, 'پرسش خالی → همهٔ رکوردها');
ok(searchHelpIndex(index, 'نیمسال').length === 1, 'جست‌وجوی «نیمسال» فقط نتیجهٔ مدیریت نیمسال را می‌دهد');
ok(searchHelpIndex(index, 'نمره').map(e => e.slug).join(',') === 'grades', 'جست‌وجوی «نمره» صفحهٔ نمرات استاد را پیدا می‌کند');
ok(
  searchHelpIndex(index, 'نمره', { role: 'student' }).length === 0,
  'فیلتر نقش، نتایج نقش دیگر را حذف می‌کند',
);
ok(searchHelpIndex(index, 'كارنامه').length === 0, 'کلیدواژهٔ بی‌ربط در فهرست → بدون نتیجه');
ok(searchHelpIndex(index, 'نياز').map(e => e.slug).join(',') === 'enroll', 'جست‌وجوی «نياز» با ي عربی کلیدواژهٔ «هم‌نیاز» را پیدا می‌کند');
ok(searchHelpIndex(index, 'پيش نياز').map(e => e.slug).join(',') === 'enroll', 'جست‌وجوی «پيش نياز» با ي عربی کلیدواژهٔ «پیش‌نیاز» را پیدا می‌کند');
ok(searchHelpIndex(index, 'نیمسال', { limit: 1 }).length === 1, 'سقف نتیجه اعمال می‌شود');
ok(helpEntrySearchText(index[0]).includes('انتخاب'), 'متن جست‌وجوی رکورد شامل عنوان است');

if (fail) {
  console.log(`\n✗ ${fail} failed, ${pass} passed`);
  process.exit(1);
}
console.log(`\n✓ همه (${pass}) گذشت`);