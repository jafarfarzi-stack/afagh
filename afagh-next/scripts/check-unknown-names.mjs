import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://afagh:afagh@localhost:5432/afagh_db',
});

async function main() {
  const rem = await pool.query(`SELECT count(*) FROM users WHERE "firstName" = 'نامشخص'`);
  console.log('Remaining users with firstName = نامشخص:', rem.rows[0].count);

  const sampleCodes = ['9319918009', '9119918061', '8819919073', '8819919071', '8819919068', '40011264001', '400202001'];
  const samples = await pool.query(`
    SELECT s."studentCode", u."firstName", u."lastName", p."canonicalFirstName", p."canonicalLastName"
    FROM students s
    JOIN users u ON u.id = s."userId"
    LEFT JOIN persons p ON p.id = s."personId"
    WHERE s."studentCode" = ANY($1)
  `, [sampleCodes]);

  console.table(samples.rows);
  await pool.end();
}

main().catch(console.error);
