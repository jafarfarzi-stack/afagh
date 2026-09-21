import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`SELECT id, title, "rulesConfig" FROM educational_regulations ORDER BY id;`);
    for (const r of res.rows) {
      const cfg = JSON.parse(r.rulesConfig);
      console.log(`ID: ${r.id} | Title: ${r.title} | Policy: ${cfg.grading_and_gpa?.failed_course_gpa_policy} | FailedCode: ${cfg.grading_and_gpa?.failed_sama_status_code}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
