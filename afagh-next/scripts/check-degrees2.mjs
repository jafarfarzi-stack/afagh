import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  const c = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='degree_level_configs' ORDER BY ordinal_position`);
  console.log(c.rows);
  const d = await pool.query(`SELECT * FROM degree_level_configs ORDER BY id`);
  console.log(d.rows);
}
main().catch(console.error).finally(() => pool.end());
