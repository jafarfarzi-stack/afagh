/**
 * ════════════════════════════════════════════════════════════════════════
 *  تستِ تجزیه‌گرِ فیلترهای «تایپی» گزارش‌ها
 *    • parseTermSelection — «14031-14035» / «۱۴۰۳۱ تا ۱۴۰۳۵» / «14031,14033»
 *    • parseCodeList      — لیستِ کد دانشجو با ویرگول/فاصله/خط جدید و بازه
 *
 *  چرا تست دارد: این ورودی از Excel/پیام می‌آید و شکلش آزاد است؛ خطای
 *  تجزیه در UI دیده نمی‌شود (گزارش فقط خالی یا بزرگ‌تر از انتظار می‌شود).
 * ════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_TERM_CODES, parseTermSelection } from '../src/lib/term-selection';
import { CODE_LIST_LIMIT, parseCodeList } from '../src/lib/code-list';

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`); }
};

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

console.log('\n۱) انتخاب ترم با تایپ');
ok('ویرگول انگلیسی', JSON.stringify(parseTermSelection('14031,14033').codes) === '["14031","14033"]');
ok('ویرگول فارسی + ارقام فارسی',
  JSON.stringify(parseTermSelection('۱۴۰۳۱، ۱۴۰۳۳').codes) === '["14031","14033"]');
ok('بازهٔ عددی', JSON.stringify(parseTermSelection('14031-14033').codes) === '["14031","14032","14033"]');
ok('بازهٔ معکوس مرتب می‌شود',
  JSON.stringify(parseTermSelection('14033 تا 14031').codes) === '["14031","14032","14033"]');
ok('بازه با ارقام فارسی و «تا»',
  JSON.stringify(parseTermSelection('۱۴۰۳۱ تا ۱۴۰۳۳').codes) === '["14031","14032","14033"]');
ok('ترکیب بازه و تک‌کد',
  JSON.stringify(parseTermSelection('14031-14032, 14040').codes) === '["14031","14032","14040"]');
ok('تکرار حذف می‌شود', parseTermSelection('14031,14031, 14031').codes.length === 1);
ok('کد کوتاه (سال) ترم نیست', parseTermSelection('1403').codes.length === 0);
ok('توکن نامعتبر گزارش می‌شود', parseTermSelection('abc, 12, 1403').invalid.length >= 2);
ok('واژه‌های بی‌عدد نادیده گرفته می‌شوند', parseTermSelection('ترم 14031').codes.length === 1);

const known = ['14031', '14032', '14033'];
const filtered = parseTermSelection('14031-14035', known);
ok('کد ناموجود در فهرست دانشگاه نمی‌آید', filtered.codes.length === 3);
ok('کدهای ناموجود جدا گزارش می‌شوند', filtered.unknown.length === 2, filtered.unknown.join(','));

const many = parseTermSelection('16000-16099');
ok('سقفِ تعداد ترم اعمال می‌شود', many.codes.length === MAX_TERM_CODES && many.truncated);
ok('بازهٔ بزرگ‌تر از ۴۰۰ نامعتبر است', parseTermSelection('10000-99999').invalid.length === 1);

console.log('\n۲) لیست کد دانشجو');
ok('ویرگول', parseCodeList('4021370010,4021370011').codes.length === 2);
ok('ارقام فارسی و ویرگول فارسی',
  JSON.stringify(parseCodeList('۴۰۲۱۳۷۰۰۱۰، ۴۰۲۱۳۷۰۰۱۱').codes) === '["4021370010","4021370011"]');
ok('خط جدید و Tab',
  parseCodeList('4021370010\n4021370011\t23921001').codes.length === 3);
ok('بازهٔ کد دانشجو',
  parseCodeList('4021370010-4021370015').codes.length === 6 &&
  parseCodeList('4021370010-4021370015').usedRange);
ok('بازهٔ معکوس', parseCodeList('4021370015-4021370013').codes.length === 3);
ok('کد ۱۳ رقمی هم پذیرفته می‌شود', parseCodeList('4000000000001').codes[0] === '4000000000001');
ok('کد ۷ رقمی هم پذیرفته می‌شود', parseCodeList('2392101').codes[0] === '2392101');
ok('کدِ دارای خط‌تیره بازه حساب نمی‌شود',
  JSON.stringify(parseCodeList('9211311005-2').codes) === '["9211311005-2"]');
ok('بازه با «تا» بین دو کد',
  JSON.stringify(parseCodeList('4021370010 تا 4021370012').codes) ===
  '["4021370010","4021370011","4021370012"]');
ok('بازهٔ دو سرِ ناهم‌طول نامعتبر است', parseCodeList('4021370010-40213').invalid.length === 1);
ok('کد نامعتبر (کمتر از ۴ رقم) رد می‌شود', parseCodeList('12, 4021370010').codes.length === 1);
ok('کد نامعتبر گزارش می‌شود', parseCodeList('12, abc').invalid.includes('12'));
ok('تکرار حذف می‌شود', parseCodeList('4021370010,4021370010').codes.length === 1);
ok('سقفِ کدها اعمال می‌شود',
  parseCodeList('4000000000-4000000003', { limit: 3 }).codes.length === 3);
ok('بازهٔ بزرگ‌تر از سقف نامعتبر است',
  parseCodeList('4000000000-4000009999', { limit: 10 }).invalid.length === 1);

console.log('\n۳) اتصال به گزارش‌ها');
const helpers = read('src/app/admin/reports/report-helpers.ts');
const client = read('src/app/admin/reports/ReportsClient.tsx');
const actions = read('src/app/admin/reports/actions.ts');
ok('studentWhere فیلترِ لیست کد را اعمال می‌کند', /studentCodes/.test(helpers) && /parseCodeList/.test(helpers));
ok('فیلترِ خالی‌بی‌کد fail-closed است', /1 = 0/.test(helpers));
ok('UI دکمهٔ «اعمال لیست» دارد', /اعمال لیست/.test(client));
ok('سرور بازهٔ ترم را هم می‌فهمد', /parseTermSelection\(raw\)/.test(actions));
ok('سقفِ کد در UI هم استفاده می‌شود', /CODE_LIST_LIMIT/.test(client));

console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
