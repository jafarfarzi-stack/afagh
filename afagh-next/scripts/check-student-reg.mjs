import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const res = await pool.query(`
    SELECT s.id, s."studentCode", s."entryYear", s."regulationId", er.title as reg_title, er."rulesConfig"
    FROM students s
    LEFT JOIN educational_regulations er ON er.id = s."regulationId"
    WHERE s.id = 31993;
  `);
  console.log('Student 31993 with regulation:');
  console.log(res.rows[0]);
}

main().finally(() => pool.end());
