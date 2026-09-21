import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const ccCount = await pool.query(`
    SELECT
      cv."universityId",
      COUNT(cc.id) as total_curriculum_courses,
      COUNT(cc."passGradeStatusCode") as has_pass_code,
      COUNT(cc."failGradeStatusCode") as has_fail_code
    FROM curriculum_courses cc
    JOIN curriculum_versions cv ON cv.id = cc."curriculumVersionId"
    GROUP BY cv."universityId"
    ORDER BY 1
  `);
  console.log('Curriculum courses stats:');
  console.table(ccCount.rows);

  const totalCC = await pool.query(`SELECT COUNT(*) FROM curriculum_courses`);
  console.log('Total curriculum_courses in DB:', totalCC.rows[0].count);

  await pool.end();
}

main().catch(console.error);
