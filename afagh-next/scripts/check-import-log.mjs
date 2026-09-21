import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  const t = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE '%run%' OR table_name LIKE '%log%' OR table_name LIKE '%batch%') ORDER BY 1`);
  console.log(t.rows.map(r => r.table_name));
  for (const tbl of ['legacy_import_batches', 'import_runs', 'import_logs']) {
    try {
      const c = await pool.query(`SELECT * FROM ${tbl} ORDER BY 1 DESC LIMIT 20`);
      console.log(`--- ${tbl} (${c.rows.length} shown) ---`);
      console.table(c.rows);
    } catch (e) { console.log(tbl, 'missing:', e.message.slice(0, 80)); }
  }
  await pool.end();
}
main().catch(console.error);
