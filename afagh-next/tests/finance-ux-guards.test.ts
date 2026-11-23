/**
 * ════════════════════════════════════════════════════════════════════════
 *  نگهبانِ UX مالی و مرکز گزارشها — تستِ ایستا (بدون DB، بدون مرورگر)
 *
 *  چرا این تست وجود دارد:
 *    در بازنویسی UX دو مشکلِ ریشه‌ای دوباره سر برآورده بود و هیچ گاردی
 *    نداشت:
 *      ۱) دکمهٔ «▶ اجرای گزارش» (و Excel/چاپ) داخلِ نوارِ فیلترها رفته
 *         بود ⇒ کاربر مجبور بود برای هر تغییر فیلتر، بارها اجرا کند و
 *         نتیجه زیرِ فیلترها گم میشد. چاره: نوارِ عملیاتِ چسبان
 *         (`sticky top-[6.5rem]`) **قبل از** نوارِ فیلترها.
 *      ۲) کاشیهای دسترسی سریع (`DOCKS`) و مسیرهای مالیِ منو چند بار
 *         تکرار شده بودند ⇒ کاربر با دو کاشیِ یکسان روبهرو میشد.
 *      ۳) لینکهای تازه بدون `prefetch={false}` اضافه میشدند ⇒ هر کلیک
 *         دهها رندرِ RSC و کوئریِ DB در پسزمینه (نگهبانِ عمومیِ
 *         `link-prefetch-guards.test.ts` را هم تقویت میکند).
 *      ۴) سربرگِ کارتابل مالی ۵ لینکِ تکراری داشت ⇒ فقط یک CTA واحد
 *         «🧰 ابزارهای مالی» به `/admin/c/fin`، و دکمهٔ چاپ هم از سربرگ
 *         به بالای جدول (بعد از فیلترها) منتقل شد.
 *
 *    تست فقط متن فایلها را میخواند و همان الگوی `ok(...)` سایر گاردها
 *    را دنبال میکند.
 * ════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string, detail = ''): void => {
  if (c) { pass++; console.log('  ✓', m); }
  else { fail++; console.log('  ✗', m, detail ? `\n      ${detail}` : ''); }
};

const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p: string) => existsSync(path.join(ROOT, p));

/** کوچکترین index یافتشده از میان چند نشانه (یا -1) */
const firstIndex = (s: string, needles: string[]): number => {
  const found = needles.map(n => s.indexOf(n)).filter(i => i >= 0);
  return found.length ? Math.min(...found) : -1;
};

const CLIENT = 'src/app/admin/reports/ReportsClient.tsx';
// تصحیحِ team-lead: `DOCKS` و لینکهای سربرگ، هر دو در صفحهٔ **گزارشهای مالی**اند.
const FINANCE_REPORTS_PAGE = 'src/app/admin/finance/reports/page.tsx';
const WORKLIST_PAGE = 'src/app/admin/finance/page.tsx';
const REPORT_PAGES = [FINANCE_REPORTS_PAGE, 'src/app/admin/reports/page.tsx'];
const MODULES = 'src/lib/admin-modules.tsx';

const client = read(CLIENT);
const modules = read(MODULES);
const financeReports = read(FINANCE_REPORTS_PAGE);
const worklist = read(WORKLIST_PAGE);

// ─────────────────────────────────────────────────────────────────────
console.log('\n— ۱) نوار عملیات قبل از نوار فیلترها (ReportsClient) —');

// نشانهٔ نوارِ چسبانِ عملیات — ترتیب کلاسها و کلاسهای اضافی مهم نیست،
// ولی هر دو کلاس باید روی **یک تگ** باشند (نه دو تگ جدا).
const stickyTags = [...client.matchAll(/<div\b[^>]*>/g)]
  .filter(m => /\bsticky\b/.test(m[0]) && m[0].includes('top-[6.5rem]'))
  .map(m => m.index ?? -1);
