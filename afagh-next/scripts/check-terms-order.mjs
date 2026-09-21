import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`SELECT id, "termCode", title, "startDate" FROM academic_terms ORDER BY "termCode" ASC LIMIT 20;`);
    console.log('Terms sample:', res.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
