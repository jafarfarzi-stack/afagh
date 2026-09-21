import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function check() {
  // Let's check student_term_states to see the official Sama term statistics!
  const termStates = await pool.query(`SELECT * FROM student_term_states LIMIT 5`);
  console.log('student_term_states sample:', termStates.rows);
  const termCols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='student_term_states'`);
  console.log('cols:', termCols.rows.map(r => r.column_name));
}
check().finally(() => pool.end());
