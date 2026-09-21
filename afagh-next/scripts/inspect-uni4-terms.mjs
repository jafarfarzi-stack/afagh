import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://afagh:afagh@localhost:5432/afagh_db',
});

async function main() {
  const t = await pool.query(`
    SELECT * FROM academic_terms WHERE "termCode" IN ('101', '102', '103', '104', '105', '106', '107', '108', '1021', '1042', '1051')
  `);
  console.table(t.rows);

  // Check some legacy_grades with termCode = '101'
  const lg101 = await pool.query(`
    SELECT lg.*, s."entryYear"
    FROM legacy_grades lg
    LEFT JOIN students s ON s."studentCode" = lg."studentCode"
    WHERE lg."termCode" = '101'
    LIMIT 5
  `);
  console.log('Legacy grades for 101:');
  console.table(lg101.rows.map(r => ({ studentCode: r.studentCode, entryYear: r.entryYear, raw: r.raw })));

  // Check uni 4 students entry year
  const u4 = await pool.query(`
    SELECT "entryYear", count(*) FROM students WHERE "universityId" = 4 GROUP BY "entryYear" ORDER BY "entryYear"
  `);
  console.table(u4.rows);

  await pool.end();
}

main().catch(console.error);
