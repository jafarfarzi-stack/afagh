import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const c = await pool.connect();
  try {
    await c.query('ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS "originalSamaCode" varchar(10)');
    console.log('Column added');

    // کپی کدهای فعلی به عنوان کد اصلی (فقط برای رکوردهایی که originalSamaCode خالیه)
    const r = await c.query(`
      UPDATE enrollments SET "originalSamaCode" = "samaGradeStatusCode"
      WHERE "originalSamaCode" IS NULL AND "samaGradeStatusCode" IS NOT NULL
    `);
    console.log(`Backfilled ${r.rowCount} rows`);
  } finally { c.release(); await pool.end(); }
}
main().catch(console.error);
