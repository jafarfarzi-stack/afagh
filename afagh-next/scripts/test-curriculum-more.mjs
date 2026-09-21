import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://afagh:afagh@localhost:5432/afagh_db',
});

async function main() {
  const uniId = 1;
  const coursesRes = await pool.query(`
    SELECT id, code, title, units, "courseType"
    FROM courses
    WHERE "universityId" = $1
    LIMIT 10
  `, [uniId]);
  console.log('Courses ok, sample count:', coursesRes.rows.length);

  const depsRes = await pool.query(`
    SELECT id, name
    FROM departments
    WHERE "universityId" = $1
    ORDER BY name ASC
    LIMIT 10
  `, [uniId]);
  console.log('Departments ok, sample count:', depsRes.rows.length);

  await pool.end();
}

main().catch(console.error);
