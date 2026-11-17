/**
 * ════════════════════════════════════════════════════════════════════════
 *  نگهبانِ «واژگان دفتر مالی در گزارش‌ها» — تستِ ایستا (بدون DB)
 *
 *  چرا این تست وجود دارد:
 *    ۱) گزارشِ «کل پرداختی دانشجویان» برای دانشجویانِ مؤسسه‌های منحله
 *       (زرینه/شمس/علامه/نژند) همیشه «۰ ریال» می‌داد، چون پرداختی‌های
 *       مهاجرت‌شده با نوعِ `CREDIT` ذخیره شده‌اند و فهرستِ محلیِ گزارش
 *       فقط `PAYMENT/POS_PAYMENT/LOAN/SPONSORSHIP` را می‌شناخت.
 *    ۲) زیرنوع‌های `TUITION_BATES_FIXED/VARIABLE/AMOUNT` در فهرستِ تخفیف
 *       نبودند ⇒ «مانده» بیش از واقعیت بود.
 *    ۳) صورت سود و زیان در سکوت صفر می‌شد: کوئری به ستونِ ناموجودِ
 *       `st.oth` ارجاع می‌داد و `.catch()` خطا را می‌بلعید.
 *
 *  قاعدهٔ تازه: هیچ ماژول گزارشی فهرستِ نوع تراکنش را محلی تعریف نمی‌کند؛
 *  همه از `src/lib/ledger-balance.ts` می‌خوانند.
 * ════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CREDIT_LEDGER_TYPES,
  DEBT_LEDGER_TYPES,
  DISCOUNT_LEDGER_TYPES,
  PAID_LEDGER_TYPES,
  ledgerTypesCsv,
} from '../src/lib/ledger-balance';

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`); }
};

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const finance = read('src/app/admin/reports/r-finance.ts');
const statements = read('src/app/admin/reports/r-finance-statements.ts');
const catalog = read('src/app/admin/reports/catalog/finance.ts');
const client = read('src/app/admin/reports/ReportsClient.tsx');
const schema = read('src/db/schema.ts');

console.log('\n۱) واژگان کانونی (ledger-balance.ts)');
for (const t of ['CREDIT', 'PAYMENT', 'POS_PAYMENT', 'SPONSORSHIP', 'LOAN']) {
  ok(`«${t}» در فهرستِ پرداخت هست`, (PAID_LEDGER_TYPES as readonly string[]).includes(t));
}
for (const t of ['DISCOUNT_FIXED', 'DISCOUNT_VARIABLE', 'SUBJECT_DEDUCTIVE', 'TUITION_BATES',
  'TUITION_BATES_FIXED', 'TUITION_BATES_VARIABLE', 'TUITION_BATES_AMOUNT', 'TUITION_ADJUST_INC']) {
  ok(`«${t}» در فهرستِ تخفیف هست`, (DISCOUNT_LEDGER_TYPES as readonly string[]).includes(t));
}
ok('اعتبار = پرداخت + تخفیف (بدون تکرار/جاافتادگی)',
  CREDIT_LEDGER_TYPES.length === PAID_LEDGER_TYPES.length + DISCOUNT_LEDGER_TYPES.length);
ok('هیچ نوعی هم بدهی و هم اعتبار نیست',
  !DEBT_LEDGER_TYPES.some((t) => (CREDIT_LEDGER_TYPES as readonly string[]).includes(t)));
ok('ledgerTypesCsv خروجی SQL معتبر می‌دهد', ledgerTypesCsv(['A', 'B']) === `'A','B'`);

console.log('\n۲) پوششِ کاملِ انواعِ مجازِ دیتابیس');
const checkSrc = schema.match(/ck_student_ledger_txn_type[\s\S]*?\)\)/)?.[0] ?? '';
const inList = /IN \(([\s\S]*?)\)/.exec(checkSrc)?.[1] ?? '';
const allowed = [...inList.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
ok('فهرستِ CHECK خوانده شد', allowed.length >= 20, `count=${allowed.length}`);
const known = new Set<string>([...DEBT_LEDGER_TYPES, ...CREDIT_LEDGER_TYPES]);
const missing = allowed.filter((t) => !known.has(t));
ok('هیچ نوعِ مجازِ دیتابیسی در تراز نادیده نمی‌ماند', missing.length === 0, `جاافتاده: ${missing.join(', ')}`);

console.log('\n۳) گزارش‌های مالی از واژگان کانونی می‌خوانند');
ok('r-finance.ts از ledger-balance ایمپورت می‌کند', /from '@\/lib\/ledger-balance'/.test(finance));
ok('r-finance-statements.ts از ledger-balance ایمپورت می‌کند', /from '@\/lib\/ledger-balance'/.test(statements));
ok('catalog/finance.ts از ledger-balance ایمپورت می‌کند', /from '@\/lib\/ledger-balance'/.test(catalog));
ok('catalog/finance.ts فهرستِ دستی ندارد', /ledgerTypesCsv\(PAID_LEDGER_TYPES\)/.test(catalog));

const stalePaid = /IN \('PAYMENT','POS_PAYMENT','LOAN','SPONSORSHIP'\)/;
ok('هیچ فهرستِ پرداختِ منسوخ (بدون CREDIT) نمانده',
  !stalePaid.test(finance) && !stalePaid.test(catalog));
const staleDisc = /IN \('DISCOUNT_FIXED','DISCOUNT_VARIABLE','SUBJECT_DEDUCTIVE','TUITION_BATES','TUITION_ADJUST_INC'\)/;
ok('هیچ فهرستِ تخفیفِ منسوخ (بدون زیرنوع‌های بیتس) نمانده',
  !staleDisc.test(finance) && !staleDisc.test(catalog));

console.log('\n۴) ستونِ ناموجود در سود و زیان');
ok('ارجاع به st.oth حذف شده است', !/st\.oth/.test(statements));
ok('CREDIT به‌عنوان «سایر درآمد» شمرده نمی‌شود', /0::text AS other/.test(statements));
ok('CREDIT به وصولی‌ها اضافه شده است', /COALESCE\(st\.pay, 0\) \+ COALESCE\(st\.cr, 0\)/.test(statements));

console.log('\n۵) گزارشِ «کل پرداختی دانشجویان»');
const totalPayments = finance.slice(
  finance.indexOf("if (kind === 'total-payments')"),
  finance.indexOf("if (kind === 'student-payments')"),
);
ok('بلوکِ گزارش پیدا شد', totalPayments.length > 200);
ok('فیلترِ ترم دارد', /ledgerSumJoin\(\{\s*term:\s*f\.term/.test(totalPayments));
ok('دانشجویانِ بدونِ ردیفِ مالی حذف می‌شوند', totalPayments.includes('sl."txnCount" > 0'));
ok('جمع کل روی همهٔ ردیف‌ها محاسبه می‌شود (نه صفحهٔ جاری)', /db\.execute/.test(totalPayments));
ok('کارتِ گزارش در r-finance.ts نیازمند ترم است',
  /kind: 'total-payments'[^}]*needsTerm: true/.test(finance));
ok('کارتِ گزارش در ReportsClient نیازمند ترم است',
  /kind: 'total-payments'[^}]*needsTerm: true/.test(client));

console.log('\n۶) سقفِ تخفیف در سطح (دانشجو × ترم) در گزارش‌های تجمیعی');
// قاعده: تخفیفِ هر ترم حداکثر به اندازهٔ شهریهٔ همان ترم؛ بدون این سقف،
// تخفیفِ اضافیِ یک ترم بدهیِ ترمِ دیگر را خنثی می‌کند و «مانده» کم می‌شود.
ok('r-finance: کمکیِ ledgerSumJoin سقف را روی (دانشجو × ترم) می‌گذارد',
  /LEAST\(\s*t\."discount",\s*t\."charge"\s*\)/.test(finance)
  && /GROUP BY sl2\."termId"/.test(finance));
ok('r-finance: صورت‌حساب شهریه از همان کمکی استفاده می‌کند',
  /if \(kind === 'tuition-statement'\)[\s\S]*?ledgerSumJoin\(\{\s*term:\s*f\.term\s*\}\)/.test(finance));
ok('r-finance: گزارش مالی نیمسال (per دانشجو×ترم) سقف را دارد',
  /const discSum = sql`LEAST\(/.test(finance));
ok('catalog/finance: منبعِ «ماندهٔ دانشجو» سقف را اعمال می‌کند',
  /LEAST\(t\."discount", t\."charge"\)/.test(catalog));
ok('catalog/finance: دو سطح جمع دارد (ترم → دانشجو)',
  /GROUP BY sl2\."studentId", sl2\."termId"/.test(catalog));
ok('statements: مرجعِ قاعده (ledgerCte) هنوز سقف دارد', /LEAST\(/.test(statements));

console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
