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

  // ═══ اعتبارسنجی پس از اعمال: کل ماتریس RLS باید فعال باشد، وگرنه استقرار ناموفق است ═══
  const RLS_TABLES = [
    'users','students','staff','sessions','enrollments','cart_items','notifications','student_requests',
    'transcript_snapshots','student_ledger','financial_clearances','seat_allocations',
    'student_class_attendance','student_documents','military_service_records','kyc_verifications',
    'grade_appeals','grade_submission_otps','doc_sign_otps','professor_term_contracts',
    'professor_class_attendance','professor_exam_attendance','electronic_documents','payroll_statements',
    'exam_minutes','physical_access_logs','request_step_logs','request_parallel_checkpoints', // ۲۸ حساس
    'system_settings','integrations_config','audit_logs','api_audit_logs','admissions_staging',
    'sanjesh_mappings','evaluation_responses','verification_otps','step_api_actions','document_signatures', // ۱۰ deny-all
  ];
  const checks = await client.query(
    `SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = ANY($1)
     ORDER BY c.relname`,
    [RLS_TABLES],
  );
  const missing = RLS_TABLES.filter(t => !checks.rows.find(r => r.table_name === t)?.rls_enabled);
  if (missing.length) {
    console.error(`❌ RLS روی جدول‌های ${missing.join(', ')} فعال نیست — استقرار متوقف شد.`);
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

  console.log(`✅ RLS فعال است (${RLS_TABLES.length}/${RLS_TABLES.length} جدول — شامل deny-all) و نقش afagh_app امن است (NOSUPERUSER + NOBYPASSRLS).`);
  console.log('✅ گرنت ستونی: نوشتن دانشجو فقط روی enrollments("status","waitlistPosition") + cart_items(INSERT/DELETE) + notifications(INSERT).');
} catch (err) {
  console.error('خطا در اجرای سخت‌سازی:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
