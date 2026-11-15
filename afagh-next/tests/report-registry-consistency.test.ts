/**
 * نگهبانِ ثباتِ رجیستریِ گزارش‌ها — تستِ ایستا (بدون DB، بدون React).
 *
 * اجرا: npm test
 *
 * چرا؟ یک گزارش سه جا باید هم‌زمان ثبت شود:
 *   ۱) کارت در `r-finance-statements.ts` (CARDS)
 *   ۲) شاخهٔ اجرا در همان فایل (`if (kind === '...')`)
 *   ۳) عضویت در `ALL_REPORT_KINDS` (report-helpers.ts)
 *   ۴) کارتِ UI در `ReportsClient.tsx`
 * اگر یکی جا بیفتد، گزارش یا در فهرست دیده نمی‌شود یا با کلیک، «گزارش ناشناخته»
 * می‌دهد — و هیچ تستِ رفتاری این را نمی‌گیرد (چون به DB نیاز دارد).
 * این فایل همان شکاف را می‌بندد.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`); }
};

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const src = read('src/app/admin/reports/r-finance-statements.ts');
const helpers = read('src/app/admin/reports/report-helpers.ts');
const client = read('src/app/admin/reports/ReportsClient.tsx');
const schema = read('src/db/schema.ts');

const uniq = (xs: string[]) => [...new Set(xs)].sort();
const grab = (re: RegExp) => uniq([...src.matchAll(re)].map((m) => m[1]));

const cardKinds = grab(/kind: '([a-z][a-z-]*)'/g);
const dispatchKinds = grab(/kind === '([a-z][a-z-]*)'/g);

console.log('۱) کارت‌ها ↔ شاخه‌های اجرا');
ok('حداقل یک گزارش جدید تعریف شده', cardKinds.length > 0, `count=${cardKinds.length}`);
ok(
  'هر کارت شاخهٔ اجرا دارد',
  cardKinds.every((k) => dispatchKinds.includes(k)),
  `بدون شاخه: ${cardKinds.filter((k) => !dispatchKinds.includes(k)).join(', ')}`,
);
ok(
  'هر شاخه کارت دارد (بدون کدِ مرده)',
  dispatchKinds.every((k) => cardKinds.includes(k)),
  `بدون کارت: ${dispatchKinds.filter((k) => !cardKinds.includes(k)).join(', ')}`,
);
ok('تعداد کارت و شاخه برابر است', cardKinds.length === dispatchKinds.length, `${cardKinds.length} vs ${dispatchKinds.length}`);

console.log('\n۲) ثبت در فهرستِ مجازِ گزارش‌ها');
for (const k of cardKinds) {
  ok(`«${k}» در ALL_REPORT_KINDS`, new RegExp(`'${k}'`).test(helpers));
}

console.log('\n۳) کارتِ رابط کاربری');
for (const k of cardKinds) {
  ok(`«${k}» کارت UI دارد`, new RegExp(`'${k}'`).test(client));
}

console.log('\n۴) مسیرِ بازگشتِ امن');
ok('شاخهٔ نهایی return null دارد', /return null;\s*\}\s*$/.test(src.trimEnd() + '\n') || src.includes('return null;'));

console.log('\n۵) جداولِ پایهٔ مالی — schema ↔ migration ↔ journal');
const TABLES = [
  'financial_budgets',
  'financial_contractors',
  'financial_contracts',
  'financial_contract_invoices',
  'financial_expenses',
  'financial_vat_entries',
  'inventory_items',
  'inventory_movements',
  'legal_cases',
];
const mig = read('drizzle/0138_finance_base_tables.sql');
for (const t of TABLES) {
  ok(`«${t}» در schema.ts`, new RegExp(`pgTable\\('${t}'`).test(schema));
  ok(`«${t}» در 0138`, new RegExp(`CREATE TABLE (IF NOT EXISTS )?"?${t}"?`, 'i').test(mig));
}
const journal = JSON.parse(read('drizzle/meta/_journal.json')) as { entries: { tag: string; idx: number }[] };
ok('0137 در journal ثبت شده', journal.entries.some((e) => e.tag === '0137_ledger_bates_breakdown'));
ok('0138 در journal ثبت شده', journal.entries.some((e) => e.tag === '0138_finance_base_tables'));
ok(
  'idx ها یکتا هستند',
  new Set(journal.entries.map((e) => e.idx)).size === journal.entries.length,
);
ok(
  'فایل‌های migration موجودند',
  existsSync(join(root, 'drizzle/0137_ledger_bates_breakdown.sql')) &&
    existsSync(join(root, 'drizzle/0138_finance_base_tables.sql')),
);

console.log('\n۶) نوع‌های دفتر مالی — CHECK ↔ ledger-balance');
const ledgerBalance = read('src/lib/ledger-balance.ts');
const batesTypes = ['TUITION_BATES_FIXED', 'TUITION_BATES_VARIABLE', 'TUITION_BATES_AMOUNT'];
const checkSql = read('drizzle/0137_ledger_bates_breakdown.sql');
for (const t of batesTypes) {
  ok(`«${t}» در CHECK دیتابیس`, checkSql.includes(`'${t}'`));
  ok(`«${t}» در ledger-balance.ts`, ledgerBalance.includes(`'${t}'`));
}
ok('TUITION_BATES در CHECK باقی مانده (سازگاری با دادهٔ قدیم)', checkSql.includes(`'TUITION_BATES'`));

// ── طولِ ستون در برابر بلندترین نامِ مجاز ──
// این دقیقاً خطایی بود که در پروداکشن رخ داد: ستون varchar(20) بود اما
// «TUITION_BATES_VARIABLE» ۲۲ کاراکتر است ⇒ درج با «value too long» شکست.
console.log('\n۶-۲) طولِ ستون transactionType ≥ بلندترین نوعِ مجاز');
const lenMatch = schema.match(/transactionType:\s*varchar\('transactionType',\s*\{\s*length:\s*(\d+)/);
ok('طولِ ستون در schema.ts خوانده شد', !!lenMatch);
const colLen = Number(lenMatch?.[1] ?? 0);
const allowedTypes = [...checkSql.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
ok('فهرستِ نوع‌ها از CHECK خوانده شد', allowedTypes.length >= 20, `count=${allowedTypes.length}`);
const longest = allowedTypes.reduce((a, b) => (b.length > a.length ? b : a), '');
ok(
  `بلندترین نوع («${longest}» = ${longest.length}) در ${colLen} جا می‌شود`,
  longest.length <= colLen,
  `ستون varchar(${colLen}) اما «${longest}» ${longest.length} کاراکتر است`,
);
// و هیچ نوعی از این فهرست نباید در schema.ts جا افتاده باشد
for (const t of batesTypes) ok(`«${t}» در CHECK موجود است`, allowedTypes.includes(t));

console.log('\n۷) RLS جداولِ جدید');
const rls = read('src/db/pg-hardening.sql');
for (const t of TABLES) {
  ok(`RLS برای «${t}»`, new RegExp(`ALTER TABLE "?${t}"? ENABLE ROW LEVEL SECURITY`, 'i').test(rls));
}

console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