const stickyIdx = stickyTags.length ? Math.min(...stickyTags) : -1;
ok(stickyIdx >= 0, 'نوارِ عملیات دارای کلاس «sticky top-[6.5rem]» است');

// دکمهٔ اجرا: دقیقاً `onClick={() => run(1)}` (و نه onKeyDownِ جستوجو)
const runClickRe = /onClick=\{\(\)\s*=>\s*run\(1\)\}/g;
const runClicks = [...client.matchAll(runClickRe)].map(m => m.index ?? -1);
ok(runClicks.length === 1, `یک دکمهٔ «▶ اجرای گزارش» وجود دارد (یافتشده: ${runClicks.length})`);

// آغاز نوارِ فیلترها — چند نشانهٔ جایگزین تا در برابر تغییر کامنت مقاوم بماند
const filterIdx = firstIndex(client, [
  '{/* نوار فیلتر */}',
  'نوار فیلتر',
  'value={universityId}',
  'دانشگاه:',
]);
ok(filterIdx >= 0, 'آغاز نوارِ فیلترها در متن پیدا شد');

ok(stickyIdx >= 0 && filterIdx >= 0 && stickyIdx < filterIdx,
  `نوارِ عملیات (index=${stickyIdx}) **قبل از** نوارِ فیلترها (index=${filterIdx}) قرار دارد`,
  `sticky=${stickyIdx}, filter=${filterIdx}`);
ok(runClicks.length > 0 && filterIdx >= 0 && runClicks[0] < filterIdx,
  `دکمهٔ اجرا (index=${runClicks[0]}) قبل از نوارِ فیلترها (index=${filterIdx}) است`);

// محتوای نوارِ عملیات: از کلاس چسبان تا شروع فیلترها
const actionBarEnd = filterIdx > stickyIdx ? filterIdx : (stickyIdx >= 0 ? stickyIdx + 4000 : 0);
const actionBar = stickyIdx >= 0 ? client.slice(stickyIdx, actionBarEnd) : '';
ok(runClickRe.test(actionBar), 'دکمهٔ «اجرای گزارش» داخل نوارِ عملیات است');
ok(/onClick=\{doExport\}/.test(actionBar), 'دکمهٔ «خروجی Excel» (doExport) داخل همان نوار است');
ok(actionBar.includes('<ReportPrint'), 'دکمهٔ «چاپ» (ReportPrint) داخل همان نوار است');

// ─────────────────────────────────────────────────────────────────────
console.log('\n— ۲) نبودِ report kind تکراری در آرایهٔ DOCKS —');

ok(/const\s+DOCKS\b/.test(financeReports), 'آرایهٔ DOCKS در مسیر finance/reports/page.tsx قرار دارد');
const docksSrc = financeReports;
const docksBlock = /const\s+DOCKS\b[\s\S]*?\n\];/.exec(docksSrc)?.[0] ?? '';
ok(docksBlock.length > 0, 'بلوکِ تعریفِ DOCKS خوانده شد');

const docksHrefs = [...docksBlock.matchAll(/href:\s*'([^']+)'/g)].map(m => m[1]);
ok(docksHrefs.length >= 1, `کاشیهای DOCKS خوانده شدند (${docksHrefs.length} href)`);
// پس از پاکسازیِ report-dev فقط یک لینک کاتالوگ ?kind= باقی میماند — آستانهٔ
// قدیمی (≥5) با آن تعارض داشت و حذف شد؛ قفلِ اصلی «نبودِ تکرار» است.
const docksKinds = [...docksBlock.matchAll(/\?kind=([a-z][a-z-]*)/g)].map(m => m[1]);
ok(docksKinds.length <= 1, `حداکثر یک لینک ?kind= در DOCKS باقی مانده است (${docksKinds.length})`);

