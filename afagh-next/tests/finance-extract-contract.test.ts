/**
 * ════════════════════════════════════════════════════════════════════════
 *  گاردِ پویا شدن استخراج مالی هفتگی
 *
 *  ریشهٔ باگ: `D:\backups\fin_export` یک عکس ایستا بود و weekly-uems-sync
 *  همان فایلها را هر هفته دوباره میخواند؛ «بروزرسانی مالی» عملاً بیتازهای
 *  نبود چون استخراجکنندهای برای دادهٔ مالی وجود نداشت.
 *
 *  این تست فقط متن سورس را میخواند (بدون SQL Server / بدون DB) و تضمین
 *  میکند: (۱) سرستونهای استخراج جدید دقیقاً ستونهایی را دارد که
 *  migrate-legacy-finance میخواند، (۲) اورکستراتور گام استخراج مالی را دارد
 *  و در حالت عادی ورودی مهاجرت مالی را به پوشهٔ تازه میبرد، (۳) لانچر
 *  ویندوزی پرچمهای جدید را پاس میدهد.
 * ════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const read = (p: string): string => readFileSync(path.join(ROOT, p), 'utf8');

const EXTRACT = read('scripts/extract-legacy-finance.mjs');
const ORCH = read('scripts/weekly-uems-sync.mjs');
const MIGRATE = read('scripts/migrate-legacy-finance.mjs');
const BAT = read('scripts/run-weekly-uems-sync.bat');
const ENV_EXAMPLE = read('scripts/weekly-uems-sync.env.example');

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string): void => {
  if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); }
};

/** سرستون لیترال داخل FINANCE_HEADERS را بیرون میکشد (\t → tab واقعی). */
const headerOf = (name: string): string[] => {
  const m = EXTRACT.match(new RegExp(`${name}:\\s*'([^']*)'`));
  return m ? m[1].replace(/\\t/g, '\t').split('\t') : [];
};

// ── ۱) قرارداد سرستونها ───────────────────────────────────────────────────
const termAms = headerOf('TermAms');
const stdPays = headerOf('StdPays');
const paytype = headerOf('paytype');
const termPrice = headerOf('TermPrice');

ok(termAms.length === 20, `TermAms 20 ستون دارد (got ${termAms.length})`);
ok(stdPays.length === 6, `StdPays 6 ستون دارد (got ${stdPays.length})`);
ok(paytype.join(',') === 'code,title', 'paytype = code,title');
ok(termPrice.length === 7, `TermPrice 7 ستون دارد (got ${termPrice.length})`);

const has = (cols: string[], want: string[], label: string): void => {
  for (const c of want) ok(cols.includes(c), `${label} ستون ${c} را دارد`);
};
// ستونهایی که migrate-legacy-finance.mjs با col(..., 'X') میخواند
has(termAms, ['Stno', 'TermCode', 'Fix_Price', 'Units_Price', 'FinallAcc', 'TermAmsId'], 'TermAms');
has(stdPays, ['Stno', 'TermCode', 'Mab', 'Fish_no', 'pay_type', 'StdPaysId'], 'StdPays');
ok(MIGRATE.includes("readTsv('TermAms.tsv')") && MIGRATE.includes("readTsv('StdPays.tsv')") &&
   MIGRATE.includes("readTsv('paytype.tsv')"), 'مهاجرت مالی همان سه فایل را میخواند');

// ── ۲) ایمنی استخراج ──────────────────────────────────────────────────────
ok(EXTRACT.includes("-u', '-o'"), 'خروجی Unicode sqlcmd (جلوگیری از موژیبیک فارسی)');
ok(EXTRACT.includes("'-h', '-1'"), 'سرستون sqlcmd حذف و سرستون صریح نوشته میشود');
ok(EXTRACT.includes("'-b'"), 'خطای SQL موجب exit≠0 میشود');
ok(EXTRACT.includes("ISNULL("), 'NULL بهجای لیترال NULL، رشتهٔ تهی مینویسد');
ok(EXTRACT.includes('_manifest.json') && EXTRACT.includes('_t.tsv'), 'manifest و واترمارک نوشته میشوند');
ok(EXTRACT.includes('backupExisting') && EXTRACT.includes('mirrorTo'), 'بازنویسی پوشهٔ ایستا با پشتیبانگیری است');
ok(/rows === 0/.test(EXTRACT), 'خروجی صفر ردیف fail-closed است');
ok(EXTRACT.includes('pathToFileURL(process.argv[1])'), 'import توسط تست اثر جانبی ندارد');

// ── ۳) اتصال به اورکستراتور ───────────────────────────────────────────────
ok(ORCH.includes("file: 'extract-legacy-finance.mjs'"), 'گام استخراج مالی تعریف شده است');
ok(ORCH.includes('const EXTRACT_FIN = !SKIP_EXTRACT && !FIN_STATIC;'), 'شرط استخراج مالی درست است');
ok(ORCH.includes('const FIN_DIR = EXTRACT_FIN ? finOutDir : FIN_STATIC_DIR;'),
  'مهاجرت مالی در حالت عادی دادهٔ تازه میخواند');
ok(ORCH.includes("'--dir', FIN_DIR"), 'مهاجرت مالی همان FIN_DIR پویا را میگیرد');
ok(ORCH.includes("'--mirror', FIN_STATIC_DIR") && ORCH.includes('FIN_REFRESH'),
  'پرچم --fin-refresh پوشهٔ ایستا را آینه میکند');
for (const f of ['--fin-out', '--fin-static', '--fin-refresh']) {
  ok(ORCH.includes(f), `پرچم ${f} مستند شده است`);
}

// ── ۴) لانچر و نمونهٔ کانفیگ ──────────────────────────────────────────────
ok(BAT.includes('%FINFLAG%'), 'لانچر پرچمهای مالی را پاس میدهد');
ok(BAT.includes('UEMS_SYNC_FIN_REFRESH') && BAT.includes('UEMS_SYNC_FIN_STATIC'),
  'لانچر هر دو سوئیچ جدید را میشناسد');
ok(ENV_EXAMPLE.includes('UEMS_SYNC_FIN_REFRESH') && ENV_EXAMPLE.includes('UEMS_SYNC_FIN_STATIC'),
  'نمونهٔ کانفیگ سوئیچهای جدید را توضیح داده است');

console.log(`\n${pass} قبول / ${fail} رد`);
if (fail) process.exit(1);
