import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function check() {
  const c = await pool.query(`SELECT code, title, units FROM courses WHERE code IN ('2593302', '2593303', '2593601')`);
  console.log(c.rows);
}
check().finally(() => pool.end());
