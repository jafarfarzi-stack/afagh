import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const r = await pool.query(`
    SELECT s."universityId", s."regulationId", r.title, COUNT(*) 
    FROM students s
    LEFT JOIN educational_regulations r ON r.id = s."regulationId"
    GROUP BY s."universityId", s."regulationId", r.title
    ORDER BY s."universityId", COUNT(*) DESC
  `);
  console.log('Students by universityId and regulationId:');
  console.table(r.rows);
  await pool.end();
}

main().catch(console.error);
