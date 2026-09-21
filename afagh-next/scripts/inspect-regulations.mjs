import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const regs = await pool.query(`SELECT id, title, "degreeLevelId", "effectiveFromYear", "effectiveToYear", "rulesConfig" FROM educational_regulations ORDER BY id;`);
  console.log('Educational Regulations in DB:');
  for (const r of regs.rows) {
    let cfg = {};
    try { cfg = JSON.parse(r.rulesConfig); } catch {}
    console.log({
      id: r.id,
      title: r.title,
      deg: r.degreeLevelId,
      from: r.effectiveFromYear,
      to: r.effectiveToYear,
      failedPolicy: cfg?.grading_and_gpa?.failed_course_gpa_policy,
      passGrade: cfg?.grading_and_gpa?.default_passing_grade,
      probThreshold: cfg?.probation_and_tenure?.probation_gpa_threshold,
      dedupe: cfg?.grading_and_gpa?.dedupeRepeatedCourses,
    });
  }
}

main().finally(() => pool.end());
