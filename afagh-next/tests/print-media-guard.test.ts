/**
 * ════════════════════════════════════════════════════════════════════════
 *  گیت «رسانهٔ چاپ» — قاعدهٔ موبایل نباید در چاپ اجرا شود
 *
 *  چرا این تست وجود دارد:
 *    لایهٔ موبایل (`src/styles/mobile-tables.css`) جدول‌های دارای کلاس `rt` را
 *    در عرض‌های کم به «کارتِ عمودی» تبدیل می‌کند:
 *        table.rt        { display: block }
 *        table.rt tbody  { display: block }
 *        table.rt tr     { display: block }
 *        table.rt td     { display: flex }
 *    این قاعده با `@media (max-width: 768px)` نوشته شده بود. اما عرضِ کاغذِ
 *    A4 عمودی پس از کسرِ حاشیه‌ها ≈ ۷۴۱px است — که **کمتر از ۷۶۸px** می‌شود.
 *    یعنی هنگام چاپ هم قاعده اجرا می‌شد و:
 *      • ساختارِ جدول (thead/tbody/tr/td) از بین می‌رفت،
 *      • ستون‌ها زیرِ هم تا می‌خوردند (سند ~۷۲mm عرض به‌جای ~۱۸۰mm)،
 *      • سند چند برابر بلندتر می‌شد (۱۲ صفحه به‌جای ۳) و از کاغذ بیرون می‌زد.
 *
 *    این تست سه چیز را قفل می‌کند:
 *      ۱) هیچ قاعدهٔ «وابسته به عرض» در CSS سراسری نباید بدونِ `screen` باشد،
 *      ۲) فایلِ موبایل باید تماماً `screen and (...)` باشد،
 *      ۳) بلوکِ چاپ باید ساختارِ جدول را به حالتِ استاندارد برگرداند (دفاع).
 * ════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string): void => {
  if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); }
};

const mobileCss = readFileSync(path.join(ROOT, 'src', 'styles', 'mobile-tables.css'), 'utf8');
const globalsCss = readFileSync(path.join(ROOT, 'src', 'app', 'globals.css'), 'utf8');
const printTs = readFileSync(path.join(ROOT, 'src', 'components', 'print-transcript.ts'), 'utf8');

// ── ۱) لایهٔ موبایل: هیچ media queryِ وابسته به عرض بدونِ `screen` نباشد ──
// نکته: کامنت‌های CSS در اسکن نادیده گرفته می‌شوند (خودِ توضیحِ قاعده شامل
// نمونهٔ متنیِ «@media (max-width: …)» است و نباید مثبت کاذب بدهد).
const stripCssComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const mobileCssNoComments = stripCssComments(mobileCss);
const globalsCssNoComments = stripCssComments(globalsCss);

const bareWidthMedia = [
  ...mobileCssNoComments.matchAll(/@media\s*\(\s*max-width\s*:/g),
];
ok(
  bareWidthMedia.length === 0,
  `mobile-tables.css: هیچ «@media (max-width: …)» بدونِ screen نماند (${bareWidthMedia.length} مورد)`
);
ok(
  (mobileCss.match(/@media screen and \(max-width: 768px\)/g) ?? []).length >= 6,
  'mobile-tables.css: بلوک‌های موبایل با «@media screen and (max-width: 768px)» محدود شده‌اند'
);

// ── ۲) globals.css: قاعده‌های وابسته به عرض که چاپ را تحت تأثیر می‌گذارند ──
for (const needle of ['@media (max-width: 768px) {', '@media (max-width: 640px) {']) {
  ok(!globalsCssNoComments.includes(needle), `globals.css: «${needle}» بدونِ screen وجود ندارد`);
}
ok(
  globalsCss.includes('@media screen and (max-width: 768px) {')
  && globalsCss.includes('@media screen and (max-width: 640px) {'),
  'globals.css: قاعده‌های ۷۶۸px/۶۴۰px به screen محدود شده‌اند'
);

// ── ۳) دفاعِ چاپ: ساختارِ جدول در چاپ باید به حالتِ استاندارد برگردد ──
ok(
  /\.transcript-print-area table\.rt[\s\S]*?\{\s*display:\s*revert\s*!important;/.test(globalsCss),
  'globals.css: قاعدهٔ چاپ «.transcript-print-area table.rt { display: revert }» وجود دارد'
);
ok(
  /\.transcript-print-area table\.rt th,\s*\n\s*\.transcript-print-area table\.rt td \{ display: table-cell !important; \}/.test(globalsCss),
  'globals.css: سلول‌های جدول در چاپ «table-cell» می‌شوند (نه flex)'
);
ok(
  /\.transcript-print-area table\.rt td::before \{ content: none !important; \}/.test(globalsCss),
  'globals.css: برچسب‌های تزریقیِ موبایل (data-label) در چاپ حذف می‌شوند'
);
ok(
  /\.transcript-print-area table\.rt tr \{ display: table-row !important; \}/.test(globalsCss),
  'globals.css: ردیف‌های جدول در چاپ «table-row» می‌شوند'
);

// ── ۴) چاپ هر دو جهت را پوشش دهد و «@page» در سطحِ بالا بماند ──
ok(
  printTs.includes("'A4 portrait'") && printTs.includes("'A4 landscape'"),
  'print-transcript.ts: هر دو جهتِ A4 (landscape/portrait) تعریف شده‌اند'
);
ok(
  /`@page \{ size: \$\{size\}; margin: \$\{margins\}; \}`/.test(printTs),
  'print-transcript.ts: قاعدهٔ «@page» در سطحِ بالا تزریق می‌شود (نه داخلِ @media print)'
);
ok(
  /printing-portrait/.test(printTs),
  'print-transcript.ts: کلاسِ «printing-portrait» برای تفکیکِ چیدمانِ عمودی اعمال می‌شود'
);

console.log(`\nprint-media-guard: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
