import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://afagh:afagh@localhost:5432/afagh_db',
});

async function main() {
  const r = await pool.query(`
    SELECT count(*) as total,
           count("saminLocalFieldCode") as with_local_code,
           count("saminFieldCode") as with_field_code,
           count("majorId") as with_major_id
    FROM students
    WHERE "universityId" = 1
  `);
  console.table(r.rows);

  // Check how many match with majors.majorCode
  const match = await pool.query(`
    SELECT count(*) as matched
    FROM students s
    JOIN majors m ON m."majorCode" = s."saminLocalFieldCode"
    WHERE s."universityId" = 1
  `);
  console.table(match.rows);

  await pool.end();
}

main().catch(console.error);
