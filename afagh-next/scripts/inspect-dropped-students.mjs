import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function check() {
  const dropped = await pool.query(`
    SELECT DISTINCT lg."studentCode", lg."termCode", (lg.raw::json->>'markStat') as stat
    FROM legacy_grades lg
    WHERE (lg.raw::json->>'markStat') IN ('14', '7', '6')
    LIMIT 5
  `);
  console.log('Students with dropped courses:', dropped.rows);

  for (const s of dropped.rows) {
    const grades = await pool.query(`
      SELECT "courseCode", units, "gradeValue", "gradeStatus", raw::json->>'markStat' as stat
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
