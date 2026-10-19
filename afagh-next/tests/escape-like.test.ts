/**
 * تست واحد خالص — جست‌وجوی فارسی و فرار LIKE (`src/lib/persian-search.ts`)
 *
 * پوشش: نرمال‌سازی حروف دو املایی/اعراب، تبدیل ارقام فارسی/عربی،
 * فرار کاراکترهای wildcard در LIKE (`escapeLikeChars`/`faLikePattern`)،
 * و تطبیق زیررشته‌ای نرمال‌شده (`faIncludes`).
 *
 * تنها وابستگی این ماژول `drizzle-orm` است (بدون server-only) → مناسب tsx.
 */
import {
  escapeLikeChars,
  faIncludes,
  faLikePattern,
  normalizeFa,
  toEnDigits,
} from '../src/lib/persian-search';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

console.log('\n— escapeLikeChars (فرار LIKE) —');
ok(escapeLikeChars('100%') === '100\\%', 'درصد فرار می‌شود');
ok(escapeLikeChars('a_b') === 'a\\_b', 'زیرخط فرار می‌شود');
ok(escapeLikeChars('a\\b') === 'a\\\\b', 'بک‌اسلش فرار می‌شود');
ok(escapeLikeChars('%_\\') === '\\%\\_\\\\', 'هر سه کاراکتر خاص فرار می‌شوند');
ok(escapeLikeChars('%%') === '\\%\\%', 'چند درصد پشت‌سرهم فرار می‌شوند');
ok(escapeLikeChars('سلام') === 'سلام', 'متن عادی دست‌نخورده می‌ماند');
ok(escapeLikeChars('') === '', 'رشتهٔ خالی → خالی');
ok(escapeLikeChars(null) === '', 'null → رشتهٔ خالی');
ok(escapeLikeChars(undefined) === '', 'undefined → رشتهٔ خالی');

console.log('\n— faLikePattern —');
ok(faLikePattern('50%_') === '%50\\%\\_%', 'الگوی فرارشده داخل % قرار می‌گیرد');
ok(faLikePattern('كتاب') === '%کتاب%', 'حرف عربی پيش از ساخت الگو نرمال می‌شود');
ok(faLikePattern(null) === '%%', 'ورودی خالی → فقط دو درصد');
ok(faLikePattern('  سلام  ') === '%سلام%', 'فاصله‌های اضافی trim می‌شوند');

console.log('\n— normalizeFa (حروف دو املایی/اعراب) —');
ok(normalizeFa('ي') === 'ی' && normalizeFa('ك') === 'ک', 'ي→ی و ك→ک');
ok(normalizeFa('ة') === 'ه' && normalizeFa('ؤ') === 'و' && normalizeFa('ئ') === 'ی', 'ة→ه و ؤ→و و ئ→ی');
ok(normalizeFa('أحمد') === 'احمد' && normalizeFa('إ') === 'ا' && normalizeFa('آ') === 'ا', 'أ/إ/آ→ا');
ok(normalizeFa('كتاب‌ها') === 'کتاب ها', 'نیم‌فاصله به فاصله تبدیل می‌شود');
ok(normalizeFa('مـدرسه') === 'مدرسه', 'تطویل حذف می‌شود');
ok(normalizeFa('مُعلّم') === 'معلم', 'اعراب حذف می‌شود');
ok(normalizeFa('  a   b  ') === 'a b', 'فاصله‌های تکراری و ابتدا/انتها اصلاح می‌شوند');
ok(normalizeFa(null) === '' && normalizeFa(undefined) === '', 'null/undefined → رشتهٔ خالی');

console.log('\n— toEnDigits (ارقام فارسی/عربی) —');
ok(toEnDigits('۰۱۲۳۴۵۶۷۸۹') === '0123456789', 'ارقام فارسی → لاتین');
ok(toEnDigits('٠١٢٣٤٥٦٧٨٩') === '0123456789', 'ارقام عربی-هندی → لاتین');
ok(toEnDigits('SA۰۱۲۵') === 'SA0125', 'حروف دست‌نخورده و فقط ارقام تبدیل می‌شوند');
ok(toEnDigits('abc') === 'abc', 'رشتهٔ بدون رقم دست‌نخورده می‌ماند');
ok(toEnDigits(null) === '' && toEnDigits(undefined) === '', 'null/undefined → رشتهٔ خالی');

console.log('\n— faIncludes (تطبیق نرمال‌شده) —');
ok(faIncludes('كتاب فارسی', 'کتاب') === true, 'شکل عربی/فارسی یکدیگر را می‌یابند');
ok(faIncludes('سیب', '') === true, 'سوزن خالی همه‌چیز را شامل می‌شود');
ok(faIncludes('SA۰۱۲۵', '0125') === true, 'کد ذخیره‌شدهٔ فارسی با جست‌وجوی لاتین پیدا می‌شود');
ok(faIncludes('مدرسه', 'ة') === true, 'نیازل با نرمال‌سازی پیدا می‌شود');
ok(faIncludes('abc', 'xyz') === false, 'عدم تطبیق → false');
ok(faIncludes(null, 'x') === false, 'متن خالی → false (سوزن غیرخالی)');
ok(faIncludes('x', null) === true, 'سوزن null → true');

if (fail) { console.log(`\n✗ ${fail} failed, ${pass} passed`); process.exit(1); }
console.log(`\n✓ همه (${pass}) گذشت`);
