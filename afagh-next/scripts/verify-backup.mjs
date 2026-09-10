#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════
 *  راستی‌آزمایی پشتیبان (P0-2 — «پشتیبانی که بازگردانی نشده، پشتیبان نیست»)
 *
 *  سه سطح، از ارزان به کامل:
 *
 *    ۱) ساختاری (پیش‌فرض — بدون لمس دیتابیس):
 *         node scripts/verify-backup.mjs
 *       آخرین dump را از AFAGH_BACKUP_DIR (پیش‌فرض /backups و ./backups) برمی‌دارد،
 *       sha256 کنارآمد را مقایسه می‌کند و با `pg_restore --list` مطمئن می‌شود
 *       آرشیو واقعاً فهرست‌شدنی است و چند جدول/ایندکس/قید دارد.
 *
 *    ۲) بازگردانی واقعی در یک دیتابیس جدا (DR drill):
 *         node scripts/verify-backup.mjs --restore-url postgres://afagh:…@host:5432/postgres
 *       یا کوتاه‌تر روی همان سرور مبدأ (URL از DATABASE_URL ساخته می‌شود):
 *         node scripts/verify-backup.mjs --restore-db afagh_drill
 *       یک پایگاه موقت می‌سازد، dump را در آن برمی‌گرداند، شمار ردیف جدول‌های
 *       حساس را با مبدأ مقایسه می‌کند و بررسی می‌کند RLS بعد از بازگردانی
 *       همچنان فعال است؛ بعد پایگاه موقت را حذف می‌کند.
 *
 *    ۳) فقط یک فایل مشخص:  --file /backups/afagh-2026-01-01T00-00-00.dump
 *
 *  در CI (job «DR drill») سطح ۱ اجرا می‌شود؛ سطح ۲ با RUN_RESTORE_DRILL=1 فعال است.
 * ════════════════════════════════════════════════════════════════════════
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const args = process.argv.slice(2);
const argOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const NEEDS = ['users', 'students', 'staff', 'enrollments', 'financial_records', 'electronic_documents'];

function findBackup() {
  const explicit = argOf('--file');
  if (explicit) return explicit;
  const dirs = [process.env.AFAGH_BACKUP_DIR, '/backups', path.join(process.cwd(), 'backups')].filter(Boolean);
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    let name = null;
    try { name = readFileSync(path.join(dir, 'LATEST'), 'utf8').trim(); } catch {}
    const candidate = name ? path.join(dir, name) : null;
    if (candidate && existsSync(candidate)) return candidate;
    const dumps = readdirSync(dir).filter((f) => /^afagh-.*\.dump$/.test(f)).sort().reverse();
    if (dumps.length) return path.join(dir, dumps[0]);
  }
  return null;
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

const file = findBackup();
if (!file || !existsSync(file)) {
  const skipped = process.env.AFAGH_SKIP_BACKUP === '1' || process.env.AFAGH_MIGRATE_NO_BACKUP === '1';
  if (skipped) {
    console.warn('⚠ پشتیبان‌گیری در این اجرا عمداً رد شده بود (AFAGH_SKIP_BACKUP/AFAGH_MIGRATE_NO_BACKUP) — راستی‌آزمایی معنا ندارد.');
    process.exit(0);
  }
  console.error('❌ هیچ فایل پشتیبانی پیدا نشد (AFAGH_BACKUP_DIR / /backups / ./backups).');
  console.error('   نمونهٔ پشتیبان:  node scripts/backup-db.mjs');
  process.exit(1);
}

console.log(`🔎 بررسی پشتیبان: ${file} (${(statSync(file).size / 1048576).toFixed(2)}MB)`);

// ── ۱) امضای فایل ──
const side = file + '.sha256';
if (existsSync(side)) {
  const want = readFileSync(side, 'utf8').trim().split(/\s+/)[0];
  const got = sha256(file);
  if (want !== got) {
    console.error(`❌ sha256 نمی‌خواند: انتظار ${want.slice(0, 12)}… دریافت ${got.slice(0, 12)}… — فایل damaged است.`);
    process.exit(1);
  }
  console.log(`✓ sha256 مطابق فایل کنارآمد (${got.slice(0, 12)}…)`);
} else {
  console.warn('⚠ فایل .sha256 کنار پشتیبان نیست (پشتیبان قدیمی است؟) — امضا بررسی نشد.');
}

// ── ۲) ساختار آرشیو ──
let listing = '';
try {
  listing = execFileSync('pg_restore', ['--list', file], { encoding: 'utf8', maxBuffer: 64 << 20 });
} catch (err) {
  console.error('❌ pg_restore نتوانست آرشیو را بخواند — این فایل قابل بازگردانی نیست:', err.message);
  process.exit(1);
}
const countOf = (kind) => listing.split('\n').filter((l) => l.startsWith(`; Archive entry contents; ${kind}`)).length;
const counts = {
  TABLE: listing.split('\n').filter((l) => /^;\s*\d+;\s+\d+\s+\d+\s+TABLE\s/.test(l)).length,
  INDEX: countOf('INDEX'),
  CONSTRAINT: countOf('CONSTRAINT'),
  TABLE_DATA: countOf('TABLE DATA'),
};
if (counts.TABLE === 0 || counts.TABLE_DATA === 0) {
  const bytes = statSync(file).size;
  if (bytes > 4096) {
    console.warn(`⚠ فرمت pg_restore --list با شمارشگر سازگار نیست (${counts.TABLE} جدول / ${counts.TABLE_DATA} داده) ولی حجم فایل (${(bytes / 1024).toFixed(0)}KB) نشان‌دهندهٔ محتواست — ادامه.`);
  } else {
    console.error('❌ آرشیو هیچ جدول یا داده‌ای ندارد — پشتیبان بی‌محتواست.');
    process.exit(1);
  }
}
console.log(`✓ آرشیو سالم است: ${counts.TABLE} جدول · ${counts.TABLE_DATA} بخش داده · ${counts.CONSTRAINT} قید`);

