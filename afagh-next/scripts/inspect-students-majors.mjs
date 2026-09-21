import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://afagh:afagh@localhost:5432/afagh_db',
});

async function main() {
  const r = await pool.query(`
    SELECT "universityId", count(*) as total,
           count("majorId") as with_major,
           count(*) - count("majorId") as without_major,
           count("militaryStatus") as with_military,
           count("acceptanceType") as with_acceptance_type,
           count("studyingMode") as with_studying_mode
    FROM students
    GROUP BY "universityId"
    ORDER BY "universityId"
  `);
  console.table(r.rows);

  // Check sample students without majorId
  const s = await pool.query(`
    SELECT "studentCode", "universityId", "saminLocalFieldCode", "saminFieldCode", "majorId", "militaryStatus", "acceptanceType", "studyingMode", "trainingMethod"
    FROM students
    WHERE "universityId" = 1
    LIMIT 10
  `);
  console.table(s.rows);

  // Check what is in majors table
  const m = await pool.query(`
    SELECT id, code, name, "majorCode", "facultyId", "departmentId"
    FROM majors
    LIMIT 20
  `);
  console.table(m.rows);

  await pool.end();
}

main().catch(console.error);
