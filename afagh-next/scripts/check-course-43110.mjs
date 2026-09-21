import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const r = await pool.query(`SELECT * FROM courses WHERE code IN ('43110', '43136', '43141')`);
  console.log(r.rows);
}

main().catch(console.error).finally(() => pool.end());
