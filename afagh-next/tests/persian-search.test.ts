/**
 * جست‌وجوی فارسی — «ي» با «ی» و «ك» با «ک» باید همدیگر را پیدا کنند.
 * هم سمت کاربر (normalizeFa/faIncludes) و هم سمت دیتابیس (normCol).
 */
import { faIncludes, faLikePattern, normalizeFa, normCol } from '../src/lib/persian-search';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

console.log('\n— normalizeFa —');
ok(normalizeFa('علي') === 'علی', 'ي عربی → ی فارسی');
ok(normalizeFa('كتاب') === 'کتاب', 'ك عربی → ک فارسی');
ok(normalizeFa('فاطمة') === 'فاطمه', 'ة → ه');
ok(normalizeFa('مؤمن') === 'مومن', 'ؤ → و');
ok(normalizeFa('رئیس') === 'رییس', 'ئ → ی');
ok(normalizeFa('أحمد إبراهيم آذر') === 'احمد ابراهیم اذر', 'أ/إ/آ → ا + ي → ی');
ok(normalizeFa('  علی‌رضا  ') === 'علی رضا', 'نیم‌فاصله → فاصله + trim');
ok(normalizeFa(null) === '', 'ورودی null → رشته خالی');
ok(normalizeFa('123') === '123', 'کد لاتین دست‌نخورده می‌ماند');

console.log('\n— faIncludes —');
ok(faIncludes('علی رضایی', 'علي') === true, 'جستجوی «علي» نام «علی» را پیدا می‌کند');
ok(faIncludes('کتابخانه', 'كتاب') === true, 'جستجوی «كتاب» عنوان «کتاب» را پیدا می‌کند');
ok(faIncludes('مهندسی', '') === true, 'عبارت خالی → همه');
ok(faIncludes('مهندسی کامپیوتر', 'عمران') === false, 'نامرتبط → false');
ok(faIncludes(null, 'علی') === false, 'haystack خالی → false');

console.log('\n— faLikePattern / normCol —');
ok(faLikePattern('علي') === '%علی%', 'الگوی LIKE نرمال‌شده با % ساخته می‌شود');
{
  const v = normCol('x' as never) as unknown as { queryChunks?: { value?: unknown }[] };
  const s = JSON.stringify(v?.queryChunks ?? v);
  ok(s.includes('ي') && s.includes('ی') && s.includes('آ'), 'normCol حروف دو املایی را REPLACE می‌کند');
}

if (fail) { console.log(`\n✗ ${fail} failed, ${pass} passed`); process.exit(1); }
console.log(`\n✓ همه (${pass}) گذشت`);
