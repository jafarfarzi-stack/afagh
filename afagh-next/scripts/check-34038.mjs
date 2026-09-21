import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  const r = await pool.query(`SELECT id, code, title, "courseType", "defaultAcceptMarkState", "defaultRejectMarkState", "affectsGpa" FROM courses WHERE code='34038'`);
  console.log(r.rows);
  // check enrollments for student 9922234502 course 34038
  const e = await pool.query(`SELECT e.id, e."gradeValue", e."samaGradeStatusCode", e."gradeStatus", c.code, c.title, c."defaultAcceptMarkState", t."termCode" FROM enrollments e JOIN course_offerings o ON o.id=e."offeringId" JOIN courses c ON c.id=o."courseId" JOIN academic_terms t ON t.id=o."termId" JOIN students s ON s.id=e."studentId" WHERE s."studentCode"='9922234502' AND c.code='34038' ORDER BY t."termCode" DESC`);
  console.log('enrollments:', e.rows);
  // check curriculum allocation
  const cc = await pool.query(`SELECT cc."passGradeStatusCode", cc."failGradeStatusCode", cv."versionCode", cv.status FROM curriculum_courses cc JOIN curriculum_versions cv ON cv.id=cc."curriculumVersionId" JOIN courses c ON c.id=cc."courseId" WHERE c.code='34038' LIMIT 10`);
  console.log('curriculum allocs:', cc.rows);
}
main().catch(console.error).finally(() => pool.end());