const FINANCE_DOCK_KINDS = [
  'total-payments', 'student-payments', 'term-payments', 'accounting-voucher',
  'tuition-overview', 'tuition-faculty-detail', 'faculty-financial', 'major-financial',
  'income-statement', 'balance-sheet', 'cash-flow', 'contractor-report',
  'general-ledger', 'revenue-hierarchy',
];
for (const k of FINANCE_DOCK_KINDS) {
  const n = docksKinds.filter(x => x === k).length;
  ok(n <= 1, `«${k}» حداکثر یک بار در DOCKS آمده است (تعداد: ${n})`);
}
const docksDupes = [...new Set(docksKinds.filter((k, i) => docksKinds.indexOf(k) !== i))];
ok(docksDupes.length === 0, 'هیچ report kind تکراری در DOCKS وجود ندارد',
  docksDupes.length ? `تکراریها: ${docksDupes.join(', ')}` : '');

// ─────────────────────────────────────────────────────────────────────
console.log('\n— ۳) نبودِ مسیر مالی تکراری در ADMIN_MODULES —');

/** تجزیهٔ بلوکهای شیء داخل ADMIN_MODULES با شمارش آکولاد (بدون regex شکننده) */
function adminModuleBlocks(src: string): { href: string; body: string }[] {
  const start = src.indexOf('export const ADMIN_MODULES');
  if (start < 0) return [];
  const open = src.indexOf('[', start);
  if (open < 0) return [];
  const close = src.indexOf('\n];', open);
  const arr = src.slice(open, close > 0 ? close : src.length);
  const out: { href: string; body: string }[] = [];
  let depth = 0;
  let objStart = -1;
  for (let i = 0; i < arr.length; i += 1) {
    const c = arr[i];
    if (c === '{') {
      if (depth === 0) objStart = i;
      depth += 1;
    } else if (c === '}') {
      depth -= 1;
      if (depth === 0 && objStart >= 0) {
        const body = arr.slice(objStart, i + 1);
        const href = /href:\s*'([^']+)'/.exec(body)?.[1];
        if (href) out.push({ href, body });
        objStart = -1;
      }
    }
  }
  return out;
}

const allBlocks = adminModuleBlocks(modules);
ok(allBlocks.length >= 30, `ماژولهای ADMIN_MODULES خوانده شدند (${allBlocks.length})`);

const FIN_HREF = /^\/admin\/(finance|payroll|tuition|student-finance|course-finance)/;
const finBlocks = allBlocks.filter(
  b => FIN_HREF.test(b.href) || /group:\s*'fin'/.test(b.body),
);
ok(finBlocks.length >= 5, `ماژولهای مالی پیدا شدند (${finBlocks.length})`);

const finCounts = new Map<string, number>();
for (const b of finBlocks) finCounts.set(b.href, (finCounts.get(b.href) ?? 0) + 1);
const finDupes = [...finCounts].filter(([, n]) => n > 1).map(([h, n]) => `${h} ×${n}`);
ok(finDupes.length === 0, 'هیچ مسیر مالی تکراری در ADMIN_MODULES وجود ندارد',
  finDupes.length ? `تکراریها: ${finDupes.join(' | ')}` : '');

// ─────────────────────────────────────────────────────────────────────
console.log('\n— ۴) prefetch={false} برای لینکهای سه فایل —');

/** برش تگ `<Link …>` تا اولین `>` بیرون از پرانتزهای `{ }` (الگوی تست موجود) */
function linkTags(src: string): string[] {
  const tags: string[] = [];
  const re = /<Link\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    let j = re.lastIndex;
    let depth = 0;
    while (j < src.length) {
      const c = src[j];
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      else if (c === '>' && depth === 0) break;
      j += 1;
    }
    tags.push(src.slice(m.index, j + 1));
    re.lastIndex = j + 1;
  }
  return tags;
}

for (const p of [CLIENT, ...REPORT_PAGES, MODULES, WORKLIST_PAGE]) {
  if (!exists(p)) continue;
  const tags = linkTags(read(p));
  const bad = tags.filter(t => !/prefetch\s*=\s*\{\s*false\s*\}/.test(t));
  ok(bad.length === 0, `${p}: تمام ${tags.length} لینک prefetch={false} دارند`,
    bad.length ? bad.slice(0, 3).map(t => t.slice(0, 90).replace(/\s+/g, ' ')).join('\n      ') : '');
}

