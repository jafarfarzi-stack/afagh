import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT co.id as offering_id, co."courseId", c.code, c.title, c."minPassedMark", c."defaultAcceptMarkState", c."defaultRejectMarkState"
      FROM course_offerings co
      JOIN courses c ON c.id = co."courseId"
      WHERE co.id IN (21597, 21598);
    `);
    console.log('Offerings:', res.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
