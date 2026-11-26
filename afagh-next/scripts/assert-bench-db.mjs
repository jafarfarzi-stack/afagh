#!/usr/bin/env node
/**
 * محافظ سخت پیش از هر seed/load bench — جلوگیری از دستکاری دیتابیس production.
 *
 * اجرا:  DATABASE_URL=… node scripts/assert-bench-db.mjs
 * در صورت نیاز آگاهانه به اجرا روی production: ALLOW_PROD_BENCH=1 …
 *
 * خروجی: 0 = محیط bench/LOCAL مجاز · 2 = DATABASE_URL نبود یا production بدون مجوز.
 */
import pg from 'pg';

const URL = process.env.DATABASE_URL;
if (!URL) { console.error('❌ DATABASE_URL الزامی است.'); process.exit(2); }

const client = new pg.Client({ connectionString: URL });
let code = 0;
try {
  await client.connect();
  const { rows } = await client.query('SELECT current_database() AS db, inet_server_addr()::text AS addr');
  if (!rows[0]) {
    // fail-closed: بدون هویت دیتابیس نمیتوان اطمینان داد که production نیست.
    console.error('❌ کوئری شناسایی دیتابیس بدون نتیجه برگشت — اجرا متوقف میشود.');
    code = 2;
  } else {
    const { db, addr } = rows[0];
    const isProd = db === 'afagh_db' || addr === '100.70.187.120';
    if (isProd && process.env.ALLOW_PROD_BENCH !== '1') {
      console.error('⛔ شناسایی دیتابیس production:');
      console.error(`   current_database=${db} · server_addr=${addr}`);
      console.error('   اجرای bench/seed در production ممنوع است. از دیتابیس جداگانهٔ afagh_bench استفاده کنید');
      console.error('   یا در صورت آگاهی کامل ALLOW_PROD_BENCH=1 تنظیم نمایید.');
      code = 2;
    } else {
      console.log(`✅ محیط bench مجاز است: current_database=${db} · server_addr=${addr}`);
    }
  }
} catch (e) {
  console.error('❌ نتوانستیم دیتابیس را برای بررسی محافظ شناسایی کنیم:', e?.message ?? e);
  code = 2;
} finally {
  await client.end().catch(() => {});
}
process.exit(code);
