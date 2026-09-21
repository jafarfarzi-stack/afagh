import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  const r = await pool.query(`SELECT id, title, "rulesConfig", "createdAt" FROM educational_regulations WHERE title LIKE '%۱۳۹۴%' OR title LIKE '%1394%'`);
  for (const row of r.rows) {
    let cfg = null;
    try { cfg = JSON.parse(row.rulesConfig); } catch {}
    console.log(row.id, '|', row.title, '| created:', row.createdAt);
    console.log('  grading_and_gpa:', JSON.stringify(cfg?.grading_and_gpa));
  }
  await pool.end();
}
main().catch(console.error);
