#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════
 *  ممیزی استاتیک Server Actions — «هیچ اکشن بدون گارد» (بازبینی: P0)
 *
 *  برای هر تابع export شده در فایل‌های 'use server' بررسی می‌شود که در
 *  بدنهٔ آن (یا از طریق helper گارد محلی) حداقل یک احراز/مجوز باشد:
 *    requireRole | requireDepHead | requireMigrationAdmin | getSessionUser
 *    | requireStudentScope | assertServerActionOrigin
 *
 *  Helperهای محلی هم شناخته می‌شوند: توابع async داخل همان فایل که در
 *  بدنهٔ خودشان requireRole/... صدا می‌زنند (guard/ctx/me/meCtx/meAlumni و…).
 *  فایل‌های عمداً عمومی (ورود، استعلام‌های عمومی) در لیست سفیدند.
 *
 *  در CI اجرا می‌شود: هر اکشن بدون گارد → خروجی ۱ و نام فایل/تابع.
 * ════════════════════════════════════════════════════════════════════════
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'src/app');
const GUARDS = /requireRole\(|requireDepHead\(|requireMigrationAdmin\(|getSessionUser\(|requireStudentScope\(|assertServerActionOrigin\(/;
// مسیرهای عمومی عمدی (نیاز به گارد ندارند) — با دلیل
const PUBLIC_FILES = [
  'login/actions.ts',             // ورود/تغییر رمز: خودِ login گارد داخلی دارد + origin guard
  'id/actions.ts',                // استعلام عمومی کارت (rate-limited)
  'verify-certificate/actions.ts',// استعلام عمومی اصالت گواهینامه (rate-limited)
  'verify/[code]/page.tsx',       // صفحهٔ عمومی (rate-limited)
  'open-courses/actions.ts',      // ثبت‌نام دوره‌های آزاد و استعلام کد تخفیف: عمداً برای عموم (بدون ورود) + rate-limit داخلی
];

function collect(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) collect(p, out);
    else if (e.endsWith('.ts') || e.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const files = collect(ROOT);
let problems = [];
let scanned = 0;

for (const f of files) {
  let src;
  try { src = readFileSync(f, 'utf8'); } catch { continue; }
  if (!src.includes("'use server'") && !src.includes('"use server"')) continue;
  const relApp = path.relative(process.cwd(), f).replace(/\\/g, '/').replace('src/app/', '');
  if (PUBLIC_FILES.some((p) => relApp === p)) {
    console.log(`  ⚪ عمومی (سفید): ${relApp}`);
    continue;
  }

  // ── Helperهای گارد محلی (guard/ctx/me/…) ──
  const helpers = [];
  const helperRe = /async\s+function\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/g;
  let hm;
  while ((hm = helperRe.exec(src)) !== null) {
    if (GUARDS.test(hm[2]) || /getStudentByUser\(|getStaffByUser\(/.test(hm[2])) helpers.push(hm[1]);
  }

  // ── توابع exported ──
  const parts = src.split(/export\s+async\s+function\s+/);
  if (parts.length <= 1) continue;
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const name = (chunk.match(/^([A-Za-z0-9_]+)/) || [])[1];
    if (!name) continue;
    const body = chunk.split(/export\s+(?:async\s+)?function\s+/)[0].split(/export\s+const\s+/)[0];
    const guarded = GUARDS.test(body) || helpers.some((h) => new RegExp(`await\\s+${h}\\s*\\(`).test(body));
    scanned++;
    if (!guarded) problems.push(`${relApp} → ${name}()`);
  }
}

console.log(`\n🔎 اکشن‌های ممیزی‌شده: ${scanned}`);
if (problems.length) {
  console.error(`❌ ${problems.length} اکشن بدون گارد:`);
  for (const p of problems) console.error(`   • ${p}`);
  process.exit(1);
}
console.log('✅ همهٔ Server Actionهای غیرعمومی گارد دارند (Role/Object/Origin).');
