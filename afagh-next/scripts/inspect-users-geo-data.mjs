import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT s."studentCode", u.id as user_id, u."birthPlaceCode", u."issuePlaceCode", u."placeOfBirth", u."placeOfIssue"
      FROM students s
      JOIN users u ON u.id = s."userId"
      WHERE s."studentCode" IN ('9921312004', '9922344004');
    `);
    console.log('Babak & Ramin users geo:', res.rows);

    const general = await client.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT("birthPlaceCode") as has_bpc,
        COUNT("issuePlaceCode") as has_ipc,
        COUNT("placeOfBirth") as has_pob,
        COUNT("placeOfIssue") as has_poi
      FROM users;
    `);
    console.log('General counts in users:', general.rows[0]);

    const samples = await client.query(`
      SELECT "birthPlaceCode", "issuePlaceCode", "placeOfBirth", "placeOfIssue"
      FROM users
      WHERE "birthPlaceCode" IS NOT NULL OR "placeOfBirth" IS NOT NULL
      LIMIT 15;
    `);
    console.log('Sample rows:', samples.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
