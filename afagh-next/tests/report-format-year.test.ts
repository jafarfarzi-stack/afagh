/**
 * تست واحدِ قالب‌بندی سلول‌های گزارش — با تمرکز روی «سال».
 *
 * اجرا: npm test
 *
 * ریشهٔ باگ: قالب `NUMBER` مقدار را با `toLocaleString('en-US')` گروه‌بندی
 * می‌کرد، پس «سال ورودی = ۱۴۰۳» در گزارش‌های مالی به «۱٬۴۰۳» تبدیل می‌شد
 * (سال یک «شناسه» است، نه یک «کمیت»). قالب `YEAR` این تفکیک را قفل می‌کند.
 */
import { formatReportCell } from '../src/lib/report-format.ts';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};

console.log('\nقالب سال (YEAR) — بدون جداکنندهٔ هزارگان');

// هستهٔ باگ: سالِ چهاررقمی نباید گروه‌بندی شود
eq('۱۴۰۳ عددی', formatReportCell(1403, 'YEAR'), '۱۴۰۳');
eq('۱۴۰۳ رشته‌ای', formatReportCell('1403', 'YEAR'), '۱۴۰۳');
eq('۱۴۰۵ عددی', formatReportCell(1405, 'YEAR'), '۱۴۰۵');
eq('۱۳۹۹ عددی', formatReportCell(1399, 'YEAR'), '۱۳۹۹');
eq('سالِ ۱۰۰۰ (مرزِ چهاررقمی)', formatReportCell(1000, 'YEAR'), '۱۰۰۰');

// هیچ کاراکتر جداکننده‌ای (٬ یا ,) نباید در خروجی باشد
for (const y of [1000, 1399, 1400, 1403, 1405]) {
  const out = formatReportCell(y, 'YEAR');
  eq(`سال ${y} بدون جداکننده`, /[٬,]/.test(out), false);
  eq(`سال ${y} فقط ارقام فارسی`, /^[۰-۹]+$/.test(out), true);
}

// تهی → خط تیره (مثل بقیهٔ قالب‌ها)
eq('null', formatReportCell(null, 'YEAR'), '—');
eq('undefined', formatReportCell(undefined, 'YEAR'), '—');
eq('رشتهٔ خالی', formatReportCell('', 'YEAR'), '—');

console.log('\nقالب NUMBER دست‌نخورده می‌ماند (تعداد/کمیت باید گروه‌بندی شود)');
eq('۱۲۳۴۵ به‌عنوان NUMBER', formatReportCell(12345, 'NUMBER'), '۱۲,۳۴۵');
eq('۱۲۳۴۵ به‌عنوان YEAR', formatReportCell(12345, 'YEAR'), '۱۲۳۴۵');

console.log('\nقالب MONEY بدون تغییر');
eq('۱٬۰۰۰ ریال', formatReportCell(1000, 'MONEY'), '۱,۰۰۰ ریال');

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} موفق، ${fail} ناموفق\n`);
if (fail > 0) process.exit(1);
