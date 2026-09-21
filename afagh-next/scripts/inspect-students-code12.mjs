import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function check() {
  const studentsWith12 = await pool.query(`
    SELECT DISTINCT lg."studentCode", lg."termCode" 
    FROM legacy_grades lg 
    WHERE (lg.raw::json->>'markStat') = '12' 
    LIMIT 5
  `);
  console.log('Students with markStat=12:', studentsWith12.rows);

  for (const s of studentsWith12.rows) {
    const grades = await pool.query(`
      SELECT "courseCode", "courseTitle", units, "gradeValue", "gradeStatus", raw::json->>'markStat' as stat
      FROM legacy_grades 
      WHERE "studentCode" = $1 AND "termCode" = $2
    `, [s.studentCode, s.termCode]);
    console.log(`Student ${s.studentCode} Term ${s.termCode}:`);
    console.table(grades.rows);

    const termState = await pool.query(`
      SELECT sts."termCode", sts."termAvg", sts."isProbation", sts."statusTitle"
      FROM student_term_states sts
      JOIN students st ON st.id = sts."studentId"
      WHERE st."studentCode" = $1 AND sts."termCode" = $2
    `, [s.studentCode, s.termCode]);
    console.log('Term State in DB:', termState.rows);
  }
}
check().finally(() => pool.end());
