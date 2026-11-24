import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * نگهبان صفحهٔ «صدور لیست حضور و غیاب» (/admin/attendance-list):
 * گارد نقش/مجوز، دو قالب چاپ (ماتریس جلسات / همراه عکس)، مرتب‌سازی نام خانوادگی،
 * عکس از مسیر امن PersonPhoto (نه کلید باکت) و ثبت ماژول در رجیستری کارتابل ادمین.
 */
async function main(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const read = (p: string) => fs.readFileSync(path.join(here, '..', p), 'utf8');
  let okCount = 0;
  const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); okCount += 1; };

  const page = read('src/app/admin/attendance-list/page.tsx');

  // ── گارد دسترسی: همان نقش/مجوزِ «کنترل حضور و غیاب کلاس‌ها» ──
  ok(/requireRoleOrPermission\(\[\.\.\.ATT_ROLES\], \[\.\.\.ATT_PERMISSION\]\)/.test(page)
    && /const ATT_ROLES = \['ADMIN', 'EDU_EXPERT', 'ATTENDANCE_CONTROLLER'\]/.test(page), 'گارد نقش صفحه برابر کنترل حضور است');
  ok(/'edu:attendance_control'/.test(page), 'مجوز edu:attendance_control بررسی می‌شود');

  // ── دو قالب چاپ ──
  ok(/format === 'matrix'/.test(page) && /format === 'photos'/.test(page), 'دو قالب matrix و photos رندر می‌شوند');
  ok(/size: A4 \$\{format === 'photos' \? 'portrait' : 'landscape'\}/.test(page), 'جهت کاغذ بر اساس قالب انتخاب می‌شود (ماتریس افقی، عکس عمودی)');

  // ── مرتب‌سازی بر اساس نام خانوادگی ──
  ok(/a\.lastName \?\? ''\)\.trim\(\)\.localeCompare\(\(b\.lastName/.test(page), 'فهرست بر اساس نام خانوادگی مرتب می‌شود');

  // ── عکس از مسیر امن — کلید باکت هرگز به کلاینت نمی‌رود ──
  ok(/<PersonPhoto userId=\{r\.userId\} hasPhoto=\{!!r\.photoKey\}/.test(page), 'عکس دانشجو با PersonPhoto از /api/photo رندر می‌شود');
  ok(!/photoKey\s*\}/.test(page.replace(/hasPhoto=\{!!r\.photoKey\}/g, '')), 'کلید عکس مستقیم به img داده نمی‌شود');
  ok(!/src=\{[`"']?\/api\/photo/.test(page), 'img خام جای PersonPhoto را نگرفته');

  // ── ستون‌های جلسه و شمارش وضعیت ──
  ok(/MARKS:\s*\{\s*\[k: string\]: string \}\s*=\s*\{ PRESENT: '✓', ABSENT: '✗', LATE: 'ت', EXCUSED: 'م' \}/.test(page), 'نشانه‌های چهار وضعیت حضور تعریف شده');
  ok(/MAX_PHOTO_SESSION_COLS\s*=\s*\d+/.test(page), 'سقف ستون جلسه در قالب عکس محدود شده');

  // ── ثبت در رجیستری کارتابل ادمین ──
  const registry = read('src/lib/admin-modules.tsx');
  ok(/href: '\/admin\/attendance-list'/.test(registry), 'ماژول در کارتابل ادمین ثبت شده');
  ok(/title: 'صدور لیست حضور و غیاب'/.test(registry), 'کاشی با عنوان درست ثبت شده');
  ok(registry.indexOf("href: '/admin/attendance-list'") > registry.indexOf("href: '/admin/attendance-control'"), 'کاشی بعد از کنترل حضور و غیاب آمده');

  // ── هیچ ثبتِ حضور در این صفحه انجام نمی‌شود (فقط خواندن) ──
  ok(!/'use server'/.test(page), 'صفحه Server Action ندارد — فقط خواندن');

  console.log(`✓ attendance-list guard — ${okCount} ادعا`);
}

main().catch(err => { console.error(err); process.exit(1); });