// ─────────────────────────────────────────────────────────────────────
console.log('\n— ۵) کارتابل مالی: CTA واحد سربرگ + چاپ بالای جدول —');

// (تابع linkTags در بخش ۴ بهصورت function declaration تعریف شده و hoist میشود)
// نشانههای پایدار (بهگفتهٔ team-lead): تیترِ سربرگ و آغازِ ردیف «دسترسی سریع».
// از «سربرگ premium»/«نوار KPI» استفاده نمیکنیم چون در ویرایشهای مختلف
// جابهجا/حذف میشوند. ⚠ پنجرهٔ سربرگ با «<form» تمام نمیشود: ردیف «دسترسی
// سریع مالی» (۱۰ لینک، کامیت db8911bd) بینِ سربرگ و فرمِ فیلتر نشسته و اگر
// پنجره تا فرم ادامه یابد، لینکهای آن بهاشتباه CTA سربرگ شمرده میشوند.
const wlHeaderStart = worklist.indexOf('<h1');
const wlHeaderEnd = worklist.indexOf('{/* ── ابزارهای سریع مالی');
ok(wlHeaderStart >= 0 && wlHeaderEnd > wlHeaderStart, 'بازهٔ سربرگِ کارتابل مالی پیدا شد');
const wlHeader = wlHeaderStart >= 0 && wlHeaderEnd > wlHeaderStart
  ? worklist.slice(wlHeaderStart, wlHeaderEnd)
  : '';
const wlHeaderLinks = linkTags(wlHeader);
ok(wlHeaderLinks.length === 1, `سربرگ کارتابل مالی دقیقاً یک لینک CTA دارد (یافتشده: ${wlHeaderLinks.length})`);
ok(wlHeaderLinks.some(t => t.includes('href="/admin/c/fin"')), 'CTA سربرگ به /admin/c/fin است');
ok(wlHeaderLinks.every(t => /prefetch\s*=\s*\{\s*false\s*\}/.test(t)), 'CTA سربرگ prefetch={false} دارد');

// هیچ href ثابتی نباید در لینکهای صفحه تکرار شود (پاکسازی ۵ لینک سربرگ)
for (const [label, src] of [['کارتابل مالی', worklist], ['گزارشهای مالی', financeReports]] as const) {
  const staticHrefs = [...src.matchAll(/href="([^"{]+)"/g)].map(m => m[1]);
  const dupes = [...new Set(staticHrefs.filter((h, i) => staticHrefs.indexOf(h) !== i))];
  ok(dupes.length === 0, `${label}: هیچ href ثابت تکراری در لینکها وجود ندارد`,
    dupes.length ? `تکراریها: ${dupes.join(', ')}` : '');
}

const filtersPos = worklist.indexOf('<form method="get"');
const printPos = worklist.indexOf('<PrintButton');
const tablePos = worklist.indexOf('<FinanceTable');
ok(filtersPos >= 0, 'نوار فیلترها در کارتابل مالی پیدا شد');
ok(printPos >= 0, 'دکمهٔ چاپ در کارتابل مالی پیدا شد');
ok(tablePos >= 0, 'جدول دانشجویان در کارتابل مالی پیدا شد');
const ctaPos = worklist.indexOf('href="/admin/c/fin"');
ok(ctaPos >= 0 && filtersPos >= 0 && printPos >= 0 && ctaPos < filtersPos && ctaPos < printPos,
  'CTA سربرگ قبل از فیلترها و چاپ قرار دارد');
ok(filtersPos >= 0 && printPos > filtersPos, 'چاپ **بعد از** فیلترها (بالای جدول) قرار دارد');
ok(printPos >= 0 && tablePos > printPos, 'چاپ **قبل از** جدول قرار دارد');

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} قبول / ${fail} رد`);
if (fail > 0) process.exit(1);
