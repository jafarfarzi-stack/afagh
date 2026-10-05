/**
 * تستِ نگهبان: درسِ منتقل‌شده از دانشگاه دیگر هرگز دوباره شارژ نشود.
 *
 * شهریهٔ آن درس در دانشگاه مبدأ پرداخت شده است. نشانِ آن روی ردیف
 * `enrollments.sourceUniversityId IS NOT NULL` است. هر محاسبه‌گرِ شهریه‌ای که
 * روی enrollments اسکن می‌کند باید آن ردیف‌ها را نادیده بگیرد.
 *
 * این تست استاتیک است (بدون دیتابیس): متنِ منبعِ هر دو محاسبه‌گر را می‌خواند و
 * ثابت می‌کند فیلترِ حذفی در کوئری هست. اگر کسی فیلتر را پاک کند، تست قرمز می‌شود.
 *
 *     npx tsx tests/tuition-transfer-exclusion.test.ts
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
let fail = 0;
const okT = (name: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? `\n      ${extra}` : ''}`); }
};

// ── ۱) هر دو محاسبه‌گرِ شهریه فیلترِ حذفی دارند ──────────────────────────
console.log('\n--- ۱. فیلتر حذفی در کوئری شهریه ---');
const engine = readFileSync(join(ROOT, 'src/lib/tuition-engine.ts'), 'utf8');
const formulas = readFileSync(join(ROOT, 'src/lib/finance-engine/formulas.ts'), 'utf8');

okT(
  'computeTermTuition ردیفِ منتقل‌شده را نمی‌خواند',
  engine.includes('isNull(enrollments.sourceUniversityId)'),
  'src/lib/tuition-engine.ts باید isNull(enrollments.sourceUniversityId) داشته باشد',
);
okT(
  'finance-engine/formulas ردیفِ منتقل‌شده را نمی‌خواند',
  formulas.includes('isNull(enrollments.sourceUniversityId)'),
  'src/lib/finance-engine/formulas.ts باید isNull(enrollments.sourceUniversityId) داشته باشد',
);

// ── ۲) فیلتر دقیقاً روی همان کوئریِ enrollments است، نه جایِ بی‌ربط ───────
console.log('\n--- ۲. فیلتر در کوئری درست نشسته ---');
const engineScan = engine.slice(engine.indexOf('.from(enrollments)'));
okT(
  'فیلتر بعد از from(enrollments) در tuition-engine آمده',
  /\.from\(enrollments\)[\s\S]{0,600}?isNull\(enrollments\.sourceUniversityId\)/.test(engineScan),
);
const formulasScan = formulas.slice(formulas.indexOf('.from(enrollments)'));
okT(
  'فیلتر بعد از from(enrollments) در formulas آمده',
  /\.from\(enrollments\)[\s\S]{0,600}?isNull\(enrollments\.sourceUniversityId\)/.test(formulasScan),
);

// ── ۳) وارداتِ isNull فراموش نشده ─────────────────────────────────────────
console.log('\n--- ۳. واردات ---');
okT(
  'tuition-engine isNull را import کرده',
  /import\s*\{[^}]*isNull[^}]*\}\s*from\s*'drizzle-orm'/.test(engine),
);
okT(
  'formulas isNull را import کرده',
  /import\s*\{[^}]*isNull[^}]*\}\s*from\s*'drizzle-orm'/.test(formulas),
);

// ── ۴) هیچ محاسبه‌گرِ دیگری روی enrollments اسکنِ بدون فیلتر ندارد ─────────
console.log('\n--- ۴. جست‌وجوی نشتی‌های دیگر ---');
const suspects: Array<[string, string]> = [
  ['src/lib/tuition-engine.ts', engine],
  ['src/lib/finance-engine/formulas.ts', formulas],
];
for (const [name, src] of suspects) {
  const scans = src.split('.from(enrollments)').length - 1;
  const filters = src.split('isNull(enrollments.sourceUniversityId)').length - 1;
  okT(`${name}: هر اسکن enrollments یک فیلتر دارد (${scans} اسکن، ${filters} فیلتر)`, filters >= scans);
}

console.log(`\n${fail === 0 ? '✓' : '✗'} نتیجه: ${pass} موفق | ${fail} شکست`);
if (fail > 0) process.exitCode = 1;
