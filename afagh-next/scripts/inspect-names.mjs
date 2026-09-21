import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://afagh:afagh@localhost:5432/afagh_db',
});

async function main() {
  // Check Uni 2 (Zarine)
  const z = await pool.query(`
    SELECT u.id, u."lastName", s."studentCode"
    FROM users u
    JOIN students s ON s."userId" = u.id
    WHERE u."firstName" = 'نامشخص' AND s."universityId" = 2
    LIMIT 30
  `);
  console.log('Uni 2 sample (Zarine):');
  for (const r of z.rows) {
    console.log(`  ${r.studentCode}: "${r.lastName}"`);
  }

  // Check Uni 3 (Allame)
  const a = await pool.query(`
    SELECT u.id, u."lastName", s."studentCode"
    FROM users u
    JOIN students s ON s."userId" = u.id
    WHERE u."firstName" = 'نامشخص' AND s."universityId" = 3
    LIMIT 30
  `);
  console.log('\nUni 3 sample (Allame):');
  for (const r of a.rows) {
    console.log(`  ${r.studentCode}: "${r.lastName}"`);
  }

  await pool.end();
}

main().catch(console.error);
