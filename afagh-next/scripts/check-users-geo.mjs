import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT s."studentCode", u."placeOfBirth", u."placeOfIssue", u."birthPlaceCode", u."issuePlaceCode"
      FROM students s
      JOIN users u ON u.id = s."userId"
      WHERE s."studentCode" IN ('9921312004', '9922344004');
    `);
    console.log(res.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
