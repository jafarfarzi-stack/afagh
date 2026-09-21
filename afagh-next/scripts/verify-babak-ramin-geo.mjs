import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const client = await pool.connect();
  try {
    const testRes = await client.query(`
      SELECT s."studentCode", u."firstName", u."lastName", u."placeOfBirth", u."placeOfIssue", u."birthPlaceCode"
      FROM students s
      JOIN users u ON u.id = s."userId"
      WHERE s."studentCode" IN ('9921312004', '9922344004');
    `);
    console.log('Verification check:');
    console.log(testRes.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
