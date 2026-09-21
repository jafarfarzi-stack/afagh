import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const c = await pool.connect();
  try {
    const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='students' ORDER BY ordinal_position`);
    console.log(JSON.stringify(cols.rows.map(r => r.column_name)));
  } finally { c.release(); await pool.end(); }
}
main().catch(console.error);
