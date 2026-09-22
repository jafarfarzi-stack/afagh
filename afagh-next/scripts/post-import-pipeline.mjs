#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════
 *  پایپ‌لاین پس‌ازایمپورت — زنجیرهٔ idempotent برای سرور و محلی
 *
 *  ۱) بازسازی ثبت‌نام‌های جاافتاده از legacy_grades (همه دانشگاه‌ها)
 *  ۲) تکمیل کدهای پذیرش/رد دروس (NULL → ۱/۲)
 *  ۳) کدهای مردودی صریح آیین‌نامه‌ها (۹۴۱/۹۳۱/-۹۱/۲)
 *  ۴) اصلاح مقطع SHAMS (رشته‌های کاردانی/کارشناسی به SAMA-2/1)
 *  ۵) موتور نمرات روی همهٔ کارنامه‌ها (با tsx — فایل‌های TS را import می‌کند)
 *
 *  استفاده:
 *    DATABASE_URL=postgres://… node scripts/post-import-pipeline.mjs
 *    DATABASE_URL=… node scripts/post-import-pipeline.mjs --dry
 *    DATABASE_URL=… node scripts/post-import-pipeline.mjs --skip-backfill
 *    DATABASE_URL=… node scripts/post-import-pipeline.mjs --skip-engine
 * ══════════════════════════════════════════════════════════════════════
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const raw = process.argv.slice(2);
const DRY = raw.includes('--dry');
const SKIP_BACKFILL = raw.includes('--skip-backfill');
const SKIP_ENGINE = raw.includes('--skip-engine');
const SKIP_COURSES = raw.includes('--skip-courses');
const SKIP_REGS = raw.includes('--skip-regs');
const SKIP_SHAMS = raw.includes('--skip-shams');

if (!process.env.DATABASE_URL) {
  console.warn('⚠ DATABASE_URL تنظیم نشده — از پیش‌فرض محلی استفاده می‌شود');
}

function run(label, cmd, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n═══ ${label} ═══`);
    const p = spawn(cmd, args, {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    });
    p.on('close', (code) => {
      if (code === 0) { console.log(`✓ ${label}`); resolve(); }
      else reject(new Error(`${label} exited with code ${code}`));
    });
    p.on('error', reject);
  });
}

async function main() {
  const t0 = Date.now();

  if (!SKIP_BACKFILL) {
    const bfArgs = ['scripts/backfill-enrollments.mjs', '--source', '*'];
    if (DRY) bfArgs.push('--dry');
    await run('بک‌فیل ثبت‌نام‌ها (همه دانشگاه‌ها)', 'node', bfArgs);
  }

  if (!SKIP_COURSES) {
    await run('تکمیل کدهای پذیرش/رد دروس', 'node', ['scripts/fill-remaining-course-codes.mjs']);
  }

  if (!SKIP_REGS) {
    await run('کدهای مردودی صریح آیین‌نامه‌ها', 'node', ['scripts/fix-regs-and-dist.mjs']);
  }

  if (!SKIP_SHAMS) {
    await run('اصلاح مقطع SHAMS', 'node', ['scripts/fix-shams-degrees.mjs']);
  }

  if (!SKIP_ENGINE) {
    const engArgs = ['scripts/run-grade-engine-all-transcripts.mjs'];
    if (DRY) engArgs.push('--dry');
    await run('موتور نمرات (همه کارنامه‌ها)', 'npx', ['--yes', 'tsx', ...engArgs]);
  }

  const sec = Math.round((Date.now() - t0) / 1000);
  console.log(`\n✅ پایپ‌لاین پس‌ازایمپورت کامل شد (${sec}s)${DRY ? ' [DRY-RUN]' : ''}`);
}

main().catch((e) => {
  console.error(`\n❌ پایپ‌لاین ناموفق: ${e.message}`);
  process.exit(1);
});
