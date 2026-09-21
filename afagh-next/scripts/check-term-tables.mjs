import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://afagh:afagh@localhost:5432/afagh_db',
});

async function main() {
  const tables = [
    'academic_terms',
    'student_term_states',
    'legacy_grades',
    'legacy_tuition_formulas',
    'legacy_financial_records',
    'legacy_student_term_summaries',
  ];

  for (const t of tables) {
    try {
      const res = await pool.query(`SELECT count(DISTINCT "termCode") as cnt, count(*) as total FROM ${t}`);
      console.log(`Table ${t}: total rows=${res.rows[0].total}, distinct termCode=${res.rows[0].cnt}`);
    } catch (e) {
      console.log(`Table ${t} error:`, e.message);
    }
  }

  await pool.end();
}

main().catch(console.error);
