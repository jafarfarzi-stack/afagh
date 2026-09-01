import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlFile = path.join(__dirname, '..', 'src', 'db', 'pg-hardening.sql');
const sql = readFileSync(sqlFile, 'utf8');

const PG_URL = process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db';
const client = new pg.Client({ connectionString: PG_URL });

try {
  await client.connect();
  console.log('در حال اعمال سخت‌سازی دیتابیس، ایندکس‌ها و نقش امنیتی afagh_app...');
  await client.query(sql);
  console.log('✅ سخت‌سازی دیتابیس و نقش afagh_app با موفقیت ایجاد و اعمال شد.');
} catch (err) {
  console.error('خطا در اجرای سخت‌سازی:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
