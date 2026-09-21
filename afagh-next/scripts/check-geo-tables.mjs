import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name LIKE '%geo%';
    `);
    console.log('Geo tables:', res.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
