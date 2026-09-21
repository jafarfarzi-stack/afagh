import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  const c = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='curriculum_courses' ORDER BY ordinal_position`);
  console.log(c.rows.map(r=>r.column_name));
  const c2 = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='courses' AND column_name ILIKE '%markstate%'`);
  console.log('courses markstate cols:', c2.rows);
}
main().catch(console.error).finally(() => pool.end());
