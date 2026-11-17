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

// ── ۵) چیدمانِ تککارتهٔ کارنامهٔ مالی (مدل کارتی) در چاپ قفل بماند ──
// جدول ریز دروس اکنون ۱۱ ستون دارد و سربرگ ترم شش قلم است؛ دو کارتِ
// ~۹۶mm در A4 عمودی خوانا نیست. هم JSX و هم قاعدهٔ چاپ تکستونهاند.
ok(
  /\.tr-fin-root \.tr-fin-row \{ grid-template-columns: minmax\(0, 1fr\) !important;/.test(globalsCssNoComments),
  'globals.css: گریدِ ترم‌های کارنامهٔ مالی در چاپ تکستونه است (یک کارت تمامعرض)'
);
ok(
  !/\.tr-fin-root \.tr-fin-row \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important;/.test(globalsCssNoComments),
  'globals.css: قاعدهٔ ۲ستونهٔ قدیمیِ گریدِ ترم‌ها حذف شده است'
);
ok(
  /\.tr-fin-root \.term-block \{ break-inside: avoid !important; page-break-inside: avoid !important; \}/.test(globalsCss),
  'globals.css: کارتِ ترم (term-block) در چاپ avoid است تا نصف نشود'
);
ok(
  /\.tr-fin-root \.term-block \{ break-inside: avoid !important/.test(globalsCss)
    && /\.tr-fin-root table\.tr-doc > tbody > tr\.tr-doc-row \{ break-inside: auto !important/.test(globalsCss),
  'globals.css: ردیفِ بیرونی auto است تا کارت‌ها در صفحه جریان بگیرند'
);

// ── ۶) آرمِ دانشگاه در مدل تخت (FinancialTranscriptFlat) باید در سربرگ باشد ──
const flatTsx = readFileSync(path.join(ROOT, 'src', 'components', 'FinancialTranscriptFlat.tsx'), 'utf8');
// آرم داخل نوارِ عنوان (قبل از «جمهوری اسلامی ایران»)
ok(
  /tr-fin-titlebar[\s\S]{0,600}?<img src=\{logoUrl\} alt="آرم دانشگاه"/.test(flatTsx),
  'FinancialTranscriptFlat: آرم داخل نوارِ عنوان (سربرگ) است'
);
ok(
  /tr-fin-titlebar[\s\S]{0,1200}?جمهوری اسلامی ایران/.test(flatTsx)
    && flatTsx.indexOf('alt="آرم دانشگاه"') < flatTsx.indexOf('جمهوری اسلامی ایران', flatTsx.indexOf('tr-fin-titlebar')),
  'FinancialTranscriptFlat: آرم بالای متنِ «جمهوری اسلامی ایران» می‌نشیند'
);
// و دیگر در ناحیهٔ ۴ (کنار عکس دانشجو) نباشد
const area4 = flatTsx.slice(flatTsx.indexOf('ناحیهٔ ۴'));
ok(
  !area4.includes('آرم دانشگاه'),
  'FinancialTranscriptFlat: آرم از ناحیهٔ ۴ (کنار عکس دانشجو) حذف شده است'
);

// ── ۷) پوستر سردر: قواعد @page باید «سطح بالا» بمانند (علتِ ۲صفحهایشدن) ──
// کروم هنگام ساختِ پیشنمایشِ چاپ، قواعدِ @page را فقط در سطحِ بالای stylesheet
// میخواند؛ @pageِ داخلِ @media print نادیده گرفته میشود و حاشیهٔ سراسری برنده
// میشود. این بخش قفل میکند که هر دو قاعده (بی نام + ds-a4) بیرونِ بلوکِ چاپند،
// برگ A4 افقی با حاشیهٔ صفر است و ارتفاعِ چاپی پوستر ۲۰۸mm باقی مانده است.
const doorSignTsx = readFileSync(
  path.join(ROOT, 'src', 'app', 'admin', 'weekly-board', 'door-sign-print.tsx'),
  'utf8',
);
const cssLiteral = /const css = `([\s\S]*?)`;/.exec(doorSignTsx)?.[1] ?? '';
ok(cssLiteral.length > 0, 'door-sign-print.tsx: رشتهٔ CSS پوستر پیدا شد');

// کامنتهای CSS حاوی توضیحِ باگِ قدیمی («@page داخل @media print»)اند؛
// بدون حذفشان نگهبان مثبت کاذب میداد.
const doorCss = cssLiteral.replace(/\/\*[\s\S]*?\*\//g, '');

/** عمقِ آکولادِ هر کاراکتر — برای تشخیصِ «سطح بالا» بودنِ قاعده */
const depthAt: number[] = [];
let cssDepth = 0;
for (let i = 0; i < doorCss.length; i += 1) {
  depthAt[i] = cssDepth;
  if (doorCss[i] === '{') cssDepth += 1;
  else if (doorCss[i] === '}') cssDepth = Math.max(0, cssDepth - 1);
}
/** متنِ داخلِ بلوکی که از آکولادِ `open` شروع میشود */
const blockAfter = (open: number): string => {
  let d = 0;
  for (let i = open; i < doorCss.length; i += 1) {
    if (doorCss[i] === '{') d += 1;
    else if (doorCss[i] === '}') {
      d -= 1;
      if (d === 0) return doorCss.slice(open + 1, i);
    }
  }
  return '';
};

const pageRules = [...doorCss.matchAll(/@page\s*([A-Za-z][\w-]*)?\s*\{/g)].map((m) => {
  const open = m.index + m[0].lastIndexOf('{');
  return {
    name: m[1] ?? '',
    topLevel: depthAt[m.index] === 0,
    body: blockAfter(open),
    index: m.index,
  };
});
const unnamedPage = pageRules.find((r) => r.name === '');
const namedPage = pageRules.find((r) => r.name === 'ds-a4');
const a4Landscape = /size:\s*297mm\s+210mm/;
const zeroMargin = /margin:\s*0\b/;

ok(!!unnamedPage && unnamedPage.topLevel, 'door-sign-print: @page بی نام در سطح بالاست');
ok(!!namedPage && namedPage.topLevel, 'door-sign-print: @page ds-a4 در سطح بالاست');
ok(!!unnamedPage && a4Landscape.test(unnamedPage.body) && zeroMargin.test(unnamedPage.body),
  'door-sign-print: @page بی نام = A4 افقی (297×210mm) با حاشیهٔ صفر');
ok(!!namedPage && a4Landscape.test(namedPage.body) && zeroMargin.test(namedPage.body),
  'door-sign-print: @page ds-a4 = A4 افقی (297×210mm) با حاشیهٔ صفر');

const printBlocks = [...doorCss.matchAll(/@media\s+print\s*\{/g)].map((m) => ({
  body: blockAfter(m.index + m[0].lastIndexOf('{')),
  index: m.index,
}));
ok(printBlocks.length >= 1, 'door-sign-print: بلوک @media print پیدا شد');
const printBody = printBlocks.map((b) => b.body).join('\n');
ok(!/@page\b/.test(printBody), 'door-sign-print: هیچ @pageای داخل @media print نمانده است');
ok(!!unnamedPage && !!namedPage && printBlocks.length > 0
  && unnamedPage.index < printBlocks[0].index && namedPage.index < printBlocks[0].index,
  'door-sign-print: هر دو @page قبل از بلوکِ چاپ قرار دارند');
ok(/page:\s*ds-a4\b/.test(printBody), 'door-sign-print: پوستر در چاپ page: ds-a4 را قفل میکند');

const printSheetRules = [...printBody.matchAll(/\.ds-sheet\s*\{([^}]*)\}/g)].map((m) => m[1]);
ok(printSheetRules.some((b) => /height:\s*208mm\b/.test(b)),
  'door-sign-print: .ds-sheet در چاپ ارتفاع ۲۰۸mm دارد');
ok(!/height:\s*209mm\b/.test(doorCss),
  'door-sign-print: ارتفاعِ قدیمی ۲۰۹mm جایی نمانده است');
ok(/body:has\(\.ds-sheet\)[\s\S]{0,200}?min-height:\s*0\s*!important/.test(printBody),
  'door-sign-print: resetِ چاپ شاملِ خودِ body:has(.ds-sheet) است');

// رگرسیون ۱۶ نوامبر ۱۴۰۵: پوستهٔ پنلِ ادمین والدِ <main> را p-5/pb-16
// پدگذاری میکند؛ بدون صفرکردن آن والد، پوسترِ ۲۹۷mm از چپ بریده میشود و
// ۶۴px پدِ پایینی \((208mm + 17mm) > 210mm\) برگِ دومِ خالی میسازد.
// بازتولید: والد با پدِ واقعی → ۲ برگ؛ با قاعدهٔ زیر → ۱ برگ (هم با
// حاشیهٔ ۰ و هم با حاشیهٔ پیشفرض کروم).
const parentReset = printBody.match(/body:has\(\.ds-sheet\)\s*div:has\(>\s*main\)\s*\{([^}]*)\}/)?.[1] ?? '';
ok(/padding:\s*0\s*!important/.test(parentReset),
  'door-sign-print: پدِ والدِ <main> در چاپ صفر میشود (جلوگیری از برشِ چپ و برگِ دوم)');
ok(/gap:\s*0\s*!important/.test(parentReset) && /max-width:\s*none\s*!important/.test(parentReset),
  'door-sign-print: فاصله و سقفِ عرضِ والدِ <main> در چاپ حذف میشود');

console.log(`\nprint-media-guard: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
