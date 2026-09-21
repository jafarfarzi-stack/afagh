import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://afagh:afagh@localhost:5432/afagh_db',
});

async function main() {
  const checkCodes = ['101', '102', '103', '104', '105', '106', '107', '108', '1401', '1402', '1403', '1411', '401', '411', '1021', '1042', '1051'];
  
  const res = await pool.query(`
    SELECT "termCode", title, "universityId", "startDate", "endDate", "academicYear"
    FROM academic_terms
    WHERE "termCode" = ANY($1)
    ORDER BY "termCode"
  `, [checkCodes]);
  console.table(res.rows);

  // Also check legacy_grades count for these
  const lg = await pool.query(`
    SELECT "termCode", "sourceCode", count(*) 
    FROM legacy_grades 
    WHERE "termCode" = ANY($1)
    GROUP BY "termCode", "sourceCode"
    ORDER BY "termCode"
  `, [checkCodes]);
  console.table(lg.rows);

  await pool.end();
}

main().catch(console.error);
