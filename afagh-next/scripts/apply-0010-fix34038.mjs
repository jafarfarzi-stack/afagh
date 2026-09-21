import pg from 'pg';
import fs from 'fs';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  const sql = fs.readFileSync('drizzle/0010_curriculum_grade_status_codes.sql', 'utf8');
  await pool.query(sql);
  console.log('migration 0010 applied');
  const cc = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='curriculum_courses' AND column_name IN ('passGradeStatusCode','failGradeStatusCode')`);
  console.log('new cols:', cc.rows);
  // data fix: course 34038
  const u = await pool.query(`UPDATE courses SET "defaultAcceptMarkState"='12' WHERE code='34038' AND ("universityId"=1 OR "universityId" IS NULL)`);
  console.log('course 34038 updated:', u.rowCount);
  // fix the wrong enrollment
  const e = await pool.query(`UPDATE enrollments SET "samaGradeStatusCode"='12' WHERE id=227371 AND "samaGradeStatusCode"='1'`);
  console.log('enrollment 227371 fixed:', e.rowCount);
  const v = await pool.query(`SELECT e.id, e."gradeValue", e."samaGradeStatusCode", c.code, c."defaultAcceptMarkState" FROM enrollments e JOIN course_offerings o ON o.id=e."offeringId" JOIN courses c ON c.id=o."courseId" WHERE e.id=227371`);
  console.log('verify:', v.rows);
}
main().catch(console.error).finally(() => pool.end());
