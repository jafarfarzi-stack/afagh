import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const c = await pool.query(`SELECT count(*) FROM legacy_grades WHERE "sourceCode" = 'AFAGH'`);
  console.log('AFAGH grades count:', c.rows[0].count);

  const idx = await pool.query(`
    SELECT indexname FROM pg_indexes WHERE tablename = 'legacy_grades'
  `);
  console.log('Indexes on legacy_grades:', idx.rows.map(r => r.indexname));
}

main().catch(console.error).finally(() => pool.end());
