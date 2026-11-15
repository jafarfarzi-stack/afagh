/**
 * تستِ خالصِ «دادهٔ پایهٔ مالی» — بدون DB، بدون React.
 *
 * اجرا: npm test
 *
 * چرا؟ نُه فرمِ CRUD از یک رجیستریِ اعلانی ساخته می‌شوند. اگر یک فیلد در
 * رجیستری غلط باشد (نوعِ نامعتبر، ستونِ ناموجود، گزینهٔ گمشده)، خطا در
 * زمانِ کلیک روی «ثبت» و در محیطِ تولید ظاهر می‌شود — نه در build.
 * این فایل همان قرارداد را قفل می‌کند.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENTITIES, ENTITY_KEYS, getEntity, needsTerms, optionLabel, refTargetsOf } from '../src/lib/finance-base/entities.ts';
import { validateField, validateRow } from '../src/lib/finance-base/validate.ts';

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`); }
};

const root = join(import.meta.dirname, '..');
const schema = readFileSync(join(root, 'src/db/schema.ts'), 'utf8');

console.log('۱) ساختارِ رجیستری');
ok('نُه موجودیت تعریف شده', ENTITIES.length === 9, `count=${ENTITIES.length}`);
ok('کلیدها یکتا هستند', new Set(ENTITY_KEYS).size === ENTITY_KEYS.length);
ok('getEntity با کلیدِ ناشناخته null می‌دهد', getEntity('nope') === null);
ok('getEntity با کلیدِ درست spec می‌دهد', getEntity('budgets')?.table === 'financial_budgets');

console.log('\n۲) هر جدول واقعاً در schema.ts هست');
for (const e of ENTITIES) {
  ok(`«${e.table}» در schema`, new RegExp(`pgTable\\('${e.table}'`).test(schema));
}

console.log('\n۳) فیلدها');
const KINDS = new Set(['text', 'textarea', 'money', 'number', 'date', 'select', 'ref', 'term', 'termCode']);
for (const e of ENTITIES) {
  const names = e.fields.map((f) => f.name);
  ok(`«${e.key}» نامِ فیلد یکتا دارد`, new Set(names).size === names.length);
  ok(`«${e.key}» نوع‌ها معتبرند`, e.fields.every((f) => KINDS.has(f.kind)));
  ok(
    `«${e.key}» ستون‌های فهرست در فیلدها هست`,
    e.list.every((c) => names.includes(c)),
    `گمشده: ${e.list.filter((c) => !names.includes(c)).join(', ')}`,
  );
  ok(`«${e.key}» حداقل یک فیلد الزامی دارد`, e.fields.some((f) => f.required));
  for (const f of e.fields) {
    if (f.kind === 'select') {
      ok(`«${e.key}.${f.name}» گزینه دارد`, !!f.options?.length);
      if (f.required) ok(`«${e.key}.${f.name}» مقدارِ پیش‌فرض دارد`, !!f.options?.[0]?.value);
    }
    if (f.kind === 'ref') ok(`«${e.key}.${f.name}» هدفِ ارجاع دارد`, !!f.ref);
  }
}

console.log('\n۴) اعتبارسنجیِ فیلد — مبلغ');
const money = { name: 'amount', label: 'مبلغ', kind: 'money' as const, required: true };
ok('عدد صحیح پذیرفته', validateField(money, '1500000').value === 1500000);
ok('اعشار رد می‌شود', !!validateField(money, '12.5').error);
ok('حرف رد می‌شود', !!validateField(money, 'abc').error);
ok('منفی رد می‌شود', !!validateField(money, '-5').error);
ok('خالیِ الزامی رد می‌شود', !!validateField(money, '').error);
ok('عدد (نه رشته) پذیرفته', validateField(money, 2000).value === 2000);

console.log('\n۵) اعتبارسنجیِ فیلد — تاریخ');
const date = { name: 'd', label: 'تاریخ', kind: 'date' as const };
ok('YYYY-MM-DD پذیرفته', validateField(date, '2026-03-21').value === '2026-03-21');
ok('فرمتِ دیگر رد می‌شود', !!validateField(date, '21/03/2026').error);
ok('خالیِ اختیاری null می‌دهد', validateField(date, '').value === null);
ok('تاریخِ ناموجود رد می‌شود', !!validateField(date, '2026-13-45').error);

console.log('\n۶) اعتبارسنجیِ فیلد — گزینه و ارجاع');
const sel = {
  name: 'status',
  label: 'وضعیت',
  kind: 'select' as const,
  required: true,
  options: [{ value: 'OPEN', label: 'باز' }, { value: 'CLOSED', label: 'مختومه' }],
};
ok('گزینهٔ مجاز پذیرفته', validateField(sel, 'OPEN').value === 'OPEN');
ok('گزینهٔ نامجاز رد می‌شود', !!validateField(sel, 'HACK').error);
ok('خالیِ الزامی رد می‌شود', !!validateField(sel, '').error);

const ref = { name: 'contractorId', label: 'پیمانکار', kind: 'ref' as const, ref: 'contractors' as const, required: true };
ok('شناسهٔ مثبت پذیرفته', validateField(ref, '7').value === 7);
ok('صفر رد می‌شود', !!validateField(ref, '0').error);
ok('منفی رد می‌شود', !!validateField(ref, '-3').error);

console.log('\n۷) اعتبارسنجیِ فیلد — کد نیمسال');
const tc = { name: 'termCode', label: 'نیمسال', kind: 'termCode' as const };
ok('۵ رقمی پذیرفته', validateField(tc, '14051').value === '14051');
ok('۳ رقمی رد می‌شود', !!validateField(tc, '140').error);
ok('خالی null می‌دهد', validateField(tc, '').value === null);

console.log('\n۸) اعتبارسنجیِ ردیف — ایجاد');
const budgets = getEntity('budgets')!;
const good = validateRow(budgets, {
  termCode: '14051',
  category: 'آموزشی',
  lineItem: 'حقوق اساتید',
  direction: 'EXPENSE',
  amount: '900000000',
  description: '',
});
ok('ردیفِ کامل پذیرفته می‌شود', good.ok);
if (good.ok) {
  ok('مبلغ عددی شد', good.values.amount === 900000000);
  ok('توضیحِ خالی null شد', good.values.description === null);
}

const bad = validateRow(budgets, { category: '', lineItem: '', direction: 'WRONG', amount: 'x' });
ok('ردیفِ ناقص رد می‌شود', !bad.ok);
if (!bad.ok) {
  ok('چهار خطا گزارش می‌شود', bad.errors.length === 4, `got ${bad.errors.length}: ${bad.errors.join(' | ')}`);
  ok('پیامِ فارسی است', bad.errors.every((e) => /[آ-ی]/.test(e)));
}

console.log('\n۹) اعتبارسنجیِ ردیف — ویرایشِ جزئی');
const part = validateRow(budgets, { amount: '500' }, true);
ok('فقط کلیدِ ارسالی بررسی می‌شود', part.ok && Object.keys((part as any).values).length === 1);
const empty = validateRow(budgets, {}, true);
ok('بدون کلید ⇒ خطا', !empty.ok);
const unknown = validateRow(budgets, { hacker: '1', amount: '10' }, true);
ok('کلیدِ ناشناخته نادیده گرفته می‌شود', unknown.ok && !('hacker' in (unknown as any).values));

console.log('\n۱۰) کمک‌تابع‌ها');
ok('refTargetsOf برای contracts = contractors', JSON.stringify(refTargetsOf(getEntity('contracts')!)) === '["contractors"]');
ok('needsTerms برای budgets درست است', needsTerms(budgets));
ok('needsTerms برای contractors نادرست است', !needsTerms(getEntity('contractors')!));
ok(
  'optionLabel برچسب فارسی می‌دهد',
  optionLabel(budgets, 'direction', 'EXPENSE') === 'هزینه',
);
ok('optionLabel برای فیلدِ غیرگزینه مقدار را برمی‌گرداند', optionLabel(budgets, 'category', 'آموزشی') === 'آموزشی');

console.log('\n۱۱) موجودیت‌های وابسته به هم');
const contracts = getEntity('contracts')!;
const invoices = getEntity('contract-invoices')!;
const moves = getEntity('inventory-movements')!;
ok('قرارداد به پیمانکار ارجاع دارد', contracts.fields.some((f) => f.kind === 'ref' && f.ref === 'contractors'));
ok('صورتحساب به قرارداد ارجاع دارد', invoices.fields.some((f) => f.kind === 'ref' && f.ref === 'contracts'));
ok('گردش کالا به کالا ارجاع دارد', moves.fields.some((f) => f.kind === 'ref' && f.ref === 'inventory-items'));
ok('همهٔ اهدافِ ارجاع در رجیستری موجودند', ['contractors', 'contracts', 'inventory-items'].every((k) => !!getEntity(k)));

console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
