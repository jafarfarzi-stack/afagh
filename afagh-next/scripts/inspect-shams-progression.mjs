import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://afagh:afagh@localhost:5432/afagh_db',
});

async function main() {
  // Check students in SHAMS taking terms 991, 992, 101, 102, 1401, 1402
  const sample = await pool.query(`
    SELECT DISTINCT "studentCode", "termCode"
    FROM legacy_grades
    WHERE "sourceCode" = 'SHAMS' AND "termCode" IN ('991', '992', '993', '101', '102', '103', '1401', '1402', '1403', '401', '411')
    ORDER BY "studentCode", "termCode"
    LIMIT 40
  `);
  console.table(sample.rows);

  // Group by studentCode to see progression of terms
  const students = [...new Set(sample.rows.map(r => r.studentCode))].slice(0, 5);
  for (const sc of students) {
    const stTerms = await pool.query(`
      SELECT DISTINCT "termCode"
      FROM legacy_grades
      WHERE "sourceCode" = 'SHAMS' AND "studentCode" = $1
      ORDER BY "termCode"
    `, [sc]);
    console.log(`Student ${sc} terms:`, stTerms.rows.map(r => r.termCode).join(', '));
  }

  await pool.end();
}

main().catch(console.error);
