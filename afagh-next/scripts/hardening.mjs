import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlFile = path.join(__dirname, '..', 'src', 'db', 'pg-hardening.sql');
const sql = readFileSync(sqlFile, 'utf8');

const PG_URL = process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db';
// ── رمز نقش RLS از محیط، نه هاردکد ──
// در production حتماً باید تعیین شود (AFAGH_APP_DB_PASSWORD)؛ در توسعه پیش‌فرض محلی مجاز است.
const isProd = process.env.NODE_ENV === 'production';
const APP_PASSWORD = process.env.AFAGH_APP_DB_PASSWORD;
if (isProd && !APP_PASSWORD) {
  console.error('❌ در production باید AFAGH_APP_DB_PASSWORD (رمز نقش afagh_app) تعیین شود.');
  process.exit(1);
}
const appPassword = APP_PASSWORD || 'afagh_app';
if (!isProd && !APP_PASSWORD) {
  console.warn('⚠ توسعه: رمز پیش‌فرض afagh_app برای نقش afagh_app استفاده می‌شود (فقط محلی).');
}

const client = new pg.Client({ connectionString: PG_URL });

try {
  await client.connect();
  console.log('در حال اعمال سخت‌سازی دیتابیس، ایندکس‌ها و نقش امنیتی afagh_app...');
  await client.query(sql.replaceAll('__AFAGH_APP_PASSWORD__', appPassword));
  console.log('✅ سخت‌سازی دیتابیس و نقش afagh_app با موفقیت ایجاد و اعمال شد.');

  // ═══ اعتبارسنجی پس از اعمال: اگر RLS درست فعال نشده باشد، استقرار ناموفق است ═══
  const checks = await client.query(`
    SELECT c.relname AS table_name,
           c.relrowsecurity AS rls_enabled,
           c.relforcerowsecurity AS rls_forced
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('enrollments','cart_items','notifications','student_requests')
    ORDER BY c.relname`);
  const missing = checks.rows.filter(r => !r.rls_enabled);
  if (missing.length) {
    console.error(`❌ RLS روی جدول‌های ${missing.map(r => r.table_name).join(', ')} فعال نیست — استقرار متوقف شد.`);
    process.exit(1);
  }

  const role = await client.query(
    `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'afagh_app'`);
  const r = role.rows[0];
  if (!r) { console.error('❌ نقش afagh_app ساخته نشد.'); process.exit(1); }
  if (r.rolsuper || r.rolbypassrls) {
    console.error('❌ نقش afagh_app نباید SUPERUSER یا BYPASSRLS باشد.');
    process.exit(1);
  }

  console.log(`✅ RLS فعال است (${4 - missing.length}/4 جدول) و نقش afagh_app امن است (NOSUPERUSER + NOBYPASSRLS).`);
} catch (err) {
  console.error('خطا در اجرای سخت‌سازی:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
