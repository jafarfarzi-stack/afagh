/**
 * ══════════════════════════════════════════════════════════════════════
 *  نگهبانِ «منابع آموزشی گزارش‌ساز» — تستِ ایستا (بدون DB)
 *
 *  چه چیزی را قفل می‌کند:
 *   ۱) سه منبع آموزشی (دانشجویان / اساتید / برنامه‌ریزی ترم) در کاتالوگ
 *      ثبت‌شده‌اند و کلیدشان با منابع مالی تصادم ندارد.
 *   ۲) هر منبع اسکوپ دانشگاه (universityColumn) و نقش‌های مجاز دارد —
 *      fail-closed بودنِ موتور به همین دو وابسته است.
 *   ۳) کلید فیلدها alias-safe اند (موتور با safeIdent همان الگو را
 *      اعتبارسنجی می‌کند) و هیچ کلید تکراری درون یک منبع نیست.
 *   ۴) هر فیلدِ قابل فیلتر، عملگرهای مجاز دارد و واژگان ثابتِ نمایشی با
 *      CASE در SQL چیده شده (نه فقط در options) تا خروجی فارسی بماند.
 * ══════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EDU_SOURCES } from '../src/app/admin/reports/catalog/education';

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`); }
};

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const indexSrc = read('src/app/admin/reports/catalog/index.ts');
const financeSrc = read('src/app/admin/reports/catalog/finance.ts');

console.log('\n۱) ثبت در رجیستری کاتالوگ');
ok('index.ts فایل education را ایمپورت می‌کند', /import\s*\{\s*EDU_SOURCES\s*\}\s*from\s*'\.\/education'/.test(indexSrc));
ok('index.ts منابع آموزشی را به ALL_SOURCES می‌افزاید', /\.\.\.EDU_SOURCES/.test(indexSrc));

// فقط کلیدِ «منبع» (خطی که با key: شروع می‌شود) — کلیدِ فیلدها درونِ یک‌خطی‌های { key: ... } است
const sourceKeyRe = /^\s{4}key:\s*'([a-z-]+)',\s*$/gm;
const financeKeys = [...financeSrc.matchAll(sourceKeyRe)].map(m => m[1]);
const eduKeys = EDU_SOURCES.map(s => s.key);
const allKeys = [...financeKeys, ...eduKeys];
ok('سه منبع آموزشی وجود دارد', eduKeys.length === 3, eduKeys.join(', '));
for (const k of ['edu-students', 'edu-professors', 'edu-term-planning']) {
  ok(`منبع «${k}» تعریف شده`, eduKeys.includes(k));
}
ok('کلید منابع در کل کاتالوگ یکتاست', new Set(allKeys).size === allKeys.length,
  allKeys.filter((k, i) => allKeys.indexOf(k) !== i).join(', '));

console.log('\n۲) اسکوپ دانشگاه و نقش‌ها (fail-closed)');
for (const s of EDU_SOURCES) {
  ok(`«${s.key}» universityColumn دارد`, !!s.universityColumn && /"[A-Za-z]+"/.test(s.universityColumn));
  ok(`«${s.key}» نقش ADMIN را می‌بیند`, (s.roles ?? []).includes('ADMIN'));
  ok(`«${s.key}» نقش EDU_EXPERT را می‌بیند`, (s.roles ?? []).includes('EDU_EXPERT'));
  ok(`«${s.key}» سقف ردیف (maxRows) دارد`, typeof s.maxRows === 'number' && s.maxRows > 0);
}

console.log('\n۳) سلامتِ فیلدها');
const ALIAS_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
for (const s of EDU_SOURCES) {
  const keys = s.fields.map(f => f.key);
  ok(`«${s.key}» فیلد دارد`, s.fields.length >= 10, `count=${s.fields.length}`);
  ok(`«${s.key}» کلید فیلد تکراری ندارد`, new Set(keys).size === keys.length);
  ok(`«${s.key}» همهٔ کلیدها alias-safe اند`, keys.every(k => ALIAS_RE.test(k)));
  ok(`«${s.key}» هر فیلد sql دارد`, s.fields.every(f => typeof f.sql === 'string' && f.sql.trim().length > 0));
  ok(`«${s.key}» هر فیلدِ قابل‌فیلتر عملگر دارد`,
    s.fields.filter(f => f.filterable).every(f => (f.ops?.length ?? 0) > 0));
}

console.log('\n۴) واژگان نمایشی — CASE در SQL، نه فقط در options');
const students = EDU_SOURCES.find(s => s.key === 'edu-students')!;
const profs = EDU_SOURCES.find(s => s.key === 'edu-professors')!;
const planning = EDU_SOURCES.find(s => s.key === 'edu-term-planning')!;
const fOf = (s: typeof students, k: string) => s.fields.find(f => f.key === k)!;
ok('وضعیت دانشجو فارسی می‌شود (CASE روی s.status)', /CASE s\.status/.test(fOf(students, 'status').sql));
ok('«در حال تحصیل» در وضعیت هست', fOf(students, 'status').sql.includes('در حال تحصیل'));
ok('جنسیت دانشجو فارسی می‌شود', /CASE WHEN u\.gender/.test(fOf(students, 'gender').sql));
ok('وضعیت استاد فارسی می‌شود', /CASE WHEN/.test(fOf(profs, 'isActive').sql));
ok('نوع ارائه فارسی می‌شود', /CASE co\."offeringType"/.test(fOf(planning, 'offeringType').sql));
// برنامهٔ هفتگی/امتحان/استاد کلاس در LATERALهای baseFrom چیده شده‌اند؛
// فیلد فقط ستونِ آماده (ct."classTimes" / ex."examDate" / pp.profs) را می‌خواند.
ok('برنامهٔ هفتگی از schedules می‌آید', /ct\."classTimes"/.test(fOf(planning, 'classTimes').sql));
ok('روزهای هفته با قرارداد ۰=شنبه‌اند', /WHEN 0 THEN 'شنبه'/.test(planning.baseFrom));
ok('امتحان از scheduleType=EXAM است', /scheduleType'\s*=\s*'EXAM'/.test(planning.baseFrom) || /scheduleType" = 'EXAM'/.test(planning.baseFrom));
// 🔒 aliasهای LATERAL باید در تعریف هم گیومه‌دار باشند — بدون گیومه Postgres
//    به حروف کوچک می‌برد و ارجاعِ ct."classTimes" خطای «column does not exist» می‌دهد.
ok('aliasهای LATERAL گیومه‌دار تعریف شده‌اند',
  /AS "classTimes"/.test(planning.baseFrom) && /AS "examDate"/.test(planning.baseFrom));
ok('ارجاعِ فیلدها به aliasها با تعریف هم‌خوان است',
  /ct\."classTimes"/.test(fOf(planning, 'classTimes').sql) && /ex\."examDate"/.test(fOf(planning, 'examDate').sql));
ok('اساتیدِ کلاس از offering_professors است', /offering_professors/.test(planning.baseFrom));

console.log(`\nنتیجه: ${pass} ✓ / ${fail} ✗`);
if (fail > 0) process.exit(1);
