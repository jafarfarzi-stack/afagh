import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const r = await pool.query('SELECT "militaryStatus", count(*) FROM student_profiles GROUP BY 1');
  console.log('student_profiles militaryStatus:', r.rows);
  const total = await pool.query('SELECT count(*) FROM student_profiles');
  console.log('total student_profiles:', total.rows[0].count);
}

main().catch(console.error).finally(() => pool.end());
