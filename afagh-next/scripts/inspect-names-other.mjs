import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://afagh:afagh@localhost:5432/afagh_db',
});

async function main() {
  for (const uniId of [1, 4, 5]) {
    const r = await pool.query(`
      SELECT DISTINCT u.id, u."lastName", s."studentCode"
      FROM users u
      JOIN students s ON s."userId" = u.id
      WHERE u."firstName" = 'نامشخص' AND s."universityId" = $1
      LIMIT 25
    `, [uniId]);
    console.log(`\n=== Uni ${uniId} ===`);
    for (const row of r.rows) {
      console.log(`  ${row.studentCode}: "${row.lastName}"`);
    }
  }

  await pool.end();
}

main().catch(console.error);
