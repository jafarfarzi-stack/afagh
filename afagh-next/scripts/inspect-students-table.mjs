import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const r = await pool.query(`
    SELECT
      count(*) as total_students,
      count("majorId") as with_major,
      count("militaryStatus") as with_military,
      count("acceptanceType") as with_accept,
      count("studyingMode") as with_studying_mode,
      count("trainingMethod") as with_training_method,
      count("advisorCode") as with_advisor
    FROM students
    WHERE "universityId" = 1
  `);
  console.log('Students stats for University 1 (Afagh):', r.rows[0]);

  const milSample = await pool.query(`
    SELECT "militaryStatus", count(*)
    FROM students
    WHERE "universityId" = 1
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 10
  `);
  console.log('Military status breakdown:', milSample.rows);

  const modeSample = await pool.query(`
    SELECT "studyingMode", count(*)
    FROM students
    WHERE "universityId" = 1
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 10
  `);
  console.log('Studying mode breakdown:', modeSample.rows);
}

main().catch(console.error).finally(() => pool.end());
