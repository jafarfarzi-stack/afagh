import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const match = await pool.query(`
    SELECT count(*)
    FROM students s
    JOIN majors m ON m."universityId" = s."universityId" AND m."majorCode" = s."saminLocalFieldCode"
    WHERE s."universityId" = 1 AND s."majorId" IS NULL
  `);
  console.log('Students matchable to major:', match.rows[0].count);

  const unmatch = await pool.query(`
    SELECT DISTINCT s."saminLocalFieldCode"
    FROM students s
    LEFT JOIN majors m ON m."universityId" = s."universityId" AND m."majorCode" = s."saminLocalFieldCode"
    WHERE s."universityId" = 1 AND s."majorId" IS NULL AND m.id IS NULL
  `);
  console.log('Unmatchable field codes:', unmatch.rows);
}

main().catch(console.error).finally(() => pool.end());
