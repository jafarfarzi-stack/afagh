import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  const r = await pool.query(`SELECT id, title, "degreeLevelId", "rulesConfig" FROM educational_regulations WHERE id IN (12,13,14,15,16,17) ORDER BY id`);
  for (const row of r.rows) {
    let cfg = {};
    try { cfg = JSON.parse(row.rulesConfig); } catch {}
    console.log(`id=${row.id} | ${row.title} | deg=${row.degreeLevelId}`);
    console.log('   grading_and_gpa:', JSON.stringify(cfg.grading_and_gpa));
  }
  await pool.end();
}
main().catch(console.error);
