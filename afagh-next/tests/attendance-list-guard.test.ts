import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * نگهبان صفحهٔ «صدور لیست حضور و غیاب» (/admin/attendance-list):
 * گارد نقش/مجوز، چک‌باکس «عکسدار» (نه دو لینک قالب)، جستجوی درس/استاد + فیلتر دانشکده/گروه،
 * ادغام کلاس‌های ادغامی در یک لیست، ارم دانشگاه در سربرگ، عکس از مسیر امن PersonPhoto
 * و ثبت ماژول در رجیستری کارتابل ادمین.
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
  ok(!/قالب ماتریس جلسات<\/Link>/.test(page) && !/<Link href=\{buildHref/.test(page), 'دو لینک قالب قدیمی حذف شده‌اند');
  ok(/size: A4 \$\{photos \? 'portrait' : 'landscape'\}/.test(page), 'جهت کاغذ بر اساس تیک عکسدار انتخاب می‌شود');

  // ── جستجو و فیلتر ──
  ok(/normFa/.test(controls) && /جستجوی درس/.test(controls) && /استاد — کد یا نام/.test(controls), 'جستجوی درس و استاد (کد/نام) با نرمال‌سازی فارسی هست');
  ok(/همهٔ دانشکده‌ها/.test(controls) && /همهٔ گروه‌های آموزشی/.test(controls), 'فیلتر دانشکده و گروه آموزشی هست');
  ok(/profCodes/.test(controls) && /profCodes/.test(page), 'جستجوی استاد با کد استاد هم کار می‌کند');

  // ── کلاس‌های ادغامی: یک لیست خروجی ──
  ok(/groupIntoMerged/.test(page) && /mergedGroupKey/.test(page) && /mergedDisplayTitle/.test(page), 'گروه‌بندی ادغامی با همان موتور کارتابل استاد است');
  ok(/memberIds/.test(page) && /seenStudents/.test(page), 'دانشجویان همهٔ اعضا در یک فهرست ترکیبی می‌آیند');
  ok(/sessionDedupKey/.test(page) && /keyBySessionId/.test(page), 'جلسات فیزیکی تکراری اعضای ادغامی یک ستون می‌شوند');
  ok(/ادغامی ×/.test(page), 'نشانِ ادغامی در سربرگ/فهرست هست');

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
