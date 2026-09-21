import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  // Find AFAGH enrollments with 931 where student reg is KEEP_ALWAYS (should become 2)
  // vs EXCLUDE_IF_PASSED with later pass (should stay 931)
  const r = await pool.query(`
    SELECT e.id, s."studentCode", s."regulationId", r.title AS reg_title,
           r."rulesConfig", c.code AS course_code, e."gradeValue", t."termCode"
    FROM enrollments e
    JOIN course_offerings co ON co.id = e."offeringId"
    JOIN courses c ON c.id = co."courseId"
    JOIN academic_terms t ON t.id = co."termId"
    JOIN students s ON s.id = e."studentId"
    LEFT JOIN educational_regulations r ON r.id = s."regulationId"
    WHERE s."universityId" = 1 AND e."samaGradeStatusCode" = '931' AND e."gradeStatus" = 'FINALIZED'
    LIMIT 200
  `);
  let keepAlways = 0, exclude = 0;
  const keepSamples = [];
  for (const row of r.rows) {
    let cfg = null;
    try { if (row.rulesConfig) cfg = JSON.parse(row.rulesConfig); } catch {}
    const policy = cfg?.grading_and_gpa?.failed_course_gpa_policy;
    const fcode = cfg?.grading_and_gpa?.failed_sama_status_code;
    if (policy === 'KEEP_ALWAYS' || fcode === '2') {
      keepAlways++;
      if (keepSamples.length < 5) keepSamples.push({ stu: row.studentCode, reg: row.reg_title, policy, course: row.course_code, grade: row.gradeValue, term: row.termCode });
    } else exclude++;
  }
  console.log(`Sampled ${r.rows.length} enrollments with 931 in AFAGH:`);
  console.log(`- KEEP_ALWAYS/2 regs (931 is WRONG, should be 2): ${keepAlways}`);
  console.log(`- EXCLUDE regs (931 may be correct): ${exclude}`);
  console.table(keepSamples);
  await pool.end();
}
main().catch(console.error);
