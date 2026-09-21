import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const c = await pool.connect();
  try {
    const studentId = 38436;

    // 1) آیین‌نامه + config
    const reg = (await c.query(`
      SELECT r.id, r.title, r."rulesConfig"
      FROM educational_regulations r
      JOIN students s ON s."regulationId" = r.id
      WHERE s.id = $1
    `, [studentId])).rows[0];
    console.log('=== آیین‌نامه ===');
    console.log('ID:', reg.id, '| عنوان:', reg.title);
    const cfg = reg.rulesConfig ? JSON.parse(reg.rulesConfig) : null;
    console.log('config:', JSON.stringify(cfg, null, 2));

    // 2) همه enrollmentها
    const enrs = await c.query(`
      SELECT e.id, e."samaGradeStatusCode", e."gradeValue", e."gradeStatus",
        t."termCode", c.code as "courseCode", c.title as "courseTitle"
      FROM enrollments e
      JOIN course_offerings co ON co.id = e."offeringId"
      JOIN academic_terms t ON t.id = co."termId"
      JOIN courses c ON c.id = co."courseId"
      WHERE e."studentId" = $1
      ORDER BY t."termCode", c.code
    `, [studentId]);
    console.log('\n=== Enrollmentها (' + enrs.rows.length + ' رکورد) ===');
    for (const r of enrs.rows) {
      console.log(`${r.termCode} | ${r.courseCode} (${r.courseTitle}) | نمره: ${r.gradeValue} | کد: ${r.samaGradeStatusCode} | وضع: ${r.gradeStatus}`);
    }

    // 3) آیا درسی مردود هست که بعداً قبول شده باشد؟
    const failed = enrs.rows.filter(r => {
      const g = parseFloat(r.gradeValue);
      return !isNaN(g) && g < 12 && r.gradeStatus === 'FINALIZED';
    });
    console.log('\n=== دروس مردود (نمره < 12) ===');
    for (const f of failed) {
      const laterPass = enrs.rows.find(r =>
        r.courseCode === f.courseCode &&
        parseInt(r.termCode) > parseInt(f.termCode) &&
        parseFloat(r.gradeValue) >= 12
      );
      console.log(`${f.courseCode} (${f.courseTitle}) ترم ${f.termCode} نمره ${f.gradeValue} کد ${f.samaGradeStatusCode} → قبولی بعدی: ${laterPass ? laterPass.termCode + ' نمره ' + laterPass.gradeValue : 'ندارد'}`);
    }
  } finally { c.release(); await pool.end(); }
}
main().catch(console.error);
