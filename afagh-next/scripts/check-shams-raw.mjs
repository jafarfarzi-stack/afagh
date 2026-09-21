import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  const r = await pool.query(`SELECT raw FROM legacy_grades WHERE "sourceCode" = 'SHAMS' LIMIT 3`);
  for (const row of r.rows) console.log(JSON.stringify(row.raw).slice(0, 400));
  await pool.end();
}
main().catch(console.error);
