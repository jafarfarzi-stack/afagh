#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════
 *  اعمال پچ‌های اسکیما در پایپ‌لاین مهاجرت (پیش از استارت اپ)
 *
 *  سیاست مهاجرت امن: ALTER/CREATE اصلی فقط این‌جا (migrator) اجرا می‌شود،
 *  نه در runtime اپ. ترتیب کامل migrator:
 *      drizzle-kit push → apply-patches → seed-base → hardening
 *
 *  متن پچ‌ها: src/db/patches.sql (همان منبعی که در توسعه به‌عنوان
 *  خودترمیمی استفاده می‌شود — یک منبع واحد، بدون تکرار SQL).
 * ══════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlFile = path.join(__dirname, '..', 'src', 'db', 'patches.sql');
const sql = readFileSync(sqlFile, 'utf8');

const PG_URL = process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db';
const client = new pg.Client({ connectionString: PG_URL });

try {
  await client.connect();
  console.log('🔧 اعمال پچ‌های اسکیما (patches.sql)…');
  await client.query(sql);
  console.log('✅ پچ‌های اسکیما اعمال شد.');
} catch (err) {
  console.error('❌ خطا در اعمال پچ‌ها:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