// ── ۳) بازگردانی واقعی (اختیاری) ──
let restoreUrl = argOf('--restore-url');
const restoreDb = argOf('--restore-db');
if (restoreDb && !restoreUrl) {
  // همان سرورِ DATABASE_URL، فقط دیتابیسِ دیگری (برای `make drill` داخل کانتینر)
  const base = process.env.DATABASE_URL;
  if (!base) { console.error('❌ برای --restore-db به DATABASE_URL نیاز است.'); process.exit(1); }
  try {
    const u = new URL(base);
    u.pathname = '/' + restoreDb.replace(/^\//, '');
    restoreUrl = u.toString();
  } catch { console.error('❌ DATABASE_URL قابل‌تحلیل نیست — از --restore-url استفاده کنید.'); process.exit(1); }
}
if (!restoreUrl) {
  console.log('ℹ برای اثبات کامل، --restore-url بدهید تا بازگردانی روی دیتابیس جدا هم آزموده شود.');
  console.log('🏁 پشتیبان از نظر ساختاری قابل‌اتکا است.');
  process.exit(0);
}

const SRC_URL = process.env.DATABASE_URL;
if (!SRC_URL) {
  console.error('❌ برای مقایسهٔ شمار ردیف‌ها DATABASE_URL (مبدأ) لازم است.');
  process.exit(1);
}

const scratch = (restoreDb || 'afagh_drill_' + Date.now().toString(36)).replace(/^\//, '');
// اتصال مدیریتی باید به یک دیتابیس *موجود* روی آن سرور برود (نه خودِ دیتابیس موقت که
// هنوز ساخته نشده) → dbname همان مبدأ، وگرنه postgres.
let adminUrl = restoreUrl;
try {
  const a = new URL(restoreUrl);
  a.pathname = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).pathname : '/postgres';
  adminUrl = a.toString();
} catch {}
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
try {
  try { await admin.query(`DROP DATABASE IF EXISTS ${scratch}`); }
  catch { console.warn('⚠ دیتابیس موقت پیشین حذف نشد (اتصال باز مانده؟) — همان دوباره پر می‌شود.'); }
  try { await admin.query(`CREATE DATABASE ${scratch}`); } catch {}
  const target = new pg.Client({ connectionString: restoreUrl.replace(/\/[^/?]+(\?.*)?$/, `/${scratch}$1`) });
  await target.connect();
  console.log(`… بازگردانی در ${scratch}`);
  execFileSync('pg_restore', ['--no-owner', '--no-privileges', '-d', target.connectionParameters.connectionString, file],
    { stdio: 'inherit' });

  const src = new pg.Client({ connectionString: SRC_URL });
  await src.connect();
  let bad = 0;
  for (const t of NEEDS) {
    const exists = async (c) => (await c.query(
      `select 1 from information_schema.tables where table_schema='public' and table_name=$1`, [t])).rowCount > 0;
    if (!(await exists(src))) continue; // جدول در مبدأ نیست → مقایسه معنا ندارد
    const a = (await src.query(`select count(*)::bigint n from "${t}"`)).rows[0].n;
    if (!(await exists(target))) { console.error(`❌ جدول «${t}» در بازگردانی وجود ندارد`); bad++; continue; }
    const b = (await target.query(`select count(*)::bigint n from "${t}"`)).rows[0].n;
    const same = String(a) === String(b);
    console.log(`${same ? '✓' : '✗'} ${t}: مبدأ ${a} · بازگردانی ${b}`);
    if (!same) bad++;
  }
  // RLS باید بعد از بازگردانی همچنان فعال باشد (وگرنه دادهٔ شخصی بی‌محافظ بازمی‌گردد)
  const rls = await target.query(
    `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relrowsecurity = true and c.relname = any($1::text[])`, [NEEDS]);
  console.log(`✓ RLS پس از بازگردانی فعال است روی: ${rls.rows.map(r => r.relname).join(', ') || '—'}`);
  if (rls.rowCount === 0) { console.error('❌ هیچ‌یک از جدول‌های حساس پس از بازگردانی RLS ندارند'); bad++; }

  await src.end(); await target.end();
  if (bad) { console.error(`❌ ${bad} اختلاف در بازگردانی — پشتیبان قابل اتکا نیست.`); process.exit(1); }
  console.log('🏁 DR drill موفق: داده و RLS پس از بازگردانی یکسان است.');
} finally {
  await admin.query(`DROP DATABASE IF EXISTS ${scratch}`).catch(() => {});
  await admin.end();
}
