#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════
 *  تبدیل جامع هر ۵ دانشگاه — ETL سما + پایپ‌لاین پس‌ازایمپورت
 *
 *  ترتیب: برای هر دانشگاه (AFAGH → ZARINE → ALLAME → SHAMS → NAZHAND)
 *    node scripts/import-sama-afagh.mjs --dir <data> --source <CODE> --db <DB>
 *  سپس یک‌بار:
 *    node scripts/post-import-pipeline.mjs   (بک‌فیل + کدها + SHAMS + موتور نمرات)
 *
 *  همهٔ مراحل idempotent‌اند: اجرای دوباره تکراری نمی‌سازد.
 *
 *  استفاده (محلی):
 *    $env:DATABASE_URL = "postgres://afagh:afagh@127.0.0.1:5432/afagh_db2"
 *    node scripts/convert-all-universities.mjs --data-root "E:\git\backup"
 *
 *  گزینه‌ها:
 *    --db <url>          اتصال دیتابیس (پیش‌فرض: DATABASE_URL یا afagh_db محلی)
 *    --data-root <path>  ریشهٔ پوشه‌های داده (پیش‌فرض: E:\git\backup)
 *    --only <codes>      فقط این دانشگاه‌ها، با ویرگول (مثلاً: --only AFAGH,ZARINE)
 *    --dry               شبیه‌سازی بدون نوشتن (به ETL و پایپ‌لاین پاس داده می‌شود)
 *    --skip-etl          رد کردن ETL و اجرای فقط پایپ‌لاین
 *    --skip-pipeline     رد کردن پایپ‌لاین (فقط ETL)
 * ══════════════════════════════════════════════════════════════════════
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const raw = process.argv.slice(2);
const opt = (n, d) => {
  const i = raw.indexOf(n);
  return (i >= 0 && raw[i + 1] && !raw[i + 1].startsWith('--')) ? raw[i + 1] : d;
};
const flag = (n) => raw.includes(n);

const DB = opt('--db', process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db');
const DATA_ROOT = resolve(opt('--data-root', 'E:\\git\\backup'));
const DRY = flag('--dry');
const SKIP_ETL = flag('--skip-etl');
const SKIP_PIPELINE = flag('--skip-pipeline');
const ONLY = opt('--only', '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

const UNIS = [
  { code: 'AFAGH', dir: 'information-afagh' },
  { code: 'ZARINE', dir: 'information-zarine' },
  { code: 'ALLAME', dir: 'information-allameh' },
  { code: 'SHAMS', dir: 'information-shams' },
  { code: 'NAZHAND', dir: 'information-nazhand' },
].filter((u) => !ONLY.length || ONLY.includes(u.code));

function run(label, cmd, args, extraEnv = {}) {
  return new Promise((resolveP, reject) => {
    console.log(`\n════════ ${label} ════════`);
    const p = spawn(cmd, args, {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, ...extraEnv },
      shell: process.platform === 'win32',
    });
    p.on('close', (code) => {
      if (code === 0) { console.log(`✓ ${label}`); resolveP(); }
      else reject(new Error(`${label} exited with code ${code}`));
    });
    p.on('error', reject);
  });
}

async function main() {
  const t0 = Date.now();
  console.log(`تبدیل جامع ${UNIS.length} دانشگاه → ${DB.replace(/:[^:@/]*@/, ':***@')}${DRY ? ' [DRY-RUN]' : ''}`);
  console.log(`ریشهٔ داده: ${DATA_ROOT}`);

  if (!SKIP_ETL) {
    for (const u of UNIS) {
      const dir = join(DATA_ROOT, u.dir);
      if (!existsSync(dir)) {
        console.warn(`⚠ پوشهٔ ${u.code} یافت نشد (${dir}) — رد شد`);
        continue;
      }
      const a = ['scripts/import-sama-afagh.mjs', '--dir', dir, '--source', u.code, '--db', DB];
      if (DRY) a.push('--dry');
      await run(`ETL سما — ${u.code}`, 'node', a);
    }
  } else {
    console.log('(ETL رد شد — فقط پایپ‌لاین)');
  }

  if (!SKIP_PIPELINE) {
    const a = ['scripts/post-import-pipeline.mjs'];
    if (DRY) a.push('--dry');
    await run('پایپ‌لاین پس‌ازایمپورت (هر ۵ دانشگاه)', 'node', a, { DATABASE_URL: DB });
  } else {
    console.log('(پایپ‌لاین رد شد)');
  }

  const min = Math.round((Date.now() - t0) / 60000);
  console.log(`\n✅ تبدیل جامع کامل شد (${min} دقیقه)${DRY ? ' [DRY-RUN]' : ''}`);
}

main().catch((e) => {
  console.error(`\n❌ تبدیل جامع ناموفق: ${e.message}`);
  process.exit(1);
});
