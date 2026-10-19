#!/usr/bin/env node
/**
 * ثبت یک دانشگاه نمونه برای نسخهٔ دمو (idempotent)
 *
 * فقط ردیف دانشگاه را در `universities` می‌سازد تا سوییچر دانشگاه و
 * صفحهٔ ورود (login-showcase) بیش از یک دانشگاه نشان دهند.
 * داده‌های آموزشی (رشته، نیمسال، دانشجو) برای این دانشگاه ساخته نمی‌شوند.
 *
 * اجرا:
 *   DATABASE_URL=postgres://user:pass@host:5432/db node scripts/seed-sample-university.mjs
 *   (اختیاری) SAMPLE_UNI_CODE=DEMO SAMPLE_UNI_TITLE="دانشگاه نمونه" node scripts/seed-sample-university.mjs
 */
import pg from 'pg';

const { Pool } = pg;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL ست نشده است.');
  process.exit(1);
}

const code = (process.env.SAMPLE_UNI_CODE || 'SAMPLE').trim().toUpperCase();
const title = (process.env.SAMPLE_UNI_TITLE || 'دانشگاه نمونه').trim();

const pool = new Pool({ connectionString: url });
try {
  const res = await pool.query(
    `INSERT INTO universities (code, title, kind, status, "isActive")
     VALUES ($1, $2, 'OWN', 'ACTIVE', 1)
     ON CONFLICT (code) DO NOTHING
     RETURNING id`,
    [code, title],
  );
  if (res.rowCount) {
    console.log(`دانشگاه نمونه ثبت شد: code=${code} id=${res.rows[0].id}`);
  } else {
    console.log(`دانشگاه با code=${code} از قبل وجود دارد؛ تغییری داده نشد.`);
  }
} catch (err) {
  console.error('خطا در ثبت دانشگاه نمونه:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
