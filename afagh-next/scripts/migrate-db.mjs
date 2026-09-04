#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════
 *  migrator تولیدی — جایگزین `drizzle-kit push --force`
 *
 *  زنجیرهٔ استقرار: پشتیبان (fail-closed) → اعمال مهاجرت‌های نسخه‌دار از
 *  `drizzle/*.sql` (بر اساس `meta/_journal.json`) → راستی‌آزمایی دفتر مهاجرت.
 *
 *  - بدون `--baseline`  : همهٔ مهاجرت‌های اعمال‌نشده از صفر (یا از آخرین مهاجرت)
 *                         اجرا می‌شوند — برای محیط‌های جدید (CI، Production).
 *  - با `--baseline`     : برای دیتابیس‌های موجود که اسکیما را قبلاً با
 *                         `drizzle-kit push` ساخته‌اند — مهاجرت‌های فعلی فقط
 *                         «اعمال‌شده» ثبت می‌شوند (بدون اجرای SQL) تا از این پس
 *                         تغییرات فقط از راه مهاجرت‌ها وارد شوند. امن است:
 *                         فقط روی hashهایی که هنوز ثبت نشده‌اند می‌نویسد.
 *
 *  اجرا:  DATABASE_URL=… node scripts/migrate-db.mjs [--baseline]
 * ════════════════════════════════════════════════════════════════════════
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const URL = process.env.DATABASE_URL;
if (!URL) { console.error('❌ DATABASE_URL الزامی است.'); process.exit(2); }
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(HERE, '..', 'drizzle');
const BASELINE = process.argv.includes('--baseline');

// ── ۱) پشتیبان پیش از استقرار (fail-closed: اگر پشتیبان نشد، توقف) ──
const backup = spawnSync(process.execPath, [path.join(HERE, 'backup-db.mjs')], { stdio: 'inherit' });
if (backup.status !== 0) {
  // فقط برای محیط توسعهٔ محلی که pg_dump با سرور ناسازگار است (override صریح).
  // در پایپ‌لاین تولیدی هرگز تنظیم نمی‌شود — fail-closed حفظ می‌شود.
  if (process.env.AFAGH_MIGRATE_NO_BACKUP === '1') {
    console.warn('⚠ AFAGH_MIGRATE_NO_BACKUP=1 — پشتیبان رد شد (فقط توسعهٔ محلی).');
  } else {
    console.error('❌ پشتیبان‌گیری ناموفق — مهاجرت متوقف شد.');
    process.exit(3);
  }
}

// ── ۲) خواندن دفترچهٔ مهاجرت‌ها ──
const journalPath = path.join(MIGRATIONS_DIR, 'meta', '_journal.json');
if (!fs.existsSync(journalPath)) {
  console.error(`❌ ${journalPath} یافت نشد — اول: npx drizzle-kit generate`);
  process.exit(4);
}
const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
const files = journal.entries.map((e) => {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, `${e.tag}.sql`), 'utf8');
  return { tag: e.tag, sql, when: e.when, hash: crypto.createHash('sha256').update(sql).digest('hex') };
});

const c = new pg.Client({ connectionString: URL });
await c.connect();
const db = drizzle(c);

// ── ۳) دفتر مهاجرت (همان ساختار drizzle — سازگار با `drizzle-kit migrate`) ──
await c.query('CREATE SCHEMA IF NOT EXISTS drizzle');
await c.query(
  'CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)',
);

if (BASELINE) {
  // فقط ثبتِ «انجام‌شده» برای محیط‌های موجود (بدون اجرای SQL)
  let marked = 0;
  for (const f of files) {
    const has = await c.query('SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash=$1 LIMIT 1', [f.hash]);
    if (!has.rows.length) {
      await c.query('INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1,$2)', [f.hash, f.when]);
      marked++;
    }
  }
  console.log(`✅ baseline: ${marked} مهاجرت به‌عنوان اعمال‌شده ثبت شد (${files.length} مهاجرت موجود).`);
  console.log('   از این پس تغییرات اسکیما فقط از راه drizzle/*.sql وارد می‌شوند.');
  await c.end();
  process.exit(0);
}

// ── ۴) اعمال مهاجرت‌های نسخه‌دار (تراکنشی، فقط pending) ──
await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

// ── ۵) راستی‌آزمایی ──
const { rows } = await c.query('SELECT count(*)::int AS n, max(created_at) AS last FROM drizzle.__drizzle_migrations');
const applied = rows[0].n;
console.log(`✅ مهاجرت انجام شد: ${applied}/${files.length} مهاجرت در دفتر ثبت است.`);
if (applied < files.length) {
  console.error(`❌ ناهماهنگی: ${files.length - applied} مهاجرت ثبت نشده — بررسی کنید.`);
  await c.end();
  process.exit(5);
}
await c.end();
console.log('🏁 اسکیما در وضعیت مورد انتظار است.');
