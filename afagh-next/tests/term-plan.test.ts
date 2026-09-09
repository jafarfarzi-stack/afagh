/**
 * تست تعداد ترم چارت بر اساس مقطع + ترم تابستان (src/lib/term-plan.ts).
 * قاعده: مقدار صریح DB مقدم است؛ وگرنه کاردانی/ناپیوسته/ارشد/دکترا → ۴، پیوسته/ناشناخته → ۸.
 */
import { SUMMER_SEMESTER, isSummerSemester, planSemesters, termCountForDegree } from '../src/lib/term-plan';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

console.log('\n— مقدار صریح دیتابیس مقدم است —');
ok(termCountForDegree({ termCount: 4, code: 'BS', title: 'کارشناسی پیوسته' }) === 4, 'termCount=4 حتی با کد BS');
ok(termCountForDegree({ termCount: 8, code: 'AD', title: 'کاردانی' }) === 8, 'termCount=8 حتی با کد AD');
ok(termCountForDegree({ termCount: 0 }) === 8, 'صفر نامعتبر → استنتاج');
ok(termCountForDegree({ termCount: 99 }) === 8, 'خارج بازه → استنتاج');

console.log('\n— استنتاج از کد —');
ok(termCountForDegree({ code: 'AD' }) === 4, 'AD → ۴');
ok(termCountForDegree({ code: 'MS' }) === 4, 'MS → ۴');
ok(termCountForDegree({ code: 'PHD' }) === 4, 'PHD → ۴');
ok(termCountForDegree({ code: 'BS' }) === 8, 'BS → ۸');
ok(termCountForDegree({ code: 'ms' }) === 4, 'حروف کوچک هم قبول');

console.log('\n— استنتاج از عنوان —');
ok(termCountForDegree({ title: 'کاردانی' }) === 4, 'کاردانی → ۴');
ok(termCountForDegree({ title: 'کارشناسی ناپیوسته' }) === 4, 'ناپیوسته → ۴');
ok(termCountForDegree({ title: 'کارشناسی ارشد' }) === 4, 'ارشد → ۴');
ok(termCountForDegree({ title: 'دکترای تخصصی' }) === 4, 'دکترا → ۴');
ok(termCountForDegree({ title: 'کارشناسی پیوسته' }) === 8, 'پیوسته → ۸');
ok(termCountForDegree({ title: 'کارشناسی' }) === 8, 'کارشناسی تنها → ۸ (پیش‌فرض پیوسته)');
ok(termCountForDegree({}) === 8, 'خالی → ۸');
ok(termCountForDegree({ title: 'كارداني' }) === 4, 'املای عربی هم پوشش');

console.log('\n— تابستان و فهرست ترم‌ها —');
ok(SUMMER_SEMESTER === 9, 'تابستان = ۹');
ok(isSummerSemester(9) === true, '۹ تابستان است');
ok(isSummerSemester(2) === false, '۲ تابستان نیست');
ok(isSummerSemester(null) === false, 'null تابستان نیست');
ok(JSON.stringify(planSemesters(4)) === '[1,2,3,4]', 'چارت ۴ ترمه');
ok(JSON.stringify(planSemesters(8)) === '[1,2,3,4,5,6,7,8]', 'چارت ۸ ترمه');

if (fail) { console.log(`\n✗ ${fail} failed, ${pass} passed`); process.exit(1); }
console.log(`\n✓ همه (${pass}) گذشت`);
