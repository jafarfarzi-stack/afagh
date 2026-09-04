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
  // ── قفل مهاجرت (بازبینی مهندسی): دو نمونهٔ همزمان migrator هرگز پچ نمی‌زنند ──
  await client.query(`SELECT pg_advisory_lock(hashtext('afagh_migrator'))`);
  console.log('🔧 اعمال پچ‌های اسکیما (patches.sql)…');
  await client.query(sql);
  console.log('✅ پچ‌های اسکیما اعمال شد.');

  // ═══ تأیید سلامت اسکیما (Migration Verification — بازبینی Medium) ═══
  // پیش از ادامهٔ پایپ‌لاین، جدول‌های حیاتیِ اپ باید وجود داشته باشند؛
  // اگر drizzle-kit push یا پچ‌ها ناقص مانده باشند، این‌جا (نه در runtime اپ) شکست می‌خورد.
  const REQUIRED_TABLES = [
    'users', 'students', 'staff', 'sessions', 'roles', 'user_roles',
    'enrollments', 'course_offerings', 'academic_terms', 'courses',
    'student_ledger', 'payment_cheques', 'student_discounts', 'student_sponsorships', 'student_loans',
    'system_settings', 'audit_logs', 'notifications', 'student_requests',
    'degree_level_configs', 'educational_regulations', 'majors',
  ];
  const missingTabs = [];
  for (const t of REQUIRED_TABLES) {
    const r = await client.query(`SELECT to_regclass('public."${t}"') AS t`);
    if (!r.rows[0]?.t) missingTabs.push(t);
  }
  if (missingTabs.length) {
    console.error(`❌ جدول‌های حیاتی یافت نشد: ${missingTabs.join(', ')} — مهاجرت ناقص است، استقرار متوقف شد.`);
    process.exit(1);
  }
  console.log(`✅ تأیید سلامت اسکیما: ${REQUIRED_TABLES.length} جدول حیاتی موجودند.`);

  await client.query(`SELECT pg_advisory_unlock(hashtext('afagh_migrator'))`);
} catch (err) {
  console.error('❌ خطا در اعمال پچ‌ها:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
