import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const totalCourses = await pool.query(`SELECT "universityId", COUNT(*) as count FROM courses GROUP BY "universityId" ORDER BY 1`);
  console.log('Courses per university:', totalCourses.rows);

  const stats = await pool.query(`
    SELECT
      "universityId",
      COUNT(*) as total,
      COUNT("defaultAcceptMarkState") as has_accept_code,
      COUNT("defaultRejectMarkState") as has_reject_code,
      COUNT(NULLIF("courseType", '')) as has_type,
      COUNT(NULLIF("theoreticalUnits", 0)) as has_theory_units,
      COUNT(NULLIF("practicalUnits", 0)) as has_prac_units,
      COUNT("departmentId") as has_dept
    FROM courses
    GROUP BY "universityId"
    ORDER BY 1
  `);
  console.log('Course field population stats:');
  console.table(stats.rows);

  await pool.end();
}

main().catch(console.error);
