import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * نگهبان صفحهٔ «صدور لیست حضور و غیاب» (/admin/attendance-list):
 * گارد نقش/مجوز، چک‌باکس «عکسدار»، برگهٔ خالی برای تک دستی (بدون تیک استاد)،
 * سربرگ تکرارشو در همهٔ صفحات چاپ (thead)، جدول در عرض صفحه (بدون بریدگی از چپ)،
 * مرتب‌سازی فهرست، ادغامی یک لیست، ارم دانشگاه، عکس امن، ثبت در رجیستری ادمین.
 */
async function main(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const read = (p: string) => fs.readFileSync(path.join(here, '..', p), 'utf8');
  let okCount = 0;
  const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); okCount += 1; };

  const page = read('src/app/admin/attendance-list/page.tsx');
  const controls = read('src/app/admin/attendance-list/controls.tsx');

  // ── گارد دسترسی: همان نقش/مجوزِ «کنترل حضور و غیاب کلاس‌ها» ──
  ok(/requireRoleOrPermission\(\[\.\.\.ATT_ROLES\], \[\.\.\.ATT_PERMISSION\]\)/.test(page)
    && /const ATT_ROLES = \['ADMIN', 'EDU_EXPERT', 'ATTENDANCE_CONTROLLER'\]/.test(page), 'گارد نقش صفحه برابر کنترل حضور است');

  // ── چک‌باکس «عکسدار» — نه دو لینک قالب ──
  ok(/type="checkbox"/.test(controls) && /عکسدار/.test(controls), 'چک‌باکس عکسدار در نوار کنترل است');
  ok(!/<Link href=\{buildHref/.test(page), 'لینک‌های قالب قدیمی حذف شده‌اند');

  // ── برگهٔ خالی: تیک‌های استاد در چاپ ادمین نمی‌آید ──
  ok(!/MARKS/.test(page) && !/student_class_attendance/.test(page), 'کوئری حضور/نشانه‌ها حذف شده — برگهٔ ادمین خالی است');
  ok(!/✓|✗/.test(page), 'بدون نشانهٔ تیک/ضربدر در رندر');

  // ── چاپ: A4 عمودی + سربرگ تکرارشو + بدون بریدگی ──
  ok(/@page \{ size: A4 portrait; margin: 8mm; \}/.test(page), 'چاپ A4 عمودی است');
  ok(/attl-headcell/.test(page) && /colSpan=\{/.test(page), 'سربرگ داخل thead است و در همهٔ صفحات تکرار می‌شود');
  ok(/table-layout: fixed/.test(page) && /max-width: 100%/.test(page), 'جدول fixed و حداکثر عرض صفحه است');
  ok(/MAX_MATRIX_SESSION_COLS = \d+/.test(page) && /MAX_PHOTO_SESSION_COLS = \d+/.test(page), 'سقف ستون جلسه تعریف شده');
  ok(/extraCols/.test(page) && /با دست بنویسید/.test(page), 'جلسات سرریز با ستون «…» و یادداشت اعلام می‌شود');

  // ── مرتب‌سازی فهرست ──
  ok(/sp\.sort === 'code' \? 'code' : sp\.sort === 'row' \? 'row' : 'name'/.test(page), 'مرتب‌سازی نام خانوادگی/شماره دانشجویی/ثبت‌نام سمت سرور است');
  ok(/مرتب‌سازی/.test(controls) && /ترتیب ثبت‌نام/.test(controls), 'انتخابگر مرتب‌سازی در نوار کنترل است');

  // ── ریست جستجو بعد از انتخاب ──
  ok(/setQ\(''\); setProf\(''\); setFaculty\(''\); setDept\(''\)/.test(controls), 'جستجو/فیلتر بعد از هر پیمایش ریست می‌شود');

  // ── جستجو و فیلتر ──
  ok(/normFa/.test(controls) && /جستجوی درس/.test(controls) && /استاد — کد یا نام/.test(controls), 'جستجوی درس و استاد (کد/نام) با نرمال‌سازی فارسی هست');
  ok(/همهٔ دانشکده‌ها/.test(controls) && /همهٔ گروه‌های آموزشی/.test(controls), 'فیلتر دانشکده و گروه آموزشی هست');

  // ── کلاس‌های ادغامی: یک لیست خروجی ──
  ok(/groupIntoMerged/.test(page) && /mergedGroupKey/.test(page) && /mergedDisplayTitle/.test(page), 'گروه‌بندی ادغامی با همان موتور کارتابل استاد است');
  ok(/sessionDedupKey/.test(page) && /ادغامی ×/.test(page), 'جلسات تکراری اعضای ادغامی یکی می‌شود و نشان ادغامی هست');

  // ── ارم دانشگاه ──
  ok(/getReportPrintBrand/.test(page) && /universityLogoUrl/.test(page) && /attl-logo/.test(page), 'ارم دانشگاه در سربرگ چاپ هست');

  // ── عکس از مسیر امن — کلید باکت هرگز به کلاینت نمی‌رود ──
  ok(/<PersonPhoto userId=\{r\.userId\} hasPhoto=\{!!r\.photoKey\}/.test(page), 'عکس دانشجو با PersonPhoto از /api/photo رندر می‌شود');
  ok(!/src=\{[`"']?\/api\/photo/.test(page), 'img خام جای PersonPhoto را نگرفته');

  // ── ثبت در رجیستری کارتابل ادمین ──
  const registry = read('src/lib/admin-modules.tsx');
  ok(/href: '\/admin\/attendance-list'/.test(registry), 'ماژول در کارتابل ادمین ثبت شده');
  ok(registry.indexOf("href: '/admin/attendance-list'") > registry.indexOf("href: '/admin/attendance-control'"), 'کاشی بعد از کنترل حضور و غیاب آمده');

  // ── هیچ ثبتِ حضور در این صفحه انجام نمی‌شود (فقط خواندن) ──
  ok(!/'use server'/.test(page), 'صفحه Server Action ندارد — فقط خواندن');

  console.log(`✓ attendance-list guard — ${okCount} ادعا`);
}

main().catch(err => { console.error(err); process.exit(1); });
